#!/bin/bash
# Builds the catalog's ffmpeg image. Separate from the batch so a rebuild is always deliberate.
# The tag is the build date; catalog/stages/media.ts names the one it runs (FFMPEG_IMAGE).
set -uo pipefail
cd "$(dirname "$0")"
tag="life-museum-ffmpeg:${1:-$(date +%F)}"
docker -c rootless build -t "$tag" . && echo "built $tag"
