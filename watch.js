// Watches a meeting's shared screen for participants who turned a feature on,
// and asks `describe` about the screen only when it changes in a way that
// matters. Reading out changes and Color Assist each run one of these.
//
// One loop per meeting, however many people are listening: the screen is the
// same for all of them, so it is captured and described once.

import { fingerprint, createDetector } from "./change.js";

// What `describe` returns when there is nothing worth telling anyone.
export const NO_CHANGE = "No meaningful change.";

export function createWatcher({
  capture,      // meetingUUID -> { jpeg } | null
  describe,     // (jpeg, previous) -> text
  announce,     // (meetingUUID, text) -> void
  log = () => {},
  name = "WATCH",
  intervalMs = Number(process.env.ZOOM_LENS_WATCH_SECONDS ?? 2) * 1000,
  minGapMs = 10000,
}) {
  const meetings = new Map(); // meetingUUID -> watch state

  async function look(meetingUUID, m) {
    if (m.busy) return;
    m.busy = true;
    try {
      const screen = await capture(meetingUUID);
      if (!screen) return;

      const print = await fingerprint(screen.jpeg);
      if (!m.detector.check(print)) return;
      if (Date.now() - m.lastAt < minGapMs) return; // still worth it next time

      // Set before asking, so a failing model is retried at most once per gap.
      m.lastAt = Date.now();
      const text = await describe(screen.jpeg, m.lastText);
      m.detector.accept(print);

      if (text.trim() === NO_CHANGE) {
        log(`${name} ${meetingUUID.slice(0, 12)}... changed, but nothing worth saying`);
        return;
      }
      m.lastText = text;
      log(`${name} ${meetingUUID.slice(0, 12)}... described a change in ${Date.now() - m.lastAt} ms`);
      if (meetings.get(meetingUUID) === m) announce(meetingUUID, text);
    } catch (err) {
      log(`${name} ${meetingUUID.slice(0, 12)}... ${err.message}`);
    } finally {
      m.busy = false;
    }
  }

  return {
    start(meetingUUID) {
      if (meetings.has(meetingUUID)) return;
      const m = { detector: createDetector(), lastText: null, lastAt: 0, busy: false, timer: null };
      m.timer = setInterval(() => look(meetingUUID, m), intervalMs);
      meetings.set(meetingUUID, m);
      look(meetingUUID, m);
    },

    stop(meetingUUID) {
      const m = meetings.get(meetingUUID);
      if (!m) return;
      clearInterval(m.timer);
      meetings.delete(meetingUUID);
    },

    // What the screen was last described as, for someone who joins late.
    latest: (meetingUUID) => meetings.get(meetingUUID)?.lastText ?? null,
  };
}
