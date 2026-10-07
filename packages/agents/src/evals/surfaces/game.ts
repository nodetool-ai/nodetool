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
  createBridge: () => createGameToolBridge(createTopDownRoomGame("metadata-eval")),
  systemPrompt: "Use get_native_game and edit_native_game. update_entity replaces tags and the whole props map. Nested null is data.",
  expect: {
    requiredTools: ["edit_native_game"], noErrorResults: true, minToolCalls: 1, maxToolCalls: 5,
    finalState: [{ name: "playerMetadata", detail: "Player tags or nested properties differ from the requested values.",
      test: document => {
        const player = document.scenes[0].entities.find(entity => entity.id === "player");
        return z.object({ tags: z.tuple([z.literal("hero")]), props: z.strictObject({ health: z.literal(10), nested: z.strictObject({ nullable: z.null() }) }) }).safeParse(player).success;
      } }]
  }
}];
