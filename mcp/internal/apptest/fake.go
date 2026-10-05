// Package apptest is a fake GTD app for tests: the /api/v1 surface the binary talks to.
package apptest

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

type Fake struct {
	URL      string
	server   *httptest.Server
	mu       sync.Mutex
	lastArgs string
}

// LastArgs is the body of the latest tool call.
func (f *Fake) LastArgs() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.lastArgs
}

func (f *Fake) Close() { f.server.Close() }

const tools = `{"client":{"name":"Test","preset":"assistant"},"tools":[
 {"name":"whoami","description":"Who this client is.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}},
 {"name":"list_next_actions","description":"Next actions.","inputSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"context":{"type":"string"}},"additionalProperties":false}},
 {"name":"complete","description":"Mark done.","inputSchema":{"type":"object","properties":{"ids":{"type":"array","items":{"type":"string"}}},"required":["ids"],"additionalProperties":false}}]}`

const prompts = `{"prompts":[{"name":"weekly_review","title":"Weekly review with me","description":"Lead the weekly review.","text":"Lead my weekly review. Call ` + "`prepare_weekly_review`" + ` first."}]}`

func New(t testing.TB, token string) *Fake { return NewAt(t, token, "") }

// NewAt serves the API under a path prefix, as behind a proxy at https://host/gtd/.
func NewAt(t testing.TB, token, prefix string) *Fake {
	f := &Fake{}
	mux := http.NewServeMux()
	auth := func(w http.ResponseWriter, r *http.Request) bool {
		if r.Header.Get("Authorization") != "Bearer "+token {
			w.WriteHeader(http.StatusUnauthorized)
			io.WriteString(w, `{"error":"missing, wrong or revoked bearer token"}`)
			return false
		}
		return true
	}
	mux.HandleFunc("GET "+prefix+"/api/v1/tools", func(w http.ResponseWriter, r *http.Request) {
		if auth(w, r) {
			io.WriteString(w, tools)
		}
	})
	mux.HandleFunc("GET "+prefix+"/api/v1/prompts", func(w http.ResponseWriter, r *http.Request) {
		if auth(w, r) {
			io.WriteString(w, prompts)
		}
	})
	mux.HandleFunc("POST "+prefix+"/api/v1/tools/{name}", func(w http.ResponseWriter, r *http.Request) {
		if !auth(w, r) {
			return
		}
		body, _ := io.ReadAll(r.Body)
		f.mu.Lock()
		f.lastArgs = string(body)
		f.mu.Unlock()
		var args map[string]any
		if json.Unmarshal(body, &args) != nil {
			w.WriteHeader(http.StatusBadRequest)
			io.WriteString(w, `{"error":"body is not JSON"}`)
			return
		}
		switch r.PathValue("name") {
		case "whoami":
			io.WriteString(w, `{"result":{"name":"Test"},"activity":[]}`)
		case "list_next_actions":
			io.WriteString(w, `{"result":[{"id":"n1","text":"Call the shop","href":"/next?highlight=n1","project":{"id":"p1","title":"Shop"}}],"activity":[]}`)
		case "complete":
			w.WriteHeader(http.StatusUnprocessableEntity)
			io.WriteString(w, `{"error":"complete: item nope cannot be completed","activity":["a1"]}`)
		default:
			w.WriteHeader(http.StatusNotFound)
			io.WriteString(w, `{"error":"no tool named `+strings.ReplaceAll(r.PathValue("name"), `"`, ``)+`"}`)
		}
	})
	f.server = httptest.NewServer(mux)
	f.URL = f.server.URL + prefix
	t.Cleanup(f.Close)
	return f
}
