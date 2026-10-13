// Decides whether the shared screen changed enough to describe again.
//
// Each still is shrunk to 64x36 greyscale (2304 cells) and compared cell by
// cell. On a 1280x720 share a moving pointer touches about 2 cells and
// recompression none, while one added bullet touches about 40 (test-change.js).

import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

const W = 64;
const H = 36;

// Resizes a still with ffmpeg and returns its raw pixels.
export function shrink(jpeg, width, height, format) {
  const bytes = width * height * (format === "rgb24" ? 3 : 1);
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, [
      "-hide_banner", "-loglevel", "error",
      "-f", "image2pipe", "-i", "pipe:0",
      "-vf", `scale=${width}:${height}:flags=area,format=${format}`,
      "-f", "rawvideo", "pipe:1",
    ]);
    const chunks = [];
    let stderr = "";
    ff.stdout.on("data", (c) => chunks.push(c));
    ff.stderr.on("data", (d) => { stderr += d; });
    ff.stdin.on("error", () => {});
    ff.on("error", reject);
    ff.on("close", (code) => {
      const pixels = Buffer.concat(chunks);
      if (code === 0 && pixels.length === bytes) return resolve(pixels);
      reject(new Error(`Could not read the screen: ${stderr.trim() || `exit code ${code}`}`));
    });
    ff.stdin.end(jpeg);
  });
}

export const fingerprint = (jpeg) => shrink(jpeg, W, H, "gray");

// Share of cells (0 to 1) whose brightness moved by more than `step`.
export function difference(a, b, step = 24) {
  let moved = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > step) moved++;
  }
  return moved / a.length;
}

// A change only counts once it holds still for one more look, so a slide
// transition or a page mid-scroll isn't described half drawn. A screen that
// never holds still (a playing video, a webcam inside the share) counts after
// `patience` looks anyway, or nothing else on it would ever be described.
export function createDetector({ changed = 0.01, settled = 0.005, patience = 5 } = {}) {
  let base = null;
  let candidate = null;
  let restless = 0;

  return {
    check(print) {
      if (!base) return true;
      if (difference(base, print) < changed) {
        candidate = null;
        restless = 0;
        return false;
      }
      if (!candidate || difference(candidate, print) > settled) {
        candidate = print;
        return ++restless >= patience;
      }
      return true;
    },

    // Call once the screen has been described (or judged not worth it).
    accept(print) {
      base = print;
      candidate = null;
      restless = 0;
    },
  };
}
