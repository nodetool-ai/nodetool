import { gameAuthoring, gameDocument, gameDocument3D, type AnyGameDocument } from "@nodetool-ai/protocol";
import { anyGameDocumentOp, applyAnyGameOps, createNative3DGame, createTopDownRoomGame, type AnyGameDocumentOp } from "@nodetool-ai/game-runtime";
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
