#!/usr/bin/env bash
# Cron entry point: render any spec lacking current HTML. Skips quietly when the data disk is absent.
set -euo pipefail
export DATA_ROOT="${DATA_ROOT:-/mnt/usbssd/museum-data}"
export PATH="$HOME/.deno/bin:$PATH"
cd "$(dirname "$0")/.."
[ -d "$DATA_ROOT/collection" ] || exit 0
exec deno task render
