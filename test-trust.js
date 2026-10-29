// Checks what the server trusts: Zoom's encrypted app context, the tickets
// issued from it, and webhook signatures. The last part runs the real relay
// with ticket checking, to show that IDs a panel sends on its own count for
// nothing.
//
//   node test-trust.js

import http from "http";
import crypto from "crypto";
import WebSocket from "ws";
import { readAppContext, sealAppContext, createTickets, createSignatureCheck } from "./trust.js";
import { createRelay } from "./relay.js";

const SECRET = "client-secret-for-tests";
const TOKEN = "webhook-token-for-tests";
const PORT = 8094;

const results = [];
const check = (name, passed, detail) => {
  results.push(passed);
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}`);
  if (detail) console.log(`        ${detail}`);
};
const throws = (fn) => { try { fn(); return null; } catch (err) { return err.message; } };

const now = Date.now();
const context = { typ: "meeting", uid: "user-a", mid: "meeting-1==", ts: now, exp: now + 60000 };

console.log("\n" + "-".repeat(70));
console.log("  ZoomLens, what the server trusts");
console.log("-".repeat(70) + "\n");

// 1. The app context.
{
  const read = readAppContext(sealAppContext(context, SECRET), SECRET);
  check("A context sealed with the client secret reads back", read.uid === "user-a" && read.mid === "meeting-1==");
}
{
  const err = throws(() => readAppContext(sealAppContext(context, "some other secret"), SECRET));
  check("One sealed with another secret is refused", Boolean(err), err);
}
{
  const buf = Buffer.from(sealAppContext(context, SECRET), "base64");
  buf[buf.length - 20] ^= 1; // a byte of ciphertext
  const err = throws(() => readAppContext(buf.toString("base64"), SECRET));
  check("A context changed by one bit is refused", Boolean(err), err);
}
{
  const err = throws(() => readAppContext(sealAppContext({ ...context, exp: now - 1 }, SECRET), SECRET));
  check("An expired context is refused", err === "app context has expired", err);
}
{
  const seconds = Math.floor((now + 60000) / 1000);
  const err = throws(() => readAppContext(sealAppContext({ ...context, exp: seconds }, SECRET), SECRET));
  check("An expiry in seconds is read as seconds", err === null, err);
}
{
  const err = throws(() => readAppContext("bm90IGEgY29udGV4dA==", SECRET));
  check("Something that isn't a context is refused", Boolean(err), err);
}

// 2. Tickets.
{
  const tickets = createTickets({ ttlMs: 1000 });
  const t = tickets.issue(context, now);
  const who = tickets.check(t, now);
  check("A ticket gives back the context's meeting and user",
        who?.meetingUUID === "meeting-1==" && who?.participantUUID === "user-a");
  check("An unknown ticket gives nothing", tickets.check("0".repeat(48), now) === null);
  check("An expired ticket gives nothing", tickets.check(t, now + 1001) === null);
  check("A context outside a meeting gets no ticket", tickets.issue({ ...context, typ: "panel" }, now) === null);
}
{
  const tickets = createTickets();
  const mine = tickets.issue(context, now);
  const again = tickets.issue(context, now);
  const theirs = tickets.issue({ ...context, uid: "user-b" }, now);
  const n = tickets.revokeUser("user-a");
  check("Removing the app revokes that user's tickets and nobody else's",
        n === 2 && !tickets.check(mine, now) && !tickets.check(again, now) && tickets.check(theirs, now)?.participantUUID === "user-b",
        `${n} revoked`);
}

// 3. Webhook signatures.
{
  const sign = (ts, body, token = TOKEN) =>
    "v0=" + crypto.createHmac("sha256", token).update(`v0:${ts}:${body}`).digest("hex");
  const body = Buffer.from('{"event":"meeting.rtms_started","payload":{}}');
  const ts = String(Math.floor(now / 1000));

  const signed = createSignatureCheck(TOKEN);
  check("A request signed by Zoom passes", signed(ts, sign(ts, body), body, now));
  check("The same request sent again is refused", !signed(ts, sign(ts, body), body, now));
  check("A request signed with another token is refused",
        !createSignatureCheck(TOKEN)(ts, sign(ts, body, "other"), body, now));
  check("A changed body is refused",
        !createSignatureCheck(TOKEN)(ts, sign(ts, body), Buffer.from(body.toString().replace("started", "stopped")), now));
  const old = String(Math.floor(now / 1000) - 301);
  check("A request over five minutes old is refused", !createSignatureCheck(TOKEN)(old, sign(old, body), body, now));
  check("A request with no signature is refused", !createSignatureCheck(TOKEN)(ts, undefined, body, now));
  check("A timestamp that isn't a number is refused",
        !createSignatureCheck(TOKEN)("soon", sign("soon", body), body, now));
}

// 4. The relay with real tickets: only a ticket identifies a panel.
{
  const tickets = createTickets();
  const ticket = tickets.issue(context);
  const server = http.createServer();
  createRelay(server, {
    log: () => {},
    isStreamActive: () => true,
    answerRequest: async () => ({ text: "an answer", note: null }),
    verify: (hello) => tickets.check(hello.ticket),
  });
  await new Promise((r) => server.listen(PORT, r));

  const hello = (msg) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    ws.on("message", (raw) => { resolve(JSON.parse(raw.toString())); ws.close(); });
    ws.on("open", () => ws.send(JSON.stringify({ type: "hello", ...msg })));
  });

  check("A panel with a ticket is identified", (await hello({ ticket })).identified === true);
  const impostor = await hello({ meetingUUID: "meeting-1==", participantUUID: "user-a" });
  check("A panel sending someone's IDs without a ticket is not", impostor.identified === false);
  const forged = await hello({ ticket: crypto.randomBytes(24).toString("hex") });
  check("A panel with a made-up ticket is not", forged.identified === false);
  server.close();
}

const failed = results.filter((r) => !r).length;
console.log("\n" + "-".repeat(70));
console.log(`  ${results.length - failed} of ${results.length} cases passed.`);
console.log("-".repeat(70) + "\n");
process.exit(failed ? 1 : 0);
