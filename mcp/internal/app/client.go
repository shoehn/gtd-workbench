// Package app is the HTTP client of the GTD app's agent API (/api/v1). It knows nothing of
// MCP; the bridge turns what it gets into tools and prompts.
package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Tool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`
}

type Prompt struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Text        string `json:"text"`
}

// Reply is the app's answer to a tool call: its status and body, whatever they are.
type Reply struct {
	Status int
	Body   []byte
	Header http.Header
}

// FromApp tells the app's own answers (a JSON {"error": …}, or the Bearer challenge its 401s
// carry) from those of something in front of it — a login proxy, a gateway page.
func (r Reply) FromApp() bool {
	if strings.HasPrefix(strings.ToLower(r.Header.Get("WWW-Authenticate")), "bearer") {
		return true
	}
	var e struct {
		Error string `json:"error"`
	}
	return json.Unmarshal(r.Body, &e) == nil && e.Error != ""
}

// LoginInFront is what a 401 from something other than the app means: the proxy login was asked.
func (c *Client) LoginInFront(path string) error {
	return fmt.Errorf("a login in front of the GTD app at %s answered 401 to %s — let /api/v1/ through without login (docs/OPERATIONS.md, \"Reachable from outside\"); the token was not checked", c.base, path)
}

var ErrUnauthorized = errors.New("the GTD app refused GTD_TOKEN (missing, wrong or revoked) — create a client in Settings → Clients and use its token")

const maxBody = 16 << 20

type Client struct {
	base  string // scheme://host[/prefix], no trailing slash
	token string
	http  *http.Client
}

func New(rawURL, token string) (*Client, error) {
	raw := strings.TrimRight(strings.TrimSpace(rawURL), "/")
	u, err := url.Parse(raw)
	if raw == "" || err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		shown := rawURL
		if err == nil {
			shown = u.Redacted() // never echo a password
		} else if strings.Contains(rawURL, "@") {
			shown = "…"
		}
		return nil, fmt.Errorf("GTD_URL must be the app's address, e.g. https://gtd.example.com (got %q)", shown)
	}
	// A password here would show in every link the model sees; the token is what authenticates.
	if u.User != nil || u.RawQuery != "" || u.Fragment != "" || strings.HasSuffix(raw, "?") || strings.HasSuffix(raw, "#") {
		return nil, errors.New("GTD_URL must be just the app's address — no user or password, no ?query or #fragment (the token authenticates; a proxy login needs /api/v1/ let through, docs/OPERATIONS.md)")
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, errors.New("GTD_TOKEN is not set — create a client in the app's Settings → Clients and use its token")
	}
	return &Client{
		base:  raw,
		token: token,
		http: &http.Client{
			Timeout: 30 * time.Second,
			// A redirect here is a login page (a proxy in front of the app), never the API.
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
	}, nil
}

// Absolute turns a path from the app ("/next?highlight=n1") into a link that opens it.
func (c *Client) Absolute(path string) string { return c.base + path }

func (c *Client) do(ctx context.Context, method, path string, body []byte) (Reply, error) {
	var r io.Reader
	if body != nil {
		r = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, r)
	if err != nil {
		return Reply{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		return Reply{}, fmt.Errorf("the GTD app is not reachable at %s: %v", c.base, errors.Unwrap(err))
	}
	defer res.Body.Close()
	b, err := io.ReadAll(io.LimitReader(res.Body, maxBody))
	if err != nil {
		return Reply{}, fmt.Errorf("reading the GTD app's answer: %v", err)
	}
	if res.StatusCode >= 300 && res.StatusCode < 400 {
		return Reply{}, fmt.Errorf("the GTD app at %s answered %s with a redirect to %q — a login in front of it? Let /api/v1/ through without login (docs/OPERATIONS.md, \"Reachable from outside\")", c.base, path, res.Header.Get("Location"))
	}
	return Reply{Status: res.StatusCode, Body: b, Header: res.Header}, nil
}

func (c *Client) get(ctx context.Context, path string, v any) error {
	r, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return err
	}
	if r.Status == http.StatusUnauthorized {
		if !r.FromApp() {
			return c.LoginInFront(path)
		}
		return ErrUnauthorized
	}
	if r.Status != http.StatusOK {
		msg, _ := ErrorOf(r.Body)
		return fmt.Errorf("GET %s: %d %s", path, r.Status, msg)
	}
	if err := json.Unmarshal(r.Body, v); err != nil {
		return fmt.Errorf("GET %s: the answer is not the GTD app's API (%v) — is GTD_URL the app's address?", path, err)
	}
	return nil
}

func (c *Client) Tools(ctx context.Context) ([]Tool, error) {
	var out struct {
		Tools []Tool `json:"tools"`
	}
	if err := c.get(ctx, "/api/v1/tools", &out); err != nil {
		return nil, err
	}
	return out.Tools, nil
}

func (c *Client) Prompts(ctx context.Context) ([]Prompt, error) {
	var out struct {
		Prompts []Prompt `json:"prompts"`
	}
	if err := c.get(ctx, "/api/v1/prompts", &out); err != nil {
		return nil, err
	}
	return out.Prompts, nil
}

// Call runs one tool. The error is only for an app that can't be reached; every answer of the
// app, refusals included, comes back as a Reply.
func (c *Client) Call(ctx context.Context, name string, args json.RawMessage) (Reply, error) {
	if len(bytes.TrimSpace(args)) == 0 || string(bytes.TrimSpace(args)) == "null" {
		args = json.RawMessage(`{}`)
	}
	return c.do(ctx, http.MethodPost, "/api/v1/tools/"+url.PathEscape(name), args)
}

// ErrorOf reads the app's error answer: its message, and the log entries made before it.
func ErrorOf(body []byte) (string, []string) {
	var e struct {
		Error    string   `json:"error"`
		Activity []string `json:"activity"`
	}
	if json.Unmarshal(body, &e) == nil && e.Error != "" {
		return e.Error, e.Activity
	}
	s := strings.TrimSpace(string(body))
	if len(s) > 200 {
		s = s[:200] + "…"
	}
	return s, nil
}
