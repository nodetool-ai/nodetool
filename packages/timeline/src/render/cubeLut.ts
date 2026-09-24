/** Parsed 3D `.cube` lookup table in red-fastest order. */
export interface CubeLut {
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  rgb: Float32Array;
}

const triplet = (parts: readonly string[], line: number): [number, number, number] => {
  if (parts.length !== 3) throw new Error(`Invalid .cube triplet at line ${line}`);
  const values = parts.map(Number);
  if (values.some((value) => !Number.isFinite(value))) throw new Error(`Non-finite .cube value at line ${line}`);
  return [values[0]!, values[1]!, values[2]!];
};

/** Parse a conventional 3D `.cube` file, rejecting malformed and oversized tables. */
export function parseCubeLut(source: string): CubeLut {
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const entries: number[] = [];
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.split("#", 1)[0]?.trim() ?? "";
    if (!line) continue;
    const parts = line.split(/\s+/);
    const head = parts[0]?.toUpperCase();
    if (head === "TITLE") continue;
    if (head === "LUT_1D_SIZE") throw new Error("1D .cube tables are not supported");
    if (head === "LUT_3D_SIZE") {
      const value = Number(parts[1]);
      if (!Number.isInteger(value) || value < 2 || value > 64 || parts.length !== 2) {
        throw new Error(`Invalid .cube size at line ${index + 1}`);
      }
      size = value;
      continue;
    }
    if (head === "DOMAIN_MIN") {
      domainMin = triplet(parts.slice(1), index + 1);
      continue;
    }
    if (head === "DOMAIN_MAX") {
      domainMax = triplet(parts.slice(1), index + 1);
      continue;
    }
    if (size === 0) throw new Error(`.cube data precedes LUT_3D_SIZE at line ${index + 1}`);
    entries.push(...triplet(parts, index + 1));
    if (entries.length > size * size * size * 3) throw new Error(".cube has too many entries");
  }
  if (size === 0 || entries.length !== size * size * size * 3) {
    throw new Error(`.cube requires ${size * size * size} RGB entries`);
  }
  for (let channel = 0; channel < 3; channel++) {
    if (domainMax[channel]! <= domainMin[channel]!) throw new Error(".cube domain maximum must exceed minimum");
  }
  return { size, domainMin, domainMax, rgb: Float32Array.from(entries) };
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Trilinear interpolation, with the same corner addressing as the GPU shader. */
export function sampleCubeLut(lut: CubeLut, color: readonly [number, number, number]): [number, number, number] {
  const coordinates = color.map((value, channel) => clamp01((value - lut.domainMin[channel]!) / (lut.domainMax[channel]! - lut.domainMin[channel]!)) * (lut.size - 1));
  const lower = coordinates.map(Math.floor);
  const upper = lower.map((value) => Math.min(lut.size - 1, value + 1));
  const fraction = coordinates.map((value, channel) => value - lower[channel]!);
  const result: [number, number, number] = [0, 0, 0];
  for (let bz = 0; bz <= 1; bz++) {
    for (let gy = 0; gy <= 1; gy++) {
      for (let rx = 0; rx <= 1; rx++) {
        const r = rx ? upper[0]! : lower[0]!;
        const g = gy ? upper[1]! : lower[1]!;
        const b = bz ? upper[2]! : lower[2]!;
        const weight = (rx ? fraction[0]! : 1 - fraction[0]!)
          * (gy ? fraction[1]! : 1 - fraction[1]!)
          * (bz ? fraction[2]! : 1 - fraction[2]!);
        const offset = ((b * lut.size + g) * lut.size + r) * 3;
        for (let channel = 0; channel < 3; channel++) result[channel] += (lut.rgb[offset + channel] ?? 0) * weight;
      }
    }
  }
  return result;
}
