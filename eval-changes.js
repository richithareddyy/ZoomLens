// Replays a recorded screen share through the change detector, as the watcher
// would see it live, and reports when it would have described the screen.
//
//   node eval-changes.js captures/<file>.h264
//   node eval-changes.js captures/<file>.h264 --labels labels.json
//
// Samples are saved to a temporary folder (printed at the end) so they can be
// looked through and labelled. Not next to the project: a synced Desktop would
// upload them. A labels file is a JSON array of the sample numbers where
// something a viewer would care about changed; with one, precision and recall
// are printed.
//
// Every change is also run through the color analysis, to show how many of
// them Color Assist would pass on to the model.

import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { fingerprint, difference, createDetector } from "./change.js";
import { analyzeColors } from "./colors.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

if (!file) {
  console.error("usage: node eval-changes.js <capture.h264> [--every 2] [--fps 5] [--gap 10] [--labels file.json]");
  process.exit(1);
}

// Raw H.264 carries no timestamps. Zoom sent these recordings at about 5 frames a
// second (frame count over the time between file name and last write).
const fps = Number(opt("fps", 5));
const every = Number(opt("every", 2));
const gap = Number(opt("gap", 10));
const step = Math.max(1, Math.round(fps * every));

const outDir = path.join(os.tmpdir(), `zoomlens-eval-${path.basename(file, ".h264")}`);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await new Promise((resolve, reject) => {
  const ff = spawn(ffmpegPath, [
    "-hide_banner", "-loglevel", "error",
    "-f", "h264", "-i", file,
    "-vf", `select=not(mod(n\\,${step}))`, "-fps_mode", "passthrough",
    "-q:v", "3", path.join(outDir, "%04d.jpg"),
  ]);
  let stderr = "";
  ff.stderr.on("data", (d) => { stderr += d; });
  ff.on("error", reject);
  ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim()))));
});

const samples = fs.readdirSync(outDir).filter((f) => /^\d{4}\.jpg$/.test(f)).sort();
const detector = createDetector();
const fired = [];
const colorRisk = [];
const diffs = [];
let prev = null;
let lastFired = -Infinity;

for (let i = 0; i < samples.length; i++) {
  const print = await fingerprint(fs.readFileSync(path.join(outDir, samples[i])));
  if (prev) diffs.push(difference(prev, print));
  prev = print;

  // Same order as watch.js: a settled change waits out the gap, then is accepted.
  if (detector.check(print) && (i - lastFired) * every >= gap) {
    fired.push(i + 1);
    lastFired = i;
    detector.accept(print);
    const jpeg = fs.readFileSync(path.join(outDir, samples[i]));
    if ((await analyzeColors(jpeg)).risky) colorRisk.push(i + 1);
  }
}

const pct = (x) => `${(x * 100).toFixed(2)}%`;
const sorted = [...diffs].sort((a, b) => a - b);
const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

console.log(`\n  ${path.basename(file)}: ${samples.length} looks, one every ${every}s (every ${step} frames)`);
console.log(`  difference between consecutive looks: median ${pct(at(0.5))}, 90th ${pct(at(0.9))}, max ${pct(sorted.at(-1))}`);
console.log(`  would describe ${fired.length} times instead of ${samples.length}: samples ${fired.join(", ")}`);
console.log(`  Color Assist would ask the model about ${colorRisk.length} of them: ${colorRisk.join(", ") || "none"}`);
console.log(`  samples saved to ${outDir}/`);

const labelsFile = opt("labels", null);
if (labelsFile) {
  const labels = JSON.parse(fs.readFileSync(labelsFile, "utf8"));
  // A firing counts for a label if it comes within the settle look plus the gap.
  const window = 1 + Math.ceil(gap / every);
  const hit = (f, l) => f >= l && f <= l + window;
  const tp = fired.filter((f) => labels.some((l) => hit(f, l))).length;
  const found = labels.filter((l) => fired.some((f) => hit(f, l))).length;
  console.log(`  precision ${tp}/${fired.length}, recall ${found}/${labels.length} (window ${window} looks)`);
  const missed = labels.filter((l) => !fired.some((f) => hit(f, l)));
  if (missed.length) console.log(`  missed: ${missed.join(", ")}`);
}
console.log();
