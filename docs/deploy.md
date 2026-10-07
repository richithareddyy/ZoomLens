# Putting Zoom Lens somewhere permanent

Run locally, the application only works while the machine is awake with two
terminals open, and the address changes whenever the tunnel restarts. Every
change means re-entering the address in four places in the Zoom configuration
and authorising again. Hosting removes all of that.

## Decide this first

**Reading the screen stops working when it is hosted.** `screen.js` takes a
picture of the display of the machine it runs on. On a server there is no
display, so a hosted copy falls back to a recording and labels every answer as
such.

Live capture from the meeting itself still needs the account capability that
has not been enabled.

So there is a real choice:

| | Reachable without a laptop | Reads the current screen |
|---|---|---|
| Hosted | yes | no |
| Laptop | no | yes |

**Running both is reasonable.** Host it so the address is permanent and the
application survives the local machine being off, and keep a local setup for
when reading the current screen matters.

Nothing here is wasted either way. The moment live capture is enabled, the
hosted copy becomes the only one needed.

## What to use

Any host that runs a Node web service will do. Render has a free tier, deploys
from a GitHub repository, and needs no Docker file.

## Deploying

1. render.com, sign in with GitHub, **New** then **Web Service**
2. Pick the `zoom-lens` repository
3. Settings:

```
Runtime         Node
Build command   npm install
Start command   npm start
```

4. Add the environment variables below, under Environment. **Do not commit
   them.** `.env` is excluded from the repository on purpose.

```
ZM_RTMS_CLIENT            the Zoom Lens client id
ZM_RTMS_SECRET            the Zoom Lens client secret
ZM_RTMS_SECRET_TOKEN      the webhook secret token
ANTHROPIC_API_KEY         the model provider key
VISION_MODEL              claude-opus-5
ZOOM_LENS_ALLOW_RECORDED  1
ZOOM_LENS_COOLDOWN_SECONDS 5
ZOOM_LENS_DAILY_LIMIT     60
```

Leave `ZOOM_LENS_LOCAL_SCREEN` unset. There is no display to read.

`PORT` is provided by the host and the server already reads it.

5. Deploy, and note the address, which will look like
   `https://zoom-lens.onrender.com`

## Pointing Zoom at it

In the Marketplace, on the Zoom Lens application, replace the tunnel address in
all four of these. Missing one is the usual way this goes wrong.

| Where | Value |
|---|---|
| Basic Information, OAuth Redirect URL | `https://NEW/auth/callback` |
| Basic Information, OAuth Allow List | `https://NEW` |
| Features, Access, Event notification endpoint | `https://NEW` |
| Features, Surface, Home URL and Domain Allow List | `https://NEW` |

Then authorise once more, because the redirect address has changed, and
exchange the code as before.

## Checking it worked

```
curl -s -o /dev/null -w "%{http_code}\n" https://NEW/
```

Expect 200. Then open the panel in a meeting and confirm it binds with your
name, and that an answer comes back.

## The one thing to watch

A free tier usually sleeps an idle service, and waking it takes several
seconds, so the first request after a quiet period will be slow. Either use a
tier that does not sleep, or open the panel a few minutes early so it is already
awake.
