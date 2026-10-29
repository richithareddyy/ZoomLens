# Testing ZoomLens in a live meeting

A run through a real Zoom meeting, about ten minutes, checking everything the
automated tests can't: Zoom's events reaching the server, the Start button,
answers, privacy between two people, the host switch, and reopening the panel.

It works the same from a laptop behind ngrok or from a hosted server. Only the
address differs; below it is `ADDRESS`.

## Before the meeting

1. **The server is running.** On a laptop: `npm start`, and the ngrok tunnel
   to port 8080. Open `https://ADDRESS/healthz`; it should say `"ok":true`.
2. **The Marketplace points at it.** On the ZoomLens app, every address from
   `docs/deploy.md` uses `ADDRESS`.
3. **The event subscription is validated.** In the event subscription, check
   the events are RTMS Started and RTMS Stopped, press **Validate**, and save.
   The server log shows `VALIDATION passed`, and `/healthz` now has a time under
   `lastValidation`. On a laptop, do this each time before testing: Zoom may
   have switched events off while it slept.
4. **The Start button is allowed.** Under Surface, In-client App Features,
   Zoom App SDK is on and `startRTMS` is in its APIs.
5. **Two Zoom accounts**, one to host, one to join, both on desktop client
   6.5.5 or later. The second can be on another computer or a phone with the
   Zoom app.

## In the meeting

Tick each step, and note anything that doesn't match.

| # | Do | Expect |
|---|---|---|
| 1 | Host starts a meeting and opens **Apps**, then **ZoomLens** | The panel says **Not started**, with a Start button |
| 2 | Host presses **Start ZoomLens in this meeting** | Server log: `Webhook: meeting.rtms_started`, then `JOIN CONFIRMED`. Panel: **Ready**, plus a **Host** section with **Allow ZoomLens here** |
| 3 | Host shares a screen with a table or chart | Server log: `Screen sharing started`, then `DESKSHARE frame #1` |
| 4 | The second account joins and opens ZoomLens | Its panel says **Ready**, with no Host section |
| 5 | Second account presses **Describe screen** | A summary in that panel only; nothing new in the host's |
| 6 | Second account types a question, then a follow-up such as "why?" | Both answered; the follow-up builds on the first |
| 7 | Second account closes ZoomLens and opens it again | The panel shows **Earlier answer**, and a new question follows up on it |
| 8 | Host turns **Allow ZoomLens here** off | Second account's panel says the host turned ZoomLens off, and its buttons stop working |
| 9 | Host turns it back on | Second account's panel says ZoomLens is back on |
| 10 | Second account turns on **Announce changes**, and the host changes the shared screen | A short description appears without pressing anything |
| 11 | Host stops sharing; second account presses **Describe screen** | It says there is no screen to look at, rather than describing the old one |
| 12 | Host ends the meeting | Server log: `Stream ... ended` |

## If something doesn't match

Copy the server log lines around the step that failed, and what `/healthz`
shows. Neither contains secrets or anyone's questions. Before sharing a log
anywhere public, remove meeting IDs.

The common cases:

- **Step 2, nothing in the log:** Zoom isn't reaching the server. If
  `/healthz` has no `lastWebhook` time, redo step 3 of "Before the meeting". A
  line starting `Rejected a POST because` gives the reason, for example a
  secret token that doesn't match the Marketplace.
- **Step 2, no Start button:** the Zoom client is older than 6.5.5, or
  `startRTMS` isn't in the app's Zoom App SDK APIs.
- **Step 2, Ready but no Host section:** only the host who started ZoomLens
  gets the switch. If the second account started it, that's expected.
- **Step 5, "Couldn't answer":** check `ANTHROPIC_API_KEY` and `VISION_MODEL`.
