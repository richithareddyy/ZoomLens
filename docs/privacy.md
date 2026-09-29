# Zoom Lens privacy model

This document records what Zoom Lens guarantees, how each guarantee is
enforced, and what it does not guarantee. It is written to be the starting
point for a privacy or ethics review rather than a summary produced after one.

Where a guarantee is enforced by code, the file and function are named, so a
reviewer can check the claim rather than take it on trust. Where something is
a residual risk it is stated plainly, including the risks that are awkward.

## What the application does

A participant in a Zoom meeting opens Zoom Lens from the Apps panel. While
somebody else is sharing their screen, that participant can ask for one of
three things:

- **Describe.** What is on screen right now, in plain language.
- **Explain.** What the content means rather than what it says.
- **Follow-up.** One scoped question about the previous answer.

The answer is shown only to the participant who asked. Other participants do
not see that a request was made, and do not see the answer.

**The person sharing their screen is not notified.** This is a design decision,
not an oversight, and it is the central question any review should focus on.
It is discussed in its own section below.

## What data the application handles

| Data | Where it comes from | Where it goes | Kept |
|---|---|---|---|
| Screen share video | Zoom RTMS, as H.264 | Memory, and a file on disk during development | Memory holds only since the last keyframe. The file persists until deleted by hand. |
| Still images of the screen | Decoded from that video | Sent to the Anthropic API to produce an answer | Written to `snapshots/` during development |
| Meeting identifier | Zoom Apps SDK, `getMeetingUUID` | Backend memory only | For the life of the connection |
| Participant identifier and display name | Zoom Apps SDK, `getUserContext` | Backend memory only | For the life of the connection |
| The participant's typed follow-up question | The panel | Sent to the Anthropic API with the image | Not stored beyond the request |
| The generated answer | Anthropic API | The one participant who asked | Not stored beyond the request |

Audio and transcripts are received from RTMS because the stream carries them,
but nothing is done with them and they are not sent anywhere. They are logged
as counts only.

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

**A session with no identity cannot make a request.** If the panel fails to
obtain a meeting and participant identifier from Zoom, the session is marked
unidentified and every request is refused with `not_identified`. The reasoning
is that an answer that cannot be addressed to a specific person should not be
produced at all.

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

**A participant could claim to be someone else.** Identity arrives in the
`hello` message from the panel, and the backend trusts it. A participant who
modified the panel could send another participant's identifier. Today this
gains them nothing, because answers are addressed to the session that asked and
the participant index is not used for delivery, so an impostor would receive
only their own answers. It matters if anything later routes by participant
rather than by session, and it should be closed before then. Closing it means
verifying identity against Zoom rather than accepting the panel's word for it.

**Screen content leaves the machine.** Images of the shared screen are sent to
the Anthropic API to be interpreted. Whatever was on the presenter's screen,
including anything they did not intend to share, is transmitted to a third
party. There is no filtering or redaction of any kind before sending.

**Nothing is encrypted at rest.** During development, captured video is written
to `captures/` and decoded images to `snapshots/`. These are images and
recordings of other people's screens and should be treated the same as a
meeting recording. They are excluded from version control but are stored in
plain form on the developer's machine and are never deleted automatically.

**There is no retention policy.** Nothing expires. Files accumulate until
removed by hand.

**There is no audit trail.** The application logs that a request was made and
by which session, to the terminal only. There is no durable record of who asked
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
- Captured screen video is written to disk on every session, which the finished
  application does not need to do. It exists so that decoding can be tested
  against a real recording rather than a live meeting.

## Open questions for review

1. Is the presenter's lack of notification acceptable, given that they have
   already shared the screen with everyone in the meeting?
2. Does sending screen content to a third-party model provider require consent
   from the presenter, the meeting host, or neither?
3. Does this require institutional review at all, given that it processes
   content belonging to people who are not the user of the application?
4. Should there be a way for a host to disable the application for a meeting,
   and if so, should participants be told it has been disabled?

Questions 1 and 2 are the ones that determine whether the design stands as it
is. The rest follow from them.
