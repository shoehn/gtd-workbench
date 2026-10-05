#!/usr/bin/env bash
# Build gtd-mcp for macOS and Linux (arm64, amd64) into mcp/dist/, static, version from package.json.
set -euo pipefail
cd "$(dirname "$0")/../mcp"
version=$(node -p "require('../package.json').version")
mkdir -p dist
for target in darwin/arm64 darwin/amd64 linux/arm64 linux/amd64; do
  os=${target%/*}
  arch=${target#*/}
  CGO_ENABLED=0 GOOS=$os GOARCH=$arch go build -trimpath -ldflags "-s -w -X main.version=$version" -o "dist/gtd-mcp-$os-$arch" ./cmd/gtd-mcp
  echo "mcp/dist/gtd-mcp-$os-$arch"
done
