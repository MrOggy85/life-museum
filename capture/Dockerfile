# syntax=docker/dockerfile:1
FROM denoland/deno:2.6.9 AS client
WORKDIR /src/client
COPY client/ ./
RUN deno install --config deno.json && deno task build

FROM denoland/deno:2.6.9 AS runtime
WORKDIR /app/api
COPY api/ ./
COPY --from=client /src/client/dist /app/client/dist
# @db/sqlite downloads its native library on first open; do it at build time so a cold start
# never needs the network.
RUN deno cache --config deno.json main.ts \
 && deno eval --config deno.json "import { Database } from '@db/sqlite'; new Database(':memory:').close();" \
 && chown -R 1000:1000 /deno-dir

# Binds all interfaces inside the container; deploy/start.sh publishes the port on the
# host's loopback only, so `tailscale serve` is the sole way in.
ENV HOST=0.0.0.0 \
    PORT=8001 \
    DATA_ROOT=/mnt/usbssd/museum-data \
    MOUNT_POINT=/mnt/usbssd \
    CLIENT_DIR=/app/client/dist \
    TZ=Asia/Tokyo

USER 1000
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write=/mnt/usbssd/museum-data", "--allow-ffi", "--allow-env", "main.ts"]
