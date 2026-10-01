#!/bin/bash
# Builds the exhibition image. Separate from start.sh so a rebuild is always deliberate.
set -uo pipefail
cd "$(dirname "$0")/.."
docker -c default build -t life-museum-exhibition:latest . && echo "built life-museum-exhibition:latest"
