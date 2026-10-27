# ZoomLens

A development prototype for asking questions about a shared screen during a Zoom meeting. Describe a slide, ask for an explanation, or follow up without interrupting the presentation.

Built by Richitha Rekula as part of the Next Lab Zoom Fellowship at Arizona State University. Try the demo at [zoomlens.vercel.app](https://zoomlens.vercel.app).

**Node.js · Express · Zoom Apps/RTMS SDKs · WebSockets · FFmpeg · Anthropic vision API**

The backend buffers H.264 video from a screen share, decodes a still with FFmpeg, and sends it with the question to the model. Answers return to the requesting WebSocket session. Follow-ups include the previous answer and a fresh image.

## Run locally

Requires Node.js 22.9+, a configured Zoom Marketplace app, and an Anthropic API key.

```bash
npm ci
cp .env.example .env
npm start
```

Fill in the Zoom credentials, webhook secret, API key, and supported vision model in `.env`. The server defaults to port 8080; Zoom needs an HTTPS address. See [deployment](docs/deploy.md) for the complete configuration.

## Accessibility work

**Announce changes** describes meaningful screen changes. **Color Assist** identifies potentially confusing colors and encourages explanations using labels, values, and position. Both are opt-in. Image fingerprints and color analysis limit unnecessary model calls.

These modes have not yet been evaluated with their intended users. The [accessibility notes](docs/accessibility.md) explain the implementation and development measurements.

## Checks and boundaries

```bash
node test-trust.js
node test-isolation.js
node test-ratelimit.js
node test-change.js
node test-colors.js
node test-watch.js
node test-retention.js
```

`npm test` runs all seven.

These checks do not call the model. Zoom app-context checks and signed webhooks establish request identity; images and questions still go to the model provider without redaction. Local-display and recorded-video fallbacks are opt-in and intended for controlled demonstrations. Answer accuracy has no automated evaluation, and the website demo uses scripted answers.

[Privacy](docs/privacy.md) · [Panel protocol](docs/protocol.md) · [Full setup and limitations](GUIDE.md)

Built on Zoom’s RTMS JavaScript quickstart; its attribution remains in [LICENSE](LICENSE).
