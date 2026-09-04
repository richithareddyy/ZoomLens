// Import the RTMS SDK
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

// ES modules have no __dirname, so derive it from this file's URL
const HERE = path.dirname(fileURLToPath(import.meta.url));

let clients = new Map();

// Which meetings currently have a screen share being captured. The panel asks
// about this so it can explain why a request would return nothing, rather than
// offering a control that cannot succeed.
const activeMeetings = new Map(); // meetingUUID -> streamId
const meetingForStream = new Map(); // streamId -> meetingUUID

// Recent screen share video, held in memory per meeting so an image of the
// current screen can be produced the moment somebody asks for one.
const frameBuffers = new Map(); // meetingUUID -> frame buffer

// Assigned once the HTTP server exists, further down.
let relay = null;

// Where captured screen-share video gets written
const CAPTURE_DIR = "captures";
fs.mkdirSync(CAPTURE_DIR, { recursive: true });

// Simple timestamped logger so every line is easy to spot in the terminal
const log = (...args) => console.log(`[${new Date().toLocaleTimeString()}]`, ...args);

// Handles a single RTMS webhook event from Zoom.
//
// This used to run inside rtms.onWebhookEvent(), which starts its own HTTP
// server and answers only the webhook path, so nothing else could be served on
// the same port. The panel has to be served from the same address Zoom is told
// about, so the server below is ours and this is called from it. The SDK's
// streaming client is unchanged.
function handleWebhookEvent({ event, payload }) {
  const streamId = payload?.rtms_stream_id;

  // Log EVERY event Zoom sends us, so nothing arrives silently
  log(`>>> WEBHOOK RECEIVED: ${event}`);

  if (event == "meeting.rtms_stopped") {
      if (!streamId) {
          log(`Received meeting.rtms_stopped event without stream ID`);
          return;
      }

      const client = clients.get(streamId);
      if (!client) {
          log(`Received meeting.rtms_stopped event for unknown stream ID: ${streamId}`)
          return
      }

      client.leave();
      clients.delete(streamId);

      // Tell any open panels in this meeting that there is nothing to look at
      const endedMeeting = meetingForStream.get(streamId);
      if (endedMeeting) {
        activeMeetings.delete(endedMeeting);
        meetingForStream.delete(streamId);
        frameBuffers.delete(endedMeeting);
        relay?.notifyStreamState(endedMeeting, false);
      }

      log(`Left stream ${streamId}`);

      return;
  } else if (event !== "meeting.rtms_started") {
    log(`Ignoring unknown event: ${event}`);
    return;
  }

  log(`RTMS STARTED for meeting ${payload?.meeting_uuid}, stream ${streamId}`);

  // Record that this meeting now has a screen share, and tell any open panels
  const meetingUUID = payload?.meeting_uuid ?? null;
  if (meetingUUID) {
    activeMeetings.set(meetingUUID, streamId);
    meetingForStream.set(streamId, meetingUUID);
    relay?.notifyStreamState(meetingUUID, true);
  }

  // Create a new RTMS client for the stream if it doesn't exist
  const client = new rtms.Client();
  clients.set(streamId, client);

  // --- Connection lifecycle: these prove the stream is alive ---

  client.onJoinConfirm((reason) => {
    log(`JOIN CONFIRMED (reason: ${reason}), media stream is connected`);
  });

  client.onSessionUpdate((op, sessionInfo) => {
    log(`Session update: op=${op}`, sessionInfo);
  });

  client.onUserUpdate((op, participantInfo) => {
    log(`Participant update: op=${op}`, participantInfo?.name ?? participantInfo);
  });

  // --- Media data ---

  // Audio arrives constantly, so only log a heartbeat every 100 frames
  let audioFrames = 0;
  client.onAudioData((data, size, timestamp, metadata) => {
    audioFrames++;
    if (audioFrames % 100 === 1) {
      log(`AUDIO flowing: frame #${audioFrames}, ${size} bytes, from ${metadata?.userName}`);
    }
  });

  client.onTranscriptData((data, size, timestamp, metadata) => {
    log(`TRANSCRIPT -- ${metadata?.userName}: ${data}`);
  });

  // --- Screen share frames: the actual input Zoom Lens needs ---
  // Low fps on purpose. Describe/Explain only needs a periodic still of the
  // screen, not smooth video, and fewer frames means far less to process.
  client.setDeskshareParams({
    contentType: rtms.VideoContentType.RAW_VIDEO,
    codec: rtms.VideoCodec.H264,
    resolution: rtms.VideoResolution.HD,
    fps: 5,
  });

  // Write the raw H.264 stream to disk so we can decode stills from it later.
  // Frames are encoded video, not images: frame #1 is a full keyframe and the
  // rest are deltas, so a single delta on its own is not a usable picture.
  const capturePath = path.join(
    CAPTURE_DIR,
    `deskshare-${new Date().toISOString().replace(/[:.]/g, "-")}.h264`
  );
  const captureFile = fs.createWriteStream(capturePath);
  log(`Capturing screen share to ${capturePath}`);

  // Held in memory for on-demand snapshots, separate from the file on disk
  const frames = createFrameBuffer({ log });
  if (meetingUUID) frameBuffers.set(meetingUUID, frames);

  let deskFrames = 0;
  let deskBytes = 0;
  client.onDeskshareData((data, size, timestamp, metadata) => {
    deskFrames++;
    deskBytes += size;
    captureFile.write(data);
    frames.push(data);

    // Log the first frame, then a heartbeat every 25 frames
    if (deskFrames === 1 || deskFrames % 25 === 0) {
      const kb = (deskBytes / 1024).toFixed(0);
      log(`DESKSHARE frame #${deskFrames}, ${size} bytes (${kb} KB total), from ${metadata?.userName}`);
    }
  });

  // Close the capture file cleanly when the stream ends
  client.onLeave((reason) => {
    log(`LEFT MEETING (reason: ${reason})`);
    captureFile.end();
    log(`Capture saved: ${capturePath} (${deskFrames} frames, ${(deskBytes / 1024).toFixed(0)} KB)`);
  });

  // Join the meeting using the webhook payload directly
  client.join(payload);
  log(`Joining stream ${streamId}...`);
}

// --- Answering a request -------------------------------------------------

// When no live stream is running, fall back to the most recent recording so the
// rest of the chain can be exercised without a meeting. Off unless asked for,
// because an answer about an old recording presented as the current screen
// would be worse than no answer at all. Every such answer is labelled.
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

// Reading this machine's own display, used when the meeting's media stream is
// unavailable. See screen.js for what it can and cannot see.
const ALLOW_LOCAL_SCREEN = process.env.ZOOM_LENS_LOCAL_SCREEN === "1";

// Produces an image of the screen the request is about, in order of how close
// each source is to the real thing. Returns null when there is nothing to use.
async function currentScreen(meetingUUID) {
  // 1. The meeting's own media stream. What this is supposed to use.
  const live = frameBuffers.get(meetingUUID)?.snapshot();
  if (live) {
    const { jpeg, ms } = await decodeToJpeg(live);
    log(`ANSWER decoded the shared screen in ${ms} ms (${(jpeg.length / 1024).toFixed(0)} KB)`);
    return { jpeg, note: null };
  }

  // 2. This machine's display. Whoever is sharing, Zoom draws their share here,
  //    so this is the current screen even when somebody else is presenting.
  if (ALLOW_LOCAL_SCREEN) {
    try {
      const { jpeg, ms } = await captureLocalScreen();
      log(`ANSWER read this machine's display in ${ms} ms (${(jpeg.length / 1024).toFixed(0)} KB)`);
      return {
        jpeg,
        note: "Read from this machine's display rather than the meeting's media stream.",
      };
    } catch (err) {
      // Usually macOS withholding screen recording permission from whatever
      // started the server. Say so once and carry on to whatever else there is,
      // rather than failing a request that could still be answered.
      log(`ANSWER could not read this machine's display: ${err.message}`);
    }
  }

  // 3. A recording. Current for nothing, but enough to exercise the chain.
  if (!ALLOW_RECORDED) return null;
  const file = newestCapture();
  if (!file) return null;

  // Replay it through a buffer so the clip is assembled the same way a live one
  // would be, rather than handing the decoder a whole file and hoping.
  const replay = createFrameBuffer({ log: () => {} });
  replay.push(fs.readFileSync(file));
  const clip = replay.snapshot();
  if (!clip) return null;

  const { jpeg, ms } = await decodeToJpeg(clip);
  log(`ANSWER decoded a recording in ${ms} ms (${(jpeg.length / 1024).toFixed(0)} KB)`);
  return {
    jpeg,
    note: `This is from a recording (${path.basename(file)}), not a live screen share.`,
  };
}

async function answerRequest({ meetingUUID, mode, question, previous }) {
  const screen = await currentScreen(meetingUUID);
  if (!screen) {
    throw new Error("There is no screen to look at yet. Ask again once somebody is sharing.");
  }

  const { jpeg } = screen;

  try {
    const { text, ms, usage } = await produceAnswer({ jpeg, mode, question, previous });
    log(
      `ANSWER ${mode} produced in ${(ms / 1000).toFixed(1)}s ` +
      `(${usage.input_tokens} in / ${usage.output_tokens} out)`
    );
    return { text, note: screen.note };
  } catch (err) {
    throw new Error(explainFailure(err));
  }
}

// --- HTTP server: serves the panel and receives Zoom's webhooks ---

// Hosting platforms assign a port through PORT. ZM_RTMS_PORT stays first so
// local setups that already set it are unaffected.
const PORT = Number(process.env.ZM_RTMS_PORT || process.env.PORT) || 8080;
const app = express();

app.use(express.json());

// Zoom refuses a Home URL that does not send these four headers. It checks them
// when the Surface configuration is saved and again when the panel is opened.
app.use((req, res, next) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // The Zoom Apps SDK is loaded from Zoom's own domain
      "script-src 'self' 'unsafe-inline' https://appssdk.zoom.us",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      // wss: is here ready for the panel-to-backend connection
      "connect-src 'self' https: wss:",
      "frame-ancestors 'self' https://*.zoom.us",
    ].join("; ")
  );
  next();
});

// The in-meeting panel. Zoom loads this in a webview when a participant opens
// the app, so it must be served from the same address configured in the
// Marketplace Home URL.
app.use(express.static(path.join(HERE, "public")));

// Before Zoom will deliver any events it checks that whoever owns this address
// also holds the app's secret token. It sends a random string and expects it
// hashed with that token, within a few seconds. Answering anything else, which
// is what this server did until now, leaves the subscription switched off.
//
// This used to be handled inside the SDK's own webhook server. Replacing that
// with Express to serve the panel took this with it, and nothing noticed
// because an already-validated endpoint is not asked again.
const SECRET_TOKEN = process.env.ZM_RTMS_SECRET_TOKEN;

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
  log("VALIDATION passed, Zoom will now deliver events to this address");
}

// Zoom posts RTMS events here. Acknowledge immediately, then do the work, so a
// slow join can never make Zoom think the endpoint is unhealthy.
app.post("/", (req, res) => {
  const body = req.body;

  if (!body || typeof body.event !== "string") {
    log("Rejected a POST with no event field");
    res.status(400).json({ error: "missing event field" });
    return;
  }

  // Answered rather than acknowledged: this one needs a computed reply
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

// The WebSocket relay shares this port with Express, so the panel connects back
// to the same address Zoom already knows about.
const server = http.createServer(app);

relay = createRelay(server, {
  log,
  // With a recording to fall back on, a request can be answered even when
  // nothing is being shared, so the control should not be disabled.
  isStreamActive: (meetingUUID) =>
    activeMeetings.has(meetingUUID) ||
    ALLOW_LOCAL_SCREEN ||
    (ALLOW_RECORDED && Boolean(newestCapture())),
  answerRequest,
});

server.listen(PORT, () => {
  log(`Zoom Lens is up on port ${PORT}`);
  log(`   panel   GET  /`);
  log(`   webhook POST /`);
  log(`   relay   WS   /ws`);
});
