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
  "meetingUUID": "clRQeYiYTjW0kV24udOrOA==",
  "participantUUID": "16778240",
  "screenName": "Alex Chen"
}
```

`meetingUUID` and `participantUUID` come from the Zoom Apps SDK. When the SDK
is unavailable, for example when the panel is opened outside Zoom or the app
lacks permission for those APIs, the panel sends `null` for both and the
backend marks the session `unidentified`. An unidentified session may connect
but may not request anything, because there is nobody to send the answer to.

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

`mode` is `describe`, `explain`, `ask` or `followup`.

| Mode | Meaning | `question` |
|---|---|---|
| `describe` | What is on the shared screen now | ignored |
| `explain` | What the content means | ignored |
| `ask` | A question about the current screen, standing on its own | required |
| `followup` | A question scoped to this session's previous answer | required |

`ask` exists because the panel has a persistent input, and a
question typed before any answer exists has no previous answer to be scoped to,
which is what `followup` requires. Everything already using the first three
modes is unaffected.

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
  "streamActive": false
}
```

`streamActive` is false when no screen share is currently being captured for
this meeting. The panel uses it to explain why a request would return nothing,
rather than letting the participant press a control that cannot succeed.

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
- Automatic refresh when the shared screen changes, removed from scope
- Any message from one participant that another participant can observe
