# ZoomLens privacy model

This document records what Zoom Lens guarantees, how each guarantee is
enforced, and what it does not guarantee. It is written to be the starting
point for a privacy or ethics review rather than a summary produced after one.

Where a guarantee is enforced by code, the file and function are named, so a
reviewer can check the claim rather than take it on trust. Where something is
a residual risk it is stated plainly, including the risks that are awkward.

## What the application does

A participant in a Zoom meeting opens Zoom Lens from the Apps panel. While
somebody else is sharing their screen, that participant can ask for one of
these, among others:

- **Describe.** What is on screen right now, in plain language.
- **Explain.** What the content means rather than what it says.
- **A question**, or a follow-up scoped to the previous answer.

The answer is shown only to the participant who asked. Other participants do
not see that a request was made, and do not see the answer.

**The person sharing their screen is not notified.** This is a design decision,
not an oversight, and it is the central question any review should focus on.
It is discussed in its own section below.

## What data the application handles

| Data | Where it comes from | Where it goes | Kept |
|---|---|---|---|
| Screen share video | Zoom RTMS, as H.264 | Memory. Also `captures/` on disk, only with `ZOOM_LENS_SAVE_CAPTURES=1` | Memory holds only since the last keyframe. A saved file persists until deleted by hand. |
| Still images of the screen | Decoded from that video | Sent to the Anthropic API to produce an answer | Memory, plus a temporary file during decoding that is deleted afterwards. `snapshot.js` and `describe.js`, run by hand, write to `snapshots/`. |
| Screen fingerprints | A 64x36 greyscale reduction of a still, made every 2 seconds while someone has screen changes read out | Backend memory only | Until the next one replaces it |
| Color analysis | The colors found in a still and where they are, made while someone has Color Assist on | Sent to the Anthropic API as text with that participant's requests | Not stored beyond the request |
| The Color Assist setting | The panel | The Zoom client's local storage on that device | Until changed |
| Meeting identifier and Zoom user ID | Zoom's encrypted app context, sent with each panel load | Backend memory only, behind a random ticket | Up to 12 hours, or until the server restarts |
| The participant's typed question | The panel | Sent to the Anthropic API with the image | Not stored, and not logged; the log records its length only |
| The generated answer | Anthropic API | The one participant who asked | Not stored beyond the request |

Audio and transcripts are received from RTMS because the stream carries them,
but nothing is done with them and they are not sent anywhere. They are counted
and never logged or stored. Participant names are not logged either.

## What is guaranteed

**One participant's answer reaches that participant and nobody else.**

This is the promise the application exists to keep, and it is enforced on the
backend rather than in the panel. Anything enforced in the panel can be changed
by whoever is running the panel, so it would be a guarantee in name only.

Three properties of the code make it structural rather than a matter of care:

1. **One connection is one session, bound to one participant when it opens.**
   `createRelay` in `relay.js` creates a session per socket. The session holds
   the meeting and participant identifiers and is never merged with another.
   A participant who opens the panel twice has two unrelated sessions.

2. **Every outbound message names exactly one recipient.** `sendTo(sessionId,
   message)` in `relay.js` is the only function in the file that writes to a
   socket. It takes a session id rather than a socket, so there is one place
   where delivery is decided and no path that writes to more than one session
   at a time. There is no broadcast function anywhere in the application. Where
   several sessions need the same news, for example that a screen share has
   started, `notifyStreamState` loops and calls `sendTo` once per session.

3. **A reply can only go to the session that made the request.** `reply()` in
   `relay.js` checks that the request id is outstanding on that specific
   session and refuses otherwise, logging the refusal. A mistake in later code
   that tried to deliver one participant's answer to another would be rejected
   rather than silently delivered.

**Who is asking comes from Zoom, not from the panel.** When Zoom loads the
panel it attaches an encrypted app context (the `X-Zoom-App-Context` header),
AES-256-GCM under a key only Zoom and this server hold. The server checks it and
its expiry, and writes a random ticket into the page. The panel's `hello`
carries that ticket, and the relay takes the meeting and user from the server's
record of it (`createTickets` in `trust.js`, `verify` in `relay.js`). IDs the
panel sends on its own count for nothing. `test-trust.js` checks this,
including a panel that sends another participant's IDs.

**A session with no identity cannot make a request.** Without a valid ticket
the session is marked unidentified and every request is refused with
`not_identified`. An answer that cannot be addressed to a specific person
should not be produced at all.

**The host can turn it off, and everyone is told.** The meeting's host gets a
switch that turns ZoomLens off for everyone in the meeting. The server knows who
the host is from Zoom's signed `meeting.rtms_started` event (the user who
started the stream, when Zoom says they are the original host), matched against
the verified Zoom user of each panel, so the switch can't be claimed by a
modified panel. Turning it off refuses new requests, drops answers still being
prepared, and stops change and color checks; every participant's panel says
the host turned it off (`setAllowed` in `relay.js`, `test-host.js`). The setting
is kept in memory, so a server restart turns ZoomLens back on, and a co-host or
anyone who isn't the original host doesn't get the switch.

**Webhooks are only acted on when Zoom signed them.** Every request to the
webhook route, the URL validation challenge included, must carry Zoom's
`x-zm-signature` over its exact body, be less than five minutes old, and not
repeat a signature already seen (`createSignatureCheck` in `trust.js`).
Checking the challenge matters: answering an unsigned one would hand anyone the
HMAC of a string of their choosing, which is a valid signature.

## What is not guaranteed

These are stated in rough order of how much they should matter to a reviewer.

**The presenter is not told.** Somebody sharing a spreadsheet has no way to
know that another participant is having it read and interpreted. This is
deliberate: the feature exists for people who did not follow something and do
not want to interrupt or admit it, and a notification would remove the reason
they would use it. It is nonetheless a real asymmetry. Anyone sharing a screen
in a meeting has already chosen to show it to everyone present, so the content
is not being taken from them, but the processing of it is invisible to them.
Whether that is acceptable is a judgement for review rather than something the
code can settle.

**A ticket is a bearer token.** Whoever holds a panel's ticket is treated as
that participant until it expires, after 12 hours. It only ever appears in the
page Zoom loaded for that participant and in their WebSocket messages, but it
is not bound to the connection. Tickets live in memory, so a server restart
forgets them and the panel has to be reopened from Zoom. In a breakout room
Zoom's context names the breakout room, which may not match the meeting the
screen share is captured from; this has not been tested.

**Screen content leaves the machine.** Images of the shared screen are sent to
the Anthropic API to be interpreted. Whatever was on the presenter's screen,
including anything they did not intend to share, is transmitted to a third
party. There is no filtering or redaction of any kind before sending.

**Reading out screen changes and Color Assist send more of the screen.** While
a participant has changes read out, a still is sent to the Anthropic API each
time the screen changes, up to one every 10 seconds, rather than only when they
ask. Color Assist sends one only when a changed screen contains colors that
could be confused. The answers still go only to that participant.

**Nothing is encrypted at rest.** With `ZOOM_LENS_SAVE_CAPTURES=1`, captured
video is written to `captures/`, and the development scripts write decoded
images to `snapshots/`. These are recordings of other people's screens and
should be treated the same as a meeting recording. They are excluded from
version control but are stored in plain form and never deleted automatically.
If the project folder is in a synced location, such as a Desktop synced to
iCloud, they are uploaded with it.

**There is no retention policy.** Nothing expires. Files accumulate until
removed by hand.

**There is no audit trail.** The application logs that a request was made, its
mode, and by which session, to the terminal only. There is no durable record of who asked
what about whose screen, so a participant could not later be told that their
shared screen had been read, even if that became desirable.

**The model can be wrong.** Answers are generated and may misread the screen or
state something confidently that is not there. Nothing in the interface
currently signals this to the person reading the answer.

## Conditions that apply only during development

These are not part of the design and must change before anyone outside the
project uses the application.

- The backend runs on a personal laptop, reachable through an ngrok tunnel.
  Anyone with the tunnel address can reach the panel and open a connection.
- The model provider API key belongs to an individual rather than an
  organisation. Cost per request is roughly one to three cents.
- Saving captured screen video (`ZOOM_LENS_SAVE_CAPTURES=1`) exists so decoding
  and change detection can be tested against a real recording. It is off by
  default and should stay off in any real meeting.

## Open questions for review

1. Is the presenter's lack of notification acceptable, given that they have
   already shared the screen with everyone in the meeting?
2. Does sending screen content to a third-party model provider require consent
   from the presenter, the meeting host, or neither?
3. Does this require institutional review at all, given that it processes
   content belonging to people who are not the user of the application?
4. The host can now turn ZoomLens off for a meeting, and participants are
   told when they do. Should it be off by default until the host allows it?

Questions 1 and 2 are the ones that determine whether the design stands as it
is. The rest follow from them.
