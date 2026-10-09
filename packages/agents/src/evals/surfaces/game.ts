import { z } from "zod";
import { gameDocument, gameDocument3D, type AnyGameDocument, type GameDocument, type GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps, applyGameOps3D, createNative3DGame, createTopDownRoomGame, gameDocumentOp, gameDocumentOp3D, GameOpError } from "@nodetool-ai/game-runtime";
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

/** Headless 3D game editor bridge over the production 3D op reducer. */
export function createGameToolBridge3D(initial: GameDocument3D): HeadlessSurfaceBridge<GameDocument3D> {
  let document = gameDocument3D.parse(initial);
  return {
    tools: [
      {
        name: "get_native_game",
        description: "Read the current native 3D game draft.",
        parameters: z.object({ view: z.enum(["outline", "full"]).default("outline") }),
        execute: async (args) => args.view === "full" ? { document } : {
          outline: {
            entrySceneId: document.entrySceneId,
            scenes: document.scenes.map((scene) => ({ id: scene.id, name: scene.name, environment: scene.environment,
              entities: scene.entities.map((entity) => ({ id: entity.id, name: entity.name, light: entity.light3d?.kind })) }))
          }
        }
      },
      {
        name: "edit_native_game",
        description: "Apply ordered native 3D game draft ops atomically.",
        parameters: z.object({ ops: z.array(gameDocumentOp3D).min(1) }),
        execute: async (args) => {
          const parsed = z.array(gameDocumentOp3D).parse(args.ops);
          try {
            document = applyGameOps3D(document, parsed);
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


export const GAME_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<AnyGameDocument>[] = [{
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
  id: "procedural-sky",
  description: "Author a procedural sky linked to the scene's directional light through public 3D edit ops.",
  objective: "Give the 3D scene a procedural sky whose sun follows the sun light, with turbidity 4, while keeping its background, ambient and shadow settings.",
  createBridge: () => createGameToolBridge3D(createNative3DGame("sky-eval")),
  systemPrompt: "Use get_native_game and edit_native_game. update_scene replaces the whole environment object, so send its existing fields with the new sky.",
  expect: {
    requiredTools: ["edit_native_game"], noErrorResults: true, minToolCalls: 1, maxToolCalls: 5,
    finalState: [{ name: "proceduralSky", detail: "The scene sky is not procedural, is not linked to the sun light, or lost its other environment settings.",
      test: document => {
        const initial = createNative3DGame("sky-eval").scenes[0].environment;
        const scene = document.scenes[0];
        if (document.schemaVersion !== 3 || !scene || !("environment" in scene)) { return false; }
        const { sky, ...rest } = scene.environment;
        const { sky: _initialSky, ...initialRest } = initial;
        return sky?.kind === "procedural" && sky.sunEntityId === "sun" && sky.turbidity === 4 && JSON.stringify(rest) === JSON.stringify(initialRest);
      } }]
  }
}];
