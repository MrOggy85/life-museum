# Capture Client

The thin client that feeds the archive. Its whole job is to be a **viewfinder and
a shutter** — nothing else. The design references are screenless "dumb" cameras
(Escura InstantSnap, Godox C100): a transparent piece of plastic to look through
and a button to press.

That metaphor is not just aesthetic. It *is* the capture doctrine from
[`VISION.md`](VISION.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md) made tactile:
open straight to the camera, capture freely, and **never review, browse, or
delete**. Separating capturing from reviewing is the point — the device documents
life; it does not let you curate it.

## Doctrine it must obey

- **Opens directly to the live camera.** No home screen, no menu.
- **No review, no browsing, no delete.** Today's captures cannot be inspected.
  After a capture, the client shows a brief confirmation and returns to the live
  view — never the result.
- **Freeform.** Capture whenever, as often as desired. No quota, no schedule.
- **Reminders encourage, never nag** (see [Reminders](#reminders)).
- **Real video** (H.264/HEVC MP4 downstream). No GIF.

## What it is

A **PWA** — `getUserMedia` + `MediaRecorder`, installable to the home screen,
opening straight to a full-screen preview. No native toolchain, no app store. It
is reached only over Tailscale, so the network is the authentication; there is no
login. This keeps it aligned with the project's "thin client, minimal deps"
stance.

## The screen

```
┌───────────────────────────────┐
│                               │  ← full-screen live viewfinder
│                               │    (the "transparent plastic")
│                               │
│                               │
│                               │
│                               │
│                               │
│   ( snap )     (( ⏺ ))   [3s] │  ← snap · shutter · duration toggle
└───────────────────────────────┘
```

- **Center — the shutter.** A big round button. One tap records a fixed-length
  clip and **auto-stops**; a ring drains around the button over the duration as
  the only progress indicator.
- **Left — snap.** A smaller, differently-coloured button that captures the
  **shortest clip** (a "quick moment"). A snap is a short clip, **not** a separate
  photo type: a true photo would have no duration, audio, or motion, forcing
  nullable branches through the catalog and every curator for marginal gain over a
  clip's frames. Keeping one media type end-to-end is the simpler, faithful choice.
- **Right — duration toggle.** Cycles the clip length (default **3s**, then
  **5s**, **10s**). The only on-screen setting; the app has no settings page.
- **Confirmation.** On capture: a subtle flash + haptic, then back to live view.
  No thumbnail, no "keep/discard."

Everything else a camera app usually has — gallery, playback, filters, editing —
is deliberately absent. Their absence is a feature, not a gap.

## Capture never blocks on the network

Capture and upload are decoupled. This is more robust *and* fewer edge cases than
uploading inline.

```
tap ─▶ MediaRecorder ─▶ Blob ─▶ enqueue to IndexedDB ─▶ (return to live view)
                                        │
             background uploader ───────┘ drains the queue when reachable
                POST /api/captures (with retry + backoff) ─▶ capture server
                                        │
                                        ▼
                      archive/ (clip file) + archive.sqlite (row), append-only
```

- Every capture is written to an on-device **IndexedDB queue** first, so a capture
  is never lost to a tailnet blip and the shutter always feels instant.
- A background uploader drains the queue with retry/backoff whenever the server is
  reachable.
- Each queued item carries a **client-generated UUID**; the server dedupes on it,
  so retries never create duplicates (idempotent upload).

## Dumb client, smart cataloguer

The client sends only what the device provides for free; everything about
*content* is derived later by the cataloguer (see
[`STACK.md`](STACK.md#what-the-catalog-contains)). This removes permissions and
code from the client and keeps enrichment in one place.

| The client sends                         | The cataloguer derives (not the client)        |
| ---------------------------------------- | ---------------------------------------------- |
| the raw recording (native codec)         | transcript, scene description, OCR             |
| `captured_at` (device clock + timezone)  | motion state (from the video)                  |
| GPS `lat`/`lon`/`accuracy` (if permitted)| dominant colors, audio events, objects         |
| `mode` (`clip`/`snap`), `requested_seconds` | duration (measured), place name (geocoded)  |
| device model / OS (coarse)               | embeddings                                     |
| `client_uuid` (idempotency)              |                                                |

Consequences:

- **No motion-sensor permission.** Motion is derived from the video, not captured
  from the accelerometer.
- **No client-side transcode or thumbnails.** The client uploads the native
  recording (iOS and Android differ); the **runner normalizes to MP4** with
  ffmpeg. The client never fights codecs, and "no GIF / prefer MP4" is enforced in
  one place.

## Server endpoints (`capture/api`)

House style: Deno `Deno.serve`, one `handler(req)`, manual routing; serves the PWA
and accepts uploads.

| Method + path        | Purpose                                                        |
| -------------------- | ------------------------------------------------------------- |
| `GET  /`             | the PWA (SPA fallback)                                         |
| `POST /api/captures` | multipart: recording blob + JSON metadata → append to archive; returns `{ capture_id }` (idempotent on `client_uuid`) |
| `GET  /api/health`   | liveness for the uploader                                      |

The server's only write is **append to the archive** (clip file + `archive.sqlite`
row). It never reads back captures to the client — there is nothing to review.

## Permissions & secure context

- **Camera** (`getUserMedia`) and **Geolocation** are the only prompts.
- `getUserMedia` requires HTTPS. Served over **Tailscale Serve** with tailnet
  certificates (see [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md#ingress--tls)), which
  gives a valid secure context without any public exposure.

## Reminders

The vision calls for gentle daily prompts (morning, lunch, afternoon, evening)
that encourage without nagging. On a tailnet-only, no-cloud system this is the
one genuinely awkward piece: real web push requires an **external** push service
(FCM / Apple Push), which would break the no-cloud stance.

**v1 decision:** use the phone's **native clock/reminders app** — the subject sets
a few repeating alarms. Zero code, zero infrastructure, and it fits "reminders,
not obligations" better than an app that pings you. An in-app, no-cloud mechanism
can be revisited later if it ever proves worthwhile.

## Deliberately NOT built

No gallery · no playback · no delete/edit · no filters/effects · no accounts/login
· no settings page (beyond the duration toggle) · no client-side transcoding · no
motion-sensor plumbing. Each omission is less to maintain and more faithful to the
doctrine.

## Decided

- **Still capture is a "snap" = shortest clip** — one media type end-to-end, no
  separate photo type.
- **Reminders are OS-native alarms** for v1 — no in-app push, no cloud.

## Open decisions

- **Duration presets.** 3s / 5s / 10s assumed; adjust the set if desired.
- **Capture gesture.** One-tap fixed-length (auto-stop) assumed; press-and-hold to
  extend is a possible later affordance, kept out for simplicity.

## Related

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — where `capture` sits in the system.
- [`STACK.md`](STACK.md) — runtimes, the archive store, what the cataloguer derives.
- [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md) — how the client is served (TLS) and
  where uploads land.
- [`VISION.md`](VISION.md) — why capturing is separated from reviewing.
- [`../CLAUDE.md`](../CLAUDE.md) — the doctrine all parts obey.
</content>
