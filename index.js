import rtms from "@zoom/rtms";
import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createRelay } from "./relay.js";
import { createFrameBuffer } from "./framebuffer.js";
import { decodeToJpeg } from "./decode.js";
import { produceAnswer, explainFailure } from "./answer.js";
import { captureLocalScreen } from "./screen.js";
import { createWatcher, NO_CHANGE } from "./watch.js";
import { analyzeColors, summarize } from "./colors.js";
import { readAppContext, createTickets, createSignatureCheck } from "./trust.js";
import { startRetention, hoursFrom } from "./retention.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const clients = new Map(); // streamId -> rtms.Client

// Meetings with a screen share being captured. The panel is told, so it can
// disable controls that would return nothing.
const activeMeetings = new Map(); // meetingUUID -> streamId
const meetingForStream = new Map(); // streamId -> meetingUUID

// Recent screen-share video per meeting, so a still is ready the moment someone asks.
const frameBuffers = new Map(); // meetingUUID -> frame buffer

let relay = null; // set once the HTTP server exists

const CAPTURE_DIR = "captures";
fs.mkdirSync(CAPTURE_DIR, { recursive: true });

// Screen-share video is kept on disk only when asked for: it is a recording of
// someone else's screen.
const SAVE_CAPTURES = process.env.ZOOM_LENS_SAVE_CAPTURES === "1";

const log = (...args) => console.log(`[${new Date().toLocaleTimeString()}]`, ...args);

// Called from our own Express route instead of rtms.onWebhookEvent(), which runs
// its own server and would leave nowhere on the same port to serve the panel.
function handleWebhookEvent({ event, payload }) {
  const streamId = payload?.rtms_stream_id;

  log(`Webhook: ${event}`);

  if (event === "meeting.rtms_stopped") {
    if (!streamId) {
      log("Received meeting.rtms_stopped without a stream ID");
      return;
    }
    const client = clients.get(streamId);
    if (!client) {
      log(`Received meeting.rtms_stopped for unknown stream ${streamId}`);
      return;
    }
    endStream(streamId, "Zoom stopped the stream");
    client.leave();
    return;
  }

  if (event !== "meeting.rtms_started") {
    log(`Ignoring unknown event: ${event}`);
    return;
  }

  // Zoom resends an event it thinks went unanswered; a second client for the
  // same stream would double every frame.
  if (clients.has(streamId)) {
    log(`Ignoring a repeated meeting.rtms_started for stream ${streamId}`);
    return;
  }

  log(`RTMS STARTED for meeting ${String(payload?.meeting_uuid).slice(0, 12)}..., stream ${streamId}`);

  const meetingUUID = payload?.meeting_uuid ?? null;
  if (meetingUUID) {
    activeMeetings.set(meetingUUID, streamId);
    meetingForStream.set(streamId, meetingUUID);
    relay?.notifyStreamState(meetingUUID, true);
  }

  const client = new rtms.Client();
  clients.set(streamId, client);

  // Only the screen share is listened for. The SDK subscribes to each media
  // type a handler is registered for, so handlers for audio or transcripts
  // would have Zoom send them here even though nothing uses them.
  client.onJoinConfirm((reason) => {
    log(`JOIN CONFIRMED (reason: ${reason}), media stream is connected`);
  });

  // Session details include names; the operation is enough to follow along.
  client.onSessionUpdate((op) => {
    log(`Session update: op=${op}`);
  });

  client.onMediaConnectionInterrupted(() => {
    log(`Media connection interrupted for stream ${streamId}`);
  });

  // Answers only need a still of the screen, so 5 fps is plenty.
  client.setDeskshareParams({
    contentType: rtms.VideoContentType.RAW_VIDEO,
    codec: rtms.VideoCodec.H264,
    resolution: rtms.VideoResolution.HD,
    fps: 5,
  });

  // With ZOOM_LENS_SAVE_CAPTURES=1 the raw H.264 is also written to disk, for
  // snapshot.js, eval-changes.js and the recorded fallback.
  const capturePath = SAVE_CAPTURES
    ? path.join(CAPTURE_DIR, `deskshare-${new Date().toISOString().replace(/[:.]/g, "-")}.h264`)
    : null;
  const captureFile = capturePath ? fs.createWriteStream(capturePath) : null;
  if (capturePath) log(`Saving screen share to ${capturePath}`);

  const frames = createFrameBuffer({ log });
  if (meetingUUID) frameBuffers.set(meetingUUID, frames);

  let deskFrames = 0;
  let deskBytes = 0;
  client.onDeskshareData((data, size, timestamp, metadata) => {
    deskFrames++;
    deskBytes += size;
    captureFile?.write(data);
    frames.push(data);

    if (deskFrames === 1 || deskFrames % 25 === 0) {
      const kb = (deskBytes / 1024).toFixed(0);
      log(`DESKSHARE frame #${deskFrames}, ${size} bytes (${kb} KB total)`);
    }
  });

  // Once sharing stops, what was last shared is no longer on screen, and
  // answering from it would describe something nobody is showing.
  client.onSharingEvent((what) => {
    if (what === "stop") frames.reset();
    log(`Screen sharing ${what === "stop" ? "stopped" : "started"} in stream ${streamId}`);
  });

  client.onLeave((reason) => {
    log(`LEFT MEETING (reason: ${reason})`);
    if (captureFile) {
      captureFile.end();
      log(`Capture saved: ${capturePath} (${deskFrames} frames, ${(deskBytes / 1024).toFixed(0)} KB)`);
    }
    // Also reached when the connection drops without a stopped event.
    endStream(streamId, `left with reason ${reason}`);
  });

  try {
    client.join(payload);
    log(`Joining stream ${streamId}...`);
  } catch (err) {
    log(`Could not join stream ${streamId}: ${err.message}`);
    endStream(streamId, "join failed");
  }
}

// Forgets a stream and its video, and tells the meeting's panels. Safe to call
// more than once for the same stream.
function endStream(streamId, why) {
  if (!clients.delete(streamId)) return;
  const meetingUUID = meetingForStream.get(streamId);
  meetingForStream.delete(streamId);
  if (meetingUUID && activeMeetings.get(meetingUUID) === streamId) {
    activeMeetings.delete(meetingUUID);
    frameBuffers.delete(meetingUUID);
    relay?.notifyStreamState(meetingUUID, false);
  }
  log(`Stream ${streamId} ended (${why})`);
}

// --- Answering a request -------------------------------------------------

// Fall back to the newest recording when nothing is live, for testing without a
// meeting. Off by default: an old recording passed off as the current screen is
// worse than no answer, and every such answer is labelled.
const ALLOW_RECORDED = process.env.ZOOM_LENS_ALLOW_RECORDED === "1";

function newestCapture() {
  const files = fs
    .readdirSync(CAPTURE_DIR)
    .filter((f) => f.endsWith(".h264"))
    .map((f) => ({ f, s: fs.statSync(path.join(CAPTURE_DIR, f)) }))
    .filter((x) => x.s.size > 0)
    .sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
  return files.length ? path.join(CAPTURE_DIR, files[0].f) : null;
}

// Read this machine's display when the media stream is unavailable (see screen.js).
const ALLOW_LOCAL_SCREEN = process.env.ZOOM_LENS_LOCAL_SCREEN === "1";

// Sources in order of how close each is to the real thing. Null if none is usable.
// `quiet` keeps the watcher, which looks every couple of seconds, out of the log.
async function currentScreen(meetingUUID, { quiet = false } = {}) {
  const report = quiet ? () => {} : log;

  // 1. The meeting's media stream.
  const live = frameBuffers.get(meetingUUID)?.snapshot();
  if (live) {
    const { jpeg, ms } = await decodeToJpeg(live);
    report(`ANSWER decoded the shared screen in ${ms} ms (${(jpeg.length / 1024).toFixed(0)} KB)`);
    return { jpeg, note: null };
  }

  // 2. This machine's display. Zoom draws whoever is sharing here, so it is the
  //    current screen even when someone else is presenting.
  if (ALLOW_LOCAL_SCREEN) {
    try {
      const { jpeg, ms } = await captureLocalScreen();
      report(`ANSWER read this machine's display in ${ms} ms (${(jpeg.length / 1024).toFixed(0)} KB)`);
      return {
        jpeg,
        note: "Read from this machine's display rather than the meeting's media stream.",
      };
    } catch (err) {
      // Usually macOS withholding screen-recording permission. Fall through to
      // the next source rather than failing a request that may still be answerable.
      report(`ANSWER could not read this machine's display: ${err.message}`);
    }
  }

  // 3. A recording.
  if (!ALLOW_RECORDED) return null;
  const file = newestCapture();
  if (!file) return null;

  // Replayed through a buffer so the clip is assembled exactly as a live one is.
  const replay = createFrameBuffer({ log: () => {} });
  replay.push(fs.readFileSync(file));
  const clip = replay.snapshot();
  if (!clip) return null;

  const { jpeg, ms } = await decodeToJpeg(clip);
  report(`ANSWER decoded a recording in ${ms} ms (${(jpeg.length / 1024).toFixed(0)} KB)`);
  return {
    jpeg,
    note: `This is from a recording (${path.basename(file)}), not a live screen share.`,
  };
}

async function answerRequest({ meetingUUID, mode, question, previous, colorSafe }) {
  const screen = await currentScreen(meetingUUID);
  if (!screen) {
    throw new Error("There is no screen to look at yet. Ask again once somebody is sharing.");
  }

  const colors = colorSafe || mode === "colors" ? summarize(await analyzeColors(screen.jpeg)) : null;

  try {
    const { text, ms, usage } = await produceAnswer({
      jpeg: screen.jpeg, mode, question, previous, colorSafe, colors,
    });
    log(
      `ANSWER ${mode} produced in ${(ms / 1000).toFixed(1)}s ` +
      `(${usage.input_tokens} in / ${usage.output_tokens} out)`
    );
    return { text, note: screen.note };
  } catch (err) {
    throw new Error(explainFailure(err));
  }
}

// --- HTTP server: the panel and Zoom's webhooks ---------------------------

// Hosts assign PORT; ZM_RTMS_PORT still wins for existing local setups.
const PORT = Number(process.env.ZM_RTMS_PORT || process.env.PORT) || 8080;
const app = express();

// The raw body is kept because Zoom signs the exact bytes it sends.
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// Zoom rejects a Home URL without these headers, both when the app is
// configured and each time the panel opens.
app.use((req, res, next) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://appssdk.zoom.us",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'self' https://*.zoom.us",
    ].join("; ")
  );
  next();
});

// --- Who is asking -----------------------------------------------------------

// See trust.js. Tickets outlast a long meeting's reconnects, but not a server
// restart: after one, the panel has to be reopened from Zoom.
const CLIENT_SECRET = process.env.ZM_RTMS_SECRET;
const tickets = createTickets();

function verifyHello(hello) {
  const who = tickets.check(hello.ticket);
  // The panel also reports the meeting from the SDK. A difference changes
  // nothing, since the context wins, but it is worth knowing about.
  if (who && hello.meetingUUID && hello.meetingUUID !== who.meetingUUID) {
    log("PANEL reported a different meeting from its verified context; using the context");
  }
  return who;
}

const PANEL_HTML = path.join(HERE, "public", "index.html");

app.get(["/", "/index.html"], (req, res) => {
  const header = req.get("x-zoom-app-context");
  let ticket = "";
  if (header && CLIENT_SECRET) {
    try {
      ticket = tickets.issue(readAppContext(header, CLIENT_SECRET)) ?? "";
    } catch (err) {
      log(`PANEL ignored an app context: ${err.message}`);
    }
  }
  const html = fs.readFileSync(PANEL_HTML, "utf8")
    .replace('<meta name="zoomlens-ticket" content="">', `<meta name="zoomlens-ticket" content="${ticket}">`);
  res.set("Cache-Control", "no-store").type("html").send(html);
});

// The rest of the panel (panel.js), served from the Marketplace Home URL.
app.use(express.static(path.join(HERE, "public")));

// For the host's health check and for seeing whether Zoom is getting through.
// Times only: no meeting, participant or count.
app.get("/healthz", (req, res) => {
  res.set("Cache-Control", "no-store").json({
    ok: true,
    lastWebhook: seen.webhook,
    lastValidation: seen.validation,
  });
});

// Where Zoom sends someone after they add the app. ZoomLens calls no Zoom
// REST API, so the authorization code is not exchanged, kept or logged.
app.get("/auth/callback", (req, res) => {
  res.set("Cache-Control", "no-store").type("html").send(INSTALLED_HTML);
});

const INSTALLED_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>ZoomLens is added</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#1f2329}
h1{font-size:1.4rem}a{color:#0b5cff}</style></head><body>
<h1>ZoomLens is added to your Zoom account</h1>
<p>Join or start a meeting, open <b>Apps</b> in the meeting toolbar, and choose <b>ZoomLens</b>.</p>
<p><a href="https://zoomlens.vercel.app/privacy.html">Privacy Policy</a> · <a href="https://zoomlens.vercel.app/terms.html">Terms of Use</a></p>
</body></html>`;

// Zoom won't deliver events until this endpoint proves it holds the app's secret
// token: it sends a random string and expects the HMAC back within a few seconds.
const SECRET_TOKEN = process.env.ZM_RTMS_SECRET_TOKEN;
const signedByZoom = createSignatureCheck(SECRET_TOKEN);

function handleUrlValidation(payload, res) {
  const plainToken = payload?.plainToken;

  if (!SECRET_TOKEN) {
    log("VALIDATION failed: ZM_RTMS_SECRET_TOKEN is not set in .env");
    res.status(500).json({ error: "server is missing its secret token" });
    return;
  }
  if (!plainToken) {
    log("VALIDATION failed: Zoom sent no plainToken");
    res.status(400).json({ error: "missing plainToken" });
    return;
  }

  const encryptedToken = crypto
    .createHmac("sha256", SECRET_TOKEN)
    .update(plainToken)
    .digest("hex");

  res.status(200).json({ plainToken, encryptedToken });
  seen.validation = new Date().toISOString();
  log("VALIDATION passed, Zoom will now deliver events to this address");
}

// When Zoom last reached this server, for /healthz. Zoom revalidates the
// endpoint every 72 hours and switches the subscription off after six failed
// revalidations in a row, which is what a laptop that sleeps eventually does.
const seen = { webhook: null, validation: null };

// Why a request failed the signature check, for the log. Never the values.
function whyUnsigned(timestamp, signature, rawBody) {
  if (!SECRET_TOKEN) return "ZM_RTMS_SECRET_TOKEN is not set";
  if (!timestamp || !signature) return "it has no Zoom signature headers";
  if (!rawBody?.length) return "it has no body";
  const ageS = Math.round(Date.now() / 1000 - Number(timestamp));
  if (!(Math.abs(ageS) <= 300)) return `its timestamp is ${ageS} seconds off this server's clock`;
  return "the signature doesn't match the secret token, or it was replayed";
}

// Acknowledge first, then handle the event, so a slow join never looks like an
// unhealthy endpoint to Zoom.
app.post("/", (req, res) => {
  const body = req.body;
  const timestamp = req.get("x-zm-request-timestamp");
  const signature = req.get("x-zm-signature");

  if (!signedByZoom(timestamp, signature, req.rawBody)) {
    log(`Rejected a POST because ${whyUnsigned(timestamp, signature, req.rawBody)}`);
    res.status(401).json({ error: "invalid signature" });
    return;
  }
  seen.webhook = new Date().toISOString();

  if (!body || typeof body.event !== "string") {
    log("Rejected a POST with no event field");
    res.status(400).json({ error: "missing event field" });
    return;
  }

  if (body.event === "endpoint.url_validation") {
    handleUrlValidation(body.payload, res);
    return;
  }

  res.status(200).json({ status: "ok" });

  try {
    handleWebhookEvent(body);
  } catch (err) {
    log(`Error handling ${body.event}: ${err.message}`);
  }
});

// The WebSocket relay shares the port, so the panel connects back to the same address.
const server = http.createServer(app);

// Both watchers look every couple of seconds; when both are on in a meeting,
// one decode serves the two.
const recent = new Map(); // meetingUUID -> pending or settled capture

function watchedScreen(meetingUUID) {
  if (!recent.has(meetingUUID)) {
    recent.set(meetingUUID, currentScreen(meetingUUID, { quiet: true }));
    setTimeout(() => recent.delete(meetingUUID), 1500);
  }
  return recent.get(meetingUUID);
}

async function ask(args) {
  try {
    return (await produceAnswer(args)).text;
  } catch (err) {
    throw new Error(explainFailure(err));
  }
}

const changes = createWatcher({
  capture: watchedScreen,
  describe: (jpeg, previous) => ask({ jpeg, mode: "changed", previous }),
  announce: (meetingUUID, text) => relay.announce("changes", meetingUUID, text),
  log,
});

// The model is only asked when the pixels show colors that could be confused.
const color = createWatcher({
  capture: watchedScreen,
  describe: async (jpeg, previous) => {
    const found = await analyzeColors(jpeg);
    if (!found.risky) return NO_CHANGE;
    return ask({ jpeg, mode: "colorcheck", previous, colorSafe: true, colors: summarize(found) });
  },
  announce: (meetingUUID, text) => relay.announce("color", meetingUUID, text),
  log,
  name: "COLOR",
});

relay = createRelay(server, {
  log,
  // With a fallback source available, requests can be answered without a live share.
  isStreamActive: (meetingUUID) =>
    activeMeetings.has(meetingUUID) ||
    ALLOW_LOCAL_SCREEN ||
    (ALLOW_RECORDED && Boolean(newestCapture())),
  answerRequest,
  watchers: { changes, color },
  verify: verifyHello,
});

// Saved recordings and development snapshots are deleted after a day unless
// configured otherwise; see retention.js.
startRetention({
  captureDir: CAPTURE_DIR,
  snapshotDir: "snapshots",
  captureHours: hoursFrom(process.env.ZOOM_LENS_CAPTURE_HOURS, 24),
  snapshotHours: hoursFrom(process.env.ZOOM_LENS_SNAPSHOT_HOURS, 24),
  log,
});

// Names only, never values, so the log can be shared when something is wrong.
const missing = ["ZM_RTMS_CLIENT", "ZM_RTMS_SECRET", "ZM_RTMS_SECRET_TOKEN", "ANTHROPIC_API_KEY"]
  .filter((name) => !process.env[name]);

server.listen(PORT, () => {
  log(`Zoom Lens is up on port ${PORT}`);
  log(`   panel   GET  /`);
  log(`   webhook POST /`);
  log(`   relay   WS   /ws`);
  log(`   health  GET  /healthz`);
  if (missing.length) log(`WARNING: not set: ${missing.join(", ")}. Zoom and answers won't work until they are.`);
  const testing = [
    ALLOW_LOCAL_SCREEN && "reading this machine's display",
    ALLOW_RECORDED && "answering from saved recordings",
    SAVE_CAPTURES && "saving screen-share video to captures/",
  ].filter(Boolean);
  if (testing.length) log(`Testing settings on: ${testing.join(", ")}. Leave them off when hosted.`);
});
