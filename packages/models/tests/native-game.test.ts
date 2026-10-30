import { beforeEach, describe, expect, it } from "vitest";
import { nativeGameDocument } from "@nodetool-ai/protocol/native-game";
import { Game } from "../src/game.js";
import { NativeGameStore } from "../src/native-game.js";
import { initTestDb } from "../src/db.js";

function workspace() {
  const files = new Map<string, string>();
  return { files, readText: async (path: string) => files.get(path) ?? null,
    write: async (path: string, source: string) => { files.set(path, source); },
    delete: async (path: string) => files.delete(path) };
}

describe("native game durable revisions", () => {
  beforeEach(() => { initTestDb(); });
  it.each(["2d", "3d"] as const)("saves %s draft edits and history revisions against a durable base", async (dimension) => {
    const document = nativeGameDocument.parse({ schemaVersion: dimension === "2d" ? 5 : 4, engine: "native-cpp-1", dimension,
      id: "0123456789abcdef0123456789abcdef", title: "Course", initialSceneId: "scene", scenes: [{ id: "scene" }] });
    const storage = workspace();
    await storage.write(`games/${document.id}/native/initial.json`, JSON.stringify(document));
    await Game.insertNew({ id: document.id, userId: "owner", projectId: "project", workspaceId: "workspace", name: "Course", revision: "0" });
    // Two edits, undo, and redo advance the worker draft independently of durable saves.
    const candidate = { ...document, revision: 4, title: "Edited and redone" };
    expect((await NativeGameStore.save("owner", document.id, 0, candidate, storage))?.document).toEqual(candidate);
    expect((await NativeGameStore.read("owner", document.id, storage))?.document).toEqual(candidate);
    expect((await NativeGameStore.save("owner", document.id, 0, candidate, storage))?.document).toEqual(candidate);
    expect(await NativeGameStore.save("owner", document.id, 0, { ...candidate, title: "Other writer" }, storage)).toBeNull();
    const next = { ...candidate, revision: 7, title: "Further edits" };
    expect((await NativeGameStore.save("owner", document.id, 4, next, storage))?.document).toEqual(next);
    await expect(NativeGameStore.save("owner", document.id, 7, next, storage)).rejects.toThrow("revision");
  });
  it.each(["2d", "3d"] as const)("persists one %s concurrent writer and reopens its immutable source", async (dimension) => {
    const document = nativeGameDocument.parse({ schemaVersion: dimension === "2d" ? 5 : 4, engine: "native-cpp-1", dimension,
      id: "0123456789abcdef0123456789abcdef", title: "Course", initialSceneId: "scene", scenes: [{ id: "scene" }] });
    const storage = workspace();
    await storage.write(`games/${document.id}/native/initial.json`, JSON.stringify(document));
    await Game.insertNew({ id: document.id, userId: "owner", projectId: "project", workspaceId: "workspace", name: "Course", revision: "0" });
    expect(await NativeGameStore.read("stranger", document.id, storage)).toBeNull();
    const results = await Promise.all(["First", "Second"].map((title) => NativeGameStore.save("owner", document.id, 0,
      { ...document, revision: 1, title }, storage)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const reopened = await NativeGameStore.read("owner", document.id.slice(0, 12), storage);
    expect(reopened?.document).toEqual(results.find(Boolean)?.document);
    if (!reopened) { throw new Error("Missing reopened document"); }
    expect((await NativeGameStore.save("owner", document.id, 0, reopened.document, storage))?.document).toEqual(reopened.document);
    expect(await NativeGameStore.save("owner", document.id, 0, { ...document, revision: 1 }, storage)).toBeNull();
    if (!reopened) { throw new Error("Missing reopened document"); }
    storage.files.set(`games/${document.id}/native/${reopened.game.draft_version_id}.json`, "{}");
    await expect(NativeGameStore.read("owner", document.id, storage)).rejects.toThrow("digest mismatch");
  });
});
