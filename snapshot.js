// Decodes a captured screen-share H.264 file into a still image.
//
// Usage:
//   node snapshot.js                  # newest capture -> latest frame as JPEG
//   node snapshot.js <file.h264>      # a specific capture
//   node snapshot.js <file.h264> all  # every keyframe, as a numbered series
//
// The output JPEG is what you feed to a vision model.

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import ffmpegPath from "ffmpeg-static";

const CAPTURE_DIR = "captures";
const OUT_DIR = "snapshots";

// Pick the file: either the one given, or the most recent capture
let input = process.argv[2];
const mode = process.argv[3] === "all" ? "all" : "latest";

if (!input) {
  if (!fs.existsSync(CAPTURE_DIR)) {
    console.error(`ERROR: no ${CAPTURE_DIR}/ directory yet. Capture a screen share first.`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(CAPTURE_DIR)
    .filter((f) => f.endsWith(".h264"))
    .map((f) => ({ f, t: fs.statSync(path.join(CAPTURE_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  if (!files.length) {
    console.error(`ERROR: no .h264 files in ${CAPTURE_DIR}/`);
    process.exit(1);
  }
  input = path.join(CAPTURE_DIR, files[0].f);
}

if (!fs.existsSync(input)) {
  console.error(`ERROR: file not found: ${input}`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const sizeKB = (fs.statSync(input).size / 1024).toFixed(0);
console.log(`Input:  ${input} (${sizeKB} KB)`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");

// -update 1 makes each decoded frame overwrite the same output file, so when
// ffmpeg finishes the file holds the LAST frame, i.e. the most recent state
// of the shared screen.
const args =
  mode === "all"
    ? ["-y", "-f", "h264", "-i", input,
       "-vf", "select=eq(pict_type\\,I)", "-vsync", "vfr", "-q:v", "2",
       path.join(OUT_DIR, `keyframe-${stamp}-%03d.jpg`)]
    : ["-y", "-f", "h264", "-i", input,
       "-update", "1", "-q:v", "2",
       path.join(OUT_DIR, `latest-${stamp}.jpg`)];

console.log(`Mode:   ${mode === "all" ? "every keyframe" : "latest frame"}\n`);

try {
  execFileSync(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
} catch (err) {
  console.error("ffmpeg failed:");
  console.error(err.stderr?.toString().split("\n").slice(-15).join("\n") || err.message);
  process.exit(1);
}

const produced = fs
  .readdirSync(OUT_DIR)
  .filter((f) => f.includes(stamp))
  .sort();

if (!produced.length) {
  console.error("ffmpeg ran but produced no images. The capture may hold no complete keyframe yet.");
  process.exit(1);
}

console.log(`Wrote ${produced.length} image(s):`);
for (const f of produced) {
  const kb = (fs.statSync(path.join(OUT_DIR, f)).size / 1024).toFixed(0);
  console.log(`   ${path.join(OUT_DIR, f)}  (${kb} KB)`);
}
