import { describe, expect, it } from "vitest";
import { gameInputFrame3D, type GameAnimationGraph3D, type GameDocument3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import { createGameSession3D } from "../src/session3d.js";
import { applyGameOps3D } from "../src/document-ops3d.js";
import { validateGame3D } from "../src/validate3d.js";
import { animationMotionWeights3D } from "../src/systems/animation-graph3d.js";
import { GAME_SCRIPT_TYPES_3D } from "../src/script-types3d.js";
import { blockout } from "./fixtures-game3d.js";

const input = gameInputFrame3D.parse({ pressed: [] });

function locomotionGraph(): GameAnimationGraph3D {
  return {
    parameters: { speed: { kind: "float", default: 0 }, jump: { kind: "trigger" }, wave: { kind: "trigger" } },
    layers: [
      { id: "base", mode: "override", weight: 1, initialState: "move", states: {
        move: { motion: { kind: "blend1d", parameter: "speed", points: [{ value: 0, clip: "idle" }, { value: 2, clip: "walk" }, { value: 6, clip: "run" }] }, speed: 1, loop: true },
        jump: { motion: { kind: "clip", clip: "jump" }, speed: 1, loop: false }
      }, transitions: [
        { from: "*", to: "jump", conditions: [{ parameter: "jump", op: "set" }], durationTicks: 4 },
        { from: "jump", to: "move", conditions: [], exitTicks: 20, durationTicks: 6 }
      ] },
      { id: "upper", mode: "additive", weight: 0.5, mask: ["node:1"], initialState: "rest", states: {
        rest: { motion: { kind: "clip", clip: "idle" }, speed: 1, loop: true },
        wave: { motion: { kind: "clip", clip: "wave" }, speed: 2, loop: false }
      }, transitions: [
        { from: "rest", to: "wave", conditions: [{ parameter: "wave", op: "set" }], durationTicks: 0 },
        { from: "wave", to: "rest", conditions: [], exitTicks: 30, durationTicks: 0 }
      ] }
    ]
  };
}

/** The player ramps `speed` by 0.1 per tick and fires `jump` at tick 70 and `wave` at tick 72. */
function animatedDocument(source = "input=>({state:null,commands:[{kind:'setAnimParam',name:'speed',value:Math.min(6,input.tick*0.1)},...(input.tick===70?[{kind:'setAnimParam',name:'jump',value:true}]:[]),...(input.tick===72?[{kind:'setAnimParam',name:'wave',value:true}]:[])]})"): GameDocument3D {
  const document = blockout();
  document.assets.hero = { mediaKind: "model", assetId: "hero", digest: "digest", required: true, format: "glb", preparationVersion: "1",
    bounds: { min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 2, z: 0.5 } }, nodeIds: ["node:0", "node:1"], clipIds: ["clip:0", "clip:1", "clip:2", "clip:3"],
    geometryBytes: 1, textureBytes: 0, triangles: 1, supportedExtensions: [] };
  document.animationGraphs = { locomotion: locomotionGraph() };
  const player = document.scenes[0].entities.find((entity) => entity.id === "player");
  if (!player) { throw new Error("Player fixture is missing"); }
  player.model = { assetId: "hero", castShadow: true, receiveShadow: true };
  player.animator3d = { clips: { idle: "clip:0", run: "clip:1", jump: "clip:2", walk: "clip:3", wave: "clip:3" }, playbackRate: 1, loop: true, transitionTicks: 6, graph: "locomotion" };
  player.behaviors = [{ kind: "script", maxTickMs: 50, maxCommands: 16, source }];
  return document;
}

function playerPose(frame: GameRenderFrame3D) {
  const pose = frame.entities.find((entity) => entity.entityId === "player")?.animationPose;
  if (!pose) { throw new Error("Player pose is missing"); }
  return pose;
}

describe("3D animation graph runtime", () => {
  it("blends idle, walk and run by the speed parameter", async () => {
    const session = await createGameSession3D(animatedDocument(), 1);
    try {
      const weights: Record<number, Record<string, number>> = {};
      for (let tick = 1; tick <= 65; tick += 1) {
        const { frame } = session.step(input);
        if ([1, 11, 21, 41, 61].includes(tick)) {
          weights[tick] = Object.fromEntries(playerPose(frame).layers[0].current.clips.map((clip) => [clip.clipId, Number(clip.weight.toFixed(6))]));
        }
        expect(frame.entities.find((entity) => entity.entityId === "player")?.animation).toBeUndefined();
      }
      // Scripts see the previous tick, so frame N carries speed (N - 1) * 0.1.
      expect(weights).toEqual({
        1: { "clip:0": 1 },
        11: { "clip:0": 0.5, "clip:3": 0.5 },
        21: { "clip:3": 1 },
        41: { "clip:3": 0.5, "clip:1": 0.5 },
        61: { "clip:1": 1 }
      });
      expect(session.snapshot().entities.find((entity) => entity.id === "player")?.animationGraph).toMatchObject({
        graphId: "locomotion", parameters: { speed: 6, jump: false, wave: false }, layers: [{ state: "move", enteredTick: 0 }, { state: "rest", enteredTick: 0 }]
      });
    } finally { session.dispose(); }
  });

  it("fires and consumes triggers, crossfades, and returns after exit ticks", async () => {
    const session = await createGameSession3D(animatedDocument(), 1);
    try {
      for (let tick = 1; tick <= 71; tick += 1) { session.step(input); }
      const layers = () => session.snapshot().entities.find((entity) => entity.id === "player")?.animationGraph;
      expect(layers()?.parameters.jump).toBe(false);
      expect(layers()?.layers[0]).toEqual({ state: "jump", enteredTick: 71, previousState: "move", previousEnteredTick: 0, transitionTicks: 4 });
      const pose = playerPose(session.step(input).frame).layers[0];
      expect(pose).toMatchObject({ current: { startTick: 71, loop: false, clips: [{ clipId: "clip:2", weight: 1 }] }, previous: { startTick: 0 }, transitionTicks: 4 });
      session.step(input);
      expect(layers()?.layers[1]).toEqual({ state: "wave", enteredTick: 73 });
      expect(playerPose(session.frame()).layers[1]).toMatchObject({ mode: "additive", weight: 0.5, mask: ["node:1"], current: { rate: 2 } });
      for (let tick = 74; tick <= 76; tick += 1) { session.step(input); }
      expect(layers()?.layers[0]).toEqual({ state: "jump", enteredTick: 71 });
      for (let tick = 77; tick <= 91; tick += 1) { session.step(input); }
      expect(layers()?.layers[0]).toMatchObject({ state: "move", enteredTick: 91, previousState: "jump" });
      for (let tick = 92; tick <= 103; tick += 1) { session.step(input); }
      expect(layers()?.layers[1]).toEqual({ state: "rest", enteredTick: 103 });
    } finally { session.dispose(); }
  });

  it("replays identically from a snapshot taken mid-transition", async () => {
    const document = animatedDocument();
    const full = await createGameSession3D(document, 1);
    try {
      const frames: GameRenderFrame3D[] = [];
      let saved: ReturnType<typeof full.snapshot> | undefined;
      for (let tick = 1; tick <= 120; tick += 1) {
        frames.push(full.step(input).frame);
        if (tick === 73) { saved = full.snapshot(); }
      }
      expect(saved?.entities.find((entity) => entity.id === "player")?.animationGraph?.layers[0].previousState).toBe("move");
      const resumed = await createGameSession3D(document, 1, saved);
      try {
        expect(Array.from({ length: 47 }, () => resumed.step(input).frame)).toEqual(frames.slice(73));
        expect(resumed.snapshot()).toEqual(full.snapshot());
      } finally { resumed.dispose(); }
    } finally { full.dispose(); }
  });

  it("maps playAnimation to a direct base-layer state change", async () => {
    const document = animatedDocument("input=>({state:null,commands:input.tick===5?[{kind:'playAnimation',clip:'jump'}]:input.tick===15?[{kind:'playAnimation',clip:'move'}]:[]})");
    const session = await createGameSession3D(document, 1);
    try {
      for (let tick = 1; tick <= 6; tick += 1) { session.step(input); }
      const graph = () => session.snapshot().entities.find((entity) => entity.id === "player")?.animationGraph;
      expect(graph()?.layers[0]).toEqual({ state: "jump", enteredTick: 6, previousState: "move", previousEnteredTick: 0, transitionTicks: 6 });
      for (let tick = 7; tick <= 16; tick += 1) { session.step(input); }
      expect(graph()?.layers[0]).toEqual({ state: "move", enteredTick: 16, previousState: "jump", previousEnteredTick: 6, transitionTicks: 6 });
      const unknown = await createGameSession3D(animatedDocument("input=>({state:null,commands:[{kind:'playAnimation',clip:'missing'}]})"), 1);
      try { expect(() => unknown.step(input)).toThrow("Unknown animation missing"); } finally { unknown.dispose(); }
    } finally { session.dispose(); }
  });

  it("rejects parameters the graph does not declare or with the wrong type", async () => {
    for (const [command, message] of [
      ["{kind:'setAnimParam',name:'missing',value:1}", "Unknown animation parameter missing"],
      ["{kind:'setAnimParam',name:'speed',value:true}", "expects a number"],
      ["{kind:'setAnimParam',name:'jump',value:1}", "expects a boolean"]
    ] as const) {
      const session = await createGameSession3D(animatedDocument(`input=>({state:null,commands:[${command}]})`), 1);
      try { expect(() => session.step(input)).toThrow(message); } finally { session.dispose(); }
    }
  });

  it("declares setAnimParam for 3D scripts", () => {
    expect(GAME_SCRIPT_TYPES_3D).toContain('{ kind: "setAnimParam"; name: string; value: number | boolean }');
  });

  it("computes gradient-band weights for 2D blends", () => {
    const motion = { kind: "blend2d" as const, parameterX: "x", parameterY: "y", points: [
      { x: 0, y: 0, clip: "idle" }, { x: 0, y: 1, clip: "forward" }, { x: 1, y: 0, clip: "right" }, { x: -1, y: 0, clip: "left" }] };
    expect(Object.fromEntries(animationMotionWeights3D(motion, { x: 0, y: 0 }))).toEqual({ idle: 1 });
    expect(Object.fromEntries(animationMotionWeights3D(motion, { x: 0, y: 1 }))).toEqual({ forward: 1 });
    const half = Object.fromEntries(animationMotionWeights3D(motion, { x: 0.5, y: 0 }));
    expect(half.idle).toBeCloseTo(0.5); expect(half.right).toBeCloseTo(0.5);
    expect([...animationMotionWeights3D(motion, { x: 0.3, y: 0.4 }).values()].reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
  });

  it("leaves entities without a graph on the clip-only path", async () => {
    const document = animatedDocument("input=>({state:null,commands:input.tick===1?[{kind:'playAnimation',clip:'run'}]:[]})");
    const player = document.scenes[0].entities.find((entity) => entity.id === "player");
    if (!player?.animator3d) { throw new Error("Player animator is missing"); }
    delete player.animator3d.graph;
    const session = await createGameSession3D(document, 1);
    try {
      session.step(input);
      const { frame } = session.step(input);
      const entity = frame.entities.find((candidate) => candidate.entityId === "player");
      expect(entity?.animationPose).toBeUndefined();
      expect(entity?.animation).toMatchObject({ clipId: "clip:1", startTick: 2 });
      expect(session.snapshot().entities.find((candidate) => candidate.id === "player")?.animationGraph).toBeUndefined();
    } finally { session.dispose(); }
  });
});

describe("3D animation graph validation and ops", () => {
  const codes = (document: GameDocument3D) => validateGame3D(document).diagnostics.map((diagnostic) => diagnostic.code);

  it("accepts the locomotion fixture", () => {
    expect(validateGame3D(animatedDocument()).diagnostics).toEqual([]);
  });

  it("reports broken graph references", () => {
    const document = animatedDocument();
    const graph = document.animationGraphs?.locomotion;
    if (!graph) { throw new Error("Graph fixture is missing"); }
    graph.layers[0].transitions.push({ from: "nowhere", to: "missing", conditions: [{ parameter: "speed", op: "set" }], durationTicks: 1 });
    graph.layers[0].transitions.push({ from: "move", to: "jump", conditions: [], durationTicks: 1 });
    graph.layers[0].transitions.push({ from: "move", to: "jump", conditions: [{ parameter: "speed", op: "gt" }], durationTicks: 1 });
    graph.layers[1].initialState = "absent";
    graph.layers.push({ ...graph.layers[1], id: "base" });
    const motion = graph.layers[0].states.move.motion;
    if (motion.kind !== "blend1d") { throw new Error("Blend fixture is missing"); }
    motion.points[2].value = 1;
    motion.parameter = "jump";
    expect(codes(document)).toEqual(expect.arrayContaining([
      "missing_animation_state", "invalid_animation_condition", "unconditional_animation_transition", "duplicate_animation_layer",
      "invalid_blend_points", "invalid_animation_parameter"
    ]));
  });

  it("reports animator references the graph or model cannot satisfy", () => {
    const document = animatedDocument();
    const player = document.scenes[0].entities.find((entity) => entity.id === "player");
    if (!player?.animator3d) { throw new Error("Player animator is missing"); }
    delete player.animator3d.clips.walk;
    player.animator3d.initialClip = "idle";
    const mask = document.animationGraphs?.locomotion.layers[1];
    if (mask) { mask.mask = ["node:9"]; }
    expect(codes(document)).toEqual(expect.arrayContaining(["missing_animation_clip", "animation_graph_conflict", "missing_model_node"]));
    player.animator3d.graph = "unknown";
    expect(codes(document)).toContain("missing_animation_graph");
  });

  it("sets and removes graphs through document ops", () => {
    const document = animatedDocument();
    const graph = document.animationGraphs?.locomotion;
    if (!graph) { throw new Error("Graph fixture is missing"); }
    delete document.animationGraphs;
    const player = document.scenes[0].entities.find((entity) => entity.id === "player");
    if (!player?.animator3d) { throw new Error("Player animator is missing"); }
    delete player.animator3d.graph;
    const withGraph = applyGameOps3D(document, [
      { op: "set_animation_graph", graph_id: "locomotion", graph },
      { op: "update_entity", entity_id: "player", set: { animator3d: { graph: "locomotion" } } }
    ]);
    expect(withGraph.animationGraphs?.locomotion.layers).toHaveLength(2);
    expect(() => applyGameOps3D(withGraph, [{ op: "remove_animation_graph", graph_id: "locomotion" }])).toThrow("Animation graph locomotion does not exist");
    const removed = applyGameOps3D(withGraph, [
      { op: "update_entity", entity_id: "player", set: { animator3d: { graph: null } } },
      { op: "remove_animation_graph", graph_id: "locomotion" }
    ]);
    expect(removed.animationGraphs).toBeUndefined();
    expect(() => applyGameOps3D(removed, [{ op: "remove_animation_graph", graph_id: "locomotion" }])).toThrow("Animation graph does not exist");
  });
});
