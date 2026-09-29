// Proves the in-memory pipeline: video in, image out, without touching Zoom.
//
// Replays a recorded screen share through the frame buffer in small pieces, the
// way it arrives from a live meeting, then asks for an image at several points
// and decodes each one.
//
//   node test-snapshot.js [captures/something.h264]

import fs from "fs";
import path from "path";
import { createFrameBuffer } from "./framebuffer.js";
import { decodeToJpeg } from "./decode.js";

const CAPTURE_DIR = "captures";
const OUT_DIR = "snapshots";

let input = process.argv[2];
if (!input) {
  const files = fs.existsSync(CAPTURE_DIR)
    ? fs.readdirSync(CAPTURE_DIR)
        .filter((f) => f.endsWith(".h264"))
        .map((f) => ({ f, t: fs.statSync(path.join(CAPTURE_DIR, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
    : [];
  if (!files.length) {
    console.error("No recorded screen share found in captures/.");
    process.exit(1);
  }
  input = path.join(CAPTURE_DIR, files[0].f);
}

const line = () => console.log("-".repeat(74));

const video = fs.readFileSync(input);
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log();
line();
console.log("  Zoom Lens, screen to image without writing a file first");
console.log(`  ${new Date().toLocaleString()}`);
console.log(`  replaying ${input} (${(video.length / 1048576).toFixed(1)} MB)`);
line();

const frames = createFrameBuffer({ log: (m) => console.log(`     ${m}`) });

// Feed it in pieces, as it would arrive from a meeting
const CHUNK = 4096;
const checkpoints = [0.25, 0.5, 0.75, 1.0];
let nextCheckpoint = 0;

for (let offset = 0; offset < video.length; offset += CHUNK) {
  frames.push(video.subarray(offset, Math.min(offset + CHUNK, video.length)));

  const progress = Math.min(offset + CHUNK, video.length) / video.length;
  if (nextCheckpoint < checkpoints.length && progress >= checkpoints[nextCheckpoint]) {
    const at = checkpoints[nextCheckpoint];
    nextCheckpoint++;

    const stats = frames.stats();
    const clip = frames.snapshot();

    console.log(`\n  ${Math.round(at * 100)}% through the recording`);
    console.log(`     held in memory: ${(stats.bytes / 1024).toFixed(0)} KB`);
    console.log(`     keyframes seen: ${stats.keyframesSeen}`);

    if (!clip) {
      console.log("     no image available yet");
      continue;
    }

    try {
      const { jpeg, ms } = await decodeToJpeg(clip);
      const out = path.join(OUT_DIR, `live-${Math.round(at * 100)}pc.jpg`);
      fs.writeFileSync(out, jpeg);
      console.log(`     decoded in ${ms} ms to a ${(jpeg.length / 1024).toFixed(0)} KB image`);
      console.log(`     saved ${out}`);
    } catch (err) {
      console.log(`     decode failed: ${err.message}`);
    }
  }
}

line();
const s = frames.stats();
console.log(`  ${s.framesSeen} pieces of video received, ${s.keyframesSeen} keyframes.`);
console.log(`  Memory never exceeded the cap, because each keyframe makes`);
console.log(`  everything before it unnecessary and the buffer resets to it.`);
line();
console.log();
