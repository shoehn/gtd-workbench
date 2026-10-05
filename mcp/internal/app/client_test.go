package app_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gtd-workbench/mcp/internal/app"
	"gtd-workbench/mcp/internal/apptest"
)

const token = "gtd_test-token-not-a-secret"

func TestListsToolsAndPrompts(t *testing.T) {
	f := apptest.New(t, token)
	c, err := app.New(f.URL, token)
	if err != nil {
		t.Fatal(err)
	}
	tools, err := c.Tools(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 3 || tools[1].Name != "list_next_actions" || !strings.Contains(string(tools[1].InputSchema), `"type":"object"`) {
		t.Fatalf("tools: %+v", tools)
	}
	prompts, err := c.Prompts(context.Background())
	if err != nil || len(prompts) != 1 || prompts[0].Title != "Weekly review with me" {
		t.Fatalf("prompts: %+v %v", prompts, err)
	}
}

func TestCallForwardsArgumentsAndAnswers(t *testing.T) {
	f := apptest.New(t, token)
	c, _ := app.New(f.URL, token)
	r, err := c.Call(context.Background(), "list_next_actions", json.RawMessage(`{"context":"@calls"}`))
	if err != nil || r.Status != 200 || !strings.Contains(string(r.Body), `"href":"/next?highlight=n1"`) {
		t.Fatalf("call: %d %s %v", r.Status, r.Body, err)
	}
	if f.LastArgs() != `{"context":"@calls"}` {
		t.Fatalf("args: %s", f.LastArgs())
	}
	r, _ = c.Call(context.Background(), "whoami", nil)
	if r.Status != 200 || f.LastArgs() != `{}` {
		t.Fatalf("no arguments must be sent as {}: %d %s", r.Status, f.LastArgs())
	}
	r, _ = c.Call(context.Background(), "complete", json.RawMessage(`{"ids":["nope"]}`))
	msg, activity := app.ErrorOf(r.Body)
	if r.Status != 422 || msg != "complete: item nope cannot be completed" || len(activity) != 1 {
		t.Fatalf("refusal: %d %q %v", r.Status, msg, activity)
	}
}

func TestBaseURL(t *testing.T) {
	t.Run("trailing slash and path prefix", func(t *testing.T) {
		f := apptest.NewAt(t, token, "/gtd")
		c, err := app.New(f.URL+"/", token)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := c.Tools(context.Background()); err != nil {
			t.Fatal(err)
		}
		if got := c.Absolute("/next?highlight=n1"); got != f.URL+"/next?highlight=n1" {
			t.Fatalf("absolute: %s", got)
		}
	})
	t.Run("missing or not http", func(t *testing.T) {
		for _, u := range []string{"", "gtd.example.com", "ftp://gtd.example.com"} {
			if _, err := app.New(u, token); err == nil || !strings.Contains(err.Error(), "GTD_URL") {
				t.Fatalf("%q: %v", u, err)
			}
		}
		if _, err := app.New("https://gtd.example.com", " "); err == nil || !strings.Contains(err.Error(), "GTD_TOKEN") {
			t.Fatalf("empty token: %v", err)
		}
	})
}

func TestErrors(t *testing.T) {
	t.Run("a wrong token is ErrUnauthorized", func(t *testing.T) {
		f := apptest.New(t, token)
		c, _ := app.New(f.URL, "gtd_wrong")
		if _, err := c.Tools(context.Background()); !errors.Is(err, app.ErrUnauthorized) {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("a redirect (proxy login) is named as such", func(t *testing.T) {
		login := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "https://auth.example.com/?rd=x", http.StatusFound)
		}))
		defer login.Close()
		c, _ := app.New(login.URL, token)
		_, err := c.Tools(context.Background())
		if err == nil || !strings.Contains(err.Error(), "redirect") || !strings.Contains(err.Error(), "/api/v1/") {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("not reachable", func(t *testing.T) {
		c, _ := app.New("http://127.0.0.1:1", token)
		if _, err := c.Call(context.Background(), "whoami", nil); err == nil || !strings.Contains(err.Error(), "not reachable") {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("errors never contain the token", func(t *testing.T) {
		c, _ := app.New("http://127.0.0.1:1", token)
		_, err1 := c.Tools(context.Background())
		f := apptest.New(t, "other")
		c2, _ := app.New(f.URL, token)
		_, err2 := c2.Tools(context.Background())
		for _, err := range []error{err1, err2} {
			if err == nil || strings.Contains(err.Error(), token) {
				t.Fatalf("leaks or nil: %v", err)
			}
		}
	})
}
