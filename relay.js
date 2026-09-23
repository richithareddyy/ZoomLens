// The connection layer between the panel and the backend.
//
// Implements docs/protocol.md.
//
// The privacy model lives here. Zoom Lens promises that a participant's answers
// reach that participant and nobody else, and that promise has to be kept on the
// backend, because anything enforced in the panel can be changed by whoever is
// running the panel.
//
// Three rules make it structural rather than a matter of care:
//
//   1. One connection is one session, bound to one participant when it opens.
//   2. sendTo() is the only way a message leaves this file. It takes a session
//      id, not a socket, so every outbound message names its single recipient.
//   3. A reply to a request can only go to the session that made that request.
//      reply() checks the request is pending on that session and refuses
//      otherwise, so a mix-up cannot silently deliver to the wrong person.
//
// There is no broadcast anywhere. Where several sessions need the same news, it
// is sent to each one individually through sendTo.

import { WebSocketServer } from "ws";

// How long a request is expected to take, so the panel can say something more
// useful than "working".
const EXPECTED_SECONDS = { describe: 6, explain: 12, followup: 3, ask: 7 };

// A participant may have the panel open more than once, on two devices or in
// two windows. Those are separate sessions and are never merged, but they do
// belong to the same person, so we keep an index to find them.
const participantKey = (meetingUUID, participantUUID) =>
  `${meetingUUID}|${participantUUID}`;

// Every request costs real money and several seconds, so there are two limits.
//
// A gap between requests, because pressing a button twice is almost always
// impatience rather than a second question, and the first answer is usually
// still on its way.
//
// A daily ceiling per participant, because the gap alone does not bound what a
// single enthusiastic person can spend over an afternoon.
//
// Both are counted per participant rather than per session, otherwise opening
// the panel a second time would reset them.
const COOLDOWN_MS = Number(process.env.ZOOM_LENS_COOLDOWN_SECONDS ?? 5) * 1000;
const DAILY_LIMIT = Number(process.env.ZOOM_LENS_DAILY_LIMIT ?? 60);
const DAY_MS = 24 * 60 * 60 * 1000;

export function createRelay(httpServer, { log, isStreamActive, answerRequest }) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  const sessions = new Map(); // sessionId -> session
  const byParticipant = new Map(); // "meeting|participant" -> Set<sessionId>
  const usage = new Map(); // "meeting|participant" -> { last, count, since }
  let nextSessionId = 1;

  // Decides whether a participant may ask right now. Returns null to allow, or
  // a sentence explaining the refusal, which the panel shows as it is.
  function refuseForRate(key, now = Date.now()) {
    const seen = usage.get(key);
    if (!seen) return null;

    if (now - seen.since >= DAY_MS) return null; // a new day, start again

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

  // Recorded only once a request is actually accepted, so a refusal never
  // counts against the person who was refused.
  function recordUse(key, now = Date.now()) {
    const seen = usage.get(key);
    if (!seen || now - seen.since >= DAY_MS) {
      usage.set(key, { last: now, count: 1, since: now });
      return;
    }
    seen.last = now;
    seen.count += 1;
  }

  // --- The only way out of this file ---------------------------------------

  // Sends one message to one session. Everything outbound goes through here,
  // so there is a single place where delivery is decided and logged.
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

  // Sends a reply that belongs to a specific request. Refuses unless that
  // request is actually outstanding on that session, which is what makes it
  // impossible to deliver one participant's answer to another.
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
      `RELAY ${session.id} bound to ${session.screenName ?? "unnamed"} ` +
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
      screenName: null,
      key: null,
      pending: new Map(), // requestId -> { mode, at }
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

      // hello must come first, so a session can never exist without an identity
      // decision having been made about it.
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
          session.meetingUUID = msg.meetingUUID ?? null;
          session.participantUUID = msg.participantUUID ?? null;
          session.screenName = msg.screenName ?? null;
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
          if (!["describe", "explain", "followup", "ask"].includes(mode)) {
            fail(session.id, "bad_request", `Unknown mode: ${mode}`, id);
            return;
          }
          // followup is scoped to a previous answer; ask stands on its own.
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

          // Checked last, so a request refused for any other reason is not also
          // counted as an attempt.
          const refusal = refuseForRate(session.key);
          if (refusal) {
            log(`RELAY ${session.id} rate limited: ${refusal}`);
            fail(session.id, "rate_limited", refusal, id);
            return;
          }
          recordUse(session.key);

          // Record it before replying, so reply() has something to match
          session.pending.set(id, { mode, at: Date.now() });

          log(
            `RELAY ${session.id} (${session.screenName ?? "unnamed"}) ` +
            `requested ${mode}${question ? `: "${question}"` : ""}`
          );

          // Acknowledge through sendTo rather than reply, because reply clears
          // the pending request and the answer still has to come back against it.
          sendTo(session.id, {
            type: "accepted",
            id,
            mode,
            expectedSeconds: EXPECTED_SECONDS[mode],
          });

          if (!answerRequest) return; // nothing wired up to produce answers

          // Produced asynchronously so a slow answer never blocks other
          // participants. It returns through reply(), which is what keeps it
          // addressed to this session and no other.
          answerRequest({
            meetingUUID: session.meetingUUID,
            mode,
            question: question ?? null,
            previous: session.lastAnswer ?? null,
          })
            .then(({ text, note }) => {
              if (mode !== "followup") session.lastAnswer = text;
              reply(session.id, id, { type: "answer", text, ...(note ? { note } : {}) });
            })
            .catch((err) => {
              log(`RELAY ${session.id} answer for ${id} failed: ${err.message}`);
              fail(session.id, "internal", err.message, id);
            });

          return;
        }

        case "ping":
          sendTo(session.id, { type: "pong" });
          return;

        default:
          // Ignored on purpose, so a newer panel talking to an older backend
          // degrades rather than breaking.
          log(`RELAY ${session.id} sent an unknown type: ${msg.type}`);
      }
    });

    ws.on("close", () => {
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
    // Called when a meeting's screen share starts or stops. Sent to each session
    // in that meeting individually, by id. There is no broadcast.
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

    // For tests and diagnostics.
    stats: () => ({
      sessions: sessions.size,
      participants: byParticipant.size,
      pending: [...sessions.values()].reduce((n, s) => n + s.pending.size, 0),
    }),
  };
}
