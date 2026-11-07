#!/bin/bash
# Builds the capture image. Separate from start.sh so a rebuild is always deliberate.
set -uo pipefail
cd "$(dirname "$0")/.."
docker -c rootless build -t life-museum-capture:latest . && echo "built life-museum-capture:latest"
