import { describe, expect, it } from "vitest";
import { gameDocument, gameSnapshot, type GameDocument } from "@nodetool-ai/protocol";
import { applyGameOps, createScriptedGameSession, validateGame } from "../src/index.js";

const IMAGE = { assetId: "builtin:dot", digest: "builtin:dot-v1", width: 8, height: 8 };
const idle = { pressed: [], justPressed: [] };

const HUD = {
  nodes: [
    { kind: "panel", id: "scorePanel", anchor: { x: 1, y: 0 }, offset: { x: -16, y: 16 }, width: 160, height: 40, color: "#101820" },
    { kind: "text", id: "score", parent: "scorePanel", anchor: { x: 0.5, y: 0.5 }, text: "Score 0", size: 18 },
    { kind: "bar", id: "health", offset: { x: 16, y: 16 }, width: 200, height: 16, source: { kind: "health", entityId: "player" } },
    { kind: "bar", id: "charge", offset: { x: 16, y: 40 }, width: 200, height: 8, max: 10 },
    { kind: "button", id: "pause", anchor: { x: 0.5, y: 1 }, offset: { x: 0, y: -16 }, width: 96, height: 40, action: "pause", text: "Pause" }
  ]
};

function game(script: string, extra: Partial<GameDocument> = {}): GameDocument {
  return gameDocument.parse({
    schemaVersion: 2, engineVersion: "1", id: "g", revision: "r1", entrySceneId: "main",
    pixelsPerUnit: 32, tickRate: 60, inputActions: ["pause", "next"],
    assets: { dot: IMAGE },
    ui: HUD,
    scenes: [
      { id: "main", name: "Main", entities: [
        { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } },
        { id: "player", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "health", maximum: 5 },
          { kind: "script", maxTickMs: 50, source: script }] }
      ] },
      { id: "second", name: "Second", entities: [
        { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 16, height: 9 } },
        { id: "player", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "health", maximum: 3 }] }
      ] }
    ],
    ...extra
  });
}

const SET_HUD = `({ tick, pressed, state }) => ({ state: 1, commands: [
  { kind: 'ui', id: 'score', text: 'Score ' + (tick + 1) * 10 },
  { kind: 'ui', id: 'charge', value: 4 },
  ...(tick === 1 ? [{ kind: 'ui', id: 'pause', visible: false }] : []),
  ...(pressed.includes('next') ? [{ kind: 'sceneTransition', sceneId: 'second' }] : [])
] })`;

describe("HUD widget tree", () => {
  it("resolves the document tree with entity health before any script runs", async () => {
    const session = await createScriptedGameSession(game("() => ({ state: 1, commands: [] })"), 1);
    const nodes = session.frame().ui?.nodes ?? [];
    expect(nodes.map((node) => node.id)).toEqual(["scorePanel", "score", "health", "charge", "pause"]);
    expect(nodes.find((node) => node.id === "health")).toMatchObject({ value: 5, max: 5 });
    expect(session.frame().ui).toMatchObject({ safeArea: true, focusNavigation: false });
    session.dispose();
  });

  it("applies ui commands and restores them from a snapshot", async () => {
    const document = game(SET_HUD);
    const session = await createScriptedGameSession(document, 1);
    session.step(idle);
    const frame = session.step(idle).frame;
    expect(frame.ui?.nodes.find((node) => node.id === "score")).toMatchObject({ text: "Score 20" });
    expect(frame.ui?.nodes.find((node) => node.id === "charge")).toMatchObject({ value: 4, max: 10 });
    expect(frame.ui?.nodes.find((node) => node.id === "pause")).toMatchObject({ visible: false });
    expect(session.snapshot().ui).toEqual({ score: { text: "Score 20" }, charge: { value: 4 }, pause: { visible: false } });
    const restored = await createScriptedGameSession(document, 1, session.snapshot());
    expect(restored.frame()).toEqual(session.frame());
    session.dispose();
    restored.dispose();
  });

  it("clears script changes on a scene transition and reads the new scene's health", async () => {
    const session = await createScriptedGameSession(game(SET_HUD), 1);
    session.step(idle);
    const frame = session.step({ pressed: ["next"], justPressed: ["next"] }).frame;
    expect(session.snapshot().ui).toBeUndefined();
    expect(frame.ui?.nodes.find((node) => node.id === "health")).toMatchObject({ value: 3, max: 3 });
    expect(frame.ui?.nodes.find((node) => node.id === "score")).toMatchObject({ text: "Score 0" });
    session.dispose();
  });

  it("fails the step when a script changes a missing node or a field the node does not have", async () => {
    const missing = await createScriptedGameSession(game("() => ({ state: 1, commands: [{ kind: 'ui', id: 'nope', visible: false }] })"), 1);
    expect(() => missing.step(idle)).toThrow("Game script changes missing HUD node nope");
    missing.dispose();
    const wrong = await createScriptedGameSession(game("() => ({ state: 1, commands: [{ kind: 'ui', id: 'health', text: 'x' }] })"), 1);
    expect(() => wrong.step(idle)).toThrow("Game script sets text on HUD bar health");
    wrong.dispose();
  });

  it("leaves frames and snapshots of games without a HUD tree unchanged", async () => {
    const { ui: _ui, ...document } = game(SET_HUD.replace(/\{ kind: 'ui'[^}]*\},?/g, ""));
    const session = await createScriptedGameSession(gameDocument.parse(document), 1);
    session.step(idle);
    expect(Object.keys(session.frame())).not.toContain("ui");
    expect(Object.keys(session.snapshot())).not.toContain("ui");
    session.dispose();
  });

  it("keys saved overrides by HUD node ids of at most 64 characters", async () => {
    const session = await createScriptedGameSession(game(SET_HUD), 1);
    const shape = session.snapshot();
    session.dispose();
    expect(gameSnapshot.safeParse({ ...shape, ui: { ["n".repeat(64)]: { text: "ok" } } }).success).toBe(true);
    expect(gameSnapshot.safeParse({ ...shape, ui: { ["n".repeat(65)]: { text: "ok" } } }).success).toBe(false);
    expect(gameSnapshot.safeParse({ ...shape, ui: { "": { text: "ok" } } }).success).toBe(false);
  });

  it("reports tree reference problems through validateGame", () => {
    const document = game("() => ({ state: 1, commands: [] })");
    const broken = gameDocument.parse({ ...document, ui: { nodes: [
      { kind: "text", id: "label", parent: "later", text: "x" },
      { kind: "stack", id: "later" },
      { kind: "text", id: "child", parent: "label", text: "y" },
      { kind: "button", id: "go", action: "jump", width: 10, height: 10 },
      { kind: "bar", id: "barNoSize" },
      { kind: "image", id: "logo", assetId: "missing", width: 4, height: 4 },
      { kind: "bar", id: "boss", width: 4, height: 4, source: { kind: "health", entityId: "camera" } }
    ] }, scenes: document.scenes.map((scene) => ({ ...scene, ui: { nodes: [{ kind: "text", id: "go", text: "dup" }] } })) });
    const messages = validateGame(broken).issues.map((issue) => issue.message);
    expect(messages).toEqual(expect.arrayContaining([
      "HUD node label names parent later, which is not an earlier node of this tree",
      "HUD node label is a text and cannot hold children",
      "HUD button go presses undeclared input action jump",
      "HUD bar barNoSize needs a width and a height",
      "HUD image logo uses missing image asset missing",
      "HUD bar boss reads health of camera, which has no health behavior in this scene",
      "HUD node id go is used twice"
    ]));
  });

  it("sets and clears the document and scene trees through set_ui", () => {
    const document = game("() => ({ state: 1, commands: [] })");
    const tree = { nodes: [{ kind: "text", id: "title", text: "Level 2" }] };
    const edited = applyGameOps(document, [{ op: "set_ui", scene_id: "second", ui: tree }, { op: "set_ui", ui: null }]);
    expect(edited.ui).toBeUndefined();
    expect(edited.scenes[1].ui).toEqual(tree);
    expect(() => applyGameOps(document, [{ op: "set_ui", ui: { nodes: [{ kind: "button", id: "b", action: "fly", width: 1, height: 1 }] } }]))
      .toThrow("HUD button b presses undeclared input action fly");
  });
});
