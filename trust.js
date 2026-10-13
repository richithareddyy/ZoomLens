// What this server trusts, and why.
//
// The panel's identity comes from the context Zoom attaches when it loads the
// panel (the X-Zoom-App-Context header). Only Zoom and this server hold the
// key, so its meeting and user can be trusted where IDs sent by the panel
// cannot. Format: https://developers.zoom.us/docs/zoom-apps/zoom-app-context/
//
// Webhooks are trusted when they carry Zoom's signature over the exact body.

import crypto from "crypto";

// base64 of [iv length: 1][iv][aad length: 2, LE][aad][ciphertext length: 4, LE]
// [ciphertext][tag: 16], AES-256-GCM under SHA-256 of the client secret.
export function readAppContext(header, secret, now = Date.now()) {
  const buf = Buffer.from(header, "base64");
  let at = 0;
  const take = (n) => {
    if (at + n > buf.length) throw new Error("app context is truncated");
    return buf.subarray(at, (at += n));
  };

  const iv = take(take(1).readUInt8(0));
  const aad = take(take(2).readUInt16LE(0));
  const cipherText = take(take(4).readUInt32LE(0));
  const tag = buf.subarray(at);
  if (tag.length !== 16) throw new Error("app context has a malformed tag");

  const key = crypto.createHash("sha256").update(secret).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv).setAAD(aad).setAuthTag(tag);
  // final() throws if the tag doesn't match, i.e. the context wasn't made with our secret.
  const context = JSON.parse(Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8"));

  // Zoom doesn't state the unit; its example timestamps have 13 digits
  // (milliseconds). Ten digits would be seconds.
  const exp = context.exp < 1e12 ? context.exp * 1000 : context.exp;
  if (!(exp > now)) throw new Error("app context has expired");
  return context;
}

// The inverse, for tests.
export function sealAppContext(context, secret) {
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const aad = Buffer.alloc(0);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv).setAAD(aad);
  const cipherText = Buffer.concat([cipher.update(JSON.stringify(context)), cipher.final()]);
  const len = (n, bytes) => {
    const b = Buffer.alloc(bytes);
    if (bytes === 1) b.writeUInt8(n);
    else if (bytes === 2) b.writeUInt16LE(n);
    else b.writeUInt32LE(n);
    return b;
  };
  return Buffer.concat([
    len(iv.length, 1), iv, len(aad.length, 2), aad, len(cipherText.length, 4), cipherText, cipher.getAuthTag(),
  ]).toString("base64");
}

// A valid context gets a ticket written into the page; the panel's hello
// presents it, and the meeting and user come from here, not from the panel.
export function createTickets({ ttlMs = 12 * 60 * 60 * 1000 } = {}) {
  const tickets = new Map(); // ticket -> { meetingUUID, participantUUID, expires }

  return {
    // Null unless the context is for a meeting.
    issue(context, now = Date.now()) {
      if (context.typ !== "meeting" || !context.mid || !context.uid) return null;
      for (const [t, v] of tickets) if (v.expires < now) tickets.delete(t);
      const ticket = crypto.randomBytes(24).toString("hex");
      tickets.set(ticket, { meetingUUID: context.mid, participantUUID: context.uid, expires: now + ttlMs });
      return ticket;
    },

    check(ticket, now = Date.now()) {
      const found = typeof ticket === "string" && tickets.get(ticket);
      if (!found || found.expires < now) return null;
      return { meetingUUID: found.meetingUUID, participantUUID: found.participantUUID };
    },
  };
}

// Every request from Zoom, the validation challenge included, is signed:
// "v0=" + HMAC-SHA256 of "v0:<timestamp>:<body>" under the secret token, with
// the timestamp in seconds. The challenge has to be checked too. Answering an
// unsigned one hands anyone the HMAC of a string they choose, which is exactly
// a valid signature.
export function createSignatureCheck(secretToken, { maxAgeS = 300 } = {}) {
  const seen = new Map(); // signature -> when, to refuse replays

  return (timestamp, signature, rawBody, now = Date.now()) => {
    if (!secretToken || !timestamp || !signature || !rawBody) return false;
    if (!(Math.abs(now / 1000 - Number(timestamp)) <= maxAgeS)) return false;

    const expected = "v0=" + crypto.createHmac("sha256", secretToken)
      .update(`v0:${timestamp}:`).update(rawBody).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

    for (const [s, at] of seen) if (now - at > maxAgeS * 1000) seen.delete(s);
    if (seen.has(signature)) return false;
    seen.set(signature, now);
    return true;
  };
}
