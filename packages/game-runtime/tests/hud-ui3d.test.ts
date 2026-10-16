import { describe, expect, it } from "vitest";
import { gameDocument, gameDocument3D, gameEntity3D, gameInputFrame3D, gameSnapshot3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps3D, createGameSession3D, createScriptedGameSession, createTopDownRoomGame, validateGame3D } from "../src/index.js";
import { blockout } from "./fixtures-game3d.js";

const idle = gameInputFrame3D.parse({ pressed: [] });
const next = gameInputFrame3D.parse({ pressed: ["next"], justPressed: ["next"] });

const HUD = {
  nodes: [
    { kind: "panel", id: "scorePanel", anchor: { x: 1, y: 0 }, offset: { x: -16, y: 16 }, width: 160, height: 40, color: "#101820" },
    { kind: "text", id: "score", parent: "scorePanel", anchor: { x: 0.5, y: 0.5 }, text: "Score 0", size: 18 },
    { kind: "bar", id: "health", offset: { x: 16, y: 16 }, width: 200, height: 16, source: { kind: "health", entityId: "player" } },
    { kind: "bar", id: "charge", offset: { x: 16, y: 40 }, width: 200, height: 8, max: 10 },
    { kind: "button", id: "pause", anchor: { x: 0.5, y: 1 }, offset: { x: 0, y: -16 }, width: 96, height: 40, action: "pause", text: "Pause" }
  ]
};

const SET_HUD = `({ tick, pressed }) => ({ state: 1, commands: [
  { kind: 'ui', id: 'score', text: 'Score ' + (tick + 1) * 10 },
  { kind: 'ui', id: 'charge', value: 4 },
  ...(tick === 1 ? [{ kind: 'ui', id: 'pause', visible: false }] : []),
  ...(pressed.includes('next') ? [{ kind: 'sceneTransition', sceneId: 'second' }] : [])
] })`;

/** The blockout with a document HUD, a player with 5 health running `script`, and a second scene where it has 3. */
function game(script: string): GameDocument3D {
  const base = blockout();
  const [scene] = base.scenes;
  const withPlayer = (maximum: number, behaviors: unknown[]) => ({ ...scene, entities: scene.entities.map((entity) => entity.id === "player"
    ? gameEntity3D.parse({ ...entity, behaviors: [{ kind: "health", maximum }, ...behaviors] }) : entity) });
  return gameDocument3D.parse({ ...base, inputActions: ["jump", "pause", "next"], ui: HUD, scenes: [
    withPlayer(5, [{ kind: "script", maxTickMs: 20, source: script }]),
    { ...withPlayer(3, []), id: "second", name: "Second" }
  ] });
}

describe("3D HUD widget tree", () => {
  it("resolves the document tree with entity health before any script runs", async () => {
    const session = await createGameSession3D(game("() => ({ state: 1, commands: [] })"), 1);
    try {
      const ui = session.frame().ui;
      expect(ui?.nodes.map((node) => node.id)).toEqual(["scorePanel", "score", "health", "charge", "pause"]);
      expect(ui?.nodes.find((node) => node.id === "health")).toMatchObject({ value: 5, max: 5 });
      expect(ui).toMatchObject({ safeArea: true, focusNavigation: false });
    } finally { session.dispose(); }
  });

  it("applies ui commands and restores them from a snapshot", async () => {
    const document = game(SET_HUD);
    const session = await createGameSession3D(document, 1);
    try {
      session.step(idle);
      const frame = session.step(idle).frame;
      expect(frame.ui?.nodes.find((node) => node.id === "score")).toMatchObject({ text: "Score 20" });
      expect(frame.ui?.nodes.find((node) => node.id === "charge")).toMatchObject({ value: 4, max: 10 });
      expect(frame.ui?.nodes.find((node) => node.id === "pause")).toMatchObject({ visible: false });
      expect(session.snapshot().ui).toEqual({ score: { text: "Score 20" }, charge: { value: 4 }, pause: { visible: false } });
      const restored = await createGameSession3D(document, 1, session.snapshot());
      try {
        expect(restored.frame().ui).toEqual(session.frame().ui);
        expect(restored.step(idle).frame).toEqual(session.step(idle).frame);
      } finally { restored.dispose(); }
    } finally { session.dispose(); }
  });

  it("clears script changes on a scene transition and reads the new scene's health", async () => {
    const session = await createGameSession3D(game(SET_HUD), 1);
    try {
      session.step(idle);
      const frame = session.step(next).frame;
      expect(frame.sceneId).toBe("second");
      expect(session.snapshot().ui).toBeUndefined();
      expect(frame.ui?.nodes.find((node) => node.id === "health")).toMatchObject({ value: 3, max: 3 });
      expect(frame.ui?.nodes.find((node) => node.id === "score")).toMatchObject({ text: "Score 0" });
    } finally { session.dispose(); }
  });

  it("fails the step when a script changes a missing node or a field the node does not have", async () => {
    const missing = await createGameSession3D(game("() => ({ state: 1, commands: [{ kind: 'ui', id: 'nope', visible: false }] })"), 1);
    try { expect(() => missing.step(idle)).toThrow("Game script changes missing HUD node nope"); } finally { missing.dispose(); }
    const wrong = await createGameSession3D(game("() => ({ state: 1, commands: [{ kind: 'ui', id: 'health', text: 'x' }] })"), 1);
    try { expect(() => wrong.step(idle)).toThrow("Game script sets text on HUD bar health"); } finally { wrong.dispose(); }
  });

  it("leaves frames and snapshots of games without a HUD tree unchanged", async () => {
    const session = await createGameSession3D(blockout(), 1);
    try {
      session.step(idle);
      expect(Object.keys(session.frame())).not.toContain("ui");
      expect(Object.keys(session.snapshot())).not.toContain("ui");
    } finally { session.dispose(); }
  });

  it("keys saved overrides by HUD node ids of at most 64 characters", async () => {
    const session = await createGameSession3D(game(SET_HUD), 1);
    const shape = session.snapshot();
    session.dispose();
    expect(gameSnapshot3D.safeParse({ ...shape, ui: { ["n".repeat(64)]: { text: "ok" } } }).success).toBe(true);
    expect(gameSnapshot3D.safeParse({ ...shape, ui: { ["n".repeat(65)]: { text: "ok" } } }).success).toBe(false);
  });

  it("replays ui commands from tick 60 without divergence", async () => {
    const document = game(SET_HUD);
    const session = await createGameSession3D(document, 1);
    try {
      for (let tick = 0; tick < 60; tick++) { session.step(idle); }
      const atSixty = session.snapshot();
      // Script timings differ between runs, so the replay compares events and frames.
      const tail = Array.from({ length: 60 }, () => session.step(idle)).map(({ events, frame }) => ({ events, frame }));
      const resumed = await createGameSession3D(document, 1, atSixty);
      try {
        expect(Array.from({ length: 60 }, () => resumed.step(idle)).map(({ events, frame }) => ({ events, frame }))).toEqual(tail);
        expect(resumed.snapshot()).toEqual(session.snapshot());
      } finally { resumed.dispose(); }
    } finally { session.dispose(); }
  });

  it("reports tree reference problems through validateGame3D", () => {
    const document = game("() => ({ state: 1, commands: [] })");
    const broken = gameDocument3D.parse({ ...document, ui: { nodes: [
      { kind: "button", id: "go", action: "fly", width: 10, height: 10 },
      { kind: "image", id: "logo", assetId: "logo", width: 4, height: 4 },
      { kind: "bar", id: "boss", width: 4, height: 4, source: { kind: "health", entityId: "camera" } }
    ] } });
    const result = validateGame3D(broken);
    expect(result.diagnostics.filter((issue) => issue.code === "invalid_ui").map((issue) => issue.message)).toEqual([
      "HUD button go presses undeclared input action fly",
      "HUD image logo uses missing image asset logo",
      "HUD bar boss reads health of camera, which has no health behavior in this scene"
    ]);
  });

  it("sets and clears the document and scene trees through set_ui", () => {
    const document = game("() => ({ state: 1, commands: [] })");
    const tree = { nodes: [{ kind: "text" as const, id: "title", text: "Level 2" }] };
    const edited = applyGameOps3D(document, [{ op: "set_ui", scene_id: "second", ui: tree }, { op: "set_ui", ui: null }]);
    expect(edited.ui).toBeUndefined();
    expect(edited.scenes[1].ui).toEqual(tree);
    expect(() => applyGameOps3D(document, [{ op: "set_ui", ui: { nodes: [{ kind: "button", id: "b", action: "fly", width: 1, height: 1 }] } }]))
      .toThrow("HUD button b presses undeclared input action fly");
    expect(() => applyGameOps3D(document, [{ op: "set_ui", scene_id: "missing", ui: tree }])).toThrow("Scene missing does not exist");
  });
});

describe("HUD commands from onDestroy", () => {
  const destroyHooks = `({
    onUpdate(input) { return { state: 1, commands: input.tick === 2 ? [{ kind: 'despawn', entityId: input.entity.id }] : [] }; },
    onDestroy() { return { commands: [{ kind: 'ui', id: 'banner', text: 'gone', visible: true }] }; }
  })`;

  it("changes the HUD in 2D", async () => {
    const base = createTopDownRoomGame("a".repeat(32));
    const document = gameDocument.parse({ ...base, ui: { nodes: [{ kind: "text", id: "banner", text: "here", visible: false }] },
      scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => entity.id === "gem"
        ? { ...entity, behaviors: [...entity.behaviors, { kind: "script", maxTickMs: 20, source: destroyHooks }] } : entity) })) });
    const session = await createScriptedGameSession(document, 1);
    try {
      const frames = Array.from({ length: 5 }, () => session.step({ pressed: [], justPressed: [] }).frame);
      expect(frames[2].ui?.nodes[0]).toMatchObject({ text: "here", visible: false });
      expect(frames[3].ui?.nodes[0]).toMatchObject({ text: "gone", visible: true });
      expect(session.snapshot().ui).toEqual({ banner: { text: "gone", visible: true } });
    } finally { session.dispose(); }
  });

  it("changes the HUD in 3D", async () => {
    const base = blockout();
    const document = gameDocument3D.parse({ ...base, ui: { nodes: [{ kind: "text", id: "banner", text: "here", visible: false }] },
      scenes: base.scenes.map((scene) => ({ ...scene, entities: [...scene.entities,
        { id: "gem", transform3d: { position: { x: 4, y: 1, z: 0 } }, behaviors: [{ kind: "script", maxTickMs: 20, source: destroyHooks }] }] })) });
    const session = await createGameSession3D(document, 1);
    try {
      const frames = Array.from({ length: 5 }, () => session.step(idle).frame);
      expect(frames[2].ui?.nodes[0]).toMatchObject({ text: "here", visible: false });
      expect(frames[3].ui?.nodes[0]).toMatchObject({ text: "gone", visible: true });
      expect(session.snapshot().ui).toEqual({ banner: { text: "gone", visible: true } });
    } finally { session.dispose(); }
  });
});
