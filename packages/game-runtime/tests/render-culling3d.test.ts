import { describe, expect, it } from "vitest";
import { gameDocument3D, gameInputFrame3D, type GameDocument3D, type GameEvent3D } from "@nodetool-ai/protocol";

import { anyGameDocumentOp, applyAnyGameOps, applyGameOps3D, createGameSession3D, validateGame3D } from "../src/index.js";
import { blockout } from "./fixtures-game3d.js";

const crate = (id: string, x: number, culling?: object) => ({
  id, transform3d: { position: { x, y: 2 + x / 10, z: -x } },
  body3d: { type: "dynamic" }, collider3d: { kind: "box", halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
  primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 } },
  ...(culling ? { renderCulling: culling } : {})
});

/** A scene of falling crates, with or without presentation-only culling settings. */
function cratesGame(culled: boolean): GameDocument3D {
  const base = blockout();
  return gameDocument3D.parse({
    ...base,
    ...(culled ? { performance: { cullLayers: { props: { maxDistance: 6 }, far: { maxDistance: 400 } }, budgets: { drawCalls: 10, voices: 4 } } } : {}),
    scenes: [{ ...base.scenes[0], entities: [
      ...base.scenes[0].entities,
      { id: "floor", transform3d: { position: { x: 0, y: -0.5, z: 0 } }, body3d: { type: "static" },
        collider3d: { kind: "box", halfExtents: { x: 50, y: 0.5, z: 50 } }, primitive: { kind: "box", dimensions: { x: 100, y: 1, z: 100 } } },
      ...Array.from({ length: 12 }, (_, index) => crate(`crate-${index}`, index * 2,
        culled ? (index % 3 === 0 ? { layer: "props" } : index % 3 === 1 ? { layer: "far", maxDistance: 3 } : { maxDistance: 9 }) : undefined))
    ] }]
  });
}

function withoutDigest(snapshot: object): object {
  const { contentDigest: _contentDigest, ...rest } = snapshot as { contentDigest?: string };
  return rest;
}

const route = Array.from({ length: 120 }, (_, tick) => gameInputFrame3D.parse({
  pressed: tick % 40 < 5 ? ["jump"] : [], axes: { moveX: tick < 60 ? 1 : -0.5, moveZ: tick % 30 < 15 ? 1 : 0 }
}));

describe("3D render culling is presentation only", () => {
  it("resolves each entity's cull distance from its own setting before its layer", async () => {
    const game = cratesGame(true);
    expect(validateGame3D(game).errors).toEqual([]);
    const session = await createGameSession3D(game, 1);
    try {
      const distances = Object.fromEntries(session.frame().entities.map((entity) => [entity.entityId, entity.cullDistance]));
      expect(distances["crate-0"]).toBe(6);
      expect(distances["crate-1"]).toBe(3);
      expect(distances["crate-2"]).toBe(9);
      expect(distances.floor).toBeUndefined();
      expect(distances.player).toBeUndefined();
    } finally { session.dispose(); }
  });

  it("produces identical snapshots, events and transforms with culling on and off for the same seed", async () => {
    const culled = await createGameSession3D(cratesGame(true), 1);
    const plain = await createGameSession3D(cratesGame(false), 1);
    try {
      const culledEvents: GameEvent3D[] = [];
      const plainEvents: GameEvent3D[] = [];
      for (const input of route) {
        const a = culled.step(input);
        const b = plain.step(input);
        culledEvents.push(...a.events);
        plainEvents.push(...b.events);
        expect(a.frame.entities.map(({ cullDistance: _cullDistance, ...entity }) => entity)).toEqual(b.frame.entities);
        expect(a.frame.camera).toEqual(b.frame.camera);
      }
      expect(culledEvents).toEqual(plainEvents);
      const snapshot = culled.snapshot();
      expect(withoutDigest(snapshot)).toEqual(withoutDigest(plain.snapshot()));
      expect(JSON.stringify(snapshot)).not.toMatch(/cull|renderCulling|budget/i);
      expect(snapshot.entities.some((entity) => entity.id.startsWith("crate") && entity.transform.position.y < 1)).toBe(true);
    } finally { culled.dispose(); plain.dispose(); }
  });

  it("replays a culled game from a mid-run snapshot without divergence", async () => {
    const game = cratesGame(true);
    const session = await createGameSession3D(game, 1);
    try {
      for (const input of route.slice(0, 60)) { session.step(input); }
      const resumed = await createGameSession3D(game, 1, session.snapshot());
      try {
        for (const input of route.slice(60)) { session.step(input); resumed.step(input); }
        expect(resumed.snapshot()).toEqual(session.snapshot());
      } finally { resumed.dispose(); }
    } finally { session.dispose(); }
  });

  it("reports an entity that names an undeclared cull layer", () => {
    const game = cratesGame(true);
    game.scenes[0].entities.find((entity) => entity.id === "crate-0")!.renderCulling = { layer: "missing" };
    expect(validateGame3D(game).diagnostics).toContainEqual(expect.objectContaining({ code: "missing_cull_layer" }));
  });

  it("sets and removes culling through document operations", () => {
    const plain = cratesGame(false);
    const culled = applyGameOps3D(plain, [
      { op: "set_performance", performance: { cullLayers: { props: { maxDistance: 6 } }, budgets: { triangles: 50_000 } } },
      { op: "update_entity", scene_id: "scene", entity_id: "crate-0", set: { renderCulling: { layer: "props" } } }
    ]);
    expect(culled.performance).toEqual({ cullLayers: { props: { maxDistance: 6 } }, budgets: { triangles: 50_000 } });
    expect(culled.scenes[0].entities.find((entity) => entity.id === "crate-0")?.renderCulling).toEqual({ layer: "props" });
    const wire = JSON.parse(JSON.stringify([
      { op: "update_entity", scene_id: "scene", entity_id: "crate-0", set: { renderCulling: null } },
      { op: "set_performance", performance: null }
    ])).map((op: unknown) => anyGameDocumentOp.parse(op));
    expect(applyAnyGameOps(culled, wire)).toEqual(plain);
  });
});
