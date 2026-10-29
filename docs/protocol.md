# Zoom Lens message protocol

Version 1.

The panel and the backend are separate programs. This document defines the
messages they exchange, so both sides can be built against the same contract
rather than one being written to match the other after the fact.

## Transport

A WebSocket at `wss://<host>/ws`, opened by the panel when it loads.

WebSocket rather than server-sent events because the panel needs to send as
well as receive. Answers take several seconds to produce, so the connection
stays open rather than the panel polling for a result.

One open socket is one **session**. A participant who opens the panel twice has
two sessions and they are treated as unrelated.

## Why identity is in the protocol

Zoom Lens shows each participant only their own answers. The presenter is never
told the tool is in use. That guarantee has to be enforced on the backend,
because anything enforced only in the panel can be bypassed by whoever is
running the panel.

So every session is bound to a participant at the moment it opens, and every
response is addressed to exactly one session. The backend never broadcasts.

## Message shape

Every message is JSON with a `type` field. Messages that belong to a particular
request also carry `id`, a value the panel generates so it can match an answer
to the request that caused it.

Unknown `type` values are ignored rather than treated as errors, so that a newer
panel talking to an older backend degrades instead of breaking.

## Panel to backend

### `hello`

Sent once, immediately after the socket opens. No other message is accepted
until this arrives.

```json
{
  "type": "hello",
  "ticket": "9f2c…",
  "meetingUUID": "clRQeYiYTjW0kV24udOrOA=="
}
```

`ticket` is what identifies the session. The server writes it into the panel
page when Zoom loads it with a valid encrypted app context, and takes the
meeting and Zoom user from its own record of the ticket (see `trust.js`).
`meetingUUID` is what the Zoom Apps SDK reported; it is only compared with the
verified meeting and logged if they differ.

Without a valid ticket, for example when the panel is opened outside Zoom or the
server has restarted since the page loaded, the backend marks the session
`unidentified`. An unidentified session may connect but may not request
anything, because there is nobody to send the answer to. IDs in the message
itself are never trusted.

### `request`

Asks for an answer about the screen currently being shared.

```json
{
  "type": "request",
  "id": "r-7",
  "mode": "describe",
  "question": null
}
```

`mode` is `describe`, `explain`, `ask`, `followup`, `changed` or `colors`.

| Mode | Meaning | `question` |
|---|---|---|
| `describe` | What is on the shared screen now | ignored |
| `explain` | What the content means | ignored |
| `ask` | A question about the current screen, standing on its own | required |
| `followup` | A question scoped to this session's previous answer | required |
| `changed` | What is different since this session's previous answer, or a short description if there is none | ignored |
| `colors` | What each color on screen means, named by label and position rather than color | ignored |

With Color Assist on (see `watch`), every mode is answered without relying on
color, and the backend adds its own pixel analysis of the colors to the request.

`ask` exists because the panel has a persistent input, and a
question typed before any answer exists has no previous answer to be scoped to,
which is what `followup` requires. Everything already using the first three
modes is unaffected.

### `watch`

Turns a feature on or off for this session.

```json
{ "type": "watch", "feature": "changes", "on": true }
```

| `feature` | While on |
|---|---|
| `changes` (the default) | The screen is described again each time it changes in a way worth mentioning |
| `color` | Answers are color-safe, and a note is sent when a new screen tells things apart by color alone |

The backend replies with `watching`. While either is on, it looks at the
meeting's screen every 2 seconds and sends `update` when there is something to
say. Settings belong to the connection: after a reconnect the panel sends them
again.

### `allow`

The host turning ZoomLens on or off for the whole meeting.

```json
{ "type": "allow", "on": false }
```

Refused with `not_host` unless the server knows this participant is the host
(see `host` under `ready`). Turning it off fails any request in flight in the
meeting, so its answer is never delivered, stops the meeting's watchers, and
sends every session in the meeting a new `ready` with `allowed: false`.
Participants' own settings come back when the host turns it on again.

### `ping`

Optional keepalive. The backend replies with `pong`. Meetings run long and
intermediaries drop idle connections, so either side may send this.

## Backend to panel

### `ready`

Sent in response to `hello`. Confirms the session and reports whether there is
anything to look at yet.

```json
{
  "type": "ready",
  "sessionId": "s-3",
  "identified": true,
  "streamActive": false,
  "allowed": true,
  "host": false
}
```

The reply to `hello` also carries `previous`, the participant's last answer,
when they had one in this meeting in the last 30 minutes, so a reopened panel
can show it and follow up on it. It is only ever sent to the same verified
participant, and later `ready` messages leave it out.

`streamActive` is false when no screen share is currently being captured for
this meeting. The panel uses it to explain why a request would return nothing,
rather than letting the participant press a control that cannot succeed.

`allowed` is false while the meeting's host has turned ZoomLens off. `host` is
true only for the host: the user Zoom's signed `meeting.rtms_started` event
names as having started the stream, when it also says that user is the
original host. `ready` is sent again whenever either changes.

### `accepted`

Acknowledges a request and tells the panel roughly how long to expect.

```json
{
  "type": "accepted",
  "id": "r-7",
  "mode": "describe",
  "expectedSeconds": 6
}
```

### `answer`

The result, addressed to the one session that asked.

```json
{
  "type": "answer",
  "id": "r-7",
  "mode": "describe",
  "text": "A spreadsheet showing quarterly revenue...",
  "elapsedMs": 5840
}
```

### `watching`

Confirms the `watch` setting. `reason` is present when the backend turned it off
itself, which happens when the participant reaches the daily limit.

```json
{ "type": "watching", "feature": "changes", "on": false, "reason": "You have reached today's limit..." }
```

### `update`

A screen change described, or a Color Assist note. It has no `id` because
nobody asked for it.

```json
{ "type": "update", "feature": "changes", "text": "New slide: churn by month, falling from 6% to 3%." }
```

Each one counts towards the participant's daily limit but not the gap between
requests, so an update never blocks a question.

### `error`

```json
{
  "type": "error",
  "id": "r-7",
  "code": "no_stream",
  "message": "Nobody is sharing a screen in this meeting."
}
```

`id` is absent for errors that do not belong to a request.

| `code` | Meaning |
| --- | --- |
| `not_identified` | The session has no participant identity, so nothing can be sent back |
| `no_hello` | A message arrived before `hello` |
| `no_stream` | No screen share is being captured for this meeting |
| `bad_request` | Malformed message, or an `ask` or `followup` with no question |
| `rate_limited` | Too many requests from this participant, by gap or daily ceiling |
| `host_disabled` | The meeting's host has turned ZoomLens off |
| `not_host` | `allow` from someone other than the host |
| `internal` | Something failed on the backend |

## Rules

1. `hello` first. Anything else before it gets `no_hello` and the socket closes.
2. One answer per request, matched by `id`.
3. A response goes to one session. There is no broadcast in this protocol.
4. The backend never sends screen content to the panel, only text about it.
   Images stay on the backend.
5. Unknown message types are ignored.

## Not in version 1

Deliberately left out:

- Cancelling a request in flight
- Any message from one participant that another participant can observe
