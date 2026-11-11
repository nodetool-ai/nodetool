import { expect, it } from "vitest";
import { clipEffect } from "../src/api-schemas/timeline.js";
import {
  buildEffect,
  effectParams
} from "../src/api-schemas/timeline-tool-params.js";
it("creates neutral bounded noise reduction", () => {
  const value = buildEffect(effectParams.parse({ type: "denoise" }), 0);
  expect(clipEffect.parse(value)).toMatchObject({
    type: "denoise",
    lumaStrength: 0,
    chromaStrength: 0,
    temporalStrength: 0,
    radius: 2
  });
});
it.each([
  { lumaStrength: -1 },
  { chromaStrength: 2 },
  { temporalStrength: 2 },
  { radius: 0 },
  { radius: 5 },
  { radius: 1.5 }
])("rejects invalid controls %j", (patch) => {
  expect(
    clipEffect.safeParse({ id: "d", type: "denoise", enabled: true, ...patch })
      .success
  ).toBe(false);
  expect(effectParams.safeParse({ type: "denoise", ...patch }).success).toBe(
    false
  );
});
