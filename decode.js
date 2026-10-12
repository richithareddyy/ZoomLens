// Decodes a clip from framebuffer.js to a JPEG of its last frame, i.e. the
// screen as it is now rather than at the keyframe.

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import ffmpegPath from "ffmpeg-static";

// Decoding normally takes well under a second; past this something is wrong.
const TIMEOUT_MS = 10000;

export async function decodeToJpeg(clip) {
  if (!clip?.length) throw new Error("No video to decode yet.");

  const started = Date.now();

  // With -update, ffmpeg overwrites one file per decoded frame, leaving the last
  // frame when it finishes. A pipe would give several JPEGs concatenated.
  const out = path.join(os.tmpdir(), `zoomlens-${process.pid}-${Date.now()}.jpg`);

  try {
    await new Promise((resolve, reject) => {
      const ff = spawn(ffmpegPath, [
        "-hide_banner", "-loglevel", "error",
        "-f", "h264",
        "-i", "pipe:0",
        "-update", "1",
        "-q:v", "3",
        "-y", out,
      ]);

      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        ff.kill("SIGKILL");
        reject(new Error("Decoding took too long and was stopped."));
      }, TIMEOUT_MS);

      ff.stderr.on("data", (d) => { stderr += d.toString(); });

      // EPIPE just means ffmpeg stopped reading early.
      ff.stdin.on("error", () => {});

      ff.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Could not run the decoder: ${err.message}`));
      });

      ff.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) return resolve();
        const detail = stderr.trim().split("\n").pop() || `exit code ${code}`;
        reject(new Error(`Could not decode the screen: ${detail}`));
      });

      ff.stdin.end(clip);
    });

    const jpeg = await fs.readFile(out);
    if (!jpeg.length) throw new Error("Decoder produced an empty image.");

    return { jpeg, ms: Date.now() - started };
  } finally {
    await fs.unlink(out).catch(() => {});
  }
}
