// Deletes meeting content left on disk once it is old enough to have served
// its purpose. Nothing here is needed to answer a question: answers come from
// memory. What can end up on disk is screen-share video saved for testing
// (captures/), images written by the development scripts (snapshots/), and a
// decoded still left in the temp folder if the process died mid-decode.

import fs from "fs";
import os from "os";
import path from "path";

const HOUR = 60 * 60 * 1000;

// Removes files in `dir` matching `match` that were last written more than
// `maxAgeMs` ago. A missing folder, or a file that vanishes or can't be
// removed, is skipped rather than stopping the sweep.
export function sweep(dir, { maxAgeMs, match = () => true, now = Date.now() }) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }

  const removed = [];
  for (const name of names) {
    if (!match(name)) continue;
    const file = path.join(dir, name);
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || now - stat.mtimeMs <= maxAgeMs) continue;
      fs.unlinkSync(file);
      removed.push(name);
    } catch {}
  }
  return removed;
}

// Hours from the environment, falling back when unset or not a number. Zero
// is allowed and means "as soon as the next sweep runs".
export function hoursFrom(value, fallback) {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
}

// The sweep the server runs at startup and then every `everyMs`.
export function startRetention({ captureDir, snapshotDir, captureHours, snapshotHours, log, everyMs = HOUR }) {
  const run = () => {
    const gone = [
      ...sweep(captureDir, { maxAgeMs: captureHours * HOUR, match: (n) => n.endsWith(".h264") }),
      ...sweep(snapshotDir, { maxAgeMs: snapshotHours * HOUR, match: (n) => /\.(jpe?g|png)$/i.test(n) }),
      // A decode takes well under a second, so ten minutes is never one in progress.
      ...sweep(os.tmpdir(), { maxAgeMs: 10 * 60 * 1000, match: (n) => /^zoomlens-.*\.(jpe?g|png)$/.test(n) }),
    ];
    if (gone.length) log(`RETENTION deleted ${gone.length} old file(s) of screen content`);
  };
  run();
  const timer = setInterval(run, everyMs);
  timer.unref();
  return { run, stop: () => clearInterval(timer) };
}
