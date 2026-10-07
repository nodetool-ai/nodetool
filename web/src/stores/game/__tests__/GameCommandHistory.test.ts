import { z } from "zod";
import { gameAuthoring, gameDocument, gameDocument3D, type AnyGameDocument } from "@nodetool-ai/protocol";
import { anyGameDocumentOp, applyAnyGameOps, createNative3DGame, createTopDownRoomGame, validateAnyGame, type AnyGameDocumentOp } from "@nodetool-ai/game-runtime";
import { getGameDraftStore } from "../GameDraftStore";

function move(document: AnyGameDocument, entityId: string, x: number): AnyGameDocumentOp {
  return document.schemaVersion === 3
    ? { op: "update_entity", scene_id: document.entrySceneId, entity_id: entityId, set: { transform3d: { position: { x } } } }
    : { op: "update_entity", scene_id: document.entrySceneId, entity_id: entityId, set: { transform2d: { x } } };
}

it.each([{ name: "2D", create: createTopDownRoomGame }, { name: "3D", create: createNative3DGame }])(
  "$name keeps later gesture targets and cumulative forward effects in one labelled command", ({ name, create }) => {
    const document = create(`gesture-targets-${name}`);
    const store = getGameDraftStore(document.id);
    store.getState().load(document, "first");
    const ids = document.scenes[0].entities.slice(0, 2).map((entity) => entity.id);
    store.getState().selectMany(ids);
    const gestureId = store.getState().beginGesture();
    const options = { label: "Move Selection", mergeKey: "move-selection", gestureId };
    store.getState().apply([move(document, ids[0], 3)], options);
    store.getState().apply([move(document, ids[1], 4)], options);
    store.getState().apply([move(document, ids[0], 5)], options);
    store.getState().endGesture(gestureId);
    const after = structuredClone(store.getState().document);
    expect(store.getState().commandHistory.past).toHaveLength(1);
    expect(store.getState().commandHistory.past[0].label).toBe("Move Selection");
    store.getState().undo();
    expect(store.getState().document).toEqual(document);
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().canRedo).toBe(true);
    store.getState().redo();
    expect(store.getState().document).toEqual(after);
    expect(applyAnyGameOps(document, store.getState().pendingOps)).toEqual(after);
    const secondGesture = store.getState().beginGesture();
    store.getState().apply([move(document, ids[0], 6)], { ...options, gestureId: secondGesture });
    store.getState().endGesture(secondGesture);
    expect(store.getState().commandHistory.past).toHaveLength(2);
  });

it("exposes descriptive labels and clears redo only after a valid new command", () => {
  const document = createNative3DGame("command-public-labels");
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "first");
  store.getState().apply([move(document, "player", 2)], { label: "Move Player" });
  const light = document.scenes[0].entities.find((entity) => entity.light3d);
  if (!light?.light3d) { throw new Error("Fixture light missing"); }
  store.getState().apply([{ op: "update_entity", scene_id: document.entrySceneId, entity_id: light.id,
    set: { light3d: { intensity: light.light3d.intensity + 1 } } }], { label: "Change Light Intensity" });
  expect(store.getState().commandHistory.past.map((command) => command.label)).toEqual(["Move Player", "Change Light Intensity"]);
  store.getState().undo();
  const history = structuredClone(store.getState().commandHistory);
  store.getState().apply([move(document, "missing", 4)], { label: "Invalid Move" });
  expect(store.getState().commandHistory).toEqual(history);
  store.getState().apply([move(document, "player", 3)], { label: "Move Player" });
  expect(store.getState().canRedo).toBe(false);
});

it("starts a fresh undo boundary for the same script target after load", () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
  try {
    const document = createTopDownRoomGame("command-script-load");
    document.scenes[0].entities[1].behaviors.push({ kind: "script", source: "(input) => ({ state: input.state, commands: [] })", maxCommands: 16, maxTickMs: 8 });
    const store = getGameDraftStore(document.id);
    const script = { op: "set_script" as const, scene_id: document.entrySceneId, entity_id: "player", index: 2, source: "() => ({ state: { value: 1 }, commands: [] })" };
    store.getState().load(document, "first");
    store.getState().apply([script]);
    store.getState().load(document, "replacement");
    store.getState().apply([{ ...script, source: "() => ({ state: { value: 2 }, commands: [] })" }]);
    store.getState().undo();
    expect(store.getState().document).toEqual(document);
  } finally { now.mockRestore(); }
});

it.each([createTopDownRoomGame, createNative3DGame])("rejects a batch atomically with nonempty undo and redo", (create) => {
  const document = create(`command-atomic-${create.name}`);
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "first");
  store.getState().apply([move(document, "player", 1)]);
  store.getState().apply([move(document, "player", 2)]);
  store.getState().undo();
  const before = structuredClone({ document: store.getState().document, pendingOps: store.getState().pendingOps,
    saveStatus: store.getState().saveStatus });
  store.getState().apply([move(document, "player", 3), move(document, "missing", 4)]);
  expect(store.getState().error).toMatch(/missing|not found/i);
  expect({ document: store.getState().document, pendingOps: store.getState().pendingOps,
    saveStatus: store.getState().saveStatus }).toEqual(before);
  store.getState().redo();
  const parsed = document.schemaVersion === 3 ? gameDocument3D.parse(store.getState().document) : gameDocument.parse(store.getState().document);
  expect(parsed).toEqual(applyAnyGameOps(document, [move(document, "player", 2)]));
  store.getState().undo();
  store.getState().undo();
  expect(store.getState().document).toEqual(document);
  store.getState().redo();
  store.getState().redo();
  expect(store.getState().document).toEqual(applyAnyGameOps(document, [move(document, "player", 2)]));
  store.getState().apply([move(document, "player", 5)]);
  expect(store.getState().document).toEqual(applyAnyGameOps(document, [move(document, "player", 5)]));
});

it("queues granular 3D undo operations after a submitted save prefix", () => {
  const document = createNative3DGame("command-3d-save-prefix");
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "first");
  const first = move(document, "player", 1);
  store.getState().apply([first]);
  store.getState().setSaving(1);
  store.getState().apply([move(document, "player", 2)]);
  store.getState().undo();
  expect(store.getState().pendingOps[0]).toEqual(first);
  expect(store.getState().pendingOps.every((op) => op.op !== "set_document")).toBe(true);
  const saved = applyAnyGameOps(document, [first]);
  store.getState().acknowledge(saved, "second", 1);
  expect(applyAnyGameOps(saved, store.getState().pendingOps)).toEqual(store.getState().document);
});

it("replays manual ownership when an authored move returns to its baseline value", () => {
  const baseline = createNative3DGame("command-authored-return");
  const document = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline,
    overrides: [], detached: [], suppressions: [] }) };
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "first");
  store.getState().apply([move(document, "player", 2)]);
  store.getState().apply([move(document, "player", 0)]);
  const current = gameDocument3D.parse(store.getState().document);
  expect(current.scenes).toEqual(document.scenes);
  expect(current.authoring?.overrides).toEqual([{ sceneId: document.entrySceneId, entityId: "player",
    path: ["transform3d", "position", "x"], value: 0 }]);
  expect(store.getState().pendingOps.length).toBeGreaterThan(0);
  expect(store.getState().pendingOps.every((op) => op.op !== "set_document")).toBe(true);
  expect(applyAnyGameOps(document, store.getState().pendingOps)).toEqual(current);
});


it.each([{ name: "2D", create: createTopDownRoomGame }, { name: "3D", create: createNative3DGame }]
  .flatMap((dimension) => [false, true].map((heldPrefix) => ({ ...dimension, heldPrefix }))))(
  "$name compacts authored script edits while retaining submitted prefix bytes ($heldPrefix)", ({ name, create, heldPrefix }) => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(1_000);
    try {
        const baseline = create(`authored-script-queue-${name}-${heldPrefix}`);
        const player = baseline.scenes[0].entities.find((entity) => entity.id === "player");
        if (!player) { throw new Error("Fixture player missing"); }
        const index = player.behaviors.length;
        player.behaviors.push({ kind: "script", source: "() => ({ state: {}, commands: [] })", maxCommands: 16, maxTickMs: 8 });
        const document = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
          program: { source: "return inputs.document", inputs: { valueOf: "literal", toString: "literal" }, seed: 1 }, baseline }) };
        const store = getGameDraftStore(document.id);
        store.getState().load(document, "first");
        if (heldPrefix) { store.getState().apply([move(document, "player", 4)]); }
        const prefix = structuredClone(store.getState().pendingOps);
        const submitted = structuredClone(store.getState().document);
        store.getState().setSaving(prefix.length);
        for (let edit = 0; edit < 350; edit++) {
          store.getState().apply([{ op: "set_script", scene_id: document.entrySceneId, entity_id: "player", index,
            source: `() => ({ state: { edit: ${edit} }, commands: [] })` }]);
          expect(store.getState().error).toBeNull();
        }
        const current = structuredClone(store.getState().document);
        const editedPlayer = current?.scenes[0].entities.find((entity) => entity.id === "player");
        expect(editedPlayer?.behaviors[index]).toMatchObject({ kind: "script", source: "() => ({ state: { edit: 349 }, commands: [] })" });
        expect(current?.authoring?.overrides.length).toBeGreaterThan(0);
        expect(store.getState().pendingOps.length - prefix.length).toBeGreaterThan(0);
        expect(store.getState().pendingOps.slice(0, prefix.length)).toEqual(prefix);
        expect(store.getState().pendingOps.length - prefix.length).toBeLessThanOrEqual(8);
        const wire = JSON.parse(JSON.stringify(store.getState().pendingOps)).map((op: unknown) => anyGameDocumentOp.parse(op));
        expect(applyAnyGameOps(document, wire)).toEqual(current);
        if (!submitted) { throw new Error("Submitted document missing"); }
        store.getState().acknowledge(submitted, "second", prefix.length);
        expect(applyAnyGameOps(submitted, store.getState().pendingOps)).toEqual(current);
    } finally { clock.mockRestore(); }
  });


it.each([{ name: "2D", create: createTopDownRoomGame }, { name: "3D", create: createNative3DGame }])(
  "$name keeps a submitted script prefix and compacts the suffix after acknowledgement", ({ name, create }) => {
    const baseline = create(`script-prefix-ack-${name}`);
    const player = baseline.scenes[0].entities.find((entity) => entity.id === "player");
    if (!player) { throw new Error("Fixture player missing"); }
    const index = player.behaviors.length;
    player.behaviors.push({ kind: "script", source: "() => ({ state: {}, commands: [] })", maxCommands: 16, maxTickMs: 8 });
    const document = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
      program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline }) };
    const store = getGameDraftStore(document.id);
    store.getState().load(document, "first");
    const edit = (value: number) => store.getState().apply([{ op: "set_script", scene_id: document.entrySceneId,
      entity_id: "player", index, source: `() => ({ state: { edit: ${value} }, commands: [] })` }]);
    edit(1);
    const prefix = structuredClone(store.getState().pendingOps);
    const submitted = structuredClone(store.getState().document);
    if (!submitted) { throw new Error("Submitted document missing"); }
    store.getState().setSaving(prefix.length);
    for (let value = 2; value <= 10; value++) { edit(value); }
    expect(store.getState().error).toBeNull();
    expect(store.getState().pendingOps.slice(0, prefix.length)).toEqual(prefix);
    expect(applyAnyGameOps(document, store.getState().pendingOps)).toEqual(store.getState().document);
    const suffixCount = store.getState().pendingOps.length - prefix.length;
    expect(suffixCount).toBeGreaterThan(0);
    expect(suffixCount).toBeLessThanOrEqual(3);
    store.getState().acknowledge(submitted, "second", prefix.length);
    edit(11);
    expect(store.getState().error).toBeNull();
    expect(store.getState().pendingOps.length).toBeLessThanOrEqual(suffixCount);
    const current = store.getState().document;
    expect(current?.scenes[0].entities.find((entity) => entity.id === "player")?.behaviors[index])
      .toMatchObject({ kind: "script", source: "() => ({ state: { edit: 11 }, commands: [] })" });
    const wire = JSON.parse(JSON.stringify(store.getState().pendingOps)).map((op: unknown) => anyGameDocumentOp.parse(op));
    expect(applyAnyGameOps(submitted, wire)).toEqual(current);
  });


it.each([false, true])("accepts a newly tinted 2D sprite with authored=%s", (authored) => {
  const baseline = createTopDownRoomGame(`sprite-optional-${authored}`);
  const before = authored ? gameDocument.parse({ ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document;", inputs: { document: baseline }, seed: 1 }, baseline }) }) : baseline;
  const player = before.scenes[0].entities.find((entity) => entity.id === "player");
  if (!player?.sprite || player.sprite.tint !== undefined) { throw new Error("Fixture sprite must have no tint"); }
  const ops: AnyGameDocumentOp[] = [{ op: "update_entity", scene_id: before.entrySceneId,
    entity_id: player.id, set: { sprite: { tint: "#ff0000" } } }];
  const expected = applyAnyGameOps(before, ops);
  const store = getGameDraftStore(before.id);
  store.getState().load(before, "base");
  store.getState().apply(ops, { label: "Change Sprite Tint" });
  expect(store.getState().error).toBeNull();
  expect(store.getState().document).toEqual(expected);
  expect(applyAnyGameOps(before, JSON.parse(JSON.stringify(store.getState().pendingOps)))).toEqual(expected);
});

it.each([false, true])("restores absent optional sprite fields through undo and redo with authored=%s", (authored) => {
  const baseline = createTopDownRoomGame(`sprite-optional-inverse-${authored}`);
  const before = authored ? gameDocument.parse({ ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document;", inputs: { document: baseline }, seed: 1 }, baseline }) }) : baseline;
  const store = getGameDraftStore(before.id);
  store.getState().load(before, "base");
  store.getState().apply([{ op: "update_entity", scene_id: before.entrySceneId,
    entity_id: "player", set: { sprite: { tint: "#ff0000" } } }], { label: "Change Sprite Tint" });
  expect(store.getState().error).toBeNull();
  const after = structuredClone(store.getState().document);
  expect(after).not.toEqual(before);
  store.getState().undo();
  expect(store.getState().document).toEqual(before);
  expect(applyAnyGameOps(before, JSON.parse(JSON.stringify(store.getState().pendingOps)))).toEqual(before);
  store.getState().redo();
  expect(store.getState().document).toEqual(after);
  expect(applyAnyGameOps(before, JSON.parse(JSON.stringify(store.getState().pendingOps)))).toEqual(after);
});


it.each(["scene-name", "scene-music", "scene-lighting"])("accepts a JSON-stored 2D %s edit without counting undefined optional fields", (kind) => {
  const before = gameDocument.parse(JSON.parse(JSON.stringify({ ...createTopDownRoomGame(`optional-json-${kind}`), schemaVersion: 2 })));
  expect(Object.hasOwn(before.scenes[0], "music")).toBe(false);
  expect(Object.hasOwn(before.scenes[0], "gravity")).toBe(false);
  expect(Object.hasOwn(before.scenes[0], "lighting")).toBe(false);
  const ops: AnyGameDocumentOp[] = kind === "scene-name"
    ? [{ op: "update_scene", scene_id: before.entrySceneId, set: { name: "Renamed room" } }]
    : kind === "scene-music"
      ? [{ op: "update_scene", scene_id: before.entrySceneId, set: { music: { assetId: "sfx.collect" } } }]
      : [{ op: "set_lighting", scene_id: before.entrySceneId, lighting: { ambient: { color: "#ffffff", intensity: 0.5 }, points: [] } }];
  const expected = applyAnyGameOps(before, ops);
  expect(JSON.parse(JSON.stringify(expected))).not.toEqual(before);
  const store = getGameDraftStore(before.id);
  store.getState().load(before, "base");
  store.getState().apply(ops, { label: `Change ${kind}` });
  expect(store.getState().error).toBeNull();
  expect(JSON.parse(JSON.stringify(store.getState().document))).toEqual(JSON.parse(JSON.stringify(expected)));
  store.getState().undo();
  expect(JSON.parse(JSON.stringify(store.getState().document))).toEqual(before);
  expect(JSON.parse(JSON.stringify(applyAnyGameOps(before, store.getState().pendingOps)))).toEqual(before);
});

function optionalDocumentCommandFixture(kind: "gravity" | "background-options" | "first-background" | "first-effects", authored: boolean) {
  const baseline = gameDocument.parse({ ...createTopDownRoomGame(`ordinary-optional-${kind}-${authored}`), schemaVersion: 2 });
  const scene = baseline.scenes[0];
  const player = scene.entities.find((entity) => entity.id === "player");
  if (!player?.sprite) { throw new Error("Fixture sprite asset missing"); }
  delete scene.gravity;
  delete scene.backgrounds;
  delete baseline.renderEffects;
  const backgroundDocument = gameDocument.parse({ ...baseline, scenes: [{ ...scene,
    backgrounds: [{ id: "background-control", assetId: player.sprite.assetId, width: 16, height: 9 }] }] });
  const background = backgroundDocument.scenes[0].backgrounds?.[0];
  if (!background) { throw new Error("Fixture background missing"); }
  let ops: AnyGameDocumentOp[];
  if (kind === "gravity") {
    ops = [{ op: "update_scene", scene_id: scene.id, set: { gravity: { x: 0, y: -12 } } }];
  } else if (kind === "background-options") {
    scene.backgrounds = [background];
    ops = [{ op: "update_background", scene_id: scene.id, id: background.id,
      set: { frame: { x: 0, y: 0, width: 1, height: 1 }, sampling: "linear" } }];
  } else if (kind === "first-background") {
    ops = [{ op: "add_background", scene_id: scene.id, background }];
  } else {
    ops = [{ op: "set_effects", effects: [{ kind: "brightnessContrast", brightness: 0.1, contrast: 1, required: false }] }];
  }
  const before = authored ? gameDocument.parse({ ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document;", inputs: { document: baseline }, seed: 1 }, baseline }) }) : baseline;
  if (kind === "gravity") { expect(before.scenes[0]).not.toHaveProperty("gravity"); }
  else if (kind === "first-background") { expect(before.scenes[0]).not.toHaveProperty("backgrounds"); }
  else if (kind === "first-effects") { expect(before).not.toHaveProperty("renderEffects"); }
  else {
    expect(before.scenes[0].backgrounds?.[0]).not.toHaveProperty("frame");
    expect(before.scenes[0].backgrounds?.[0]).not.toHaveProperty("sampling");
  }
  return { before, ops };
}

const OPTIONAL_DOCUMENT_KINDS = ["gravity", "background-options", "first-background", "first-effects"] as const;
const OPTIONAL_DOCUMENT_CONTROLS = OPTIONAL_DOCUMENT_KINDS.flatMap((kind) => [false, true].map((authored) => ({ kind, authored })));

it.each(OPTIONAL_DOCUMENT_CONTROLS)("accepts the public forward operation for $kind authored=$authored before inverse validation", ({ kind, authored }) => {
  const { before, ops } = optionalDocumentCommandFixture(kind, authored);
  const wire = ops.map((op) => anyGameDocumentOp.parse(JSON.parse(JSON.stringify(op))));
  const expected = applyAnyGameOps(before, wire);
  expect(expected).not.toEqual(before);
  const store = getGameDraftStore(before.id);
  store.getState().load(before, "base");
  store.getState().apply(wire, { label: `Change ${kind}` });
  expect(store.getState().error).toBeNull();
  expect(store.getState().document).toEqual(expected);
  expect(applyAnyGameOps(before, store.getState().pendingOps)).toEqual(expected);
});

it.each(OPTIONAL_DOCUMENT_CONTROLS)("restores exact optional document shape through $kind authored=$authored undo/redo and public JSON batches", ({ kind, authored }) => {
  const { before, ops } = optionalDocumentCommandFixture(kind, authored);
  const expected = applyAnyGameOps(before, ops);
  const store = getGameDraftStore(before.id);
  store.getState().load(before, "base");
  store.getState().apply(ops, { label: `Change ${kind}` });
  expect(store.getState().error).toBeNull();
  expect(store.getState().document).toEqual(expected);
  store.getState().undo();
  expect(store.getState().document).toEqual(before);
  expect(applyAnyGameOps(before, store.getState().pendingOps.map((op) => anyGameDocumentOp.parse(JSON.parse(JSON.stringify(op)))))).toEqual(before);
  store.getState().redo();
  expect(store.getState().document).toEqual(expected);
  expect(applyAnyGameOps(before, store.getState().pendingOps.map((op) => anyGameDocumentOp.parse(JSON.parse(JSON.stringify(op)))))).toEqual(expected);
});

it("undoes deletion of an explicitly empty background container through public JSON", () => {
  const before = gameDocument.parse({ ...createTopDownRoomGame("empty-background-command"), schemaVersion: 2 });
  before.scenes[0].backgrounds = [];
  const store = getGameDraftStore(before.id);
  store.getState().load(before, "base");
  const op = anyGameDocumentOp.parse(JSON.parse(JSON.stringify({ op: "update_scene", scene_id: before.entrySceneId, set: { backgrounds: null } })));
  store.getState().apply([op], { label: "Remove Background Container" });
  expect(store.getState().error).toBeNull();
  expect(store.getState().document?.scenes[0]).not.toHaveProperty("backgrounds");
  store.getState().undo();
  expect(store.getState().document).toEqual(before);
  expect(applyAnyGameOps(before, JSON.parse(JSON.stringify(store.getState().pendingOps)))).toEqual(before);
  const expected = structuredClone(before);
  delete expected.scenes[0].backgrounds;
  store.getState().redo();
  expect(store.getState().document).toEqual(expected);
  expect(applyAnyGameOps(before, JSON.parse(JSON.stringify(store.getState().pendingOps)))).toEqual(expected);
});

// Append-only GameCommandHistory.test.ts evidence regression. Add z from zod and
// validateAnyGame from game-runtime to existing imports. Existing gameDocument,
// gameAuthoring, anyGameDocumentOp, applyAnyGameOps and getGameDraftStore imports suffice.
// This is the public atomic-batch path, not viewport callback/throughput coverage.

it.each([false, true])("preserves one public atomic batch and its inverse within the queue budget for 350 authored roots with heldPrefix=%s", (heldPrefix) => {
  const roots = Array.from({ length: 350 }, (_, index) => ({ id: `root-${index}`,
    transform2d: { x: (index % 25) * 2 - 24, y: Math.floor(index / 25) * 2 - 12 } }));
  const baseline = gameDocument.parse({ schemaVersion: 2, engineVersion: "1", id: `atomic-many-roots-${heldPrefix}`,
    revision: "1", entrySceneId: "room", pixelsPerUnit: 32, tickRate: 60, inputActions: [], assets: {},
    scenes: [{ id: "room", name: "Many roots", entities: roots }] });
  const before = gameDocument.parse({ ...baseline,
    scenes: baseline.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => ({ ...entity,
      transform2d: { ...entity.transform2d, x: entity.transform2d.x + 1 } })) })),
    authoring: gameAuthoring.parse({ version: 1, program: { source: "return inputs.document;", inputs: { document: baseline }, seed: 1 },
      baseline, overrides: baseline.scenes[0].entities.map((entity) => ({ sceneId: "room", entityId: entity.id,
        path: ["transform2d", "x"], value: entity.transform2d.x + 1 })) }) });
  const valid = validateAnyGame(before);
  if (!valid.valid) { throw new Error(`Invalid authored many-root fixture: ${JSON.stringify(valid)}`); }
  expect(before.authoring?.overrides).toHaveLength(350);
  const store = getGameDraftStore(before.id);
  store.getState().load(before, "base-token");
  if (heldPrefix) { store.getState().apply([{ op: "update_scene", scene_id: "room", set: { name: "Submitted name" } }], { label: "Rename scene" }); }
  const prefix = structuredClone(store.getState().pendingOps);
  const prefixBytes = JSON.stringify(prefix);
  const submitted = applyAnyGameOps(before, prefix);
  expect(submitted.schemaVersion).toBe(2);
  if (heldPrefix) { expect(store.getState().error).toBeNull(); expect(prefix.length).toBeGreaterThan(0); store.getState().setSaving(prefix.length); }
  store.getState().selectMany(roots.map((entity) => entity.id));
  const moveOps = submitted.scenes[0].entities.map((entity) => anyGameDocumentOp.parse({ op: "update_entity",
    scene_id: "room", entity_id: entity.id, set: { transform2d: { x: entity.transform2d.x + 1, y: entity.transform2d.y } } }));
  const expected = applyAnyGameOps(submitted, moveOps);
  const gestureId = store.getState().beginGesture();
  store.getState().apply(moveOps, { label: "Move Selection", mergeKey: "move-selection", gestureId });
  store.getState().endGesture(gestureId);
  expect(store.getState().error).toBeNull();
  expect(store.getState().document).toEqual(expected);
  expect(store.getState().commandHistory.past).toHaveLength(heldPrefix ? 2 : 1);
  const command = store.getState().commandHistory.past.at(-1);
  if (!command) { throw new Error("Atomic move command missing"); }
  expect(command.label).toBe("Move Selection");
  const queued = z.array(anyGameDocumentOp).parse(JSON.parse(JSON.stringify(store.getState().pendingOps)));
  expect(JSON.stringify(queued.slice(0, prefix.length))).toBe(prefixBytes);
  expect(applyAnyGameOps(before, queued)).toEqual(expected);
  if (heldPrefix) {
    store.getState().acknowledge(submitted, "acknowledged-token", prefix.length);
    expect(applyAnyGameOps(submitted, store.getState().pendingOps)).toEqual(expected);
  }
  store.getState().undo();
  expect(store.getState().document).toEqual(submitted);
  store.getState().redo();
  expect(store.getState().document).toEqual(expected);
  expect(command.ops.length).toBeLessThanOrEqual(1024);
  expect(command.inverseOps.length).toBeLessThanOrEqual(1024);
  expect(z.array(anyGameDocumentOp).max(1024).safeParse(JSON.parse(JSON.stringify(command.ops))).success).toBe(true);
  expect(z.array(anyGameDocumentOp).max(1024).safeParse(JSON.parse(JSON.stringify(command.inverseOps))).success).toBe(true);
  // This mirrors the existing public saveDraft maximum, without importing backend-private source.
  // Assert after state/replay/history controls so a RED still demonstrates the reachable producer.
  expect(queued.length).toBeLessThanOrEqual(1024);
  expect(z.array(anyGameDocumentOp).max(1024).safeParse(queued).success).toBe(true);
});

// Append-only GameCommandHistory.test.ts. Existing imports plus z and validateAnyGame.
// Atomic store path only. The separate pointer regression is unchanged.
function unsavedQueueFixture(id: string) {
  const roots = Array.from({ length: 350 }, (_, index) => ({ id: `root-${index}`,
    transform2d: { x: (index % 25) * 2 - 24, y: Math.floor(index / 25) * 2 - 12 } }));
  const baseline = gameDocument.parse({ schemaVersion: 2, engineVersion: "1", id: id,
    revision: "1", entrySceneId: "room", pixelsPerUnit: 32, tickRate: 60, inputActions: [], assets: {},
    scenes: [{ id: "room", name: "Many roots", entities: roots }] });
  const before = gameDocument.parse({ ...baseline,
    scenes: baseline.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => ({ ...entity,
      transform2d: { ...entity.transform2d, x: entity.transform2d.x + 1 } })) })),
    authoring: gameAuthoring.parse({ version: 1, program: { source: "return inputs.document;", inputs: { document: baseline }, seed: 1 },
      baseline, overrides: baseline.scenes[0].entities.map((entity) => ({ sceneId: "room", entityId: entity.id,
        path: ["transform2d", "x"], value: entity.transform2d.x + 1 })) }) });
  const valid = validateAnyGame(before);
  if (!valid.valid) { throw new Error(`Invalid authored many-root fixture: ${JSON.stringify(valid)}`); }
  expect(before.authoring?.overrides).toHaveLength(350);
  return before;
}
function unsavedQueueMove(document: ReturnType<typeof unsavedQueueFixture>) {
  return document.scenes[0].entities.map((entity) => anyGameDocumentOp.parse({ op: "update_entity",
    scene_id: "room", entity_id: entity.id, set: { transform2d: { x: entity.transform2d.x + 1 } } }));
}
function unsavedQueueWire(ops: unknown) { return z.array(anyGameDocumentOp).parse(JSON.parse(JSON.stringify(ops))); }

it("rebuilds unsent atomic history to empty undo and bounded redo", () => {
  const before = unsavedQueueFixture("unsaved-atomic-history");
  const store = getGameDraftStore(before.id); store.getState().load(before, "base");
  store.getState().apply(unsavedQueueMove(before), { label: "Move Selection" });
  const moved = structuredClone(store.getState().document);
  store.getState().undo();
  expect(store.getState().document).toEqual(before);
  expect(store.getState().pendingOps).toEqual([]);
  expect(store.getState().saveStatus).toBe("saved");
  expect(store.getState().commandHistory.future).toHaveLength(1);
  store.getState().redo();
  expect(store.getState().document).toEqual(moved);
  const wire = unsavedQueueWire(store.getState().pendingOps);
  expect(applyAnyGameOps(before, wire)).toEqual(moved);
  expect(wire.length).toBeLessThanOrEqual(1024);
});

it("preserves a held rename prefix through history and rebases only its suffix on ACK", () => {
  const before = unsavedQueueFixture("held-rename-history");
  const store = getGameDraftStore(before.id); store.getState().load(before, "base");
  store.getState().apply([{ op: "update_scene", scene_id: "room", set: { name: "Submitted name" } }]);
  const prefix = unsavedQueueWire(store.getState().pendingOps); expect(prefix.length).toBeGreaterThan(0);
  const prefixBytes = JSON.stringify(prefix); const submitted = applyAnyGameOps(before, prefix);
  store.getState().setSaving(prefix.length);
  store.getState().apply(unsavedQueueMove(before)); const moved = structuredClone(store.getState().document);
  store.getState().undo();
  expect(store.getState().document).toEqual(submitted);
  expect(JSON.stringify(store.getState().pendingOps)).toBe(prefixBytes);
  store.getState().redo();
  expect(store.getState().document).toEqual(moved);
  const queued = unsavedQueueWire(store.getState().pendingOps);
  expect(JSON.stringify(queued.slice(0, prefix.length))).toBe(prefixBytes);
  expect(applyAnyGameOps(before, queued)).toEqual(moved);
  store.getState().acknowledge(submitted, "rename-ack", prefix.length);
  expect(applyAnyGameOps(submitted, unsavedQueueWire(store.getState().pendingOps))).toEqual(moved);
  expect(queued.length).toBeLessThanOrEqual(1024);
});

it("retains submitted movement bytes and cancels only the unsent inverse after ACK and redo", () => {
  const before = unsavedQueueFixture("submitted-movement-history");
  const store = getGameDraftStore(before.id); store.getState().load(before, "base");
  store.getState().apply(unsavedQueueMove(before));
  const moved = structuredClone(store.getState().document);
  if (!moved) { throw new Error("Moved document missing"); }
  const prefix = unsavedQueueWire(store.getState().pendingOps); const bytes = JSON.stringify(prefix);
  store.getState().setSaving(prefix.length); store.getState().undo();
  expect(store.getState().document).toEqual(before);
  const queued = unsavedQueueWire(store.getState().pendingOps);
  expect(JSON.stringify(queued.slice(0, prefix.length))).toBe(bytes);
  const inverse = queued.slice(prefix.length); expect(inverse.length).toBeGreaterThan(0);
  expect(applyAnyGameOps(moved, inverse)).toEqual(before);
  store.getState().acknowledge(moved, "movement-ack", prefix.length);
  expect(applyAnyGameOps(moved, unsavedQueueWire(store.getState().pendingOps))).toEqual(before);
  store.getState().redo(); expect(store.getState().document).toEqual(moved);
  expect(store.getState().pendingOps).toEqual([]);
  expect(store.getState().saveStatus).toBe("saved");
  expect(prefix.length).toBeLessThanOrEqual(1024); expect(inverse.length).toBeLessThanOrEqual(1024);
});

it("retains a baseline-valued authored override after net-zero edit undo and redo", () => {
  const seeded = unsavedQueueFixture("net-zero-ownership-history");
  const rootId = seeded.scenes[0].entities[0].id;
  const before = applyAnyGameOps(seeded, [{ op: "reset_override", scene_id: "room", entity_id: rootId, path: ["transform2d", "x"] }]);
  expect(before.schemaVersion).toBe(2);
  const store = getGameDraftStore(before.id); store.getState().load(before, "base");
  const root = before.scenes[0].entities[0];
  const baselineX = root.transform2d.x;
  expect(before.authoring?.overrides.some((entry) => entry.entityId === root.id && entry.path.join(".") === "transform2d.x")).toBe(false);
  const gestureId = store.getState().beginGesture();
  const options = { label: "Move Selection", mergeKey: "move-selection", gestureId };
  store.getState().apply([{ op: "update_entity", scene_id: "room", entity_id: root.id, set: { transform2d: { x: baselineX + 2 } } }], options);
  store.getState().apply([{ op: "update_entity", scene_id: "room", entity_id: root.id, set: { transform2d: { x: baselineX } } }], options);
  store.getState().endGesture(gestureId);
  expect(store.getState().error).toBeNull();
  const target = structuredClone(store.getState().document);
  expect(target?.scenes).toEqual(before.scenes);
  expect(target?.authoring?.overrides.find((entry) => entry.entityId === root.id && entry.path.join(".") === "transform2d.x")?.value).toBe(baselineX);
  store.getState().undo(); expect(store.getState().document).toEqual(before);
  store.getState().redo(); expect(store.getState().document).toEqual(target);
  const wire = unsavedQueueWire(store.getState().pendingOps);
  expect(wire.length).toBeGreaterThan(0);
  expect(wire.every((op) => op.op === "set_override_membership")).toBe(true);
  expect(applyAnyGameOps(before, wire)).toEqual(target);
  expect(store.getState().document?.authoring?.overrides.find((entry) => entry.entityId === root.id &&
    entry.path.join(".") === "transform2d.x")?.value).toBe(baselineX);
});

// Separate failSave concern control: no new retry/capture API is assumed here.
it("retains uncertain submitted movement and undo suffix when save failure is reported", () => {
  const before = unsavedQueueFixture("uncertain-save-history");
  const store = getGameDraftStore(before.id); store.getState().load(before, "base");
  store.getState().apply(unsavedQueueMove(before));
  expect(store.getState().error).toBeNull();
  const moved = structuredClone(store.getState().document);
  expect(moved).not.toEqual(before);
  const prefix = unsavedQueueWire(store.getState().pendingOps); const bytes = JSON.stringify(prefix);
  expect(prefix.length).toBeGreaterThan(0);
  store.getState().setSaving(prefix.length); store.getState().undo();
  expect(store.getState().error).toBeNull();
  const queued = unsavedQueueWire(store.getState().pendingOps);
  expect(queued.length).toBeGreaterThan(prefix.length);
  if (!moved) { throw new Error("Moved document missing"); }
  expect(applyAnyGameOps(moved, queued.slice(prefix.length))).toEqual(before);
  store.getState().failSave("Response lost; server outcome unknown");
  expect(store.getState().savingCount).toBe(0);
  expect(store.getState().saveStatus).toBe("error");
  expect(store.getState().document).toEqual(before);
  expect(unsavedQueueWire(store.getState().pendingOps)).toEqual(queued);
  expect(JSON.stringify(queued.slice(0, prefix.length))).toBe(bytes);
  expect(applyAnyGameOps(before, queued)).toEqual(before);
  // Do not assert whole retry payload fits: its bounded capture seam is still owner-designed.
});

// Append after approved unsavedQueueFixture/Move/Wire helpers in GameCommandHistory.test.ts.
// First control uses only existing methods; second uses proposed captureSaveOps.
it("preserves unknown submitted movement through repeated failure and later history", () => {
  const before = unsavedQueueFixture("unknown-history-prefix");
  const store = getGameDraftStore(before.id); store.getState().load(before, "base-token");
  store.getState().apply(unsavedQueueMove(before));
  expect(store.getState().error).toBeNull();
  const moved = structuredClone(store.getState().document);
  expect(moved).not.toEqual(before);
  const prefix = unsavedQueueWire(store.getState().pendingOps);
  expect(prefix.length).toBeGreaterThan(0);
  const prefixBytes = JSON.stringify(prefix);
  store.getState().setSaving(prefix.length); store.getState().undo();
  expect(store.getState().document).toEqual(before);
  store.getState().failSave("Unknown server outcome");
  expect(store.getState().savingCount).toBe(0);
  store.getState().failSave("Repeated report with no new capture");
  store.getState().redo(); expect(store.getState().document).toEqual(moved);
  expect(JSON.stringify(store.getState().pendingOps.slice(0, prefix.length))).toBe(prefixBytes);
  store.getState().undo(); expect(store.getState().document).toEqual(before);
  const queued = unsavedQueueWire(store.getState().pendingOps);
  expect(JSON.stringify(queued.slice(0, prefix.length))).toBe(prefixBytes);
  expect(queued.length).toBeGreaterThan(prefix.length);
  if (!moved) { throw new Error("Moved document missing"); }
  expect(applyAnyGameOps(moved, queued.slice(prefix.length))).toEqual(before);
  expect(applyAnyGameOps(before, queued)).toEqual(before);
  expect(store.getState().saveStatus).not.toBe("saved");
});


it("captures the durable failed prefix first and rebases its inverse only after confirmed ACK", () => {
  const before = unsavedQueueFixture("unknown-history-retry-capture");
  const store = getGameDraftStore(before.id); store.getState().load(before, "base-token");
  store.getState().apply(unsavedQueueMove(before));
  expect(store.getState().error).toBeNull();
  const moved = structuredClone(store.getState().document);
  if (!moved) { throw new Error("Moved document missing"); }
  expect(moved).not.toEqual(before);
  const prefix = unsavedQueueWire(store.getState().pendingOps);
  expect(prefix.length).toBeGreaterThan(0);
  const bytes = JSON.stringify(prefix);
  store.getState().setSaving(prefix.length); store.getState().undo();
  expect(store.getState().document).toEqual(before);
  store.getState().failSave("Unknown server outcome");
  expect(store.getState().savingCount).toBe(0);
  store.getState().failSave("Repeated report with no new capture");
  store.getState().redo(); expect(store.getState().document).toEqual(moved);
  store.getState().undo(); expect(store.getState().document).toEqual(before);
  const queuedBeforeCapture = structuredClone(store.getState().pendingOps);
  const retry = unsavedQueueWire(store.getState().captureSaveOps());
  expect(JSON.stringify(retry)).toBe(bytes);
  expect(retry.length).toBeLessThanOrEqual(1024);
  expect(store.getState().baseUpdatedAt).toBe("base-token");
  expect(store.getState().pendingOps).toEqual(queuedBeforeCapture);
  // A second capture cannot consume the durable prefix or mutate the queue.
  expect(JSON.stringify(store.getState().captureSaveOps())).toBe(bytes);
  store.getState().setSaving(retry.length);
  store.getState().acknowledge(moved, "confirmed-token", retry.length);
  expect(store.getState().document).toEqual(before);
  const suffix = unsavedQueueWire(store.getState().captureSaveOps());
  expect(suffix.length).toBeGreaterThan(0);
  expect(suffix.length).toBeLessThanOrEqual(1024);
  expect(applyAnyGameOps(moved, suffix)).toEqual(before);
  expect(store.getState().baseUpdatedAt).toBe("confirmed-token");
  store.getState().setSaving(suffix.length);
  store.getState().acknowledge(before, "inverse-confirmed-token", suffix.length);
  expect(store.getState().pendingOps).toEqual([]);
  expect(store.getState().captureSaveOps()).toEqual([]);
  expect(store.getState().saveStatus).toBe("saved");
});

// Append to GameCommandHistory.test.ts after approved unsavedQueueFixture/Move/Wire helpers.
it.each(["load", "applyMerged"])("clears uncertain retry ownership only after authoritative %s", (reset) => {
  const before = unsavedQueueFixture(`retry-reset-${reset}`);
  const store = getGameDraftStore(before.id); store.getState().load(before, "old-token");
  store.getState().apply(unsavedQueueMove(before).slice(0, 1));
  expect(store.getState().error).toBeNull();
  const prefix = unsavedQueueWire(store.getState().pendingOps); expect(prefix.length).toBeGreaterThan(0);
  store.getState().setSaving(prefix.length); store.getState().failSave("Unknown outcome");
  expect(store.getState().captureSaveOps()).toEqual(prefix);
  const server = applyAnyGameOps(before, [{ op: "update_scene", scene_id: "room", set: { name: "Authoritative scene" } }]);
  expect(server.schemaVersion).toBe(2);
  const edits = unsavedQueueMove(server);
  const target = applyAnyGameOps(server, edits);
  if (reset === "load") {
    store.getState().load(server, "new-token");
    expect(store.getState().captureSaveOps()).toEqual([]);
    store.getState().apply(edits);
  } else { store.getState().applyMerged(target, server, "new-token"); }
  expect(store.getState().error).toBeNull();
  expect(store.getState().document).toEqual(target);
  expect(store.getState().baseUpdatedAt).toBe("new-token");
  const captured = unsavedQueueWire(store.getState().captureSaveOps());
  expect(store.getState().pendingOps.length).toBeGreaterThan(prefix.length);
  expect(captured.length).toBeGreaterThan(prefix.length);
  expect(captured).toEqual(unsavedQueueWire(store.getState().pendingOps));
  expect(captured).not.toEqual(prefix);
  expect(captured.length).toBeLessThanOrEqual(1024);
  expect(applyAnyGameOps(server, captured)).toEqual(target);
});

it.each([{ name: "2D", create: createTopDownRoomGame }, { name: "3D", create: createNative3DGame }])(
  "$name protects a failed script prefix while compacting later typing and rebasing after ACK", ({ name, create }) => {
    const baseline = create(`failed-script-prefix-${name}`);
    const player = baseline.scenes[0].entities.find((entity) => entity.id === "player");
    if (!player) { throw new Error("Fixture player missing"); }
    const index = player.behaviors.length;
    player.behaviors.push({ kind: "script", source: "() => ({ state: {}, commands: [] })", maxCommands: 16, maxTickMs: 8 });
    const document = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
      program: { source: "return inputs.document;", inputs: { document: baseline }, seed: 1 }, baseline }) };
    const store = getGameDraftStore(document.id); store.getState().load(document, "original-token");
    const edit = (value: number) => store.getState().apply([{ op: "set_script", scene_id: document.entrySceneId,
      entity_id: "player", index, source: `() => ({ state: { edit: ${value} }, commands: [] })` }]);
    edit(1); expect(store.getState().error).toBeNull();
    const rawPrefix = structuredClone(store.getState().pendingOps);
    const prefix = unsavedQueueWire(rawPrefix); expect(prefix.length).toBeGreaterThan(0);
    const bytes = JSON.stringify(rawPrefix); const submitted = structuredClone(store.getState().document);
    if (!submitted) { throw new Error("Submitted document missing"); }
    store.getState().setSaving(prefix.length); store.getState().failSave("Lost response");
    expect(store.getState().savingCount).toBe(0);
    store.getState().failSave("Repeated failure without another capture");
    for (let value = 2; value <= 10; value++) { edit(value); }
    expect(store.getState().error).toBeNull();
    const finalDocument = structuredClone(store.getState().document);
    const queued = unsavedQueueWire(store.getState().pendingOps);
    expect(JSON.stringify(store.getState().pendingOps.slice(0, prefix.length))).toBe(bytes);
    const suffix = queued.slice(prefix.length); expect(suffix.length).toBeGreaterThan(0);
    expect(suffix.length).toBeLessThanOrEqual(3);
    expect(applyAnyGameOps(document, queued)).toEqual(finalDocument);
    expect(JSON.stringify(store.getState().captureSaveOps())).toBe(bytes);
    expect(store.getState().baseUpdatedAt).toBe("original-token");
    store.getState().setSaving(prefix.length); store.getState().acknowledge(submitted, "confirmed-token", prefix.length);
    const remaining = unsavedQueueWire(store.getState().captureSaveOps());
    expect(remaining.length).toBeGreaterThan(0); expect(remaining.length).toBeLessThanOrEqual(3);
    expect(remaining).toEqual(unsavedQueueWire(store.getState().pendingOps));
    expect(applyAnyGameOps(submitted, remaining)).toEqual(finalDocument);
    const finalPlayer = finalDocument?.scenes[0].entities.find((entity) => entity.id === "player");
    expect(finalPlayer?.behaviors[index]).toMatchObject({ kind: "script", source: "() => ({ state: { edit: 10 }, commands: [] })" });
    expect(store.getState().baseUpdatedAt).toBe("confirmed-token");
  });
