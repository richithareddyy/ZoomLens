// WebSocket relay between the panel and the backend (see docs/protocol.md).
//
// This is where answers are kept private. It has to be enforced here rather
// than in the panel, which whoever runs it can change. Three rules:
//
//   1. One connection is one session, bound to one participant on hello.
//      Who that is comes from verify(), never from the IDs the panel sends.
//   2. sendTo() is the only way a message leaves this file, and it takes a
//      session id, not a socket. There is no broadcast.
//   3. reply() only delivers if the request is pending on that same session.

import { WebSocketServer } from "ws";
import { NO_CHANGE } from "./watch.js";

// Shown by the panel while it waits.
const EXPECTED_SECONDS = { describe: 6, explain: 12, followup: 3, ask: 7, changed: 5, colors: 9 };

const MODES = Object.keys(EXPECTED_SECONDS);

// What a participant can switch on, and what it's called when the daily limit
// turns it off.
const FEATURES = { changes: "screen changes are no longer read out", color: "Color Assist notes are off" };

// One participant can have several sessions (two windows, two devices). They're
// never merged, but rate limits are counted per participant.
const participantKey = (meetingUUID, participantUUID) =>
  `${meetingUUID}|${participantUUID}`;

// Each request costs money and several seconds. The cooldown catches impatient
// double presses; the daily cap bounds total spend. Both are per participant so
// reopening the panel doesn't reset them.
const COOLDOWN_MS = Number(process.env.ZOOM_LENS_COOLDOWN_SECONDS ?? 5) * 1000;
const DAILY_LIMIT = Number(process.env.ZOOM_LENS_DAILY_LIMIT ?? 60);
const DAY_MS = 24 * 60 * 60 * 1000;

// watchers maps a feature to the watch.js loop that serves it. verify turns a
// hello into { meetingUUID, participantUUID }, or null if it can't be trusted.
export function createRelay(httpServer, { log, isStreamActive, answerRequest, watchers = {}, verify }) {
  if (typeof verify !== "function") throw new Error("createRelay needs a verify function");

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  const sessions = new Map(); // sessionId -> session
  const byParticipant = new Map(); // "meeting|participant" -> Set<sessionId>
  const usage = new Map(); // "meeting|participant" -> { last, count, since }
  let nextSessionId = 1;

  // Null to allow, otherwise the refusal text the panel shows.
  function refuseForRate(key, now = Date.now()) {
    const seen = usage.get(key);
    if (!seen) return null;

    if (now - seen.since >= DAY_MS) return null;

    const wait = COOLDOWN_MS - (now - seen.last);
    if (wait > 0) {
      const seconds = Math.ceil(wait / 1000);
      return `Just a moment. You can ask again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
    }

    if (seen.count >= DAILY_LIMIT) {
      return `You have reached the limit of ${DAILY_LIMIT} questions for today.`;
    }

    return null;
  }

  // Only called for accepted requests, so refusals don't count.
  function recordUse(key, now = Date.now()) {
    const seen = usage.get(key);
    if (!seen || now - seen.since >= DAY_MS) {
      usage.set(key, { last: now, count: 1, since: now });
      return;
    }
    seen.last = now;
    seen.count += 1;
  }

  // Change descriptions count towards the daily cap but not the cooldown, so
  // one arriving never blocks the participant's own question.
  function chargeDaily(key, now = Date.now()) {
    const seen = usage.get(key);
    if (!seen || now - seen.since >= DAY_MS) {
      usage.set(key, { last: 0, count: 1, since: now });
      return true;
    }
    if (seen.count >= DAILY_LIMIT) return false;
    seen.count += 1;
    return true;
  }

  const listeners = (feature, meetingUUID) =>
    [...sessions.values()].filter((s) => s.features.has(feature) && s.meetingUUID === meetingUUID).length;

  // One loop per meeting and feature, running while anyone there has it on.
  function setFeature(session, feature, on, reason) {
    if (session.features.has(feature) !== on) {
      if (on) session.features.add(feature);
      else session.features.delete(feature);
      const count = listeners(feature, session.meetingUUID);
      if (on && count === 1) watchers[feature].start(session.meetingUUID);
      if (!on && count === 0) watchers[feature].stop(session.meetingUUID);
      log(`RELAY ${session.id} turned ${feature} ${on ? "on" : "off"}`);
    }
    sendTo(session.id, { type: "watching", feature, on, ...(reason ? { reason } : {}) });
    const latest = on && watchers[feature].latest(session.meetingUUID);
    if (latest) sendTo(session.id, { type: "update", feature, text: latest });
  }

  // --- The only way out of this file ---------------------------------------

  function sendTo(sessionId, message) {
    const session = sessions.get(sessionId);
    if (!session) {
      log(`RELAY refused to send ${message.type}: session ${sessionId} is gone`);
      return false;
    }
    if (session.ws.readyState !== session.ws.OPEN) {
      log(`RELAY refused to send ${message.type}: ${sessionId} is not open`);
      return false;
    }
    session.ws.send(JSON.stringify(message));
    return true;
  }

  // Refuses unless the request is outstanding on this session, so one
  // participant's answer can't be delivered to another.
  function reply(sessionId, requestId, message) {
    const session = sessions.get(sessionId);
    if (!session) {
      log(`RELAY dropped a reply for ${requestId}: session ${sessionId} is gone`);
      return false;
    }
    if (!session.pending.has(requestId)) {
      log(
        `RELAY refused a reply for ${requestId} to ${sessionId}: ` +
        `that session has no such request outstanding`
      );
      return false;
    }
    session.pending.delete(requestId);
    return sendTo(sessionId, { ...message, id: requestId });
  }

  function fail(sessionId, code, message, id) {
    const session = sessions.get(sessionId);
    if (id && session?.pending.has(id)) session.pending.delete(id);
    return sendTo(sessionId, { type: "error", ...(id ? { id } : {}), code, message });
  }

  // --- Session lifecycle ----------------------------------------------------

  function bind(session) {
    const key = participantKey(session.meetingUUID, session.participantUUID);
    session.key = key;
    if (!byParticipant.has(key)) byParticipant.set(key, new Set());
    byParticipant.get(key).add(session.id);

    const others = byParticipant.get(key).size - 1;
    log(
      `RELAY ${session.id} bound to a verified participant ` +
      `in meeting ${String(session.meetingUUID).slice(0, 12)}...` +
      (others ? ` (${others} other session for this participant)` : "")
    );
  }

  function release(session) {
    if (!session.key) return;
    const set = byParticipant.get(session.key);
    if (!set) return;
    set.delete(session.id);
    if (set.size === 0) byParticipant.delete(session.key);
  }

  // --- Connections ----------------------------------------------------------

  wss.on("connection", (ws) => {
    const session = {
      id: `s-${nextSessionId++}`,
      ws,
      greeted: false,
      identified: false,
      meetingUUID: null,
      participantUUID: null,
      key: null,
      pending: new Map(), // requestId -> { mode, at }
      features: new Set(),
    };
    sessions.set(session.id, session);
    log(`RELAY ${session.id} connected (${sessions.size} open)`);

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        fail(session.id, "bad_request", "Message was not valid JSON.");
        return;
      }

      if (typeof msg?.type !== "string") {
        fail(session.id, "bad_request", "Message had no type.");
        return;
      }

      // hello must come first, so no session exists without an identity decision.
      if (msg.type !== "hello" && !session.greeted) {
        fail(session.id, "no_hello", "Send hello before anything else.");
        ws.close();
        return;
      }

      switch (msg.type) {
        case "hello": {
          if (session.greeted) {
            fail(session.id, "bad_request", "hello was already sent on this connection.");
            return;
          }
          session.greeted = true;
          const who = verify(msg);
          session.meetingUUID = who?.meetingUUID ?? null;
          session.participantUUID = who?.participantUUID ?? null;
          session.identified = Boolean(session.meetingUUID && session.participantUUID);

          if (session.identified) {
            bind(session);
          } else {
            log(`RELAY ${session.id} is unidentified, requests will be refused`);
          }

          sendTo(session.id, {
            type: "ready",
            sessionId: session.id,
            identified: session.identified,
            streamActive: session.identified ? isStreamActive(session.meetingUUID) : false,
          });
          return;
        }

        case "request": {
          const { id, mode, question } = msg;

          if (!id || typeof id !== "string") {
            fail(session.id, "bad_request", "A request needs an id.");
            return;
          }
          if (!session.identified) {
            fail(session.id, "not_identified",
                 "This session has no participant identity, so an answer could not be " +
                 "addressed to anyone.", id);
            return;
          }
          if (!MODES.includes(mode)) {
            fail(session.id, "bad_request", `Unknown mode: ${mode}`, id);
            return;
          }
          if ((mode === "followup" || mode === "ask") && !question) {
            fail(session.id, "bad_request", `A ${mode} needs a question.`, id);
            return;
          }
          if (session.pending.has(id)) {
            fail(session.id, "bad_request", `Request ${id} is already outstanding.`, id);
            return;
          }
          if (!isStreamActive(session.meetingUUID)) {
            fail(session.id, "no_stream", "Nobody is sharing a screen in this meeting.", id);
            return;
          }

          // Checked last, so requests refused for other reasons aren't counted.
          const refusal = refuseForRate(session.key);
          if (refusal) {
            log(`RELAY ${session.id} rate limited: ${refusal}`);
            fail(session.id, "rate_limited", refusal, id);
            return;
          }
          recordUse(session.key);

          session.pending.set(id, { mode, at: Date.now() });

          // The question itself isn't logged: it can say as much as the screen.
          log(`RELAY ${session.id} requested ${mode}${question ? ` (${question.length}-character question)` : ""}`);

          // sendTo, not reply: reply would clear the pending request the answer needs.
          sendTo(session.id, {
            type: "accepted",
            id,
            mode,
            expectedSeconds: EXPECTED_SECONDS[mode],
          });

          if (!answerRequest) return; // tests run the relay without one

          answerRequest({
            meetingUUID: session.meetingUUID,
            mode,
            question: question ?? null,
            previous: session.lastAnswer ?? null,
            colorSafe: session.features.has("color"),
          })
            .then(({ text, note }) => {
              if (mode !== "followup" && text !== NO_CHANGE) session.lastAnswer = text;
              reply(session.id, id, { type: "answer", text, ...(note ? { note } : {}) });
            })
            .catch((err) => {
              log(`RELAY ${session.id} answer for ${id} failed: ${err.message}`);
              fail(session.id, "internal", err.message, id);
            });

          return;
        }

        case "watch": {
          const feature = msg.feature ?? "changes";
          if (!session.identified) {
            fail(session.id, "not_identified", "This session has no participant identity.");
            return;
          }
          if (!watchers[feature]) {
            fail(session.id, "bad_request", `${feature} is not available on this server.`);
            return;
          }
          setFeature(session, feature, Boolean(msg.on));
          return;
        }

        case "ping":
          sendTo(session.id, { type: "pong" });
          return;

        default:
          // Ignored so a newer panel degrades gracefully against an older backend.
          log(`RELAY ${session.id} sent an unknown type: ${msg.type}`);
      }
    });

    ws.on("close", () => {
      for (const feature of session.features) {
        session.features.delete(feature);
        if (listeners(feature, session.meetingUUID) === 0) watchers[feature].stop(session.meetingUUID);
      }
      release(session);
      sessions.delete(session.id);
      const dropped = session.pending.size;
      log(
        `RELAY ${session.id} disconnected (${sessions.size} open)` +
        (dropped ? `, ${dropped} request(s) abandoned` : "")
      );
    });

    ws.on("error", (err) => {
      log(`RELAY ${session.id} socket error: ${err.message}`);
    });
  });

  return {
    // Sent to each session in the meeting individually; there is no broadcast.
    notifyStreamState(meetingUUID, active) {
      let told = 0;
      for (const session of sessions.values()) {
        if (!session.identified || session.meetingUUID !== meetingUUID) continue;
        sendTo(session.id, {
          type: "ready",
          sessionId: session.id,
          identified: true,
          streamActive: active,
        });
        told++;
      }
      if (told) {
        log(`RELAY told ${told} session(s) that the screen share is ${active ? "on" : "off"}`);
      }
    },

    // Something a watcher found, delivered to each participant in the meeting
    // who has that feature on, individually.
    announce(feature, meetingUUID, text) {
      for (const session of sessions.values()) {
        if (!session.features.has(feature) || session.meetingUUID !== meetingUUID) continue;
        // Not an error message: that would land on whatever request the
        // participant has in flight.
        if (!chargeDaily(session.key)) {
          setFeature(session, feature, false,
                     `You have reached today's limit of ${DAILY_LIMIT} answers, so ${FEATURES[feature]}.`);
          continue;
        }
        session.lastAnswer = text;
        sendTo(session.id, { type: "update", feature, text });
      }
    },

    stats: () => ({
      sessions: sessions.size,
      participants: byParticipant.size,
      pending: [...sessions.values()].reduce((n, s) => n + s.pending.size, 0),
    }),
  };
}
