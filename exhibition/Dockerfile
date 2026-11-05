# syntax=docker/dockerfile:1
FROM denoland/deno:2.6.9
WORKDIR /app/api
COPY api/ ./
# @db/sqlite downloads its native library on first open; do it at build time so a cold start
# never needs the network.
RUN deno cache --config deno.json main.ts \
 && deno eval --config deno.json "import { Database } from '@db/sqlite'; new Database(':memory:').close();" \
 && chown -R 1000:1000 /deno-dir

ENV HOST=0.0.0.0 \
    PORT=8002 \
    DATA_ROOT=/mnt/usbssd/museum-data \
    MOUNT_POINT=/mnt/usbssd \
    TZ=Asia/Tokyo

USER 1000
# Read-only by construction: no --allow-write, so the gallery floor cannot edit the vault.
CMD ["deno", "run", "--allow-net", "--allow-read=/mnt,/deno-dir,/app/api/icon", "--allow-ffi", "--allow-env", "main.ts"]
