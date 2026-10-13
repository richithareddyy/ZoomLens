// Checks the change detector on synthetic 1280x720 screens: what it should
// ignore (recompression, a moving pointer) and what it should catch (an added
// bullet, a scroll, a new slide). No network, no recordings.
//
//   node test-change.js

import { spawnSync } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { fingerprint, difference, createDetector } from "./change.js";

const CHANGED = 0.01;

const results = [];
const check = (name, passed, detail) => {
  results.push(passed);
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}`);
  if (detail) console.log(`        ${detail}`);
};

// A white screen with filled boxes drawn on it, encoded as a JPEG.
function still(boxes, quality = 3) {
  const vf = boxes
    .map(([x, y, w, h, c = "0x303030"]) => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${c}:t=fill`)
    .join(",");
  const ff = spawnSync(ffmpegPath, [
    "-loglevel", "error", "-f", "lavfi", "-i", "color=c=white:s=1280x720",
    "-vf", vf || "null", "-frames:v", "1", "-q:v", String(quality),
    "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1",
  ]);
  if (ff.status !== 0) throw new Error(ff.stderr.toString());
  return ff.stdout;
}

// A line of text is a row of word-sized strokes; a slide is a title and lines.
const line = (y) => Array.from({ length: 9 }, (_, i) => [100 + i * 95, y, 70 + (i % 3) * 8, 14]);
const slide = (lines, top = 200) =>
  [[100, 80, 700, 40], ...Array.from({ length: lines }, (_, i) => line(top + i * 60)).flat()];
const chart = [[100, 80, 500, 40], [100, 180, 520, 360, "0x4a7bd0"], ...line(600)];
const cursor = (x, y) => [x, y, 12, 19, "black"];

const print = async (boxes, quality) => fingerprint(still(boxes, quality));
const pct = (x) => `${(x * 100).toFixed(2)}% of cells`;

console.log("\n" + "-".repeat(70));
console.log("  Zoom Lens, change detection");
console.log("-".repeat(70) + "\n");

const A = slide(4);
const a = await print(A);

// 1. What should not count as a change.
{
  const d = difference(a, await print(A, 20));
  check("Recompressing the same screen is not a change", d < CHANGED / 3, pct(d));
}
{
  const d = difference(await print([...A, cursor(300, 300)]), await print([...A, cursor(900, 500)]));
  check("Moving the pointer across the screen is not a change", d < CHANGED / 3, pct(d));
}

// 2. What should.
{
  const d = difference(a, await print(slide(5)));
  check("Adding one bullet is a change", d > CHANGED, pct(d));
}
{
  const d = difference(await print(slide(6)), await print(slide(6, 140)));
  check("Scrolling by one line is a change", d > CHANGED, pct(d));
}
{
  const d = difference(a, await print(chart));
  check("Moving to a new slide is a change", d > CHANGED, pct(d));
}

// 3. The detector only reports a change once the screen holds still.
{
  const detector = createDetector();
  const b = await print(chart);
  const half = await print([...A.slice(0, 3), ...chart.slice(1)]);

  const looks = [];
  looks.push(detector.check(a));          // nothing described yet
  detector.accept(a);
  looks.push(detector.check(a));          // unchanged
  looks.push(detector.check(half));       // mid transition
  looks.push(detector.check(b));          // new slide, first look
  looks.push(detector.check(b));          // new slide, held
  detector.accept(b);
  looks.push(detector.check(b));          // described, unchanged

  const expected = [true, false, false, false, true, false];
  check(
    "Fires on the first look, then only once a change has held for a look",
    looks.every((v, i) => v === expected[i]),
    `got ${looks.join(", ")}`,
  );
}
{
  const detector = createDetector();
  detector.accept(a);
  detector.check(await print([...chart, cursor(300, 300)]));
  const fired = detector.check(await print([...chart, cursor(700, 420)]));
  check("A pointer moving over the new slide does not hold the change back", fired);
}

{
  const detector = createDetector();
  detector.accept(a);
  const frames = await Promise.all(
    [0, 1, 2, 3, 4].map((i) => print([...chart, [700, 200 + i * 60, 300, 50, "0x20a020"]]))
  );
  const looks = [];
  for (const f of frames) looks.push(detector.check(f));
  check(
    "A screen that never holds still is still described after five looks",
    looks.join() === "false,false,false,false,true",
    `got ${looks.join(", ")}`,
  );
}

const failed = results.filter((r) => !r).length;
console.log("\n" + "-".repeat(70));
console.log(`  ${results.length - failed} of ${results.length} cases passed.`);
console.log("-".repeat(70) + "\n");
process.exit(failed ? 1 : 0);
