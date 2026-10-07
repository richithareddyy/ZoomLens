// Checks that a participant cannot run up cost by pressing a button repeatedly.
//
// Runs the real relay on a throwaway server with a short cooldown, so the test
// takes seconds rather than minutes.
//
//   node test-ratelimit.js

import http from "http";
import WebSocket from "ws";

process.env.ZOOM_LENS_COOLDOWN_SECONDS = "2";
process.env.ZOOM_LENS_DAILY_LIMIT = "3";

const { createRelay } = await import("./relay.js");

const PORT = 8098;
const server = http.createServer();
createRelay(server, {
  log: () => {},
  isStreamActive: () => true,
  // Answer instantly so the test measures the limiter, not the model.
  answerRequest: async () => ({ text: "an answer", note: null }),
});
await new Promise((r) => server.listen(PORT, r));

const results = [];
const check = (name, passed, detail) => {
  results.push(passed);
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}`);
  if (detail) console.log(`        ${detail}`);
};

function connect(participantUUID) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const seen = [];
    ws.on("message", (raw) => seen.push(JSON.parse(raw.toString())));
    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "hello", meetingUUID: "m==", participantUUID, screenName: participantUUID,
      }));
      setTimeout(() => resolve({ ws, seen }), 120);
    });
  });
}

const ask = (peer, id) => peer.ws.send(JSON.stringify({ type: "request", id, mode: "describe" }));
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const errorsFor = (peer, id) =>
  peer.seen.filter((m) => m.type === "error" && m.id === id);

console.log("\n" + "-".repeat(70));
console.log("  Zoom Lens, rate limiting");
console.log(`  cooldown 2s, daily limit 3`);
console.log("-".repeat(70) + "\n");

// 1. A second request straight after the first is refused.
{
  const a = await connect("p-a");
  ask(a, "a1");
  await settle(150);
  ask(a, "a2");
  await settle(300);
  const refused = errorsFor(a, "a2")[0];
  check("A second request during the cooldown is refused",
        refused?.code === "rate_limited",
        refused ? `"${refused.message}"` : "no refusal arrived");
  a.ws.close();
}

// 2. After the cooldown it is allowed again.
{
  const b = await connect("p-b");
  ask(b, "b1");
  await settle(2300);
  ask(b, "b2");
  await settle(300);
  check("After the cooldown passes, asking is allowed again",
        errorsFor(b, "b2").length === 0 &&
        b.seen.some((m) => m.type === "answer" && m.id === "b2"),
        `received ${b.seen.filter((m) => m.type === "answer").length} answers`);
  b.ws.close();
}

// 3. The daily ceiling applies, and a refusal does not count towards it.
{
  const c = await connect("p-c");
  for (let i = 1; i <= 3; i++) { ask(c, `c${i}`); await settle(2200); }
  ask(c, "c4");
  await settle(300);
  const refused = errorsFor(c, "c4")[0];
  check("The daily limit stops further requests",
        refused?.code === "rate_limited" && /limit of 3/.test(refused.message ?? ""),
        refused ? `"${refused.message}"` : "no refusal arrived");
  c.ws.close();
}

// 4. One participant's limit does not affect another's.
{
  const d = await connect("p-d");
  const e = await connect("p-e");
  ask(d, "d1");
  await settle(150);
  ask(d, "d2");       // refused, d is cooling down
  ask(e, "e1");       // unaffected
  await settle(400);
  check("One participant's limit does not affect another",
        errorsFor(d, "d2").length === 1 &&
        errorsFor(e, "e1").length === 0 &&
        e.seen.some((m) => m.type === "answer" && m.id === "e1"),
        "d refused, e answered");
  d.ws.close(); e.ws.close();
}

await settle(200);
const failed = results.filter((r) => !r).length;
console.log("\n" + "-".repeat(70));
console.log(`  ${results.length - failed} of ${results.length} cases passed.`);
console.log("-".repeat(70) + "\n");
server.close();
process.exit(failed ? 1 : 0);
