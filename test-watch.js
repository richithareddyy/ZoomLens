// Checks that screen changes and Color Assist notes reach only the participants
// who switched them on. Runs the real relay and watchers against a fake screen
// and a fake model, looking every 100 ms, so nothing leaves this machine.
//
//   node test-watch.js

import http from "http";
import { spawnSync } from "child_process";
import WebSocket from "ws";
import ffmpegPath from "ffmpeg-static";

process.env.ZOOM_LENS_DAILY_LIMIT = "4";

const { createRelay } = await import("./relay.js");
const { createWatcher, NO_CHANGE } = await import("./watch.js");

const PORT = 8096;

function still(box) {
  const ff = spawnSync(ffmpegPath, [
    "-loglevel", "error", "-f", "lavfi", "-i", "color=c=white:s=1280x720",
    "-vf", box ? `drawbox=${box}:color=0x303030:t=fill` : "null",
    "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1",
  ]);
  return ff.stdout;
}
const screens = [still(null), still("x=100:y=100:w=600:h=300"), still("x=500:y=300:w=600:h=300")];

// What each meeting is sharing, and what the fake model will say next.
const shown = new Map([["m1==", screens[0]], ["m2==", screens[0]]]);
const looks = new Map();
let reply = "first";
let described = 0;

let relay;
const changes = createWatcher({
  capture: async (m) => {
    looks.set(m, (looks.get(m) ?? 0) + 1);
    return { jpeg: shown.get(m) };
  },
  describe: async () => { described++; return reply; },
  announce: (m, text) => relay.announce("changes", m, text),
  intervalMs: 100,
  minGapMs: 0,
});
const color = createWatcher({
  capture: async (m) => ({ jpeg: shown.get(m) }),
  describe: async () => "The status column is told apart only by color.",
  announce: (m, text) => relay.announce("color", m, text),
  intervalMs: 100,
  minGapMs: 0,
});
const asked = [];

const server = http.createServer();
// Routing, not identity, is under test here (test-trust.js covers identity),
// so the IDs each test connection sends are taken at face value.
const trustHello = (m) =>
  m.meetingUUID && m.participantUUID ? { meetingUUID: m.meetingUUID, participantUUID: m.participantUUID } : null;
relay = createRelay(server, {
  verify: trustHello,
  log: () => {},
  isStreamActive: () => true,
  answerRequest: async (req) => { asked.push(req); return { text: "an answer", note: null }; },
  watchers: { changes, color },
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
      ws.send(JSON.stringify({ type: "hello", meetingUUID, participantUUID, screenName: participantUUID }));
      setTimeout(() => resolve({ ws, seen }), 120);
    });
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const watch = (peer, on, feature = "changes") => peer.ws.send(JSON.stringify({ type: "watch", feature, on }));
const updates = (peer, feature = "changes") =>
  peer.seen.filter((m) => m.type === "update" && m.feature === feature).map((m) => m.text);
const last = (peer, type) => peer.seen.filter((m) => m.type === type).at(-1);

console.log("\n" + "-".repeat(70));
console.log("  Zoom Lens, reading out screen changes");
console.log("-".repeat(70) + "\n");

const listener = await connect("m1==", "p-listener");
const other = await connect("m1==", "p-other");
const elsewhere = await connect("m2==", "p-elsewhere");

// 1. Nothing is captured until somebody asks.
await wait(300);
check("No screen is captured while nobody is listening", looks.size === 0);

// 2. Turning it on describes the screen once, to the listener only.
watch(listener, true);
await wait(400);
check("Turning it on is confirmed", last(listener, "watching")?.on === true);
check("The listener hears the screen described", updates(listener).join() === "first",
      `got [${updates(listener).join(" | ")}]`);
check("A participant who didn't ask hears nothing", updates(other).length === 0);
check("Only the listener's meeting is captured", !looks.has("m2=="));

// 3. An unchanged screen is not described again; a changed one is, once.
const before = described;
await wait(400);
check("An unchanged screen is not sent to the model again", described === before);

reply = "second";
shown.set("m1==", screens[1]);
await wait(500);
check("A change is described once it holds still", updates(listener).join() === "first,second",
      `got [${updates(listener).join(" | ")}]`);

// 4. When the model says nothing meaningful changed, nothing is read out.
reply = NO_CHANGE;
shown.set("m1==", screens[2]);
await wait(500);
check("\"No meaningful change\" is not read out", updates(listener).length === 2);

// 5. Changes don't use up the cooldown on the participant's own questions.
listener.ws.send(JSON.stringify({ type: "request", id: "q1", mode: "describe" }));
await wait(200);
check("A question straight after a change is still answered", last(listener, "answer")?.id === "q1");

// 6. Changes count towards the daily cap, and stop when it is reached.
//    Used so far: two changes and one answer, out of four.
reply = "third";
shown.set("m1==", screens[0]);
await wait(500);
reply = "fourth";
shown.set("m1==", screens[1]);
await wait(500);
const off = last(listener, "watching");
check("Reaching the daily cap turns change descriptions off",
      off?.on === false && /limit/.test(off.reason ?? ""),
      `last watching message: ${JSON.stringify(off)}`);
check("Nothing past the cap is read out", !updates(listener).includes("fourth"));

// 7. With nobody listening, the meeting is no longer captured.
const stopped = looks.get("m1==");
await wait(400);
check("Capturing stops when the last listener stops", looks.get("m1==") === stopped);

// 8. Color Assist: notes go only to whoever turned it on, and their answers
//    are asked for color-safe.
const colorUser = await connect("m2==", "p-color");
watch(colorUser, true, "color");
await wait(400);
check("A Color Assist note reaches the participant who turned it on",
      updates(colorUser, "color").length === 1);
check("It reaches nobody else in the meeting", elsewhere.seen.every((m) => m.type !== "update"));
colorUser.ws.send(JSON.stringify({ type: "request", id: "c1", mode: "colors" }));
elsewhere.ws.send(JSON.stringify({ type: "request", id: "e1", mode: "describe" }));
await wait(200);
const byMode = Object.fromEntries(asked.map((r) => [r.mode, r.colorSafe]));
check("Answers are color-safe with Color Assist on, and only then",
      byMode.colors === true && byMode.describe === false && asked[0].colorSafe === false,
      JSON.stringify(asked.map((r) => [r.mode, r.colorSafe])));

// 9. A session with no identity cannot listen.
const anonymous = await connect(null, null);
watch(anonymous, true);
await wait(150);
check("A session without an identity is refused", last(anonymous, "error")?.code === "not_identified");

for (const peer of [listener, other, elsewhere, colorUser, anonymous]) peer.ws.close();

const failed = results.filter((r) => !r).length;
console.log("\n" + "-".repeat(70));
console.log(`  ${results.length - failed} of ${results.length} cases passed.`);
console.log("-".repeat(70) + "\n");
server.close();
process.exit(failed ? 1 : 0);
