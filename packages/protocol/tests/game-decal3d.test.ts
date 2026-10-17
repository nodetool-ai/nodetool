import { expect, it } from "vitest";
import { gameEntity3D } from "../src/game3d/index.js";

const decal = { assetId: "paint", receiverId: "wall", size: { x: 2, y: 1, z: 0.25 } };

it("authors a bounded texture projector while retaining undecorated entity output", () => {
  const entity = gameEntity3D.parse({ id: "graffiti", transform3d: {}, decal3d: decal });
  expect(entity.decal3d).toEqual({ ...decal, opacity: 1, renderOrder: 0 });
  expect(gameEntity3D.parse({ id: "ordinary", transform3d: {} })).not.toHaveProperty("decal3d");
});

it("rejects degenerate projector bounds, unbounded alpha and unstable ordering", () => {
  for (const patch of [{ size: { x: 0, y: 1, z: 1 } }, { size: { x: 1001, y: 1, z: 1 } },
    { opacity: -0.1 }, { renderOrder: 0.5 }, { renderOrder: 32 }, { receiverId: "" }]) {
    expect(gameEntity3D.safeParse({ id: "graffiti", transform3d: {}, decal3d: { ...decal, ...patch } }).success).toBe(false);
  }
});
