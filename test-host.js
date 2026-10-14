// Checks that a meeting's host, and only the host, can turn ZoomLens off for
// everyone in that meeting, and that turning it off stops everything already
// running there. Runs the real relay with a fake model and fake watchers.
//
//   node test-host.js

import http from "http";
import WebSocket from "ws";

process.env.ZOOM_LENS_COOLDOWN_SECONDS = "0";

const { createRelay } = await import("./relay.js");

const PORT = 8093;

const stopped = [];
const watcher = { start() {}, stop: (m) => stopped.push(m), latest: () => null };

const server = http.createServer();
createRelay(server, {
  log: () => {},
  isStreamActive: () => true,
  // Slow enough that a request can still be in flight when the host acts.
  answerRequest: () => new Promise((r) => setTimeout(() => r({ text: "an answer", note: null }), 300)),
  watchers: { changes: watcher },
  // Routing, not identity, is under test; test-trust.js covers identity.
  verify: (m) => (m.meetingUUID && m.participantUUID ? m : null),
  isHost: (meetingUUID, participantUUID) => meetingUUID === "m1==" && participantUUID === "host",
});
await new Promise((r) => server.listen(PORT, r));

const results = [];
const check = (name, passed, detail) => {
  results.push(passed);
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}`);
  if (detail) console.log(`        ${detail}`);
};

function connect(meetingUUID, participantUUID) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const seen = [];
    ws.on("message", (raw) => seen.push(JSON.parse(raw.toString())));
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "hello", meetingUUID, participantUUID }));
      setTimeout(() => resolve({ ws, seen }), 120);
    });
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (peer, msg) => peer.ws.send(JSON.stringify(msg));
const last = (peer, type) => peer.seen.filter((m) => m.type === type).at(-1);
const errorFor = (peer, id) => peer.seen.find((m) => m.type === "error" && m.id === id);
const answerFor = (peer, id) => peer.seen.find((m) => m.type === "answer" && m.id === id);

console.log("\n" + "-".repeat(70));
console.log("  ZoomLens, host control");
console.log("-".repeat(70) + "\n");

const host = await connect("m1==", "host");
const guest = await connect("m1==", "guest");
const elsewhere = await connect("m2==", "other");

// 1. Only the host is told they are the host.
check("The host's panel is told it is the host", last(host, "ready").host === true);
check("A participant's panel is not", last(guest, "ready").host === false);

// 2. A participant can't turn it off.
send(guest, { type: "allow", on: false });
await wait(150);
check("A participant who isn't the host is refused", last(guest, "error")?.code === "not_host");
check("And ZoomLens stays on for the meeting", last(host, "ready").allowed === true);

// 3. The host turns it off while a participant is mid-request and listening.
send(guest, { type: "watch", feature: "changes", on: true });
send(guest, { type: "request", id: "g1", mode: "describe" });
await wait(100);
send(host, { type: "allow", on: false });
await wait(400);
check("Everyone in the meeting is told it is off",
      last(host, "ready").allowed === false && last(guest, "ready").allowed === false);
check("A request already in flight is refused", errorFor(guest, "g1")?.code === "host_disabled");
check("And its answer is never delivered", !answerFor(guest, "g1"));
check("The meeting's watchers stop", stopped.includes("m1=="));

// 4. While it is off, nothing can be started, by anyone.
send(guest, { type: "request", id: "g2", mode: "describe" });
send(guest, { type: "watch", feature: "changes", on: true });
send(host, { type: "request", id: "h1", mode: "describe" });
await wait(150);
check("A new request is refused", errorFor(guest, "g2")?.code === "host_disabled");
check("Turning a mode on is refused",
      guest.seen.some((m) => m.type === "error" && !m.id && m.code === "host_disabled"));
check("The host's own requests are refused too", errorFor(host, "h1")?.code === "host_disabled");

// 5. Other meetings are untouched.
send(elsewhere, { type: "request", id: "e1", mode: "describe" });
await wait(450);
check("Another meeting still gets answers", Boolean(answerFor(elsewhere, "e1")));
check("And was never told anything changed",
      elsewhere.seen.filter((m) => m.type === "ready").every((m) => m.allowed === true));

// 6. The host turns it back on.
send(host, { type: "allow", on: true });
await wait(150);
check("Everyone is told it is back on", last(guest, "ready").allowed === true);
send(guest, { type: "request", id: "g3", mode: "describe" });
await wait(450);
check("And requests are answered again", Boolean(answerFor(guest, "g3")));

for (const peer of [host, guest, elsewhere]) peer.ws.close();

const failed = results.filter((r) => !r).length;
console.log("\n" + "-".repeat(70));
console.log(`  ${results.length - failed} of ${results.length} cases passed.`);
console.log("-".repeat(70) + "\n");
server.close();
process.exit(failed ? 1 : 0);
