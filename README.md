# Zoom Lens

A development prototype for asking questions about a shared screen during a Zoom meeting. The panel offers **Describe screen**, **Explain this**, a question box, and follow-ups to the previous answer.

The idea is to help someone catch up with a slide, chart, or piece of code without interrupting the presentation. Replies return to the requesting WebSocket session. The current backend still needs authentication and data-retention work before broader use.

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

This repository builds on Zoom's RTMS JavaScript quickstart; the attribution is retained in [`LICENSE`](LICENSE).

## Run locally

Requires Node.js 20.6+, a Zoom Marketplace app configured for the panel and RTMS events, and an Anthropic API key.

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

The default port is 8080. A local tunnel such as `ngrok http 8080` supplies an HTTPS address for the Marketplace configuration. The panel is served at `/`, webhooks arrive at `POST /`, and the relay uses `/ws`. See [deployment notes](docs/deploy.md) for hosting details, subject to the limitations below.

The preferred input is the meeting's RTMS screen-share stream. Two development fallbacks are opt-in:

| Setting | Behavior |
| --- | --- |
| `ZOOM_LENS_LOCAL_SCREEN=1` | Capture the backend machine's display on macOS; requires Screen Recording permission and may include content outside Zoom. |
| `ZOOM_LENS_ALLOW_RECORDED=1` | Use the newest file in `captures/` when no live input is available. This is not scoped to a meeting. |

Both are off by default, and fallback answers carry a source note. Keep them confined to controlled local demonstrations.

## Tests

These scripts start their own relay and do not call the model:

```bash
node test-isolation.js
node test-ratelimit.js
```

The remaining checks need external inputs:

```bash
node test-snapshot.js captures/example.h264  # supply a recording; writes test snapshots
node test-answer.js describe                # running server, usable screen source, API key
```

`test-answer.js` identifies itself as `test-meeting==`, so a normal live meeting does not automatically supply its input. Use a controlled fallback for that script. It makes a real model request. The timings shown in the panel are estimates, not latency benchmarks. There is no automated evaluation of answer accuracy.

## Current boundaries

Session-scoped delivery is tested, but it is not verified participant authentication. The relay trusts IDs supplied in `hello`; a client can claim a meeting ID. The webhook route answers Zoom's URL-validation challenge but does not verify signatures on ordinary event requests. Neither the panel's installation status nor the request allowance closes those gaps.

Images and questions are sent to Anthropic without redaction. `index.js` writes incoming screen-share video to `captures/` and logs transcript text; the relay logs typed questions. Recordings are not automatically deleted. These implementation details supersede the stronger retention and logging claims in the earlier [privacy notes](docs/privacy.md).

The app does not send its own presenter notification when a question is asked; that does not establish what Zoom displays about RTMS capture. Closing a connection loses its follow-up context. Answers can misread a screen, and the macOS display fallback cannot isolate shared content from the rest of the display.

[Panel protocol](docs/protocol.md) · [Deployment notes](docs/deploy.md) · [Earlier privacy design notes](docs/privacy.md)
