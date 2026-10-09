import { z } from "zod";
import { gameDocument, gameDocument3D, type AnyGameDocument, type GameDocument, type GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps, applyGameOps3D, createNative3DGame, createTopDownRoomGame, gameDocumentOp, gameDocumentOp3D, GameOpError } from "@nodetool-ai/game-runtime";
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
  id: "audio-mixer-buses",
  description: "Author the document audio mixer: a user bus, an asset route and an event-driven mixer snapshot.",
  objective: "Add an ambience bus under sfx at volume 0.6, play the sfx.collect slot on the ui bus, and when the player wins fade music to volume 0.2 over 30 ticks with a victory mixer snapshot.",
  createBridge: () => createGameToolBridge(createTopDownRoomGame("mixer-eval")),
  systemPrompt: "Use get_native_game and edit_native_game. set_audio {mixer} replaces document audio.mixer with buses, assetBuses, ducking, snapshots and transitions. Transitions use on {kind: win}.",
  expect: {
    requiredTools: ["edit_native_game"], noErrorResults: true, minToolCalls: 1, maxToolCalls: 5,
    finalState: [{ name: "mixer", detail: "The mixer lacks the ambience bus, the ui route or the victory transition.",
      test: document => {
        const mixer = document.audio?.mixer;
        if (!mixer) { return false; }
        const transition = mixer.transitions.find((rule) => rule.on.kind === "win");
        return mixer.buses.ambience?.parent === "sfx" && mixer.buses.ambience.volume === 0.6 && mixer.assetBuses["sfx.collect"] === "ui" &&
          transition?.fadeTicks === 30 && mixer.snapshots[transition.snapshot]?.buses.music?.volume === 0.2;
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
}, {
  id: "particle-emitter",
  description: "Author a particles component with a death sub-emitter through public edit ops.",
  objective: "Give player a particles component: a looping emitter trail at rate 20 whose particles fire 3 particles from a second emitter sparks on death. sparks does not play on start.",
  createBridge: () => createGameToolBridge({ ...createTopDownRoomGame("particles-eval"), schemaVersion: 2 }),
  systemPrompt: "Use get_native_game and edit_native_game. update_entity sets the whole particles component as { emitters: [...] }. onDeath lists { emitter, count } for emitters of the same component.",
  expect: {
    requiredTools: ["edit_native_game"], noErrorResults: true, minToolCalls: 1, maxToolCalls: 5,
    finalState: [{ name: "playerParticles", detail: "Player has no trail emitter that fires sparks on death.",
      test: document => {
        const emitters = document.scenes[0].entities.find(entity => entity.id === "player")?.particles?.emitters ?? [];
        const trail = emitters.find(emitter => emitter.id === "trail");
        const sparks = emitters.find(emitter => emitter.id === "sparks");
        return trail?.rate === 20 && trail.loop && trail.onDeath.some(sub => sub.emitter === "sparks" && sub.count === 3) && sparks?.playOnStart === false;
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

/** Headless 3D game editor bridge that exercises the production 3D op reducer. */
export function createGame3DToolBridge(initial: GameDocument3D): HeadlessSurfaceBridge<GameDocument3D> {
  let document = gameDocument3D.parse(initial);
  return {
    tools: [
      { name: "get_native_game", description: "Read the current native 3D game draft.", parameters: z.object({}), execute: async () => ({ document }) },
      {
        name: "edit_native_game",
        description: "Apply ordered native 3D game draft ops atomically.",
        parameters: z.object({ ops: z.array(gameDocumentOp3D).min(1) }),
        execute: async (args) => {
          try {
            document = applyGameOps3D(document, z.array(gameDocumentOp3D).parse(args.ops));
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

function riggedNative3DGame(): GameDocument3D {
  const document = createNative3DGame("animation-graph-eval");
  document.assets.hero = { mediaKind: "model", assetId: "hero", digest: "hero-digest", required: true, format: "glb", preparationVersion: "1",
    bounds: { min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 2, z: 0.5 } }, nodeIds: ["node:0", "node:1"], clipIds: ["clip:0", "clip:1", "clip:2"],
    geometryBytes: 1, textureBytes: 0, triangles: 1, supportedExtensions: [] };
  const visual = document.scenes[0].entities.find((entity) => entity.id === "player-visual");
  if (visual) {
    delete visual.primitive;
    visual.model = { assetId: "hero", castShadow: true, receiveShadow: true };
    visual.animator3d = { clips: { idle: "clip:0", walk: "clip:1", run: "clip:2" }, playbackRate: 1, loop: true, transitionTicks: 6 };
  }
  return document;
}

export const GAME_3D_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<GameDocument3D>[] = [{
  id: "animation-graph-locomotion",
  description: "Author a speed-driven locomotion animation graph and attach it to a rigged model through public edit ops.",
  objective: "Give player-visual an animation graph named locomotion whose base layer blends idle, walk and run by a float parameter speed (0, 2 and 6).",
  createBridge: () => createGame3DToolBridge(riggedNative3DGame()),
  systemPrompt: "Use get_native_game and edit_native_game. set_animation_graph {graph_id, graph} stores a document-level graph, and update_entity sets animator3d.graph to its ID. Blend points name animator3d.clips aliases.",
  expect: {
    requiredTools: ["edit_native_game"], noErrorResults: true, minToolCalls: 1, maxToolCalls: 6,
    finalState: [{ name: "locomotionGraph", detail: "player-visual does not play a speed blend of idle, walk and run.",
      test: (document) => {
        const animator = document.scenes[0].entities.find((entity) => entity.id === "player-visual")?.animator3d;
        const graph = animator?.graph === undefined ? undefined : document.animationGraphs?.[animator.graph];
        const base = graph?.layers[0];
        const motion = base ? base.states[base.initialState]?.motion : undefined;
        return graph?.parameters.speed?.kind === "float" && motion?.kind === "blend1d" && motion.parameter === "speed" &&
          JSON.stringify(motion.points.map((point) => [point.value, point.clip])) === JSON.stringify([[0, "idle"], [2, "walk"], [6, "run"]]);
      } }]
  }
}];
