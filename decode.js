// Turns a clip of screen share video into a single still image.
//
// The clip comes from framebuffer.js and is always self-contained: parameter
// sets, a keyframe, then the changes since. ffmpeg decodes it and we keep the
// last frame, which is the screen as it is now rather than as it was when the
// keyframe was sent.

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import ffmpegPath from "ffmpeg-static";

// Decoding a few seconds of video should take well under a second. If it takes
// longer than this something is wrong and the participant should be told rather
// than left waiting.
const TIMEOUT_MS = 10000;

/**
 * @param {Buffer} clip  H.264 from framebuffer.snapshot()
 * @returns {Promise<{ jpeg: Buffer, ms: number }>}
 */
export async function decodeToJpeg(clip) {
  if (!clip?.length) throw new Error("No video to decode yet.");

  const started = Date.now();

  // ffmpeg writes to a file rather than a pipe. With -update it overwrites the
  // same file for every frame it decodes, so when it finishes the file holds the
  // last one. Getting that through a pipe means dealing with several JPEGs stuck
  // together, which is not worth the saved write.
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

      // A broken pipe here just means ffmpeg had what it needed and stopped
      // reading, which is not a failure.
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
