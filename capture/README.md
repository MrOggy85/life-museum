# capture

`api/` is the Deno server (upload endpoint + serves the PWA); `client/` is the React PWA, built to `client/dist/`.

```sh
cd capture/client && deno task build          # esbuild bundle -> dist/ (also writes the service worker)
cd capture/api && DATA_ROOT=/mnt/usbssd/museum-data deno task start
```

Env: `DATA_ROOT` (required), `HOST` (default `127.0.0.1`), `PORT` (default `8001`), `CLIENT_DIR` (default `../client/dist`).

- **Mount guard.** Startup fails unless `DATA_ROOT` exists and is on a different filesystem device than its parent,
  because a missing `nofail` USB disk would otherwise leave captures landing on the root filesystem. For temp/test runs
  only, `ALLOW_UNMOUNTED_DATA_ROOT=1` skips the device check (the directory must still exist).
- **Archive layout.** `archive/YYYY/MM/<capture_id>.<native ext>` (month of receipt, UTC) and `archive/archive.sqlite`.
  Uploads are stored as recorded; the cataloguer normalizes to MP4. Browsers may label MediaRecorder output
  `video/mp4` while the codec is VP9, so trust the cataloguer's probe, not the extension.
- **Idempotency.** Dedupe is on `client_uuid`: 201 for a new capture, 200 with the same `capture_id` for a retry.
  A crash between the clip rename and the row insert can leave an orphan clip file; the retry stores a new one.
- Tests: `deno task test` in each of `api/` and `client/`. The offline queue and uploader logic live in plain modules
  under `client/src/`.
