/**
 * Transform and color conversions between glTF's storage form and the numbers
 * the editor's Properties panel shows.
 *
 * glTF stores rotation as a quaternion and base color as a linear-space
 * factor; the editor reads Euler degrees in three.js's default XYZ order and a
 * CSS sRGB hex string. Both directions live here so the headless operations and
 * the browser editor cannot disagree about what "45 degrees" or "#ff8800" mean.
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Quaternion `[x, y, z, w]` to Euler degrees in XYZ order. The quaternion is
 * normalized first: glTF requires unit rotations, but files from other tools
 * do not always have them, and the extraction below is only valid for one.
 */
export function quaternionToEulerDegrees(q: Quat): Vec3 {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  const n = length > 0 && Number.isFinite(length) ? length : 1;
  const [x, y, z, w] = [q[0] / n, q[1] / n, q[2] / n, length > 0 ? q[3] / n : 1];
  // Rotation-matrix elements needed for the XYZ extraction.
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - z * w);
  const m13 = 2 * (x * z + y * w);
  const m23 = 2 * (y * z - x * w);
  const m33 = 1 - 2 * (x * x + y * y);
  const m22 = 1 - 2 * (x * x + z * z);
  const m32 = 2 * (y * z + x * w);

  const ey = Math.asin(clamp(m13, -1, 1));
  let ex: number;
  let ez: number;
  if (Math.abs(m13) < 0.9999999) {
    ex = Math.atan2(-m23, m33);
    ez = Math.atan2(-m12, m11);
  } else {
    // At |m13| = 1 the X and Z rotations are one degree of freedom, so ez is
    // pinned to 0 and ex carries the combination — which depends on the sign of
    // m13. Only m32 tracks both poles: it is sin(ex + ez) at m13 = +1 and
    // sin(ex - ez) at m13 = -1. m21 agrees at +1 and flips the sign at -1.
    ex = Math.atan2(m32, m22);
    ez = 0;
  }
  return [ex * DEG, ey * DEG, ez * DEG];
}

/** Euler degrees in XYZ order to a quaternion `[x, y, z, w]`. */
export function eulerDegreesToQuaternion(euler: Vec3): Quat {
  const [rx, ry, rz] = euler.map((value) => value * RAD * 0.5) as Vec3;
  const c1 = Math.cos(rx);
  const c2 = Math.cos(ry);
  const c3 = Math.cos(rz);
  const s1 = Math.sin(rx);
  const s2 = Math.sin(ry);
  const s3 = Math.sin(rz);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3
  ];
}

export interface Trs {
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
}

/** Decompose a column-major glTF 4x4 matrix into translation/rotation/scale. */
export function decomposeMatrix(m: readonly number[]): Trs {
  const translation: Vec3 = [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0];
  const sx = Math.hypot(m[0] ?? 0, m[1] ?? 0, m[2] ?? 0);
  const sy = Math.hypot(m[4] ?? 0, m[5] ?? 0, m[6] ?? 0);
  const sz = Math.hypot(m[8] ?? 0, m[9] ?? 0, m[10] ?? 0);
  // A negative determinant means one axis is mirrored; glTF puts the flip on X.
  const det =
    (m[0] ?? 0) * ((m[5] ?? 0) * (m[10] ?? 0) - (m[6] ?? 0) * (m[9] ?? 0)) -
    (m[4] ?? 0) * ((m[1] ?? 0) * (m[10] ?? 0) - (m[2] ?? 0) * (m[9] ?? 0)) +
    (m[8] ?? 0) * ((m[1] ?? 0) * (m[6] ?? 0) - (m[2] ?? 0) * (m[5] ?? 0));
  const scale: Vec3 = [det < 0 ? -sx : sx, sy, sz];

  const r = [
    (m[0] ?? 0) / (scale[0] || 1),
    (m[1] ?? 0) / (scale[0] || 1),
    (m[2] ?? 0) / (scale[0] || 1),
    (m[4] ?? 0) / (scale[1] || 1),
    (m[5] ?? 0) / (scale[1] || 1),
    (m[6] ?? 0) / (scale[1] || 1),
    (m[8] ?? 0) / (scale[2] || 1),
    (m[9] ?? 0) / (scale[2] || 1),
    (m[10] ?? 0) / (scale[2] || 1)
  ];
  const trace = r[0] + r[4] + r[8];
  let rotation: Quat;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    rotation = [
      (r[5] - r[7]) * s,
      (r[6] - r[2]) * s,
      (r[1] - r[3]) * s,
      0.25 / s
    ];
  } else if (r[0] > r[4] && r[0] > r[8]) {
    const s = 2 * Math.sqrt(1 + r[0] - r[4] - r[8]);
    rotation = [
      0.25 * s,
      (r[3] + r[1]) / s,
      (r[6] + r[2]) / s,
      (r[5] - r[7]) / s
    ];
  } else if (r[4] > r[8]) {
    const s = 2 * Math.sqrt(1 + r[4] - r[0] - r[8]);
    rotation = [
      (r[3] + r[1]) / s,
      0.25 * s,
      (r[7] + r[5]) / s,
      (r[6] - r[2]) / s
    ];
  } else {
    const s = 2 * Math.sqrt(1 + r[8] - r[0] - r[4]);
    rotation = [
      (r[6] + r[2]) / s,
      (r[7] + r[5]) / s,
      0.25 * s,
      (r[1] - r[3]) / s
    ];
  }
  return { translation, rotation, scale };
}

/** A column-major 4x4 matrix from translation, unit quaternion and scale. */
export function composeMatrix(t: Vec3, q: Quat, s: Vec3): number[] {
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  const [x, y, z, w] = [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ];
}

/** `a * b` for column-major 4x4 matrices. */
export function multiplyMatrices(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** Apply a column-major 4x4 matrix to a point. */
export function transformPoint(m: readonly number[], p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
  ];
}

const srgbToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (channel: number): number =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

/**
 * Parse a CSS hex color (`#rgb`, `#rrggbb`, with or without the `#`) into a
 * linear-space RGB triple. Returns null when the string is not a hex color.
 */
export function hexToLinearRgb(hex: string): Vec3 | null {
  const raw = hex.trim().replace(/^#/, "");
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return null;
  }
  const value = Number.parseInt(expanded, 16);
  return [
    srgbToLinear(((value >> 16) & 0xff) / 255),
    srgbToLinear(((value >> 8) & 0xff) / 255),
    srgbToLinear((value & 0xff) / 255)
  ];
}

/** A linear-space RGB triple as a lowercase `#rrggbb` string. */
export function linearRgbToHex(rgb: readonly number[]): string {
  const channel = (value: number): string =>
    Math.round(clamp(linearToSrgb(clamp(value, 0, 1)), 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(rgb[0] ?? 0)}${channel(rgb[1] ?? 0)}${channel(rgb[2] ?? 0)}`;
}

/** Round to six decimals so serialized transforms stay readable. */
export const round6 = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : 0;
