import { z } from "zod";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { applyGameOps, createTopDownRoomGame, gameDocumentOp, GameOpError } from "@nodetool-ai/game-runtime";
import type { HeadlessSurfaceBridge, ToolLoopEvalCase } from "../tool-loop-eval.js";

/** Headless game editor bridge that exercises the production op reducer. */
export function createGameToolBridge(initial: GameDocument): HeadlessSurfaceBridge<GameDocument> {
  let document = gameDocument.parse(initial);
  return {
    tools: [
      {
        name: "get_native_game",
        description: "Read the current native game draft.",
        parameters: z.object({ view: z.enum(["outline", "full"]).default("outline") }),
        execute: async (args) => args.view === "full" ? { document } : {
          outline: {
            entrySceneId: document.entrySceneId,
            scenes: document.scenes.map((scene) => ({ id: scene.id, name: scene.name,
              entities: scene.entities.map((entity) => ({ id: entity.id, name: entity.name, behaviors: entity.behaviors.map((behavior) => behavior.kind) })) }))
          }
        }
      },
      {
        name: "edit_native_game",
        description: "Apply ordered native game draft ops atomically.",
        parameters: z.object({ ops: z.array(gameDocumentOp).min(1) }),
        execute: async (args) => {
          const parsed = z.array(gameDocumentOp).parse(args.ops);
          try {
            document = applyGameOps(document, parsed);
            return { document };
          } catch (error) {
            if (error instanceof GameOpError) return { error: error.message, issues: error.issues };
            throw error;
          }
        }
      }
    ],
    finalState: () => document
  };
}


export const GAME_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<GameDocument>[] = [{
  id: "entity-tags-properties",
  description: "Author native entity tags and nested JSON properties through public edit ops.",
  objective: "Give player the hero tag and properties health 10 and nested nullable null, replacing prior properties.",
  createBridge: () => createGameToolBridge({ ...createTopDownRoomGame("metadata-eval"), schemaVersion: 4, engineVersion: "3" }),
  systemPrompt: "Use get_native_game and edit_native_game. update_entity replaces tags and the whole props map. Nested null is data.",
  expect: {
    requiredTools: ["edit_native_game"], noErrorResults: true, minToolCalls: 1, maxToolCalls: 5,
    finalState: [{ name: "playerMetadata", detail: "Player tags or nested properties differ from the requested values.",
      test: document => {
        const player = document.scenes[0].entities.find(entity => entity.id === "player");
        return z.object({ tags: z.tuple([z.literal("hero")]), props: z.strictObject({ health: z.literal(10), nested: z.strictObject({ nullable: z.null() }) }) }).safeParse(player).success;
      } }]
  }
}, {
  id: "input-bindings",
  description: "Author a document input map through set_game input_bindings while other actions keep their generated defaults.",
  objective: "Bind the left action to the J key and gamepad button 14 only. Leave every other action on its default bindings.",
  createBridge: () => createGameToolBridge(createTopDownRoomGame("bindings-eval")),
  systemPrompt: "Use get_native_game and edit_native_game. set_game input_bindings replaces the whole input map: {actions: {action: [binding]}, axes: {}}. A key binding is {kind:\"key\", code} with a KeyboardEvent.code, a gamepad button is {kind:\"gamepadButton\", button}. Actions not listed keep their defaults.",
  expect: {
    requiredTools: ["edit_native_game"], noErrorResults: true, minToolCalls: 1, maxToolCalls: 5,
    finalState: [{ name: "leftBinding", detail: "The input map does not bind left to exactly KeyJ and gamepad button 14, or it binds other actions.",
      test: document => z.object({ actions: z.strictObject({ left: z.tuple([z.object({ kind: z.literal("key"), code: z.literal("KeyJ") }), z.object({ kind: z.literal("gamepadButton"), button: z.literal(14) })]) }) })
        .safeParse(document.inputBindings).success
        || z.object({ actions: z.strictObject({ left: z.tuple([z.object({ kind: z.literal("gamepadButton"), button: z.literal(14) }), z.object({ kind: z.literal("key"), code: z.literal("KeyJ") })]) }) })
          .safeParse(document.inputBindings).success }]
  }
}];
