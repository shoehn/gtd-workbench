// gtd-mcp — the GTD Workbench as an MCP server over stdio. It offers the app's tools and guided
// workflows to an agent and forwards every call to the app's /api/v1 with the client's token.
//
//	GTD_URL    the app's address, e.g. https://gtd.example.com
//	GTD_TOKEN  a client token from the app's Settings → Clients
//
// stdout carries the protocol only; messages go to stderr.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"gtd-workbench/mcp/internal/app"
	"gtd-workbench/mcp/internal/bridge"
)

var version = "dev"

func main() {
	log.SetFlags(0)
	log.SetOutput(os.Stderr)
	log.SetPrefix("gtd-mcp: ")
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Println("gtd-mcp " + version)
		return
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx); err != nil {
		log.Print(err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	if os.Getenv("GTD_URL") == "" {
		return fmt.Errorf("GTD_URL is not set — the app's address, e.g. https://gtd.example.com")
	}
	c, err := app.New(os.Getenv("GTD_URL"), os.Getenv("GTD_TOKEN"))
	if err != nil {
		return err
	}
	start, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	s, err := bridge.New(start, c, version)
	if err != nil {
		return err
	}
	if err := s.Run(ctx, &mcp.StdioTransport{}); err != nil && ctx.Err() == nil {
		return err
	}
	return nil
}
