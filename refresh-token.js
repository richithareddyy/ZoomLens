// Gets a new access token without going through the browser again.
//
// Access tokens last an hour, which is shorter than a working session, so
// re-authorising by hand several times a day is the normal experience without
// this. The refresh token saved alongside it lasts far longer and can be
// exchanged for a fresh access token directly.
//
//   node --env-file=.env refresh-token.js
//
// Zoom issues a new refresh token every time and invalidates the old one, so
// the file is rewritten with both. Losing the new one means going back to the
// browser, which is why this writes before it prints anything.

import fs from "fs";

const TOKEN_FILE = ".tokens.json";

const CLIENT_ID = process.env.ZM_RTMS_CLIENT;
const CLIENT_SECRET = process.env.ZM_RTMS_SECRET;

if (!fs.existsSync(TOKEN_FILE)) {
  console.error(`ERROR: no ${TOKEN_FILE}. Authorise first with zoom-auth.js.`);
  process.exit(1);
}

const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));

if (!saved.refresh_token) {
  console.error("ERROR: no refresh token saved. Authorise again with zoom-auth.js.");
  process.exit(1);
}

const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

console.log("Exchanging the refresh token for a new access token...");

const res = await fetch("https://zoom.us/oauth/token", {
  method: "POST",
  headers: {
    Authorization: `Basic ${basic}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: saved.refresh_token,
  }),
});

const data = await res.json();

if (!res.ok) {
  console.error(`\nFAILED (HTTP ${res.status}):`);
  console.error(JSON.stringify(data, null, 2));
  console.error("\nMost likely causes:");
  console.error("  - the refresh token was already used (they are single-use)");
  console.error("  - it expired, which happens after a long gap");
  console.error("  - the app's credentials changed since it was issued");
  console.error("\nEither way, authorise again in the browser and run zoom-auth.js.");
  process.exit(1);
}

fs.writeFileSync(
  TOKEN_FILE,
  JSON.stringify({ ...data, obtained_at: new Date().toISOString() }, null, 2)
);

console.log("\nSUCCESS. New access token saved.");
console.log(`   Scopes: ${data.scope}`);
console.log(`   Valid for: ${Math.round(data.expires_in / 60)} minutes`);
console.log("\nNow run:");
console.log("   node --env-file=.env start-rtms.js <meetingId>");
