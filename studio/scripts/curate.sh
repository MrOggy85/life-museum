#!/usr/bin/env bash
# Cron entry point. cron's PATH is minimal, so add deno and claude. Uses the OAuth token file when present;
# otherwise claude falls back to the interactive login in ~/.claude.
set -euo pipefail
export DATA_ROOT="${DATA_ROOT:-/mnt/usbssd/museum-data}"
export PATH="$HOME/.deno/bin:$HOME/.local/bin:$PATH"
TOKEN_FILE="$HOME/.config/life-museum/oauth"
if [ -r "$TOKEN_FILE" ]; then CLAUDE_CODE_OAUTH_TOKEN="$(cat "$TOKEN_FILE")"; export CLAUDE_CODE_OAUTH_TOKEN; fi
cd "$(dirname "$0")/.."
exec deno task curate
