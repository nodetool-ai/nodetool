import { z } from "zod";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { anyGameDocumentOp, applyAnyGameOps, createTopDownRoomGame, validateAnyGame } from "@nodetool-ai/game-runtime";
import { diffAnyGameDocuments } from "../diffAnyGameDocuments";

const COMPONENT_CONTROLS = [
  { component: "sprite", remove: "tint", value: { assetId: "control-image", width: 1, height: 1, tint: "#ff0000" } },
  { component: "tilemap", remove: "mask", value: { assetId: "control-image", tiles: [], mask: 3 } },
  { component: "camera2d", remove: null, value: { width: 16, height: 9 } },
  { component: "body2d", remove: "gravityScale", value: { type: "kinematic", gravityScale: 0.5 } },
  { component: "collider2d", remove: "oneWay", value: { width: 1, height: 1, oneWay: true } },
  { component: "animator", remove: "clips", value: { frames: [{ x: 0, y: 0, width: 1, height: 1 }], ticksPerFrame: 1,
    clips: { idle: { frames: [{ x: 0, y: 0, width: 1, height: 1 }], ticksPerFrame: 1 } } } },
  { component: "visualAnimation", remove: "rotationRate", value: { tracks: [], rotationRate: 1 } },
  { component: "audioSource", remove: null, value: { assetId: "control-audio", onEvent: "jump" } },
  { component: "light2d", remove: "offset", value: { color: "#ffffff", intensity: 1, radius: 2, offset: { x: 1, y: 2 } } },
  { component: "particles", remove: null, value: { emitters: [{ id: "spark", rate: 4 }] } }
];

function fixture(component: string, value: unknown): GameDocument {
  const initial = createTopDownRoomGame(`component-json-${component}`);
  return gameDocument.parse({ ...initial, schemaVersion: 2,
    assets: { ...initial.assets,
      "control-image": { assetId: "0123456789abcdef0123456789abcdef", digest: "image", mediaKind: "image", width: 16, height: 16 },
      "control-audio": { assetId: "fedcba9876543210fedcba9876543210", digest: "audio", mediaKind: "audio", width: 1, height: 1 } },
    scenes: [{ ...initial.scenes[0], lighting: { ambient: { color: "#ffffff", intensity: 0.5 }, points: [] },
      entities: [...initial.scenes[0].entities, { id: "component-control", transform2d: { x: 0, y: 0 },
        sprite: { assetId: "control-image", width: 1, height: 1 }, [component]: value }] }] });
}

function roundTrip(before: GameDocument, after: GameDocument): void {
  const beforeValidation = validateAnyGame(before);
  const afterValidation = validateAnyGame(after);
  if (!beforeValidation.valid) { throw new Error(`Invalid before fixture: ${JSON.stringify(beforeValidation)}`); }
  expect(beforeValidation.valid).toBe(true);
  if (!afterValidation.valid) { throw new Error(`Invalid after fixture: ${JSON.stringify(afterValidation)}`); }
  expect(afterValidation.valid).toBe(true);
  const forward = z.array(anyGameDocumentOp).parse(JSON.parse(JSON.stringify(diffAnyGameDocuments(before, after))));
  const inverse = z.array(anyGameDocumentOp).parse(JSON.parse(JSON.stringify(diffAnyGameDocuments(after, before))));
  expect(forward.length).toBeGreaterThan(0);
  expect([...forward, ...inverse].every((op) => op.op !== "set_document")).toBe(true);
  const applied = applyAnyGameOps(before, forward);
  expect(applied).toEqual(after);
  const undone = applyAnyGameOps(applied, inverse);
  expect(undone).toEqual(before);
  expect(applyAnyGameOps(undone, forward)).toEqual(after);
}

it.each(COMPONENT_CONTROLS)("round-trips $component optional deletion through public JSON operations", ({ component, remove, value }) => {
  const before = fixture(component, value);
  const after = gameDocument.parse({ ...before, scenes: before.scenes.map((scene) => ({ ...scene,
    entities: scene.entities.map((entity) => {
      if (entity.id !== "component-control") { return entity; }
      const fields: Record<string, unknown> = Object.fromEntries(Object.entries(entity));
      if (remove === null) { delete fields[component]; }
      else {
        const existing = fields[component];
        if (typeof existing !== "object" || existing === null) { throw new Error("Fixture component missing"); }
        fields[component] = Object.fromEntries(Object.entries(existing).filter(([key]) => key !== remove));
      }
      return fields;
    }) })) });
  roundTrip(before, after);
});

it("removes one animator clip key while preserving the remaining clip", () => {
  const clip = { frames: [{ x: 0, y: 0, width: 1, height: 1 }], ticksPerFrame: 1 };
  const before = fixture("animator", { ...clip, clips: { idle: clip, run: clip } });
  const after = structuredClone(before);
  const control = after.scenes[0].entities.find((entity) => entity.id === "component-control");
  if (!control?.animator?.clips) { throw new Error("Fixture clips missing"); }
  delete control.animator.clips.idle;
  roundTrip(before, after);
});

it("replaces tile child options and patrol options through their array boundaries", () => {
  const before = fixture("tilemap", { assetId: "control-image", tiles: [{ x: 0, y: 0, width: 1, height: 1, solid: false, oneWay: true }] });
  const control = before.scenes[0].entities.find((entity) => entity.id === "component-control");
  if (!control?.tilemap) { throw new Error("Fixture tilemap missing"); }
  control.body2d = { type: "kinematic", velocity: { x: 0, y: 0 } };
  control.behaviors = [{ kind: "patrol", speed: 1, distance: 2, axis: "x", turnAtLedges: true }];
  const after = structuredClone(before);
  const next = after.scenes[0].entities.find((entity) => entity.id === control.id);
  if (!next?.tilemap || next.behaviors[0]?.kind !== "patrol") { throw new Error("Fixture replacement missing"); }
  delete next.tilemap.tiles[0].oneWay;
  delete next.behaviors[0].turnAtLedges;
  roundTrip(before, after);
});
