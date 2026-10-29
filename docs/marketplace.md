# Preparing ZoomLens for the Zoom App Marketplace

What a Marketplace submission needs, what ZoomLens already has, and what is
still open. Zoom requirements are from its developer documentation as of
October 2026; check the Marketplace build flow, which lists anything missing.

## The listing

**Name.** Zoom's App Name rules don't allow "Zoom" or a variation of it in an
app name, except to show compatibility, as in "Acme for Zoom". "ZoomLens"
will probably have to change for the listing; the new name is still to be
chosen. The website and repository can keep theirs.

**Short description.** Ask AI about whatever is being shared in your meeting,
privately, without interrupting.

**Long description.**
ZoomLens is a private panel for Zoom meetings. When someone shares their
screen, press Describe screen for a summary, Explain for what it means, or
What changed? to catch up after looking away, and ask follow-up questions in
your own words. Answers are shown only to you.

Two accessibility modes help people who can't rely on seeing the screen.
Announce changes describes the shared screen when it changes, for screen
reader users. Color Assist explains anything shown only by color, for people
with color vision deficiencies.

ZoomLens uses only the meeting's screen share, keeps it in memory for seconds,
and saves nothing. Pictures of the shared screen and your questions are sent
to Anthropic's AI to produce answers.

**URLs.**

| Field | URL |
|---|---|
| Privacy Policy | https://zoomlens.vercel.app/privacy.html |
| Terms of Use | https://zoomlens.vercel.app/terms.html |
| Support | https://zoomlens.vercel.app/support.html (reports go to GitHub issues; add a support email once one is chosen) |
| Documentation | https://zoomlens.vercel.app/guide.html, how to add, use and remove the app |

Zoom asks for the domains of the Privacy Policy, Terms of Use, OAuth redirect,
webhook and Home URLs to be verified, by a TXT record, an uploaded HTML file
or a `<meta>` tag. The values come from the Marketplace once the URLs are in.

## App configuration

| Setting | Value | Why |
|---|---|---|
| App type | General app, user-managed | RTMS events and scopes need a user-managed app |
| Surface | Meetings | The panel opens in meetings |
| Home URL | `https://SERVER` | Serves the panel |
| Domain Allow List | `SERVER` | The panel loads from, and connects back to, the server |
| OAuth Redirect URL | `https://SERVER/auth/callback` | Shows "ZoomLens is added". The code isn't exchanged: ZoomLens calls no Zoom REST API |
| Event subscription | RTMS Started, RTMS Stopped, to `https://SERVER` | How the server learns to join and leave a meeting's stream |
| Deauthorization Notification URL | `https://SERVER/zoom/deauthorized` | Zoom calls it when someone removes the app. ZoomLens keeps no account data, so it revokes that person's tickets and logs the notice; one without a valid signature changes nothing |
| Zoom App SDK APIs | `getMeetingUUID`, `getUserContext`, `startRTMS` | See below |

`SERVER` is the hosted address from `docs/deploy.md`.

### Scopes, and why each is needed

Keep only these. Every scope needs a description in the submission, and an
unused one is a reason for rejection.

| Scope | Why ZoomLens needs it |
|---|---|
| The RTMS screen-share scope (search "RTMS" under Add Scopes) | To receive the meeting's screen share, which is what every answer is about |
| The in-meeting Zoom Apps scope the Marketplace adds with Zoom App SDK | To open as a panel in the meeting |

Remove these if the app has them. ZoomLens no longer subscribes to them, and
requesting them would ask users to share data the app doesn't use:

- `meeting:read:meeting_audio`
- `meeting:read:meeting_transcript`
- any RTMS video (camera) or chat scope
- `meeting:update:participant_rtms_app_status`, which only `start-rtms.js`, a
  development script, uses; the panel's Start button replaces it

### Zoom App SDK APIs

| API | Used for |
|---|---|
| `getMeetingUUID` | Telling the server which meeting the panel is in, as a cross-check |
| `getUserContext` | Whether the person is the host, for the Start button's wording |
| `startRTMS` | The Start button. A host starts the stream; for anyone else Zoom asks the host |

The participant's identity comes from Zoom's encrypted app context, not from
these calls (`trust.js`).

## For reviewers

### What they need

- Two Zoom accounts on a plan that allows RTMS, one to host and share, one to
  join, so they can see that answers stay private.
- Zoom desktop client 6.5.5 or later, which the in-meeting RTMS APIs need.
- The host account's setting that lets apps access meeting content turned on.
- Nothing else: ZoomLens has no sign-up, accounts or roles of its own.

### Release notes for the reviewer (test plan)

Paste into the submission, with the real URLs.

1. **Add the app.** Authorize ZoomLens with the host account. The browser
   shows "ZoomLens is added to your Zoom account".
2. **Open it.** Start a meeting with the host account, then join it from the
   second account. Both open **Apps**, then **ZoomLens**. Each panel says
   **Not started**.
3. **Start it.** In the host's panel, press **Start ZoomLens in this meeting**.
   Both panels change to **Ready** within a few seconds. (Pressed from the
   second account instead, Zoom asks the host to allow it.)
4. **Share a screen.** From the host, share any page with a table or chart,
   for example https://zoomlens.vercel.app or a spreadsheet.
5. **Describe screen.** In the second account's panel, press **Describe
   screen**. A summary of the shared screen appears in that panel only; the
   host's panel shows nothing new.
6. **Explain, and ask.** Press **Explain**. Then type a question about
   something on screen, and a follow-up such as "why?".
7. **What changed?** Scroll or change the shared page, then press **What
   changed?**.
8. **Announce changes.** Turn it on, change the shared page, and wait. A short
   description appears in the panel without pressing anything.
9. **Color Assist.** Share a page whose meaning is only in color, such as a
   red, amber and green status column, and turn on Color Assist. A note
   appears, and **Explain colors** says what each color means.
10. **Stop.** Stop sharing and press **Describe screen**: the panel says
    there is no screen to look at, rather than describing the old one. End
    the meeting; ZoomLens leaves with it.
11. **Remove the app** from the account in the Marketplace. Zoom notifies the
    deauthorization URL, and the server log shows `DEAUTHORIZED`. Nothing is
    left to delete: ZoomLens keeps no account data.

## Readiness checklist

| Item | State |
|---|---|
| Panel, answers, private routing, accessibility modes | Built; automated tests pass |
| Only the screen share is received | Done in code; remove the extra scopes in the Marketplace |
| Start from inside the meeting (`startRTMS`) | Built and tested with a simulated Zoom client; needs a live meeting |
| Webhooks and URL validation | Tested locally with signed requests; needs the hosted address validated in the Marketplace |
| Always-on HTTPS server | `render.yaml` and `docs/deploy.md` ready; not yet deployed |
| Automatic deletion of saved screen content | Done, tested |
| Privacy Policy and Terms of Use | Written; live once the site deploys |
| Support and Guide pages | Done |
| Deauthorization URL | Built and tested with signed and unsigned notices; Zoom only sends them to published apps |
| App name allowed by Zoom | Needs a decision |
| Domain verification | Needs the values from the Marketplace |
| Production client ID in the submission | Needs the Marketplace |
| Two test accounts for reviewers | Needs setting up |
| Developer Pack credits for RTMS approval | Needs confirming |
| Live end-to-end test on the hosted server | Not done |

## Still blocking submission

1. The hosted server, deployed and validated in the Marketplace.
2. A live end-to-end test through the Start button on that server.
3. An app name Zoom accepts.
4. Domain verification for the listing URLs.
5. Confirmation of credits, the publishing account, and any approval needed
   from Next Lab or ASU.
