import { expect, it } from "vitest";
import { gameEnvironment3D } from "../src/game3d/index.js";

const heightFog = { kind: "height", color: "#cad9e4", density: 0.08, baseHeight: 2, heightFalloff: 0.5, maxOpacity: 0.95 };

it("retains the exact legacy linear fog shape and absent-fog defaults", () => {
  const fog = { color: "#112233", near: 5, far: 60 };
  expect(gameEnvironment3D.parse({ fog }).fog).toEqual(fog);
  expect(gameEnvironment3D.parse({}).fog).toBeUndefined();
});

it("accepts exponential height fog without requiring linear fog fields", () => {
  expect(gameEnvironment3D.parse({ fog: heightFog }).fog).toEqual(heightFog);
  expect(gameEnvironment3D.safeParse({ fog: { ...heightFog, near: 1, far: 20 } }).success).toBe(false);
});

it("rejects nonfinite and unbounded atmospheric parameters", () => {
  for (const patch of [{ density: -1 }, { density: Infinity }, { heightFalloff: 0 }, { heightFalloff: 101 },
    { baseHeight: 10001 }, { maxOpacity: 1.01 }]) {
    expect(gameEnvironment3D.safeParse({ fog: { ...heightFog, ...patch } }).success).toBe(false);
  }
});
