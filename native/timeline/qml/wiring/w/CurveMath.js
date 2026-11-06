.pragma library
// Generated from TrackEffectsPanel.tsx by src/wiring/w/curves.mjs.
var EQ_FS = 48000
var biquadMagDb = (type, f, f0, gainDb, q) => {
  if (gainDb === 0 && type !== "peaking") return 0;
  if (gainDb === 0 && type === "peaking") return 0;
  const A = Math.pow(10, gainDb / 40);
  const w0 = 2 * Math.PI * f0 / EQ_FS;
  const cw = Math.cos(w0);
  const sw = Math.sin(w0);
  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  if (type === "peaking") {
    const alpha = sw / (2 * q);
    b0 = 1 + alpha * A;
    b1 = -2 * cw;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cw;
    a2 = 1 - alpha / A;
  } else if (type === "lowshelf") {
    const S = 1;
    const alpha = sw / 2 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const sqA = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * cw + sqA);
    b1 = 2 * A * (A - 1 - (A + 1) * cw);
    b2 = A * (A + 1 - (A - 1) * cw - sqA);
    a0 = A + 1 + (A - 1) * cw + sqA;
    a1 = -2 * (A - 1 + (A + 1) * cw);
    a2 = A + 1 + (A - 1) * cw - sqA;
  } else {
    const S = 1;
    const alpha = sw / 2 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const sqA = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cw + sqA);
    b1 = -2 * A * (A - 1 + (A + 1) * cw);
    b2 = A * (A + 1 + (A - 1) * cw - sqA);
    a0 = A + 1 - (A - 1) * cw + sqA;
    a1 = 2 * (A - 1 - (A + 1) * cw);
    a2 = A + 1 - (A - 1) * cw - sqA;
  }
  const w = 2 * Math.PI * f / EQ_FS;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  const numRe = b0 + b1 * c1 + b2 * c2;
  const numIm = -(b1 * s1 + b2 * s2);
  const denRe = a0 + a1 * c1 + a2 * c2;
  const denIm = -(a1 * s1 + a2 * s2);
  const numMag2 = numRe * numRe + numIm * numIm;
  const denMag2 = denRe * denRe + denIm * denIm;
  if (denMag2 === 0) return 0;
  return 10 * Math.log10(numMag2 / denMag2);
};
var compTransferDb = (inputDb, threshold, ratio, knee) => {
  const half = knee / 2;
  const delta = inputDb - threshold;
  if (knee > 0 && delta > -half && delta < half) {
    const x = delta + half;
    return inputDb + (1 / ratio - 1) * (x * x) / (2 * knee);
  }
  if (delta <= 0) return inputDb;
  return threshold + delta / ratio;
};
