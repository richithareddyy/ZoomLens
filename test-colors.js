// Checks the color analysis behind Color Assist: the color difference formula
// against published values, the deficiency simulation on pairs whose outcome is
// well known, and the warning gate on synthetic 1280x720 screens.
//
//   node test-colors.js

import { spawnSync } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { analyzeColors, deltaE, lab, simulate, linearFromHex, DEFICIENCIES } from "./colors.js";

const results = [];
const check = (name, passed, detail) => {
  results.push(passed);
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}`);
  if (detail) console.log(`        ${detail}`);
};

function still(boxes) {
  const vf = boxes.map(([x, y, w, h, c]) => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${c}:t=fill`).join(",");
  const ff = spawnSync(ffmpegPath, [
    "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0xf6f7f9:s=1280x720",
    "-vf", vf || "null", "-frames:v", "1", "-q:v", "3",
    "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1",
  ]);
  if (ff.status !== 0) throw new Error(ff.stderr.toString());
  return ff.stdout;
}

const RED = "0xd64545";
const AMBER = "0xe6a23c";
const GREEN = "0x3a9d5d";
const BLUE = "0x1f77b4";
const ORANGE = "0xff7f0e";

const text = Array.from({ length: 6 }, (_, i) => [100, 150 + i * 50, 600, 12, "0x1d2433"]);
const dots = (color, ys, x = 1000) => ys.map((y) => [x, y, 14, 14, color]);

const seenAs = (a, b, type) =>
  deltaE(lab(simulate(linearFromHex(a), type)), lab(simulate(linearFromHex(b), type)));

console.log("\n" + "-".repeat(70));
console.log("  Zoom Lens, Color Assist analysis");
console.log("-".repeat(70) + "\n");

// 1. CIEDE2000 against Sharma, Wu and Dalal's test data (pairs 1, 17 and 25).
{
  const got = [
    deltaE([50, 2.6772, -79.7751], [50, 0, -82.7485]),
    deltaE([50, 2.5, 0], [73, 25, -18]),
    deltaE([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387]),
  ];
  const want = [2.0425, 27.1492, 1.2644];
  check("Color difference matches the published CIEDE2000 values",
        got.every((v, i) => Math.abs(v - want[i]) < 1e-4), got.map((v) => v.toFixed(4)).join(", "));
}

// 2. The simulation agrees with what is known about each deficiency.
{
  const d = seenAs("#d64545", "#3a9d5d", "deuteranopia");
  check("Red and green run together for deuteranopia", d < 10, `difference ${d.toFixed(1)}`);
}
{
  const worst = Math.min(...Object.keys(DEFICIENCIES).map((t) => seenAs("#1f77b4", "#ff7f0e", t)));
  check("Blue and orange stay apart for all three", worst > 30, `closest ${worst.toFixed(1)}`);
}
{
  const d = seenAs("#1f77b4", "#9467bd", "protanopia");
  check("Blue and purple run together for protanopia", d < 10, `difference ${d.toFixed(1)}`);
}

// 3. Finding colors on a screen.
{
  const found = await analyzeColors(still([
    ...text,
    ...dots(AMBER, [260, 380]), ...dots(GREEN, [300, 420]), ...dots(RED, [340, 450]),
  ]));
  const names = found.colors.map((c) => c.name).sort().join(", ");
  check("A status column's three colors are found", names === "green, orange, red", names);
  check("They are placed in the right part of the screen",
        found.colors.every((c) => c.where.join() === "middle right"),
        found.colors.map((c) => `${c.name}: ${c.where.join(" and ")}`).join("; "));
  check("And flagged as hard to tell apart", found.risky,
        found.confusions.map((c) => `${c.a}/${c.b} ${c.type} ${c.seen.toFixed(1)}`).join("; "));
}

// 4. When not to warn.
{
  const found = await analyzeColors(still(text));
  check("A black and white slide has no colors", found.colors.length === 0 && !found.risky);
}
{
  const found = await analyzeColors(still([[100, 100, 500, 200, BLUE], [100, 400, 500, 200, ORANGE]]));
  check("A blue and orange chart is not flagged", found.colors.length === 2 && !found.risky,
        found.colors.map((c) => c.name).join(", "));
}
{
  // Window buttons on a share that is otherwise grey.
  const chrome = [[12, 10, 8, 8, "0xff5f57"], [26, 10, 8, 8, "0xfebc2e"], [40, 10, 8, 8, "0x28c840"]];
  const found = await analyzeColors(still([...chrome, ...text]));
  check("Window buttons alone don't raise a warning", !found.risky,
        `${found.colors.length} colors found, ${found.confusions.length} confusable pairs`);
}
{
  const found = await analyzeColors(still([...text, ...dots(GREEN, [200]), ...dots(RED, [250])]));
  check("Neither do a single red and a single green dot", !found.risky);
}

const failed = results.filter((r) => !r).length;
console.log("\n" + "-".repeat(70));
console.log(`  ${results.length - failed} of ${results.length} cases passed.`);
console.log("-".repeat(70) + "\n");
process.exit(failed ? 1 : 0);
