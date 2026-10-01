// Reads the shared screen from this machine's own display.
//
// This is not how Zoom Lens is meant to work. The real path is the meeting's
// media stream, which gives the backend the shared content directly and works
// no matter whose machine the backend runs on. This exists because that stream
// needs a capability enabled on the Zoom account, and until it is there would
// otherwise be nothing current to look at.
//
// It works for the case the product is actually for. When somebody else shares
// their screen, Zoom draws that share on this display, so a picture of this
// display is a picture of what they are sharing.
//
// The limits are worth being clear about:
//
//   it only sees what this machine can see, so the backend has to run on the
//   machine of the person asking
//   it captures the whole display, including the Zoom window and this panel
//   macOS requires screen recording permission, granted once, by hand
//
// Every answer produced from it says where the image came from.

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import ffmpegPath from "ffmpeg-static";

const TIMEOUT_MS = 8000;

// A retina display is far larger than the model needs, and a smaller image is
// quicker to send and cheaper to read. Wide enough that small text survives.
const MAX_WIDTH = 1600;

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${path.basename(command)} took too long and was stopped.`));
    }, timeoutMs);

    child.stderr?.on("data", (d) => { stderr += d.toString(); });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Could not run ${path.basename(command)}: ${err.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) return resolve();
      const detail = stderr.trim().split("\n").pop() || `exit code ${code}`;
      reject(new Error(detail));
    });
  });
}

/**
 * Captures this machine's display as a JPEG.
 * @returns {Promise<{ jpeg: Buffer, ms: number }>}
 */
export async function captureLocalScreen() {
  if (process.platform !== "darwin") {
    throw new Error("Reading this machine's display is only implemented for macOS.");
  }

  const started = Date.now();
  const stamp = `${process.pid}-${Date.now()}`;
  const raw = path.join(os.tmpdir(), `zoomlens-screen-${stamp}.png`);
  const out = path.join(os.tmpdir(), `zoomlens-screen-${stamp}.jpg`);

  try {
    // -x stays silent, so a demo is not punctuated by the camera shutter sound
    await run("/usr/sbin/screencapture", ["-x", raw], TIMEOUT_MS);

    const { size } = await fs.stat(raw);
    if (!size) {
      throw new Error(
        "The screen capture was empty. macOS may be withholding screen recording " +
        "permission from the terminal."
      );
    }

    await run(ffmpegPath, [
      "-hide_banner", "-loglevel", "error",
      "-i", raw,
      "-vf", `scale='min(${MAX_WIDTH},iw)':-2`,
      "-q:v", "3",
      "-y", out,
    ], TIMEOUT_MS);

    const jpeg = await fs.readFile(out);
    if (!jpeg.length) throw new Error("The screen capture produced an empty image.");

    return { jpeg, ms: Date.now() - started };
  } finally {
    await fs.unlink(raw).catch(() => {});
    await fs.unlink(out).catch(() => {});
  }
}
