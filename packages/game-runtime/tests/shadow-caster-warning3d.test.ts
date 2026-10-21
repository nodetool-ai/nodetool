import { expect, it } from "vitest";
import { gameDocument3D } from "@nodetool-ai/protocol";
import { validateGame3D } from "../src/validate3d.js";
import { blockout } from "./fixtures-game3d.js";

function scene(ground: Record<string, unknown>, shadows = true, cascades: Record<string, number> | null = { count: 2 }) {
  const document = blockout();
  const base = document.scenes[0];
  return gameDocument3D.parse({ ...document, scenes: [{ ...base, environment: { ...base.environment, shadows: { ...base.environment.shadows, enabled: shadows, ...(cascades ? { cascades } : {}) } },
    entities: [...base.entities,
      { id: "sun", transform3d: {}, light3d: { kind: "directional", color: "#ffffff", intensity: 1, castShadow: true } },
      { id: "ground", transform3d: { scale: { x: 2, y: 1, z: 2 } }, primitive: { kind: "plane", dimensions: { x: 80, y: 1, z: 60 }, material: { color: "#808080" }, ...ground } },
      { id: "crate", transform3d: {}, primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 }, material: { color: "#808080" } } }] }] });
}

it("warns when a ground-sized mesh casts into shadow cascades, and only then", () => {
  const warned = validateGame3D(scene({}));
  expect(warned.valid).toBe(true);
  expect(warned.warnings).toEqual([expect.objectContaining({ code: "large_shadow_caster", path: ["scenes", 0, "entities", 3, "primitive", "castShadow"],
    message: expect.stringContaining("ground is 160 units across") })]);
  expect(validateGame3D(scene({ castShadow: false })).warnings).toEqual([]);
  expect(validateGame3D(scene({}, false)).warnings).toEqual([]);
  // A single shadow map covers only its extent, so a large caster costs one bounded pass.
  expect(validateGame3D(scene({}, true, null)).warnings).toEqual([]);
});
