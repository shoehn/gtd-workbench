package bridge_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"gtd-workbench/mcp/internal/app"
	"gtd-workbench/mcp/internal/apptest"
	"gtd-workbench/mcp/internal/bridge"
)

const token = "gtd_test-token-not-a-secret"

// session starts the bridge against a fake app and connects an MCP client to it in memory.
func session(t *testing.T, f *apptest.Fake) *mcp.ClientSession {
	t.Helper()
	ctx := context.Background()
	c, err := app.New(f.URL, token)
	if err != nil {
		t.Fatal(err)
	}
	s, err := bridge.New(ctx, c, "test")
	if err != nil {
		t.Fatal(err)
	}
	st, ct := mcp.NewInMemoryTransports()
	if _, err := s.Connect(ctx, st, nil); err != nil {
		t.Fatal(err)
	}
	cs, err := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "0"}, nil).Connect(ctx, ct, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cs.Close() })
	return cs
}

func text(t *testing.T, r *mcp.CallToolResult) string {
	t.Helper()
	if len(r.Content) != 1 {
		t.Fatalf("content: %+v", r.Content)
	}
	return r.Content[0].(*mcp.TextContent).Text
}

func TestToolsAndPromptsComeFromTheApp(t *testing.T) {
	cs := session(t, apptest.New(t, token))
	tools, err := cs.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, tl := range tools.Tools {
		names = append(names, tl.Name)
	}
	if strings.Join(names, ",") != "complete,list_next_actions,whoami" && strings.Join(names, ",") != "whoami,list_next_actions,complete" {
		t.Fatalf("tools: %v", names)
	}
	schema, _ := json.Marshal(tools.Tools[0].InputSchema)
	if !strings.Contains(string(schema), `"type":"object"`) {
		t.Fatalf("schema: %s", schema)
	}
	prompts, err := cs.ListPrompts(context.Background(), nil)
	if err != nil || len(prompts.Prompts) != 1 || prompts.Prompts[0].Name != "weekly_review" {
		t.Fatalf("prompts: %+v %v", prompts, err)
	}
	p, err := cs.GetPrompt(context.Background(), &mcp.GetPromptParams{Name: "weekly_review"})
	if err != nil || len(p.Messages) != 1 || !strings.Contains(p.Messages[0].Content.(*mcp.TextContent).Text, "prepare_weekly_review") {
		t.Fatalf("prompt: %+v %v", p, err)
	}
}

func TestACallIsForwardedAndLinksBecomeAbsolute(t *testing.T) {
	f := apptest.New(t, token)
	cs := session(t, f)
	r, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "list_next_actions", Arguments: map[string]any{"context": "@calls"}})
	if err != nil || r.IsError {
		t.Fatalf("call: %+v %v", r, err)
	}
	if f.LastArgs() != `{"context":"@calls"}` {
		t.Fatalf("args: %s", f.LastArgs())
	}
	out := text(t, r)
	if !strings.Contains(out, `"href":"`+f.URL+`/waiting?tab=someday&highlight=s1"`) {
		t.Fatalf("a link with & must stay readable: %s", out)
	}
	if !strings.Contains(out, `"href":"`+f.URL+`/next?highlight=n1"`) || !strings.Contains(out, `"activity":[]`) {
		t.Fatalf("answer: %s", out)
	}
}

func TestARefusalIsAToolErrorWithTheAppsReason(t *testing.T) {
	cs := session(t, apptest.New(t, token))
	r, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "complete", Arguments: map[string]any{"ids": []string{"nope"}}})
	if err != nil || !r.IsError {
		t.Fatalf("want a tool error: %+v %v", r, err)
	}
	out := text(t, r)
	if !strings.Contains(out, "complete: item nope cannot be completed") || !strings.Contains(out, "a1") {
		t.Fatalf("message: %s", out)
	}
}

func TestTheAppGoingAwayGivesAToolErrorTheSessionLivesOn(t *testing.T) {
	f := apptest.New(t, token)
	cs := session(t, f)
	f.Close()
	r, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "whoami", Arguments: map[string]any{}})
	if err != nil || !r.IsError || !strings.Contains(text(t, r), "not reachable") {
		t.Fatalf("want a tool error: %+v %v", r, err)
	}
	if _, err := cs.ListTools(context.Background(), nil); err != nil {
		t.Fatalf("session ended: %v", err)
	}
}

func TestStartingWithAWrongTokenFails(t *testing.T) {
	f := apptest.New(t, token)
	c, _ := app.New(f.URL, "gtd_wrong")
	if _, err := bridge.New(context.Background(), c, "test"); err == nil || strings.Contains(err.Error(), "gtd_wrong") {
		t.Fatalf("got %v", err)
	}
}
