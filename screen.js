// Captures this machine's display as a stand-in for the meeting's media stream,
// which needs a capability not yet enabled on the Zoom account. It works because
// Zoom draws whoever is sharing on this display, but it only sees this machine,
// it includes the Zoom window and the panel, and macOS needs screen-recording
// permission granted by hand.

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import ffmpegPath from "ffmpeg-static";

const TIMEOUT_MS = 8000;

// Retina captures are far larger than the model needs; 1600 keeps small text legible.
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

export async function captureLocalScreen() {
  if (process.platform !== "darwin") {
    throw new Error("Reading this machine's display is only implemented for macOS.");
  }

  const started = Date.now();
  const stamp = `${process.pid}-${Date.now()}`;
  const raw = path.join(os.tmpdir(), `zoomlens-screen-${stamp}.png`);
  const out = path.join(os.tmpdir(), `zoomlens-screen-${stamp}.jpg`);

  try {
    // -x: no shutter sound
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
