# Putting ZoomLens on a server

ZoomLens needs one address that is always up. Zoom sends its webhooks there,
the panel loads from it, and the panel's WebSocket connects back to it.

A laptop behind ngrok isn't enough, and not only because it sleeps. Zoom
revalidates the webhook endpoint every 72 hours and expects an answer within
3 seconds. After six failed revalidations in a row it stops sending events and
switches the subscription off, which is how events stopped reaching ZoomLens in
September. An always-on server answers every revalidation.

## What the server needs

- Node 22.9 or later. The Zoom RTMS SDK needs 22, and `npm start` uses
  `--env-file-if-exists`, which arrived in 22.9.
- Linux or macOS, on x64 or arm64, the platforms the RTMS SDK ships for.
  `npm ci` downloads the right build.
- HTTPS, and WebSocket support on the same address.
- An instance that doesn't sleep (see above).

Nothing has to be stored on disk. Answers come from memory.

## Deploying on Render

The repository has a Blueprint, `render.yaml`.

1. On render.com, sign in with GitHub, then **New**, then **Blueprint**, and
   pick the ZoomLens repository.
2. Render asks for the secret values. Copy them from your local `.env`:
   `ZM_RTMS_CLIENT`, `ZM_RTMS_SECRET`, `ZM_RTMS_SECRET_TOKEN`,
   `ANTHROPIC_API_KEY` and `VISION_MODEL`. They are stored by Render and never
   committed. The testing settings are already fixed at `0`.
3. Choose a plan that doesn't sleep, and create it.
4. Note the address, which looks like `https://zoomlens.onrender.com`, and
   check it:

```
curl -s https://NEW/healthz
```

Expect `{"ok":true,...}`. `PORT` comes from Render, and the server reads it.

Any other Node host works the same way: build with `npm ci`, start with
`npm start`, health check `/healthz`, and the environment variables above.

## Pointing Zoom at it

In the Marketplace, on the ZoomLens app, replace the tunnel address everywhere
it appears. Missing one is the usual way this goes wrong.

| Where | Value |
|---|---|
| OAuth Redirect URL | `https://NEW/auth/callback` |
| OAuth Allow List | `https://NEW` |
| Event Subscription, Event notification endpoint URL | `https://NEW` |
| Surface, Home URL | `https://NEW` |
| Surface, Domain Allow List | `NEW` |

Then, in the event subscription:

1. Make sure the events are **RTMS Started** and **RTMS Stopped**.
2. Press **Validate**. The server log shows `VALIDATION passed`, and
   `/healthz` shows the time under `lastValidation`.
3. Save.

Under Surface, In-client App Features, make sure **Zoom App SDK** is on and
**startRTMS** is in its APIs, so the panel's Start button works. It needs the
Zoom desktop client 6.5.5 or later.

## Checking the whole chain

1. Start a meeting, share your screen, and open ZoomLens from **Apps**.
2. The panel says **Not started**. Press **Start ZoomLens in this meeting**.
   As host it starts straight away; for anyone else, Zoom asks the host.
3. The server log shows `Webhook: meeting.rtms_started`, then
   `JOIN CONFIRMED`, then `DESKSHARE frame #1`, and the panel says **Ready**.
   `/healthz` shows the time under `lastWebhook`.
4. Press **Describe screen**.

If nothing arrives after step 2, `/healthz` says whether Zoom has reached the
server at all. A `Rejected a POST because ...` line says why a request was
refused, for example a secret token that doesn't match the Marketplace.

## Running it on a laptop instead

Still useful for development: `npm start` with a `.env`, and an ngrok tunnel
whose address is in `ZOOM_LENS_PUBLIC_URL` and in the Marketplace settings
above. On a laptop, `ZOOM_LENS_LOCAL_SCREEN=1` can read the machine's own
display when the meeting stream isn't available; it does nothing on a server,
which has no display.
