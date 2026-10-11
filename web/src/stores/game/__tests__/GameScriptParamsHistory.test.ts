import { z } from "zod";
import { anyGameDocumentOp, applyAnyGameOps, createNative3DGame, createTopDownRoomGame, type AnyGameDocumentOp } from "@nodetool-ai/game-runtime";
import type { AnyGameDocument } from "@nodetool-ai/protocol";

import { diffAnyGameDocuments } from "../diffAnyGameDocuments";
import { getGameDraftStore } from "../GameDraftStore";

function wire(ops: readonly AnyGameDocumentOp[]): AnyGameDocumentOp[] {
  return z.array(anyGameDocumentOp).parse(JSON.parse(JSON.stringify(ops)));
}

const SOURCE = "(input) => ({ state: input.params, commands: [] })";
const PARAMS = { speed: { type: "number", default: 1, minimum: 0, maximum: 10 }, mode: { type: "enum", options: ["walk", "run"] } };

// Script params need 2D schema 4.
const create2D = (id: string): AnyGameDocument => ({ ...createTopDownRoomGame(id), schemaVersion: 4, engineVersion: "3" });

it.each([{ name: "2D", create: create2D }, { name: "3D", create: createNative3DGame }])(
  "$name round-trips script param edits through JSON diffs and labelled undo/redo", ({ name, create }) => {
    const base = create(`script-params-history-${name}`);
    const target = { scene_id: base.entrySceneId, entity_id: base.scenes[0].entities[0].id };
    const scripted = applyAnyGameOps(base, [anyGameDocumentOp.parse({ op: "add_behavior", ...target, index: 0, behavior: { kind: "script", source: SOURCE } })]);
    const edit = (document: AnyGameDocument, patch: Record<string, unknown>): AnyGameDocument =>
      applyAnyGameOps(document, [anyGameDocumentOp.parse({ op: "set_script_params", ...target, index: 0, ...patch })]);
    const declared = edit(scripted, { params: PARAMS });
    const stages = [scripted, declared, edit(declared, { values: { speed: 4, mode: "run" } })];
    stages.push(edit(stages[2], { values: { speed: null } }));
    stages.push(edit(stages[3], { params: null }));
    for (let index = 1; index < stages.length; index += 1) {
      const before = stages[index - 1];
      const after = stages[index];
      const forward = wire(diffAnyGameDocuments(before, after));
      const inverse = wire(diffAnyGameDocuments(after, before));
      expect(forward.length).toBeGreaterThan(0);
      expect([...forward, ...inverse].every((op) => op.op !== "set_document")).toBe(true);
      expect(applyAnyGameOps(before, forward)).toEqual(after);
      expect(applyAnyGameOps(after, inverse)).toEqual(before);
      const store = getGameDraftStore(`${base.id}:params:${index}`);
      store.getState().load(before, "baseline");
      store.getState().apply(wire([anyGameDocumentOp.parse({ op: "set_script_params", ...target, index: 0,
        ...(index === 1 ? { params: PARAMS } : index === 2 ? { values: { speed: 4, mode: "run" } } : index === 3 ? { values: { speed: null } } : { params: null }) })]));
      expect(store.getState().document).toEqual(after);
      expect(store.getState().commandHistory.past.at(-1)?.label).toBe("Change Script Parameters");
      store.getState().undo();
      expect(store.getState().document).toEqual(before);
      store.getState().redo();
      expect(store.getState().document).toEqual(after);
    }
  });
