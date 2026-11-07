#!/bin/bash
# Starts the exhibition container. Tailnet-only: odin's own tailscaled serves it. Expose once with
#
#   tailscale serve --service=svc:life-museum --bg 8002
#
# Never add `tailscale funnel` here. Same mount strategy as capture/deploy/start.sh (whole
# /mnt/usbssd, rslave, mount guard in the app). The app has no write permission at all.
#
# Rootless daemon (2026-11-07): container uid 0 is oskar on the host, so files it writes stay
# oskar-owned. A fixed uid like 1000 would map to 100999 and could not write museum-data.
set -uo pipefail
DOCKER="docker -c rootless"
NAME=life-museum-exhibition
PORT=8002

$DOCKER image inspect $NAME:latest >/dev/null 2>&1 || { echo "build first: ./build.sh"; exit 1; }
$DOCKER rm -f $NAME >/dev/null 2>&1
$DOCKER run -d --name $NAME -u 0:0 --restart unless-stopped \
  -p 127.0.0.1:$PORT:$PORT \
  --mount type=bind,src=/mnt/usbssd,dst=/mnt/usbssd,bind-propagation=rslave,readonly \
  $NAME:latest || { echo "failed to start"; exit 1; }

sleep 2
echo "health: $(curl -sS -m 5 http://127.0.0.1:$PORT/api/health)"
