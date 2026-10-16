import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

import { gameParticles } from "../src/game-particles.js";
import { GAME_PARTICLE_PRESET_IDS, getGameParticlePreset } from "../src/game-particle-presets.js";

const reference = readFileSync(new URL("../../system-skills/native-game-reference/SKILL.md", import.meta.url), "utf8");

function checkRecipes(markdown: string): void {
  const section = markdown.split("### Particle preset recipes\n")[1]?.split("### Particle component fields\n")[0] ?? "";
  const recipes = [...section.matchAll(/#### (\w+)\n\n```json\n([^`]+)\n```/g)];
  expect(recipes.map((recipe) => recipe[1])).toEqual([...GAME_PARTICLE_PRESET_IDS]);
  for (const [, name, json] of recipes) {
    for (const dimension of ["2d", "3d"] as const) {
      const particles = gameParticles.parse(JSON.parse(json));
      if (dimension === "2d") {
        for (const emitter of particles.emitters) {
          delete emitter.render;
          if (emitter.shape.kind === "box") { emitter.shape.size.z = 0; }
        }
      }
      expect(particles, `${name} recipe in ${dimension}`).toEqual(getGameParticlePreset(name, dimension));
    }
  }
}

it("documents every canonical particle preset for both public edit dimensions", () => {
  checkRecipes(reference);
});

it("rejects a documented recipe with an altered emission rate", () => {
  const altered = reference.replace('"rate":48', '"rate":49');
  expect(altered).not.toBe(reference);
  expect(() => checkRecipes(altered)).toThrow(/fire recipe in 2d/);
});
