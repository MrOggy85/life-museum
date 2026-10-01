#!/usr/bin/env bash
# Cron entry point: low CPU/IO priority, closes at 04:30 JST. Log lines go to the data root.
set -euo pipefail
export DATA_ROOT="${DATA_ROOT:-/mnt/usbssd/museum-data}"
export PATH="$HOME/.deno/bin:$PATH"
cd "$(dirname "$0")/.."
mkdir -p "$DATA_ROOT/catalog" 2>/dev/null || exit 0 # disk absent: skip quietly
exec ionice -c3 nice -n 19 deno task batch --until=04:30 >> "$DATA_ROOT/catalog/batch.log" 2>&1
