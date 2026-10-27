// Checks that old screen content is deleted from disk and nothing else is.
//
//   node test-retention.js

import fs from "fs";
import os from "os";
import path from "path";
import { sweep, hoursFrom, startRetention } from "./retention.js";

const results = [];
const check = (name, passed, detail) => {
  results.push(passed);
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}`);
  if (detail) console.log(`        ${detail}`);
};

const HOUR = 60 * 60 * 1000;
const root = fs.mkdtempSync(path.join(os.tmpdir(), "zoomlens-retention-test-"));
const write = (dir, name, ageHours) => {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, "x");
  const at = new Date(Date.now() - ageHours * HOUR);
  fs.utimesSync(file, at, at);
  return file;
};

console.log("\n" + "-".repeat(70));
console.log("  Zoom Lens, retention of screen content on disk");
console.log("-".repeat(70) + "\n");

// 1. Old recordings go, recent ones and other files stay.
{
  const dir = path.join(root, "captures");
  const old = write(dir, "deskshare-old.h264", 30);
  const fresh = write(dir, "deskshare-new.h264", 1);
  const other = write(dir, "notes.txt", 30);
  const gone = sweep(dir, { maxAgeMs: 24 * HOUR, match: (n) => n.endsWith(".h264") });
  check("A recording older than the limit is deleted", !fs.existsSync(old), gone.join(", "));
  check("A recent recording is kept", fs.existsSync(fresh));
  check("Files that aren't recordings are left alone", fs.existsSync(other));
}

// 2. A limit of zero clears everything matching at once.
{
  const dir = path.join(root, "zero");
  write(dir, "a.h264", 0.01);
  sweep(dir, { maxAgeMs: 0, match: (n) => n.endsWith(".h264"), now: Date.now() + 1000 });
  check("A limit of zero deletes recordings at the next sweep", fs.readdirSync(dir).length === 0);
}

// 3. A missing folder is not an error.
check("A folder that doesn't exist is skipped", sweep(path.join(root, "nope"), { maxAgeMs: 0 }).length === 0);

// 4. Settings from the environment.
check("Hours are read from the environment",
      hoursFrom("6", 24) === 6 && hoursFrom("0", 24) === 0 && hoursFrom(undefined, 24) === 24 &&
      hoursFrom("", 24) === 24 && hoursFrom("soon", 24) === 24 && hoursFrom("-1", 24) === 24);

// 5. The sweep the server runs covers recordings, snapshots and stray temp images.
{
  const captures = path.join(root, "server-captures");
  const snapshots = path.join(root, "server-snapshots");
  write(captures, "deskshare-1.h264", 48);
  write(snapshots, "latest.jpg", 48);
  const stray = write(os.tmpdir(), `zoomlens-${process.pid}-test.jpg`, 1);
  const lines = [];
  const r = startRetention({
    captureDir: captures, snapshotDir: snapshots, captureHours: 24, snapshotHours: 24,
    log: (l) => lines.push(l),
  });
  r.stop();
  check("At startup, old recordings, snapshots and stray decode images are deleted",
        !fs.readdirSync(captures).length && !fs.readdirSync(snapshots).length && !fs.existsSync(stray),
        lines.join(" | "));
}

fs.rmSync(root, { recursive: true, force: true });

const failed = results.filter((r) => !r).length;
console.log("\n" + "-".repeat(70));
console.log(`  ${results.length - failed} of ${results.length} cases passed.`);
console.log("-".repeat(70) + "\n");
process.exit(failed ? 1 : 0);
