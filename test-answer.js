// End to end: a participant presses Describe and gets a real answer back.
//
// Connects the way the panel does, identifies itself, asks, and prints whatever
// comes back. This is the whole chain except Zoom itself: relay, frame buffer,
// decode, model, and the addressed reply.
//
//   node test-answer.js [describe|explain]

import WebSocket from "ws";

const mode = process.argv[2] || "describe";
const URL = "ws://localhost:8080/ws";
const MEETING = "test-meeting==";

const line = () => console.log("-".repeat(74));

console.log();
line();
console.log(`  Zoom Lens, request to answer (${mode})`);
console.log(`  ${new Date().toLocaleString()}`);
line();

const ws = new WebSocket(URL);
const started = Date.now();
let answered = false;

const done = (code) => { ws.close(); process.exit(code); };

ws.on("open", () => {
  ws.send(JSON.stringify({
    type: "hello",
    meetingUUID: MEETING,
    participantUUID: "p-test",
    screenName: "Test Participant",
  }));
});

ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());

  if (m.type === "ready") {
    console.log(`\n  identified: ${m.identified}, a screen is available: ${m.streamActive}`);
    if (!m.streamActive) {
      console.log("\n  Nothing to look at. Set ZOOM_LENS_ALLOW_RECORDED=1 in .env,");
      console.log("  or run this while a screen share is live.\n");
      return done(1);
    }
    console.log(`  asking for ${mode}...`);
    ws.send(JSON.stringify({ type: "request", id: "t-1", mode }));
    return;
  }

  if (m.type === "accepted") {
    console.log(`  accepted, about ${m.expectedSeconds}s expected\n`);
    return;
  }

  if (m.type === "answer") {
    answered = true;
    line();
    console.log(m.text);
    if (m.note) console.log(`\n[${m.note}]`);
    line();
    console.log(`  ${((Date.now() - started) / 1000).toFixed(1)}s from asking to answered.`);
    console.log();
    return done(0);
  }

  if (m.type === "error") {
    console.log(`\n  refused: ${m.message}\n`);
    return done(1);
  }
});

ws.on("error", (e) => {
  console.log(`\n  could not connect: ${e.message}`);
  console.log("  Is the server running? npm start\n");
  process.exit(1);
});

setTimeout(() => {
  if (!answered) {
    console.log("\n  Nothing came back within 90 seconds.\n");
    done(1);
  }
}, 90000);
