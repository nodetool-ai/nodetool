import { z } from "zod";
import { describe, expect, it } from "vitest";
import { anyGameDocumentOp, applyAnyGameOps, createTopDownRoomGame, validateAnyGame } from "../src/index.js";
import { blockout } from "./fixtures-game3d.js";

const cases = [
  { dimension: "2D", document: () => ({ ...createTopDownRoomGame("metadata-ops"), schemaVersion: 4 as const, engineVersion: "3" as const }) },
  { dimension: "3D", document: blockout }
];

describe.each(cases)("$dimension public entity metadata operations", ({ document }) => {
  it("authors tags and JSON properties without replacing the document or mutating its source", () => {
    const before = document();
    expect(validateAnyGame(before).valid).toBe(true);
    const scene = before.scenes[0];
    const actor = scene.entities.find((entity) => entity.id === "player");
    if (!actor) { throw new Error("Metadata fixture must contain the player"); }
    const source = structuredClone(before);
    const wire = z.array(anyGameDocumentOp).parse(JSON.parse(JSON.stringify([
      { op: "update_entity", scene_id: scene.id, entity_id: actor.id,
        set: { tags: ["hero"], props: { lives: 3, quest: { checkpoint: null, completed: false } } } }
    ])));
    const updated = applyAnyGameOps(before, wire);
    expect(updated.scenes[0].entities.find((entity) => entity.id === actor.id)).toMatchObject({
      tags: ["hero"], props: { lives: 3, quest: { checkpoint: null, completed: false } }
    });
    expect(validateAnyGame(updated).valid).toBe(true);
    expect(updated.id).toBe(before.id);
    expect(updated.revision).toBe(before.revision);
    expect(before).toEqual(source);
  });
  it("replaces complete metadata maps and roundtrips deletion and inverse through public JSON", () => {
    const before = document();
    const scene = before.scenes[0];
    const target = { scene_id: scene.id, entity_id: "player" };
    const apply = (source: typeof before, set: unknown) => applyAnyGameOps(source,
      z.array(anyGameDocumentOp).parse(JSON.parse(JSON.stringify([{ op: "update_entity", ...target, set }]))));
    const initial = apply(before, { tags: ["hero"], props: { nested: { old: 1, nullable: null }, removed: 2 } });
    const replaced = apply(initial, { props: { nested: { nullable: null } } });
    expect(replaced.scenes[0].entities.find((entity) => entity.id === "player")).toMatchObject({ tags: ["hero"], props: { nested: { nullable: null } } });
    const parsedEntity = replaced.scenes[0].entities.find((entity) => entity.id === "player");
    expect(parsedEntity).toHaveProperty("props", { nested: { nullable: null } });
    const deleted = apply(replaced, { tags: null, props: null });
    const deletedEntity = deleted.scenes[0].entities.find((entity) => entity.id === "player");
    expect(deletedEntity).not.toHaveProperty("tags");
    expect(deletedEntity).not.toHaveProperty("props");
    expect(deleted).toEqual(before);
    expect(apply(deleted, { tags: ["hero"], props: { nested: { nullable: null } } })).toEqual(replaced);
    const empty = apply(before, { tags: [], props: {} });
    expect(apply(apply(empty, { tags: null, props: null }), { tags: [], props: {} })).toEqual(empty);
    expect(before.scenes[0].entities.find((entity) => entity.id === "player")).not.toHaveProperty("props");
  });

  it("rejects a malformed second public operation without changing the complete input", () => {
    const before = document();
    const original = structuredClone(before);
    const scene = before.scenes[0];
    const raw = JSON.parse(JSON.stringify([
      { op: "update_entity", scene_id: scene.id, entity_id: "player", set: { tags: ["valid-first"] } },
      { op: "update_entity", scene_id: scene.id, entity_id: "player", set: { props: { invalid: "x".repeat(65536) } } }
    ]));
    expect(() => applyAnyGameOps(before, raw)).toThrow();
    expect(before).toEqual(original);
    expect(z.array(anyGameDocumentOp).safeParse(raw).success).toBe(false);
  });

});
