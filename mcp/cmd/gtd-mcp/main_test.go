package main_test

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"gtd-workbench/mcp/internal/apptest"
)

const token = "gtd_test-token-not-a-secret"

func build(t *testing.T) string {
	t.Helper()
	bin := filepath.Join(t.TempDir(), "gtd-mcp")
	out, err := exec.Command("go", "build", "-ldflags", "-X main.version=9.9.9", "-o", bin, ".").CombinedOutput()
	if err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	return bin
}

func TestTheRealBinaryTalksMCPOverStdio(t *testing.T) {
	bin := build(t)
	f := apptest.New(t, token)
	cmd := exec.Command(bin)
	cmd.Env = append(os.Environ(), "GTD_URL="+f.URL, "GTD_TOKEN="+token)
	cs, err := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "0"}, nil).Connect(context.Background(), &mcp.CommandTransport{Command: cmd}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer cs.Close()
	if v := cs.InitializeResult().ServerInfo.Version; v != "9.9.9" {
		t.Fatalf("version: %s", v)
	}
	r, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "whoami", Arguments: map[string]any{}})
	if err != nil || r.IsError {
		t.Fatalf("call: %+v %v", r, err)
	}
	// The client closing the session is a normal end: exit 0.
	cs.Close()
	if cmd.ProcessState == nil {
		_ = cmd.Wait()
	}
	if code := cmd.ProcessState.ExitCode(); code != 0 {
		t.Fatalf("exit code after a normal end: %d", code)
	}
}

func TestARefusedTokenExitsWithAReadableMessage(t *testing.T) {
	bin := build(t)
	f := apptest.New(t, token)
	cmd := exec.Command(bin)
	cmd.Env = append(os.Environ(), "GTD_URL="+f.URL, "GTD_TOKEN=gtd_wrong-token")
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	if code := cmd.ProcessState.ExitCode(); err == nil || code != 1 {
		t.Fatalf("exit %d, %v", code, err)
	}
	if stdout.Len() != 0 {
		t.Fatalf("stdout must stay empty: %q", stdout.String())
	}
	if !strings.HasPrefix(stderr.String(), "gtd-mcp: ") || !strings.Contains(stderr.String(), "Settings → Clients") || strings.Contains(stderr.String(), "gtd_wrong-token") {
		t.Fatalf("stderr: %q", stderr.String())
	}
}

func TestMissingConfigurationAndVersion(t *testing.T) {
	bin := build(t)
	cmd := exec.Command(bin)
	cmd.Env = []string{"PATH=" + os.Getenv("PATH")}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if cmd.Run() == nil || !strings.Contains(stderr.String(), "GTD_URL") {
		t.Fatalf("stderr: %q", stderr.String())
	}
	out, err := exec.Command(bin, "--version").Output()
	if err != nil || strings.TrimSpace(string(out)) != "gtd-mcp 9.9.9" {
		t.Fatalf("version: %q %v", out, err)
	}
}
