import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSandboxModuleCatalog, discoverSandboxPack } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { anyGameDocument, gameDocument, type AnyGameDocument, type GameAuthoringProgram } from "@nodetool-ai/protocol";
import { applyAnyGameOps, createGameSession, reconcileGameAuthoring } from "@nodetool-ai/game-runtime";
import { captureGameFrame } from "@nodetool-ai/game-renderer/node";
import { bakeGameCode } from "../src/game-code-bake.js";
import { retainedRoomProgram, RETAINED_ROOM_ROUTE } from "./fixtures/game-retained-authoring/program.js";

const pack = discoverSandboxPack(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "sandbox-packs", "sandbox-game"));
if (!pack) { throw new Error("Missing game construction pack"); }
const context = new ProcessingContext({ jobId: "retained-game-proof", userId: "proof-owner",
  sandboxModuleCatalog: createSandboxModuleCatalog([pack]) });

async function construct(program: GameAuthoringProgram): Promise<AnyGameDocument> {
  const baked = await bakeGameCode(context, program);
  if (!baked.ok) { throw new Error(baked.error); }
  return anyGameDocument.parse({ ...baked.document, authoring: { version: 1, program,
    baseline: baked.document, overrides: [], suppressions: [], detached: [],
    parameters: baked.parameters, prefabs: baked.prefabs, instances: baked.instances } });
}

describe("retained game second and third edit proof", () => {
  it("preserves placement, suppression and manual content while rebuilding and replaying a win", async () => {
    const firstProgram = retainedRoomProgram();
    const initial = await construct(firstProgram);
    const edited = applyAnyGameOps(initial, [
      { op: "update_entity", scene_id: "room", entity_id: "gem", set: { transform2d: { x: 3 } } },
      { op: "remove_entity", scene_id: "room", entity_id: "gem-deleted" },
      { op: "add_entity", scene_id: "room", entity: { id: "manual-marker", transform2d: { x: -4, y: 2 } } }
    ]);
    const program = { ...firstProgram, inputs: { ...firstProgram.inputs, playerSpeed: 4, enemySpeed: 2,
      layout: [{ id: "gem-deleted", x: -3, y: 1 }, { id: "gem", x: 4, y: 0 }] } };
    const candidate = reconcileGameAuthoring(edited, await construct(program));
    expect(candidate.conflicts).toEqual([]);
    const rebuilt = gameDocument.parse(candidate.document);
    const find = (id: string) => rebuilt.scenes[0].entities.find((entity) => entity.id === id);
    expect(find("gem")?.transform2d.x).toBe(3);
    expect(find("gem-deleted")).toBeUndefined();
    expect(find("manual-marker")).toBeDefined();
    expect(find("player")?.behaviors[0]).toMatchObject({ kind: "movement", speed: 4 });
    expect(find("enemy-left")?.behaviors[0]).toMatchObject({ kind: "patrol", speed: 2 });
    expect(find("enemy-right")?.behaviors[0]).toMatchObject({ kind: "patrol", speed: 2 });
    const repeated = reconcileGameAuthoring(rebuilt, await construct(program));
    expect(repeated.conflicts).toEqual([]);
    expect(repeated.document).toEqual(rebuilt);
    const session = createGameSession(rebuilt, 23);
    let resumed: ReturnType<typeof createGameSession> | undefined;
    try {
      const initialFrame = await captureGameFrame(session.frame());
      expect([...initialFrame.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      for (const [index, input] of RETAINED_ROOM_ROUTE.entries()) {
        const step = session.step(input);
        if (resumed) {
          expect(resumed.step(input).events).toEqual(step.events);
          expect(resumed.snapshot()).toEqual(session.snapshot());
        }
        if (index === 39) { resumed = createGameSession(rebuilt, 23, session.snapshot()); }
      }
      expect(session.snapshot()).toMatchObject({ won: true, score: 1, tick: 80 });
      expect(session.snapshot().entities.find((entity) => entity.id === "gem")?.active).toBe(false);
      expect(rebuilt.scenes[0].entities.find((entity) => entity.id === "gem")).toBeDefined();
      const finalFrame = await captureGameFrame(session.frame());
      expect(finalFrame).not.toEqual(initialFrame);
      expect(finalFrame).toEqual(await captureGameFrame(resumed!.frame()));
    } finally {
      resumed?.dispose();
      session.dispose();
    }
  });
});
