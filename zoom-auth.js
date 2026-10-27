// Exchanges a Zoom OAuth authorization code for an access token.
//
// Usage:  node --env-file=.env zoom-auth.js <code-from-redirect-url>
//
// The access token is saved to .tokens.json and used by start-rtms.js.

import fs from "fs";

const CLIENT_ID = process.env.ZM_RTMS_CLIENT;
const CLIENT_SECRET = process.env.ZM_RTMS_SECRET;

// Has to match the OAuth Redirect URL in the Marketplace exactly.
const PUBLIC_URL = process.env.ZOOM_LENS_PUBLIC_URL?.replace(/\/+$/, "");
if (!PUBLIC_URL) {
  console.error("ERROR: set ZOOM_LENS_PUBLIC_URL in .env to the server's address, e.g. https://zoomlens.onrender.com");
  process.exit(1);
}
const REDIRECT_URI = `${PUBLIC_URL}/auth/callback`;

const code = process.argv[2];

if (!code) {
  console.error("ERROR: no authorization code given.");
  console.error("Usage: node --env-file=.env zoom-auth.js <code>");
  process.exit(1);
}

const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

const body = new URLSearchParams({
  grant_type: "authorization_code",
  code,
  redirect_uri: REDIRECT_URI,
});

console.log("Exchanging authorization code for an access token...");

const res = await fetch("https://zoom.us/oauth/token", {
  method: "POST",
  headers: {
    Authorization: `Basic ${basic}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body,
});

const data = await res.json();

if (!res.ok) {
  console.error(`\nFAILED (HTTP ${res.status}):`);
  console.error(JSON.stringify(data, null, 2));
  console.error("\nMost likely causes:");
  console.error("  - the code was already used (they are single-use)");
  console.error("  - the code expired (they last only a few minutes)");
  console.error("  - the redirect_uri does not exactly match the Marketplace setting");
  process.exit(1);
}

fs.writeFileSync(
  ".tokens.json",
  JSON.stringify({ ...data, obtained_at: new Date().toISOString() }, null, 2)
);

console.log("\nSUCCESS. Access token saved to .tokens.json");
console.log(`   Scopes granted: ${data.scope}`);
console.log(`   Expires in: ${data.expires_in} seconds (about 1 hour)`);
console.log("\nNext: start a Zoom meeting, then run:");
console.log("   node --env-file=.env start-rtms.js <meetingId>");
