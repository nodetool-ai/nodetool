import { z } from "zod";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { applyGameOps, createTopDownRoomGame, gameDocumentOp, GameOpError } from "@nodetool-ai/game-runtime";
import type { HeadlessSurfaceBridge, ToolLoopEvalCase } from "../tool-loop-eval.js";

const SCRIPT_PARAMS_EVAL_SOURCE = "(input) => ({ state: input.params, commands: [] })";

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
  id: "script-parameters",
  description: "Tune a script's declared inspector parameters through set_script_params without editing its source.",
  objective: "The player's script declares speed and target params. Set speed to 6 and target to the gem entity. Do not change the script source.",
  createBridge: () => {
    const base = createTopDownRoomGame("script-params-eval");
    return createGameToolBridge(gameDocument.parse({ ...base, schemaVersion: 4, engineVersion: "3", scenes: base.scenes.map((scene) => ({ ...scene,
      entities: scene.entities.map((entity) => entity.id === "player" ? { ...entity, behaviors: [...entity.behaviors, { kind: "script",
        source: SCRIPT_PARAMS_EVAL_SOURCE, params: { speed: { type: "number", default: 2, minimum: 0, maximum: 10 }, target: { type: "entity" } } }] } : entity) })) }));
  },
  systemPrompt: "Use get_native_game and edit_native_game. set_script_params {entity_id, index, values} sets declared script params by behavior index.",
  expect: {
    requiredTools: ["edit_native_game"], noErrorResults: true, minToolCalls: 1, maxToolCalls: 5,
    finalState: [{ name: "playerScriptParams", detail: "The player's script values or source differ from the request.",
      test: document => {
        const script = document.scenes[0].entities.find(entity => entity.id === "player")?.behaviors.find(behavior => behavior.kind === "script");
        return z.object({ source: z.literal(SCRIPT_PARAMS_EVAL_SOURCE), values: z.strictObject({ speed: z.literal(6), target: z.literal("gem") }) }).safeParse(script).success;
      } }]
  }
}];
