// Exercises the panel-to-backend connection and prints what happened.
//
// Covers the rules the privacy model depends on, including two participants in
// one meeting who must never see each other's traffic.
//
//   node test-relay.js                          against the public address
//   node test-relay.js ws://localhost:8080/ws   against the local one

import WebSocket from "ws";

const URL = process.argv[2] || "wss://wrongly-pretended-bagpipe.ngrok-free.dev/ws";
const HEADERS = { "ngrok-skip-browser-warning": "true" };
const MEETING = "meeting-abc==";

const line = () => console.log("-".repeat(74));
const open = () => new WebSocket(URL, { headers: HEADERS });

function describe(m) {
  if (m.type === "error") return `refused${m.id ? ` [${m.id}]` : ""}: ${m.message}`;
  if (m.type === "ready") return `accepted, identity known: ${m.identified ? "yes" : "no"}`;
  if (m.type === "accepted") return `request [${m.id}] accepted, about ${m.expectedSeconds}s expected`;
  return m.type;
}

// Opens one connection, runs the given steps, collects everything it receives.
function session(name, steps, seconds = 3) {
  return new Promise((resolve) => {
    const ws = open();
    const seen = [];
    let closedByServer = false;

    ws.on("open", () => {
      steps.forEach(({ after, send }) =>
        setTimeout(() => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(send));
        }, after)
      );
    });
    ws.on("message", (raw) => seen.push(JSON.parse(raw.toString())));
    ws.on("close", () => { closedByServer = true; });

    setTimeout(() => {
      if (ws.readyState === ws.OPEN) ws.close();
      resolve({ name, seen, closedByServer });
    }, seconds * 1000);
  });
}

function report({ name, seen, closedByServer }) {
  console.log(`\n  ${name}`);
  seen.forEach((m) => console.log(`     ${describe(m)}`));
  if (closedByServer) console.log("     connection closed by the backend");
}

console.log();
line();
console.log("  Zoom Lens, panel to backend connection");
console.log(`  ${new Date().toLocaleString()}`);
console.log(`  ${URL}`);
line();

// --- The basic rules -------------------------------------------------------

report(await session("A participant we can identify", [
  { after: 0, send: { type: "hello", meetingUUID: MEETING, participantUUID: "p-1", screenName: "Alex Chen" } },
  { after: 400, send: { type: "request", id: "r-1", mode: "describe" } },
  { after: 800, send: { type: "request", id: "r-2", mode: "followup" } },
]));

report(await session("A connection with no identity", [
  { after: 0, send: { type: "hello", meetingUUID: null, participantUUID: null } },
  { after: 400, send: { type: "request", id: "r-3", mode: "describe" } },
]));

report(await session("A connection that skips the introduction", [
  { after: 0, send: { type: "request", id: "r-4", mode: "describe" } },
], 2));

// --- Two participants in the same meeting ----------------------------------

line();
console.log("  Two participants in the same meeting, at the same time");
line();

const [alice, bob] = await Promise.all([
  session("Alice", [
    { after: 0, send: { type: "hello", meetingUUID: MEETING, participantUUID: "p-alice", screenName: "Alice" } },
    { after: 500, send: { type: "request", id: "alice-1", mode: "describe" } },
  ]),
  session("Bob", [
    { after: 0, send: { type: "hello", meetingUUID: MEETING, participantUUID: "p-bob", screenName: "Bob" } },
    { after: 500, send: { type: "request", id: "bob-1", mode: "explain" } },
  ]),
]);

report(alice);
report(bob);

// Did either see anything belonging to the other?
const ids = (s) => s.seen.map((m) => m.id).filter(Boolean);
const aliceSawBob = ids(alice).some((id) => id.startsWith("bob-"));
const bobSawAlice = ids(bob).some((id) => id.startsWith("alice-"));

console.log();
console.log(`     Alice received: ${ids(alice).join(", ") || "nothing addressed"}`);
console.log(`     Bob received:   ${ids(bob).join(", ") || "nothing addressed"}`);
console.log();
console.log(
  aliceSawBob || bobSawAlice
    ? "     FAILED: one participant received the other's traffic"
    : "     PASSED: neither participant received anything belonging to the other"
);

line();
console.log("  A connection that cannot be tied to one participant is not allowed");
console.log("  to ask for anything, because there would be nobody to send the");
console.log("  answer back to. Replies are addressed to one session by name, so");
console.log("  one person's answer cannot reach another.");
line();
console.log();
process.exit(0);
