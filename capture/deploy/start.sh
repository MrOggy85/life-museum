#!/bin/bash
# Starts the capture container. Tailnet-only: odin's own tailscaled serves it. Expose once with
#
#   tailscale serve --service=svc:life-museum-capture --bg 8001
#
# Never add `tailscale funnel` here: the api has no login because nothing untrusted can reach it.
#
# /mnt/usbssd is bind-mounted whole, with rslave propagation, rather than just museum-data/:
# if the disk is unmounted when this starts, the container then sees an empty /mnt/usbssd, the
# data root does not exist, and the mount guard refuses to start - instead of silently
# capturing onto the root filesystem. rslave also lets a later re-mount show through.
#
# Rootless daemon (2026-11-07): container uid 0 is oskar on the host, so files it writes stay
# oskar-owned. A fixed uid like 1000 would map to 100999 and could not write museum-data.
set -uo pipefail
DOCKER="docker -c rootless"
NAME=life-museum-capture
PORT=8001

$DOCKER image inspect $NAME:latest >/dev/null 2>&1 || { echo "build first: ./build.sh"; exit 1; }
$DOCKER rm -f $NAME >/dev/null 2>&1
$DOCKER run -d --name $NAME -u 0:0 --restart unless-stopped \
  -p 127.0.0.1:$PORT:$PORT \
  --mount type=bind,src=/mnt/usbssd,dst=/mnt/usbssd,bind-propagation=rslave \
  $NAME:latest || { echo "failed to start"; exit 1; }

sleep 2
echo "health: $(curl -sS -m 5 http://127.0.0.1:$PORT/api/health)"
