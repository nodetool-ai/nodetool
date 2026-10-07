import { z } from "zod";
import { anyGameDocumentOp, applyAnyGameOps, createNative3DGame, createTopDownRoomGame, type AnyGameDocumentOp } from "@nodetool-ai/game-runtime";
import { gameAuthoring, type AnyGameDocument } from "@nodetool-ai/protocol";

import { diffAnyGameDocuments } from "../diffAnyGameDocuments";
import { getGameDraftStore } from "../GameDraftStore";

function wire(ops: readonly AnyGameDocumentOp[]): AnyGameDocumentOp[] {
  return z.array(anyGameDocumentOp).parse(JSON.parse(JSON.stringify(ops)));
}

function metadata(document: AnyGameDocument, set: unknown): AnyGameDocumentOp {
  return anyGameDocumentOp.parse({ op: "update_entity", scene_id: document.entrySceneId,
    entity_id: document.scenes[0].entities[0].id, set });
}

it.each([
  { name: "2D", create: createTopDownRoomGame, authored: false },
  { name: "2D", create: createTopDownRoomGame, authored: true },
  { name: "3D", create: createNative3DGame, authored: false },
  { name: "3D", create: createNative3DGame, authored: true }
])(
  "$name round-trips omitted, empty and replaced metadata through JSON diffs and labelled undo/redo authored=$authored", ({ name, create, authored }) => {
    const baseline = create(`metadata-history-${name}-${authored}`);
    const initial: AnyGameDocument = authored ? { ...baseline, authoring: gameAuthoring.parse({ version: 1,
      program: { source: "return inputs.document;", inputs: { document: baseline }, seed: 1 }, baseline }) } : baseline;
    const absent = applyAnyGameOps(initial, [metadata(initial, { tags: null, props: null })]);
    const stages = [
      absent,
      applyAnyGameOps(absent, [metadata(absent, { tags: [], props: {} })]),
      applyAnyGameOps(absent, [metadata(absent, { tags: ["first", "second"], props: { retained: null, nested: { remove: 1, keep: null } } })])
    ];
    stages.push(applyAnyGameOps(stages[2], [metadata(stages[2], { tags: ["second"], props: { retained: null, nested: { keep: null } } })]));
    stages.push(absent);
    for (let index = 1; index < stages.length; index += 1) {
      const before = stages[index - 1];
      const after = stages[index];
      const forward = wire(diffAnyGameDocuments(before, after));
      const inverse = wire(diffAnyGameDocuments(after, before));
      expect(forward.length).toBeGreaterThan(0);
      expect([...forward, ...inverse].every((op) => op.op !== "set_document")).toBe(true);
      expect(applyAnyGameOps(before, forward)).toEqual(after);
      expect(applyAnyGameOps(after, inverse)).toEqual(before);
      const store = getGameDraftStore(`${initial.id}:stage:${index}`);
      store.getState().load(before, "baseline");
      store.getState().apply(forward, { label: "Edit entity metadata" });
      expect(store.getState().document).toEqual(after);
      expect(store.getState().commandHistory.past).toHaveLength(1);
      expect(applyAnyGameOps(after, wire(store.getState().commandHistory.past[0].inverseOps))).toEqual(before);
      store.getState().undo();
      expect(store.getState().document).toEqual(before);
      store.getState().redo();
      expect(store.getState().document).toEqual(after);
      expect(applyAnyGameOps(before, wire(store.getState().pendingOps))).toEqual(after);
    }
  });
