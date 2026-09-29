// Verifies that one participant's traffic never reaches another.
//
// This is the evidence behind the central claim in docs/privacy.md. It runs the
// real relay from relay.js, not a copy of it, on a throwaway HTTP server. The
// only thing stubbed is whether a screen share is active, which is stubbed to
// true so that requests are accepted rather than refused. Isolation has to hold
// on the path where answers actually flow, not only on the path where they are
// turned down.
//
//   node test-isolation.js
//
// Exits non-zero if any case fails, so it can be run before a demo.

import http from "http";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import { createRelay } from "./relay.js";

const PORT = 8099;
const QUIET = () => {}; // the relay logs a lot; the test speaks for itself

// --- Harness ---------------------------------------------------------------

const server = http.createServer();
const relay = createRelay(server, { log: QUIET, isStreamActive: () => true });
await new Promise((r) => server.listen(PORT, r));

const results = [];
const line = () => console.log("-".repeat(74));

// Opens a connection, says hello, and records everything it is ever sent.
function connect(label, { meetingUUID, participantUUID, screenName }) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const seen = [];
    ws.on("message", (raw) => seen.push(JSON.parse(raw.toString())));
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "hello", meetingUUID, participantUUID, screenName }));
      // Give the ready message time to arrive before the caller proceeds
      setTimeout(() => resolve({ label, ws, seen }), 150);
    });
  });
}

const send = (peer, message) => peer.ws.send(JSON.stringify(message));
const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms));
const closeAll = (...peers) => peers.forEach((p) => p.ws.close());

// Every message the backend sends that belongs to a request carries that
// request's id. So "did anyone receive something that was not theirs" reduces to
// checking the ids each connection was sent.
const idsSeen = (peer) => peer.seen.map((m) => m.id).filter(Boolean);

function check(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

console.log();
line();
console.log("  Zoom Lens, participant isolation");
console.log(`  ${new Date().toLocaleString()}`);
console.log("  Running the real relay with screen sharing stubbed active,");
console.log("  so requests are accepted rather than refused.");
line();
console.log();

// --- 1. Two participants in one meeting ------------------------------------

{
  const M = "meeting-one==";
  const alice = await connect("Alice", { meetingUUID: M, participantUUID: "p-alice", screenName: "Alice" });
  const bob = await connect("Bob", { meetingUUID: M, participantUUID: "p-bob", screenName: "Bob" });

  send(alice, { type: "request", id: "alice-1", mode: "describe" });
  send(bob, { type: "request", id: "bob-1", mode: "explain" });
  await settle();

  const a = idsSeen(alice);
  const b = idsSeen(bob);
  check(
    "Two participants in one meeting receive only their own traffic",
    a.every((id) => id.startsWith("alice-")) && b.every((id) => id.startsWith("bob-")) &&
      a.length > 0 && b.length > 0,
    `Alice received [${a.join(", ")}], Bob received [${b.join(", ")}]`
  );

  closeAll(alice, bob);
  await settle(200);
}

// --- 2. Participants in different meetings ---------------------------------

{
  const one = await connect("One", { meetingUUID: "meeting-A==", participantUUID: "p-1", screenName: "One" });
  const two = await connect("Two", { meetingUUID: "meeting-B==", participantUUID: "p-2", screenName: "Two" });

  send(one, { type: "request", id: "one-1", mode: "describe" });
  send(two, { type: "request", id: "two-1", mode: "describe" });
  await settle();

  const a = idsSeen(one);
  const b = idsSeen(two);
  check(
    "Participants in different meetings are isolated from each other",
    a.every((id) => id.startsWith("one-")) && b.every((id) => id.startsWith("two-")),
    `Meeting A received [${a.join(", ")}], Meeting B received [${b.join(", ")}]`
  );

  closeAll(one, two);
  await settle(200);
}

// --- 3. One participant with the panel open twice --------------------------
// Two devices, or two windows. These are separate sessions and must stay
// separate, otherwise an answer meant for one would appear on the other.

{
  const M = "meeting-two==";
  const laptop = await connect("Laptop", { meetingUUID: M, participantUUID: "p-same", screenName: "Alex" });
  const phone = await connect("Phone", { meetingUUID: M, participantUUID: "p-same", screenName: "Alex" });

  send(laptop, { type: "request", id: "laptop-1", mode: "describe" });
  await settle();

  const onLaptop = idsSeen(laptop);
  const onPhone = idsSeen(phone);
  check(
    "The same participant's two sessions do not share answers",
    onLaptop.includes("laptop-1") && !onPhone.includes("laptop-1"),
    `Laptop received [${onLaptop.join(", ")}], phone received [${onPhone.join(", ") || "nothing addressed"}]`
  );

  closeAll(laptop, phone);
  await settle(200);
}

// --- 4. Reusing another participant's request id ---------------------------
// A participant who saw or guessed somebody else's request id should gain
// nothing by using it. Each session's outstanding requests are its own, so the
// reply goes to whoever asked, never to the other holder of that id.

{
  const M = "meeting-three==";
  const victim = await connect("Victim", { meetingUUID: M, participantUUID: "p-victim", screenName: "Victim" });
  const copycat = await connect("Copycat", { meetingUUID: M, participantUUID: "p-copycat", screenName: "Copycat" });

  send(victim, { type: "request", id: "shared-id", mode: "describe" });
  await settle(200);
  send(copycat, { type: "request", id: "shared-id", mode: "describe" });
  await settle();

  // Both used the same id, so both should have got exactly one reply each: their
  // own. The failure this guards against is one of them receiving two.
  const v = idsSeen(victim).filter((id) => id === "shared-id");
  const c = idsSeen(copycat).filter((id) => id === "shared-id");
  check(
    "Reusing another participant's request id does not redirect their answer",
    v.length === 1 && c.length === 1,
    `Victim received ${v.length} reply for that id, copycat received ${c.length}`
  );

  closeAll(victim, copycat);
  await settle(200);
}

// --- 5. News of a screen share is sent per session, not broadcast -----------
// notifyStreamState is the one place several people are told the same thing.
// It must reach only the meeting it concerns.

{
  const inMeeting = await connect("In meeting", { meetingUUID: "meeting-live==", participantUUID: "p-in", screenName: "In" });
  const elsewhere = await connect("Elsewhere", { meetingUUID: "meeting-other==", participantUUID: "p-out", screenName: "Out" });

  const before = elsewhere.seen.length;
  relay.notifyStreamState("meeting-live==", true);
  await settle(300);

  check(
    "Screen share notifications reach only the meeting they concern",
    inMeeting.seen.filter((m) => m.type === "ready").length === 2 &&
      elsewhere.seen.length === before,
    `Participant in that meeting was told, participant elsewhere received ${elsewhere.seen.length - before} further messages`
  );

  closeAll(inMeeting, elsewhere);
  await settle(200);
}

// --- 6. Many participants at once ------------------------------------------
// Two participants can pass by luck. This runs enough of them, all asking at
// the same moment, that a routing mistake would show up.

{
  const M = "meeting-crowd==";
  const COUNT = 10;
  const peers = await Promise.all(
    Array.from({ length: COUNT }, (_, i) =>
      connect(`P${i}`, { meetingUUID: M, participantUUID: `p-${i}`, screenName: `Person ${i}` })
    )
  );

  peers.forEach((p, i) => send(p, { type: "request", id: `req-${i}`, mode: "describe" }));
  await settle(800);

  const strays = peers
    .map((p, i) => ({ i, wrong: idsSeen(p).filter((id) => id !== `req-${i}`) }))
    .filter((r) => r.wrong.length);

  const everyoneAnswered = peers.every((p, i) => idsSeen(p).includes(`req-${i}`));

  check(
    `${COUNT} participants asking simultaneously stay separated`,
    strays.length === 0 && everyoneAnswered,
    strays.length
      ? `${strays.length} participant(s) received traffic that was not theirs`
      : `all ${COUNT} received their own answer and nothing else`
  );

  closeAll(...peers);
  await settle(200);
}

// --- 7. A session with no identity cannot ask ------------------------------

{
  const anon = await connect("Anonymous", { meetingUUID: null, participantUUID: null, screenName: null });
  send(anon, { type: "request", id: "anon-1", mode: "describe" });
  await settle();

  const refusal = anon.seen.find((m) => m.type === "error" && m.id === "anon-1");
  check(
    "A session with no identity is refused, because no answer could be addressed",
    refusal?.code === "not_identified",
    refusal ? `refused with code "${refusal.code}"` : "no refusal was sent"
  );

  closeAll(anon);
  await settle(200);
}

// --- Verdict ---------------------------------------------------------------

console.log();
line();
const failed = results.filter((r) => !r.passed);
console.log(`  ${results.length - failed.length} of ${results.length} cases passed.`);
if (failed.length) {
  console.log("  FAILED:");
  failed.forEach((r) => console.log(`     ${r.name}`));
} else {
  console.log("  No participant received anything belonging to another participant,");
  console.log("  in any case tested, including ten asking at the same moment.");
}
line();
console.log();

server.close();
process.exit(failed.length ? 1 : 0);
