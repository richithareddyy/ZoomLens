// Starts RTMS for a live Zoom meeting via the Zoom REST API.
//
// Usage:  node --env-file=.env start-rtms.js <meetingId>
//         node --env-file=.env start-rtms.js <meetingId> stop
//
// Requires .tokens.json (create it by running zoom-auth.js first).

import fs from "fs";

const meetingId = process.argv[2];
const action = process.argv[3] === "stop" ? "stop" : "start";

if (!meetingId) {
  console.error("ERROR: no meeting ID given.");
  console.error("Usage: node --env-file=.env start-rtms.js <meetingId> [stop]");
  process.exit(1);
}

if (!fs.existsSync(".tokens.json")) {
  console.error("ERROR: .tokens.json not found. Run zoom-auth.js first.");
  process.exit(1);
}

const tokens = JSON.parse(fs.readFileSync(".tokens.json", "utf8"));

// Warn if the token is probably stale (they last ~1 hour)
const ageMinutes = (Date.now() - new Date(tokens.obtained_at)) / 60000;
if (ageMinutes > 55) {
  console.warn(`WARNING: token is ${Math.round(ageMinutes)} minutes old and has likely expired.`);
  console.warn("   If this fails with a 401, re-authorize and run zoom-auth.js again.\n");
}

const url = `https://api.zoom.us/v2/live_meetings/${meetingId}/rtms_app/status`;

// Zoom requires settings.client_id, which identifies which app's RTMS to start
const payload = {
  action,
  settings: { client_id: process.env.ZM_RTMS_CLIENT },
};

console.log(`Sending: PATCH ${url}`);
console.log(`Body:    ${JSON.stringify(payload)}\n`);

const res = await fetch(url, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${tokens.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await res.text();

console.log(`Response: HTTP ${res.status} ${res.statusText}`);
if (text) console.log(text);

if (res.status === 204 || res.ok) {
  console.log(`\nRTMS ${action} request accepted.`);
  console.log("   Watch the server log for: >>> WEBHOOK RECEIVED: meeting.rtms_started");
} else {
  console.log("\nRequest failed. What the common codes mean:");
  console.log("   401  -> access token expired; re-run zoom-auth.js");
  console.log("   2308 -> the token's user is not the meeting host");
  console.log("   2310 -> RTMS not enabled for this app/account (needs Zoom-side enablement)");
  console.log("   3001 -> meeting not found or not currently live");
}
