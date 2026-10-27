# ZoomLens

A development prototype for asking questions about a shared screen during a Zoom meeting. The panel offers **Describe screen**, **Explain**, **What changed?**, a question box, follow-ups to the previous answer, and two accessibility modes.

The idea is to help someone catch up with a slide, chart, or piece of code without interrupting the presentation. Replies return to the requesting WebSocket session. Who is asking is checked with Zoom, as described under [Current boundaries](#current-boundaries), and saved screen content is deleted after a day. It still needs a hosted server and Marketplace review before broader use.

## From a screen share to an answer

```text
Zoom RTMS → H.264 buffer → FFmpeg → JPEG → Anthropic vision API
                                               ↓
Zoom panel ← session-scoped WebSocket reply ← answer.js
```

The backend uses Node.js, Express, the Zoom RTMS SDK, `ws`, `ffmpeg-static`, and the Anthropic SDK. The panel uses the Zoom Apps SDK and plain JavaScript.

- [`framebuffer.js`](framebuffer.js) retains H.264 parameter sets and video since a keyframe, because an arbitrary video chunk cannot be decoded as a standalone image.
- [`decode.js`](decode.js) decodes the buffered clip on demand and reads its last JPEG frame. Temporary decoding files are removed afterward.
- [`answer.js`](answer.js) sends the image with a mode-specific prompt. Follow-ups include the session's previous answer and a fresh screen image.
- [`relay.js`](relay.js) tracks pending requests per connection and sends each answer back to that connection. It also maintains an in-memory cooldown and request allowance keyed by the supplied meeting and participant IDs.
- [`index.js`](index.js) serves the panel, receives webhooks, and manages RTMS clients and buffers. [`public/`](public/) contains the panel; [`site/`](site/) is the separate project website.
- [`watch.js`](watch.js), [`change.js`](change.js), and [`colors.js`](colors.js) run the accessibility modes described below.

This repository builds on Zoom's RTMS JavaScript quickstart; the attribution is retained in [`LICENSE`](LICENSE).

## Accessibility modes

Both are switches in the panel, off by default and private to the participant who turns them on.

- **Announce screen changes**, for participants who are blind or have low vision. The panel adds a short description each time the shared screen changes in a way worth mentioning, and the participant's screen reader announces it. A 64x36 greyscale fingerprint decides when the screen changed, so the model is not asked about every frame; on the two development recordings it would have been asked about one look in eight to ten.
- **Color Assist**, for participants with a color vision deficiency. Answers name things by label, value, or position rather than color, **Explain colors** says what each color means, and a note appears when a new screen tells things apart by color alone. Colors and likely confusions are found without a model (CIELAB, CIEDE2000, and simulated protanopia, deuteranopia, and tritanopia); the model is asked only when that analysis finds colors that could be confused.

Neither mode has been tried with the people it is for yet. [`docs/accessibility.md`](docs/accessibility.md) covers the design, measurements, and limitations, and [`demo/color-dashboard.html`](demo/color-dashboard.html) is a screen to share when demonstrating Color Assist.

## Run locally

Requires Node.js 22.9+, a Zoom Marketplace app configured for the panel and RTMS events, and an Anthropic API key.

```bash
git clone https://github.com/richithareddyy/ZoomLens.git
cd ZoomLens
npm ci
cp .env.example .env
```

Set `ZM_RTMS_CLIENT`, `ZM_RTMS_SECRET`, `ZM_RTMS_SECRET_TOKEN`, `ANTHROPIC_API_KEY`, and `VISION_MODEL`. The selected model must be available to your account and support the request options in `answer.js`; the example model name is configuration, not an availability check.

```bash
npm start
```

The default port is 8080. A local tunnel such as `ngrok http 8080` supplies an HTTPS address for the Marketplace configuration; put the same address in `ZOOM_LENS_PUBLIC_URL`. The panel is served at `/`, webhooks arrive at `POST /`, the relay uses `/ws`, and `/healthz` reports when Zoom last reached the server. [Deployment notes](docs/deploy.md) cover hosting it permanently, which Zoom's webhook revalidation needs, and [Marketplace notes](docs/marketplace.md) cover submission.

The preferred input is the meeting's RTMS screen-share stream, started from the panel's **Start ZoomLens in this meeting** button (Zoom's `startRTMS`; a participant's press asks the host). `start-rtms.js` does the same through the REST API for development. Only the screen share is subscribed to: no audio, camera video, chat or transcript. Three development settings are opt-in:

| Setting | Behavior |
| --- | --- |
| `ZOOM_LENS_LOCAL_SCREEN=1` | Capture the backend machine's display on macOS; requires Screen Recording permission and may include content outside Zoom. |
| `ZOOM_LENS_ALLOW_RECORDED=1` | Use the newest file in `captures/` when no live input is available. This is not scoped to a meeting. |
| `ZOOM_LENS_SAVE_CAPTURES=1` | Save incoming screen-share video to `captures/`, for the recorded fallback, `snapshot.js`, and `eval-changes.js`. |

All three are off by default, and fallback answers carry a source note. Saved recordings and snapshots are deleted after 24 hours (`ZOOM_LENS_CAPTURE_HOURS`, `ZOOM_LENS_SNAPSHOT_HOURS`). Keep them confined to controlled local demonstrations. `ZOOM_LENS_WATCH_SECONDS` (default 2) sets how often the accessibility modes look at the screen.

## Tests

These scripts start their own relay and do not call the model:

```bash
node test-isolation.js
node test-ratelimit.js
node test-trust.js    # app context, tickets, and webhook signatures
node test-change.js   # change detection on synthetic screens
node test-colors.js   # color analysis against published values and synthetic screens
node test-watch.js    # both modes reach only the participants who turned them on
node test-retention.js # old screen content is deleted from disk, nothing else
```

The remaining checks need external inputs:

```bash
node test-snapshot.js captures/example.h264  # supply a recording; writes test snapshots
node test-answer.js describe                # running server, usable screen source, API key
node eval-changes.js captures/example.h264  # replays a recording through change detection and Color Assist
```

`test-answer.js` identifies itself as `test-meeting==`, so a normal live meeting does not automatically supply its input. Use a controlled fallback for that script. It makes a real model request. The timings shown in the panel are estimates, not latency benchmarks. There is no automated evaluation of answer accuracy.

## Current boundaries

Who is asking comes from Zoom's encrypted app context, checked when Zoom loads the panel and turned into a random ticket the panel presents; IDs the panel sends on its own are ignored. Tickets are bearer tokens held in memory for up to 12 hours, so a server restart means reopening the panel. Webhook requests, the URL-validation challenge included, must carry a valid Zoom signature, be under five minutes old, and not be replays. [`trust.js`](trust.js) holds both checks and [`test-trust.js`](test-trust.js) tests them.

Images and questions are sent to Anthropic without redaction, and with an accessibility mode on, so is a still each time the screen changes (up to one every 10 seconds; Color Assist only when its analysis finds colors that could be confused). Transcripts, questions, and participant names are not logged; the log records request modes and question lengths. Screen-share video is written to `captures/` only with `ZOOM_LENS_SAVE_CAPTURES=1`, and saved recordings are deleted after 24 hours by default. The [privacy notes](docs/privacy.md) describe what is and isn't protected.

The app does not send its own presenter notification when a question is asked; that does not establish what Zoom displays about RTMS capture. Closing a connection loses its follow-up context. Answers can misread a screen, and the macOS display fallback cannot isolate shared content from the rest of the display.

[Panel protocol](docs/protocol.md) · [Deployment notes](docs/deploy.md) · [Privacy notes](docs/privacy.md)
