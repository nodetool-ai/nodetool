import { gameAuthoring } from "@nodetool-ai/protocol";
import { anyGameDocumentOp, applyAnyGameOps, createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { diffAnyGameDocuments } from "../diffAnyGameDocuments";

describe.each([{ name: "2D", create: createTopDownRoomGame }, { name: "3D", create: createNative3DGame }])("$name ownership-only diffs", ({ name, create }) => {
  function authored() {
    const baseline = create(`wrapper-ownership-${name}`);
    return { ...baseline, authoring: gameAuthoring.parse({ version: 1,
      program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline }) };
  }
  it("uses granular JSON ownership operations forward and backward", () => {
    const before = authored();
    const after = structuredClone(before);
    after.authoring.detached.push({ sceneId: before.entrySceneId, entityId: "manual-ghost" });
    for (const [source, desired] of [[before, after], [after, before]]) {
      const ops = diffAnyGameDocuments(source, desired);
      expect(ops.length).toBeGreaterThan(0);
      expect(ops.every((op) => op.op !== "set_document")).toBe(true);
      const wire = JSON.parse(JSON.stringify(ops)).map((op: unknown) => anyGameDocumentOp.parse(op));
      expect(applyAnyGameOps(source, wire)).toEqual(desired);
    }
  });
  it("round-trips a changed entity through granular public JSON", () => {
    const before = authored();
    const after = applyAnyGameOps(before, [{ op: "update_entity", entity_id: "player", set: { name: "Changed Player" } }]);
    for (const [source, desired] of [[before, after], [after, before]]) {
      const ops = diffAnyGameDocuments(source, desired);
      expect(ops.some((op) => op.op === "update_entity")).toBe(true);
      expect(ops.every((op) => op.op !== "set_document")).toBe(true);
      const wire = JSON.parse(JSON.stringify(ops)).map((op: unknown) => anyGameDocumentOp.parse(op));
      expect(applyAnyGameOps(source, wire)).toEqual(desired);
    }
  });
  it("round-trips an authored script edit through granular public JSON", () => {
    const baseline = create(`wrapper-script-${name}`);
    const player = baseline.scenes[0].entities.find((entity) => entity.id === "player");
    if (!player) { throw new Error("Fixture player missing"); }
    const index = player.behaviors.length;
    player.behaviors.push({ kind: "script", source: "() => ({ state: {}, commands: [] })", maxCommands: 16, maxTickMs: 8 });
    const before = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
      program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline }) };
    const after = applyAnyGameOps(before, [{ op: "set_script", entity_id: "player", index, source: "() => ({ state: { edit: 0 }, commands: [] })" }]);
    for (const [source, desired] of [[before, after], [after, before]]) {
      const ops = diffAnyGameDocuments(source, desired);
      const wire = JSON.parse(JSON.stringify(ops)).map((op: unknown) => anyGameDocumentOp.parse(op));
      expect(applyAnyGameOps(source, wire)).toEqual(desired);
    }
  });
  it("retains explicit construction-definition replacement", () => {
    const before = authored();
    const after = structuredClone(before);
    after.authoring.parameters.speed = { type: "number", default: 2 };
    expect(diffAnyGameDocuments(before, after)).toEqual([{ op: "set_document", document: after }]);
  });
});
