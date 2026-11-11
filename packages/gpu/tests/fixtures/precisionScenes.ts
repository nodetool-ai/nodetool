import inverseLevels from "./inverse-levels.json" with { type: "json" };
export type Scene = "ramp" | "dark-fade" | "sky" | "grade-glow";

export function sourcePixels(scene: Scene, width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1), v = y / (height - 1 || 1);
      let rgb = [u, u, u];
      if (scene === "ramp") {
        const code = inverseLevels.inputCodes[x];
        if (code === undefined) throw new Error("Ramp fixture width mismatch");
        rgb = [code / 255, code / 255, code / 255];
      }
      if (scene === "dark-fade") {
        // Distant hills and a setting sun, faded almost to black before lifting.
        const hill = v > 0.68 + 0.09 * Math.sin(u * 13) + 0.04 * Math.cos(u * 29);
        const sun = Math.hypot((u - 0.7) * 1.6, v - 0.39) < 0.09;
        rgb = hill ? [0.08, 0.12, 0.16] : sun ? [1, 0.76, 0.4] : [0.55 + u * 0.2, 0.24 + v * 0.3, 0.25 + v * 0.35];
      }
      if (scene === "sky") {
        const cloud = Math.exp(-((u - 0.36) ** 2 / 0.025 + (v - 0.48) ** 2 / 0.004));
        rgb = [0.18 + v * 0.52 + cloud * 0.18, 0.4 + v * 0.39 + cloud * 0.12, 0.76 + v * 0.15];
        if (v > 0.87 + Math.sin(u * 19) * 0.025) rgb = [0.09, 0.18, 0.15];
      }
      if (scene === "grade-glow") {
        const lamp = Math.hypot((u - 0.28) * 1.7, v - 0.3) < 0.045 || Math.hypot((u - 0.73) * 1.7, v - 0.38) < 0.035;
        const building = v > 0.55 + Math.floor(u * 14) % 3 * 0.07;
        const window = building && Math.floor(u * 100) % 6 < 2 && Math.floor(v * 65) % 6 < 2;
        rgb = lamp ? [1, 0.86, 0.55] : window ? [0.65, 0.38, 0.15] : building ? [0.08 + u * 0.05, 0.1, 0.16] : [0.12 + v * 0.2, 0.17 + u * 0.18, 0.35 + v * 0.12];
      }
      pixels.set([...rgb.map(c => Math.round(Math.min(1, c) * 255)), 255], (y * width + x) * 4);
    }
  }
  return pixels;
}

