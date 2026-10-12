// Keeps recent screen-share video in memory so a still can be decoded on demand.
//
// H.264 isn't a sequence of pictures: a keyframe (IDR) is a whole image and the
// units after it are only changes, and nothing decodes without the SPS/PPS
// parameter sets. So this keeps the latest SPS and PPS plus everything since the
// latest keyframe, which concatenated is always a decodable clip.

// Annex B: units are separated by 00 00 01 (or 00 00 00 01), and the low five
// bits of the next byte give the unit type.
const NAL_IDR = 5; // keyframe, a complete picture
const NAL_SPS = 7; // sequence parameters: dimensions, profile
const NAL_PPS = 8; // picture parameters

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

  // A keyframe can span several IDR units (slices). Resetting on each one kept
  // only the last slice, so reset only when a run of them begins.
  let previousWasKeyframe = false;

  function reset() {
    sinceKeyframe = [];
    bytes = 0;
    haveKeyframe = false;
  }

  // Chunk boundaries don't line up with units, and a start code can be split
  // across two chunks, so the last (possibly partial) unit is carried over.
  let pending = Buffer.alloc(0);

  function push(chunk) {
    if (!chunk?.length) return;

    framesSeen++;
    lastFrameAt = Date.now();

    const buf = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    const units = scanNalUnits(buf);

    const complete = units.length > 1 ? units.slice(0, -1) : [];
    pending = units.length
      ? Buffer.from(buf.subarray(units[units.length - 1].start))
      : Buffer.from(buf);

    for (const unit of complete) {
      const slice = buf.subarray(unit.start, unit.end);

      if (unit.type === NAL_SPS) { sps = Buffer.from(slice); continue; }
      if (unit.type === NAL_PPS) { pps = Buffer.from(slice); continue; }

      // A new keyframe makes everything before it unnecessary, which keeps the
      // buffer bounded over a long meeting.
      const isKeyframe = unit.type === NAL_IDR;
      if (isKeyframe && !previousWasKeyframe) {
        reset();
        haveKeyframe = true;
        keyframesSeen++;
      }
      previousWasKeyframe = isKeyframe;

      if (!haveKeyframe) continue;

      sinceKeyframe.push(Buffer.from(slice));
      bytes += slice.length;
    }

    // Capped by size, since a busy screen produces much larger frames. Falling
    // back to the keyframe alone keeps the clip decodable.
    if (bytes > maxBytes && sinceKeyframe.length > 1) {
      const keyframe = sinceKeyframe[0];
      sinceKeyframe = [keyframe];
      bytes = keyframe.length;
      log(`BUFFER exceeded ${(maxBytes / 1048576).toFixed(0)} MB, trimmed back to the keyframe`);
    }
  }

  // A decodable clip of the current screen, or null if nothing usable yet.
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
