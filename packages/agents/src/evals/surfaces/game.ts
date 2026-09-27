import { z } from "zod";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { applyGameOps, gameDocumentOp, GameOpError } from "@nodetool-ai/game-runtime";
import type { HeadlessSurfaceBridge } from "../tool-loop-eval.js";

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
