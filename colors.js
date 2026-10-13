// Finds the colors on a shared screen and which pairs of them people with a
// common color vision deficiency would find hard to tell apart.
//
// Plain image processing: no model is involved, so it can run on every
// screen change and decide whether the model needs to be asked at all.

import { shrink } from "./change.js";

const W = 640;
const H = 360;

const CHROMA = 25;      // CIELAB chroma below which a pixel reads as grey
const BIN = 15;         // degrees of hue per histogram bin
const FLOOR = 4;        // pixels for a bin to count as occupied
const MIN_PIXELS = 20;  // about one 12px status dot on a 1280x720 share

// Window buttons and tab icons are colored too, so a warning needs both colors
// of a pair to cover more than a few such marks. Questions still see them all.
const WARN_PIXELS = 80;

// Two colors are distinct when CIEDE2000 puts them this far apart, and
// confusable when a simulated deficiency brings them within the second figure.
const DISTINCT = 15;
const CONFUSABLE = 10;

// Machado, Oliveira and Fernandes (2009), severity 1.0, on linear RGB.
// An approximation of what dichromats see, not a medical model.
export const DEFICIENCIES = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
};

const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

const toByte = (c) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
};

// Linear sRGB to CIELAB, D65 white.
export function lab([r, g, b]) {
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const fy = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function simulate(rgb, type) {
  return DEFICIENCIES[type].map((row) =>
    Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])));
}

export const linearFromHex = (hex) =>
  [1, 3, 5].map((i) => LINEAR[parseInt(hex.slice(i, i + 2), 16)]);

// CIEDE2000 (Sharma, Wu and Dalal 2005).
export function deltaE([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C7 = (c) => c ** 7 / (c ** 7 + 25 ** 7);
  const G = 0.5 * (1 - Math.sqrt(C7((Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1 = Math.hypot(a1p, b1);
  const C2 = Math.hypot(a2p, b2);
  const hue = (b, a) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1 = hue(b1, a1p);
  const h2 = hue(b2, a2p);

  let dh = 0;
  let hm = h1 + h2;
  if (C1 * C2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
    if (Math.abs(h1 - h2) > 180) hm += hm < 360 ? 360 : -360;
    hm /= 2;
  }

  const dL = L2 - L1;
  const dC = C2 - C1;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh / 2) * rad);
  const Lm = (L1 + L2) / 2;
  const Cm = (C1 + C2) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad)
          + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const SC = 1 + 0.045 * Cm;
  const SH = 1 + 0.015 * Cm * T;
  const RT = -Math.sin(2 * 30 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad) * 2 * Math.sqrt(C7(Cm));

  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

// A rough everyday name, so findings read naturally to the model and in logs.
function nameOf([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  if (max !== min) {
    const d = max - min;
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  if (max < 110 && (h < 45 || h >= 345)) return "brown";
  if (h < 15 || h >= 345) return "red";
  if (h < 40) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 200) return "teal";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

const ROWS = ["top", "middle", "bottom"];
const COLS = ["left", "centre", "right"];

export async function analyzeColors(jpeg) {
  const px = await shrink(jpeg, W, H, "rgb24");
  const bins = Array.from({ length: 360 / BIN }, () => ({
    n: 0, r: 0, g: 0, b: 0, grid: new Array(9).fill(0),
  }));

  for (let i = 0, p = 0; p < px.length; i++, p += 3) {
    const rgb = [LINEAR[px[p]], LINEAR[px[p + 1]], LINEAR[px[p + 2]]];
    const [L, a, b] = lab(rgb);
    if (L < 15 || L > 97 || Math.hypot(a, b) < CHROMA) continue;
    const bin = bins[Math.floor(((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 / BIN)];
    bin.n++;
    bin.r += rgb[0];
    bin.g += rgb[1];
    bin.b += rgb[2];
    const x = i % W;
    const y = (i - x) / W;
    bin.grid[Math.floor((y * 3) / H) * 3 + Math.floor((x * 3) / W)]++;
  }

  // Each run of neighbouring occupied hue bins is one color. Start the walk
  // at an empty bin so a run that wraps past 360 degrees isn't split.
  const start = bins.findIndex((b) => b.n < FLOOR);
  const runs = [];
  let run = null;
  for (let k = 0; k < bins.length; k++) {
    const bin = bins[(start + 1 + k) % bins.length];
    if (start === -1 || bin.n >= FLOOR) {
      run ??= { n: 0, r: 0, g: 0, b: 0, grid: new Array(9).fill(0) };
      run.n += bin.n;
      run.r += bin.r;
      run.g += bin.g;
      run.b += bin.b;
      bin.grid.forEach((v, j) => { run.grid[j] += v; });
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);

  const colors = runs
    .filter((c) => c.n >= MIN_PIXELS)
    .sort((a, b) => b.n - a.n)
    .map((c) => {
      const linear = [c.r / c.n, c.g / c.n, c.b / c.n];
      const srgb = linear.map(toByte);
      return {
        name: nameOf(srgb),
        hex: "#" + srgb.map((v) => v.toString(16).padStart(2, "0")).join(""),
        pixels: c.n,
        share: c.n / (W * H),
        where: c.grid
          .map((v, j) => (v >= MIN_PIXELS ? `${ROWS[Math.floor(j / 3)]} ${COLS[j % 3]}` : null))
          .filter(Boolean),
        linear,
      };
    });

  const confusions = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const normal = deltaE(lab(colors[i].linear), lab(colors[j].linear));
      if (normal < DISTINCT) continue;
      for (const type of Object.keys(DEFICIENCIES)) {
        const seen = deltaE(lab(simulate(colors[i].linear, type)), lab(simulate(colors[j].linear, type)));
        if (seen < CONFUSABLE) {
          confusions.push({
            a: colors[i].name, b: colors[j].name, type, normal, seen,
            large: Math.min(colors[i].pixels, colors[j].pixels) >= WARN_PIXELS,
          });
        }
      }
    }
  }

  return { colors, confusions, risky: confusions.some((c) => c.large) };
}

// The findings in words, handed to the model alongside the image.
export function summarize({ colors, confusions }) {
  if (!colors.length) return "Pixel analysis: no strongly colored areas on this screen.";

  const lines = colors.map((c) =>
    `${c.name} ${c.hex}, ${(c.share * 100).toFixed(1)}% of the screen, ${c.where.join(", ") || "scattered"}`);

  const pairs = new Map();
  for (const c of confusions) {
    const key = `${c.a} and ${c.b}`;
    pairs.set(key, [...(pairs.get(key) ?? []), c.type]);
  }
  const hard = [...pairs].map(([pair, types]) => `${pair} (${types.join(", ")})`);

  return [
    "Pixel analysis of this screen (approximate; it can include interface elements):",
    `Colors in use: ${lines.join("; ")}.`,
    hard.length
      ? `Likely hard to tell apart with a color vision deficiency: ${hard.join("; ")}.`
      : "None of these pairs is likely to be confused with a common color vision deficiency.",
  ].join("\n");
}
