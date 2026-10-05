# The GTD Workbench in an AI agent (MCP)

`gtd-mcp` connects an agent that speaks MCP over stdio — Claude Desktop, Claude Code, Codex,
an agent on a server — to the app. It offers the app's tools (capture, clarify, complete, the
lists, the calendar, the weekly review, undo …) and seven guided workflows (weekly review,
work through the inbox, plan my day, what now, who owes me what, stalled projects, meeting
notes). Every change it makes shows in the app's **Activity** under the client's name and can
be undone there.

## 1. A client and its token

In the app: **Settings → Clients** → a name per agent (e.g. "Claude Desktop", "Phone agent")
and the preset **assistant** (or *read-only* for an agent that only reads, *capture* for one
that only adds to the inbox). Copy the token — it is shown once. Revoke it there when an agent
should stop. One client per agent: the log tells them apart.

## 2. The binary

```sh
pnpm mcp:build      # needs Go (1.22+ switches to the 1.25 toolchain by itself)
```

Binaries land in `mcp/dist/`: `gtd-mcp-darwin-arm64` (Apple silicon), `gtd-mcp-darwin-amd64`,
`gtd-mcp-linux-arm64`, `gtd-mcp-linux-amd64`. Copy the one for the machine where the agent
runs, e.g. to `~/bin/gtd-mcp`, and check: `~/bin/gtd-mcp --version`.

It needs two settings, as environment variables:

| Variable | Value |
|---|---|
| `GTD_URL` | the app's address, e.g. `https://gtd.example.com` (with a path if the app lives under one) |
| `GTD_TOKEN` | the client's token |

If the app is behind a login (Authelia …), `/api/v1/` must be let through without it — see
OPERATIONS, "Reachable from outside". Otherwise `gtd-mcp` stops at start with "answered … with
a redirect".

The config files below hold the token: keep them private, never commit them.

## 3. Register it

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`
(Settings → Developer → Edit Config), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "gtd": {
      "command": "/Users/you/bin/gtd-mcp",
      "env": { "GTD_URL": "https://gtd.example.com", "GTD_TOKEN": "gtd_…" }
    }
  }
}
```

Use the absolute path; Desktop does not expand `~` or `${VAR}`.

**Claude Code** — for all your projects:

```sh
claude mcp add --env GTD_URL=https://gtd.example.com --env GTD_TOKEN=gtd_… \
  --transport stdio --scope user gtd -- /Users/you/bin/gtd-mcp
```

(`--env` takes several pairs, so the server name must not follow it directly.) In a shared
`.mcp.json`, write `"GTD_TOKEN": "${GTD_TOKEN}"` and keep the token in your
environment — Claude Code expands it.

**Codex** — `codex mcp add gtd --env GTD_URL=https://gtd.example.com --env GTD_TOKEN=gtd_… -- /Users/you/bin/gtd-mcp`,
or in `~/.codex/config.toml`:

```toml
[mcp_servers.gtd]
command = "/Users/you/bin/gtd-mcp"

[mcp_servers.gtd.env]
GTD_URL = "https://gtd.example.com"
GTD_TOKEN = "gtd_…"
```

**An agent on a server** (e.g. one you reach from the phone through a chat app): copy
`gtd-mcp-linux-amd64` (or `-arm64`) there and register it as a stdio MCP server in that agent's
configuration — command: the binary's path; environment: `GTD_URL`, `GTD_TOKEN`. If the agent
runs next to the app, `GTD_URL` may be the app's internal address (e.g. `http://gtd:3000` on a
shared Docker network) and needs no proxy bypass.

## 4. Use it

Ask the agent "what's on my plate?" (it reads `get_overview`), "put these notes in my inbox",
"I'm waiting on the shop for the quote, add it", or start a workflow from your client's prompt
list ("Weekly review with me", "Plan my day" …). Agents act when you state the decision and
draft (Clarify opens with it filled in) when they would be deciding themselves.

After an app update, restart the agent (or its MCP server) so it reads the new tool list.
