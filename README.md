# Zoom Lens

A Zoom app that tells you what is on somebody else's shared screen, privately.

If you join a meeting late, look away for a minute, or hit material outside what
you know, your options are usually to interrupt the presenter or to sit there
and hope it becomes clear. Zoom Lens is a third option. You open a panel, ask,
and get an answer a few seconds later. Nobody else in the meeting sees that you
asked, and the person sharing is not notified.

## What it does

Two shortcuts and a text box.

- **Describe screen** summarises what is currently shared, in about six seconds.
- **Explain this** says what the content means rather than what it says, in
  about ten.
- The input takes any question, and once there is an answer it asks for a
  follow-up scoped to it.

## How it is put together

```
Zoom  ──webhook──>  index.js  ──frames──>  framebuffer.js
                       │                        │
panel  <──WebSocket──  relay.js            decode.js
                       │                        │
                       └──────> answer.js <─────┘
```

| File | Does |
|---|---|
| `index.js` | Serves the panel, receives Zoom's webhooks, holds everything together |
| `relay.js` | The connection to each panel, and the privacy rules |
| `framebuffer.js` | Keeps recent screen video in memory so an image is ready on demand |
| `decode.js` | Turns that video into a still image |
| `screen.js` | Reads the local display, used while the meeting stream is unavailable |
| `answer.js` | The prompts and the model call |
| `public/` | The in-meeting panel |

## Privacy

Answers reach the participant who asked and nobody else. That is enforced in
`relay.js` rather than in the panel, because anything enforced in the panel can
be changed by whoever is running it. Every outbound message names one session,
there is no broadcast, and a reply is refused unless it matches a request that
session actually made.

`docs/privacy.md` sets out what is guaranteed, which code enforces it, and what
the residual risks are. `test-isolation.js` checks the guarantees hold, and was
itself checked by deliberately breaking the isolation to confirm the tests catch
it.

## Running it

Needs Node 20.6 or newer, a Zoom Marketplace app with RTMS access, and an API
key for the model.

```
npm install
cp .env.example .env     # then fill it in
npm start
```

The panel has to be reachable at the address configured in the Marketplace. For
local work that means a tunnel:

```
ngrok http 8080
```

`docs/deploy.md` covers putting it somewhere permanent instead.

## Tests

```
node test-isolation.js    # per-participant isolation, seven cases
node test-ratelimit.js    # the cooldown and the daily ceiling
node test-answer.js       # a request through to a real answer
node test-snapshot.js     # a recording through the buffer and decoder
```

## Known limitations

- Reading the shared screen directly from the meeting's media stream needs a
  capability enabled on the Zoom account. Until then the backend reads its own
  display, which works because Zoom draws the shared screen there, and every
  answer says where the image came from.
- Only the account the app is installed on can open the panel.
- Closing and reopening the panel loses the conversation, because the previous
  answer is held per connection.

## Documents

- `docs/protocol.md` the messages between panel and backend
- `docs/privacy.md` what is guaranteed and what is not
- `docs/deploy.md` moving off a laptop
