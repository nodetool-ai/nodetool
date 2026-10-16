import { act, renderHook } from "@testing-library/react";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { gameDocument, gameDocument3D, type GameDocument } from "@nodetool-ai/protocol";

import { createGameScriptLogChannel } from "../gameScriptLogChannel";
import { gameSourceEditDocument, useGameScriptReload } from "../useGameScriptReload";

function document(source: string): GameDocument {
  const base = createTopDownRoomGame("source-filter");
  return gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) =>
    entity.id === "player" ? { ...entity, behaviors: [{ kind: "script", source, maxTickMs: 20 }] } : entity) })) });
}

it("copies existing script sources while retaining structural changes and script budgets until restart", () => {
  const current = document("() => ({})");
  const draft = document("() => ({ state: 1 })");
  draft.scenes[0].name = "Changed scene";
  draft.scenes[0].entities.find((entity) => entity.id === "player")?.behaviors.forEach((behavior) => {
    if (behavior.kind === "script") { behavior.maxTickMs = 10; }
  });
  const candidate = gameSourceEditDocument(current, draft);
  expect(candidate.scenes[0].name).toBe(current.scenes[0].name);
  expect(candidate.scenes[0].entities.find((entity) => entity.id === "player")?.behaviors[0]).toMatchObject({ source: "() => ({ state: 1 })", maxTickMs: 20 });
  expect(current.scenes[0].entities.find((entity) => entity.id === "player")?.behaviors[0]).toMatchObject({ source: "() => ({})" });
});

it("applies edits that arrived before the play session finished initializing", async () => {
  const current = document("() => ({})");
  const edited = document("() => ({ state: 2 })");
  const effectiveDocumentRef = { current };
  const session = { snapshot: () => ({ tick: 12 }), reloadScripts: jest.fn(async (candidate: GameDocument) => ({ ok: true as const, changed: true, document: candidate })) };
  const sessionRef: { current: typeof session | null } = { current: null };
  const checkpoint = jest.fn();
  const scriptLogs = createGameScriptLogChannel();
  const view = renderHook(({ generation }) => useGameScriptReload({ draft: edited, playDocument: current, sessionRef,
    effectiveDocumentRef, readyGeneration: generation, scriptLogs, checkpoint }), { initialProps: { generation: 0 } });
  expect(session.reloadScripts).not.toHaveBeenCalled();
  sessionRef.current = session;
  await act(async () => { view.rerender({ generation: 1 }); });
  expect(session.reloadScripts).toHaveBeenCalledTimes(1);
  expect(effectiveDocumentRef.current).toEqual(edited);
  expect(checkpoint).toHaveBeenCalledWith(session);
  view.unmount();
});

it("aborts superseded and disposed reloads without accepting their documents or console errors", async () => {
  const current = document("() => ({})");
  const effectiveDocumentRef = { current };
  const pending: Array<{ resolve: (result: { ok: false; error: string }) => void; signal?: AbortSignal }> = [];
  const session = { snapshot: () => ({ tick: 9 }), reloadScripts: jest.fn((_candidate: GameDocument, signal?: AbortSignal) =>
    new Promise<{ ok: false; error: string }>((resolve) => { pending.push({ resolve, signal }); })) };
  const sessionRef = { current: session };
  const scriptLogs = createGameScriptLogChannel();
  const logs = jest.fn();
  scriptLogs.subscribe(logs);
  const checkpoint = jest.fn();
  const view = renderHook(({ draft }) => useGameScriptReload({ draft, playDocument: current, sessionRef,
    effectiveDocumentRef, readyGeneration: 1, scriptLogs, checkpoint }), { initialProps: { draft: document("() => ({ state: 1 })") } });
  view.rerender({ draft: document("() => ({ state: 2 })") });
  expect(pending[0].signal?.aborted).toBe(true);
  view.unmount();
  expect(pending[1].signal?.aborted).toBe(true);
  await act(async () => { pending.forEach(({ resolve }) => resolve({ ok: false, error: "stale compilation" })); });
  expect(logs).not.toHaveBeenCalled();
  expect(checkpoint).not.toHaveBeenCalled();
  expect(effectiveDocumentRef.current).toBe(current);
});

it("keeps the same candidate for unrelated edits and copies 3D prefab source changes", () => {
  const current = gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "prefab-reload", revision: "saved",
    entrySceneId: "level", tickRate: 60, assets: {}, inputActions: [], presentation: { aspectRatio: 16 / 9, hudWidth: 960, hudHeight: 540 }, scenes: [{ id: "level", name: "Level", activeCameraId: "camera", entities: [
      { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } }
    ] }], prefabs: { actor: { rootId: "actor", entities: [{ id: "actor", transform3d: {}, behaviors: [{ kind: "script", source: "() => ({})" }] }] } } });
  const draft = structuredClone(current);
  draft.scenes[0].name = "New level name";
  expect(gameSourceEditDocument(current, draft)).toBe(current);
  const behavior = draft.prefabs.actor.entities[0].behaviors[0];
  if (behavior.kind !== "script") { throw new Error("Expected script fixture"); }
  behavior.source = "() => ({ state: 2 })";
  const candidate = gameSourceEditDocument(current, draft);
  expect(candidate.prefabs.actor.entities[0].behaviors[0]).toMatchObject({ source: behavior.source });
  expect(candidate.scenes[0].name).toBe("Level");
});

for (const change of ["remove", "reorder"] as const) {
  it(`keeps running script identities after a behavior ${change}`, () => {
    const current = document("() => ({ state: 'a' })");
    const player = current.scenes[0].entities.find((entity) => entity.id === "player")!;
    player.behaviors.push({ kind: "script", source: "() => ({ state: 'b' })", maxCommands: 16, maxTickMs: 20 });
    const draft = structuredClone(current);
    const edited = draft.scenes[0].entities.find((entity) => entity.id === "player")!;
    if (change === "remove") { edited.behaviors.shift(); } else { edited.behaviors.reverse(); }
    expect(gameSourceEditDocument(current, draft)).toBe(current);
  });
}

it("publishes a reload diagnostic when the failed session cannot snapshot", async () => {
  const current = document("() => ({})");
  const session = { snapshot: jest.fn(() => { throw new Error("Session failed"); }),
    reloadScripts: jest.fn(async () => ({ ok: false as const, error: "Session failed" })) };
  const logs = jest.fn();
  const scriptLogs = createGameScriptLogChannel();
  scriptLogs.subscribe(logs);
  const view = renderHook(() => useGameScriptReload({ draft: document("() => ({ state: 2 })"), playDocument: current,
    sessionRef: { current: session }, effectiveDocumentRef: { current }, readyGeneration: 1, scriptLogs, checkpoint: jest.fn(), lastCommittedTick: 12 }));
  await act(async () => { await Promise.resolve(); });
  expect(logs).toHaveBeenCalledTimes(1);
  expect(logs.mock.calls[0][0][0]).toMatchObject({ tick: 12, level: "error" });
  expect(session.snapshot).not.toHaveBeenCalled();
  view.unmount();
});

it("suppresses structurally edited lists even when every reordered script source was also edited", () => {
  const current = document("() => ({ state: 'a' })");
  const player = current.scenes[0].entities.find((entity) => entity.id === "player")!;
  player.behaviors.push({ kind: "script", source: "() => ({ state: 'b' })", maxCommands: 16, maxTickMs: 20 });
  const draft = structuredClone(current);
  const edited = draft.scenes[0].entities.find((entity) => entity.id === "player")!;
  edited.behaviors.reverse();
  for (const behavior of edited.behaviors) { if (behavior.kind === "script") { behavior.source += " "; } }
  expect(gameSourceEditDocument(current, draft, new Set(["player"]))).toBe(current);
});
