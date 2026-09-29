// Holds the most recent screen share video in memory, ready to be turned into
// an image the moment somebody asks.
//
// Why this exists: until now the shared screen was written to a file and decoded
// by hand afterwards. A participant pressing Describe needs the screen as it is
// at that moment, which means keeping recent video in memory instead.
//
// The catch is that H.264 is not a sequence of pictures. A keyframe is a whole
// image; everything after it describes only what changed. Hand a decoder a
// handful of those change-frames on their own and it has nothing to build from.
// Two extra pieces, the SPS and PPS, carry the width, height and encoding
// settings, and without them a decoder cannot start at all.
//
// So this keeps three things:
//
//   the most recent SPS and PPS, which rarely change
//   everything from the most recent keyframe onward
//
// Concatenated, that is always a decodable clip, however long the meeting runs.

// H.264 Annex B: NAL units are separated by 00 00 01 (sometimes 00 00 00 01),
// and the low five bits of the next byte say what kind of unit it is.
const NAL_IDR = 5; // keyframe, a complete picture
const NAL_SPS = 7; // sequence parameters: dimensions, profile
const NAL_PPS = 8; // picture parameters

// Walks a chunk and reports the NAL units in it as { type, start, end }.
function scanNalUnits(buf) {
  const units = [];
  let i = 0;
  let current = null;

  while (i + 3 < buf.length) {
    const isStart =
      buf[i] === 0 && buf[i + 1] === 0 &&
      (buf[i + 2] === 1 || (buf[i + 2] === 0 && buf[i + 3] === 1));

    if (!isStart) {
      i++;
      continue;
    }

    const headerLength = buf[i + 2] === 1 ? 3 : 4;
    const typeIndex = i + headerLength;
    if (typeIndex >= buf.length) break;

    if (current) {
      current.end = i;
      units.push(current);
    }
    current = { type: buf[typeIndex] & 0x1f, start: i, end: buf.length };
    i += headerLength;
  }

  if (current) units.push(current);
  return units;
}

export function createFrameBuffer({ maxBytes = 12 * 1024 * 1024, log = () => {} } = {}) {
  let sps = null;
  let pps = null;
  let sinceKeyframe = [];
  let bytes = 0;
  let haveKeyframe = false;

  let framesSeen = 0;
  let keyframesSeen = 0;
  let lastFrameAt = null;

  // A single picture can be split across several NAL units, all marked as
  // keyframe. Resetting on each one would keep only the last slice and throw
  // away the rest of the same picture, which decodes as a fraction of an image.
  // So reset only when a keyframe run begins.
  let previousWasKeyframe = false;

  function reset() {
    sinceKeyframe = [];
    bytes = 0;
    haveKeyframe = false;
  }

  // Video arrives in pieces whose boundaries mean nothing to the format. A unit
  // separator can be split across two of them, so anything not yet provably
  // complete is carried forward rather than guessed at.
  let pending = Buffer.alloc(0);

  // Called for every chunk of screen share video Zoom sends.
  function push(chunk) {
    if (!chunk?.length) return;

    framesSeen++;
    lastFrameAt = Date.now();

    const buf = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    const units = scanNalUnits(buf);

    // The last unit runs to the end of what has arrived, so it may be only
    // half of one. Hold it back until more arrives to prove otherwise.
    const complete = units.length > 1 ? units.slice(0, -1) : [];
    pending = units.length
      ? Buffer.from(buf.subarray(units[units.length - 1].start))
      : Buffer.from(buf);

    for (const unit of complete) {
      const slice = buf.subarray(unit.start, unit.end);

      // Keep the parameter sets aside. They are small, they rarely change, and
      // every decode needs them in front.
      if (unit.type === NAL_SPS) { sps = Buffer.from(slice); continue; }
      if (unit.type === NAL_PPS) { pps = Buffer.from(slice); continue; }

      // A keyframe makes everything before it unnecessary, which is what stops
      // this growing without limit during a long meeting. Only the first slice
      // of a keyframe resets; the slices that follow belong to the same picture
      // and must be kept.
      const isKeyframe = unit.type === NAL_IDR;
      if (isKeyframe && !previousWasKeyframe) {
        reset();
        haveKeyframe = true;
        keyframesSeen++;
      }
      previousWasKeyframe = isKeyframe;

      if (!haveKeyframe) continue; // nothing to build on yet

      sinceKeyframe.push(Buffer.from(slice));
      bytes += slice.length;
    }

    // A static screen produces small frames and a busy one produces large ones,
    // so cap by size rather than count. Dropping back to the keyframe alone
    // keeps the clip decodable rather than truncating it into something that
    // is not.
    if (bytes > maxBytes && sinceKeyframe.length > 1) {
      const keyframe = sinceKeyframe[0];
      sinceKeyframe = [keyframe];
      bytes = keyframe.length;
      log(`BUFFER exceeded ${(maxBytes / 1048576).toFixed(0)} MB, trimmed back to the keyframe`);
    }
  }

  // Returns a decodable clip of the current screen, or null if nothing usable
  // has arrived yet.
  function snapshot() {
    if (!haveKeyframe || !sps || !pps) return null;
    return Buffer.concat([sps, pps, ...sinceKeyframe]);
  }

  function stats() {
    return {
      ready: Boolean(haveKeyframe && sps && pps),
      bytes,
      framesSeen,
      keyframesSeen,
      secondsSinceLastFrame: lastFrameAt ? (Date.now() - lastFrameAt) / 1000 : null,
    };
  }

  return { push, snapshot, stats, reset };
}
