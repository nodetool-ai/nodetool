import { expect, it } from "vitest";
import { gameParticleIssues, gameParticles } from "../src/game-particles.js";
import { GAME_PARTICLE_PRESET_IDS, getGameParticlePreset } from "../src/game-particle-presets.js";

const NAMES = ["fire", "smoke", "sparks", "dust", "magic", "rain", "snow", "explosion"];

it("offers exactly the eight authored particle presets", () => {
  expect(GAME_PARTICLE_PRESET_IDS).toEqual(NAMES);
});

it.each(NAMES.flatMap((name) => (["2d", "3d"] as const).map((dimension) => [name, dimension] as const)))("provides complete bounded %s particles in %s", (name, dimension) => {
  const preset = getGameParticlePreset(name, dimension);
  expect(gameParticles.parse(preset)).toEqual(preset);
  expect(gameParticleIssues(preset)).toEqual([]);
  expect(preset.emitters.some((emitter) => emitter.rate > 0 || emitter.bursts.some((burst) => burst.count > 0))).toBe(true);
  expect(preset.emitters.every((emitter) => emitter.maxParticles <= 512)).toBe(true);
});

it("returns independent nested copies and rejects unknown names", () => {
  const original = getGameParticlePreset("fire", "3d");
  const changed = getGameParticlePreset("fire", "3d");
  changed.emitters[0].gravity.y = 123;
  changed.emitters[0].colorOverLifetime![0].color = "#000000";
  expect(getGameParticlePreset("fire", "3d")).toEqual(original);
  expect(() => getGameParticlePreset("constructor", "2d")).toThrow(/Unknown particle preset/);
});

it("keeps world-unit sizes and upward Y consistent in both dimensions", () => {
  expect(getGameParticlePreset("snow", "2d").emitters[0].size).toEqual({ min: 0.04, max: 0.1 });
  expect(getGameParticlePreset("snow", "3d").emitters[0].size).toEqual({ min: 0.04, max: 0.1 });
  for (const dimension of ["2d", "3d"] as const) {
    expect(getGameParticlePreset("fire", dimension).emitters[0].gravity.y).toBeGreaterThan(0);
    expect(getGameParticlePreset("smoke", dimension).emitters[0].gravity.y).toBeGreaterThan(0);
    expect(getGameParticlePreset("rain", dimension).emitters[0].gravity.y).toBeLessThan(0);
    expect(getGameParticlePreset("snow", dimension).emitters[0].gravity.y).toBeLessThan(0);
  }
});

it("distinguishes weather, additive sparks and a finite explosion", () => {
  expect(getGameParticlePreset("rain", "3d").emitters[0].render?.kind).toBe("stretched");
  expect(getGameParticlePreset("sparks", "3d").emitters[0].blend).toBe("additive");
  const explosion = getGameParticlePreset("explosion", "3d").emitters[0];
  expect(explosion.loop).toBe(false);
  expect(explosion.rate).toBe(0);
  expect(explosion.bursts[0].count).toBeGreaterThan(0);
});
