import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { nativeGameDocument } from "@nodetool-ai/protocol/native-game";
import { NativeGameWorker, NativeGameWorkerError } from "../src/lib/native-game-worker.js";

const fixture = fileURLToPath(new URL("./fixtures/native-game-worker.mjs", import.meta.url));
describe("native game worker framing", () => {
  it("handles split responses and propagates structured errors", async () => {
    const worker = new NativeGameWorker({ executable: process.execPath, args: [fixture] });
    try {
      expect(await worker.request("hello")).toEqual({ engine: "native-cpp-1" });
      await expect(worker.request("invalid")).rejects.toMatchObject({ code: "validation", message: "Invalid document" });
    } finally { worker.close(); }
  });
  it("preserves source diagnostics from gameplay failures", async () => {
    const worker = new NativeGameWorker({ executable: process.execPath, args: [fixture] });
    try {
      await expect(worker.request("script-error")).rejects.toMatchObject({
        code: "script_error", path: "/scripts/0",
        details: { entityId: "player", behaviorId: "move", sourceDigest: "digest", hook: "onUpdate", tick: 42, limit: "commands" }
      });
    } finally { worker.close(); }
  });
  it("rejects oversized response frames and worker exit", async () => {
    const worker = new NativeGameWorker({ executable: process.execPath, args: [fixture], maxFrameBytes: 1024 });
    await expect(worker.request("oversize")).rejects.toMatchObject({ code: "frame_limit" });
    const exited = new NativeGameWorker({ executable: process.execPath, args: [fixture] });
    await expect(exited.request("exit")).rejects.toBeInstanceOf(NativeGameWorkerError);
  });
  it("cancels unresponsive work and rejects pending requests", async () => {
    const worker = new NativeGameWorker({ executable: process.execPath, args: [fixture], killGraceMs: 5 });
    const controller = new AbortController();
    const pending = worker.request("hang", {}, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    worker.close();
  });
});

describe("native game worker integration", () => {
  it("creates and edits a real native session with monotonic revisions", async () => {
    const executable = process.env.NODETOOL_NATIVE_GAME_WORKER ?? resolve(fileURLToPath(new URL("../../../native/game/build/", import.meta.url)), process.platform === "win32" ? "game-worker.exe" : "game-worker");
    const worker = new NativeGameWorker({ executable });
    const document = { schemaVersion: 4, engine: "native-cpp-1", dimension: "3d", id: "game", title: "Course",
      revision: 0, initialSceneId: "scene", scenes: [{ id: "scene", name: "Scene", entities: [] }], prefabs: [], scripts: [], assets: [], inputActions: [] };
    try {
      expect(await worker.request("hello")).toMatchObject({ engine: "native-cpp-1", schemaVersion: 4 });
      expect(await worker.request("open", { sessionId: "session", document })).toMatchObject({ revision: 0 });
      expect(await worker.request("transaction", { sessionId: "session", expectedRevision: 0, operations: [{ kind: "setTitle", title: "Changed" }] }))
        .toMatchObject({ revision: 1, document: { title: "Changed" } });
      await expect(worker.request("transaction", { sessionId: "session", expectedRevision: 0, operations: [{ kind: "setTitle", title: "Stale" }] }))
        .rejects.toMatchObject({ code: "conflict" });
      expect(await worker.request("inspect", { sessionId: "session" })).toMatchObject({ revision: 1, document: { title: "Changed" } });
      await worker.request("close", { sessionId: "session" });
    } finally { worker.close(); }
  });
});


describe("native gameplay through the host interface", () => {
  const executable = process.env.NODETOOL_NATIVE_GAME_WORKER ?? resolve(fileURLToPath(new URL("../../../native/game/build/", import.meta.url)), process.platform === "win32" ? "game-worker.exe" : "game-worker");
  const course = (source: string, maxCommands = 128) => nativeGameDocument.parse({
    schemaVersion: 4, engine: "native-cpp-1", dimension: "3d", id: "scripted-course", title: "Scripted course",
    initialSceneId: "scene", scenes: [{ id: "scene", entities: [{ id: "player", behaviors: [{ id: "update", scriptId: "behavior", maxCommands }] }] }],
    scripts: [{ id: "behavior", source }]
  });

  it("runs QuickJS gameplay and repeats continuation after restoring a snapshot", async () => {
    const worker = new NativeGameWorker({ executable });
    const document = course("(input) => ({state: {updates: (input.state.updates || 0) + 1}, commands: [{kind: 'score', amount: 2}]})");
    try {
      await worker.request("open", { sessionId: "play", document });
      expect(await worker.request("start", { sessionId: "play", seed: 7 })).toMatchObject({ tick: 0, score: 0 });
      expect(await worker.request("step", { sessionId: "play" })).toMatchObject({ tick: 1, score: 2 });
      const snapshot = await worker.request("snapshot", { sessionId: "play" });
      expect(await worker.request("step", { sessionId: "play" })).toMatchObject({ tick: 2, score: 4 });
      await worker.request("restore", { sessionId: "play", snapshot });
      expect(await worker.request("step", { sessionId: "play" })).toMatchObject({ tick: 2, score: 4 });
      const continued = await worker.request("snapshot", { sessionId: "play" });
      expect(continued).toMatchObject({ tick: 2, states: { "player/update": { updates: 2 } } });
    } finally { worker.close(); }
  });

  it("rejects a checkpoint from another worker without replacing the active session", async () => {
    const document = course("(input) => ({state: {updates: (input.state.updates || 0) + 1}, commands: [{kind: 'score', amount: 2}]})");
    const first = new NativeGameWorker({ executable });
    let snapshot: unknown;
    try {
      await first.request("open", { sessionId: "original", document });
      await first.request("start", { sessionId: "original", seed: 7 });
      await first.request("step", { sessionId: "original" });
      snapshot = await first.request("snapshot", { sessionId: "original" });
    } finally { first.close(); }
    const reopened = new NativeGameWorker({ executable });
    try {
      await reopened.request("open", { sessionId: "reopened", document });
      await reopened.request("start", { sessionId: "reopened", seed: 7 });
      await expect(reopened.request("restore", { sessionId: "reopened", snapshot })).rejects.toMatchObject({ code: "snapshot_error" });
      expect(await reopened.request("frame", { sessionId: "reopened" })).toMatchObject({ tick: 0, score: 0 });
      expect(await reopened.request("step", { sessionId: "reopened" })).toMatchObject({ tick: 1, score: 2 });
    } finally { reopened.close(); }
  });

  it("keeps a failed source replacement unchanged and restarts after a valid replacement", async () => {
    const worker = new NativeGameWorker({ executable });
    const document = course("() => ({commands: [{kind: 'score', amount: 2}]})");
    try {
      await worker.request("open", { sessionId: "reload", document });
      await worker.request("start", { sessionId: "reload" });
      await worker.request("step", { sessionId: "reload" });
      const invalid = course("(() =>");
      await expect(worker.request("reload", { sessionId: "reload", document: invalid })).rejects.toBeInstanceOf(NativeGameWorkerError);
      expect(await worker.request("frame", { sessionId: "reload" })).toMatchObject({ tick: 1, score: 2 });
      const replacement = course("() => ({commands: [{kind: 'score', amount: 5}]})");
      expect(await worker.request("reload", { sessionId: "reload", document: replacement })).toMatchObject({ tick: 0, score: 0 });
      expect(await worker.request("step", { sessionId: "reload" })).toMatchObject({ tick: 1, score: 5 });
    } finally { worker.close(); }
  });

  it("validates source edits before committing the authored revision or restarting gameplay", async () => {
    const worker = new NativeGameWorker({ executable });
    const document = course("() => ({commands: [{kind: 'score', amount: 2}]})");
    try {
      await worker.request("open", { sessionId: "edit-source", document });
      await worker.request("start", { sessionId: "edit-source", seed: 7 });
      await worker.request("step", { sessionId: "edit-source" });
      await expect(worker.request("transaction", { sessionId: "edit-source", expectedRevision: 0,
        operations: [{ kind: "setScript", script: { id: "behavior", source: "(() =>" } }] })).rejects.toBeInstanceOf(NativeGameWorkerError);
      expect(await worker.request("inspect", { sessionId: "edit-source" })).toMatchObject({ revision: 0 });
      expect(await worker.request("frame", { sessionId: "edit-source" })).toMatchObject({ tick: 1, score: 2 });
      expect(await worker.request("transaction", { sessionId: "edit-source", expectedRevision: 0,
        operations: [{ kind: "setScript", script: { id: "behavior", source: "() => ({commands: [{kind: 'score', amount: 5}]})" } }] })).toMatchObject({ revision: 1 });
      expect(await worker.request("frame", { sessionId: "edit-source" })).toMatchObject({ tick: 0, score: 0 });
      expect(await worker.request("step", { sessionId: "edit-source" })).toMatchObject({ tick: 1, score: 5 });
    } finally { worker.close(); }
  });

  it("does not publish staged gameplay commands when a behavior exceeds its command limit", async () => {
    const worker = new NativeGameWorker({ executable });
    const document = course("() => ({commands: [{kind: 'score', amount: 2}, {kind: 'score', amount: 3}]})", 1);
    try {
      await worker.request("open", { sessionId: "limits", document });
      await worker.request("start", { sessionId: "limits" });
      await expect(worker.request("step", { sessionId: "limits" })).rejects.toMatchObject({
        details: { entityId: "player", behaviorId: "update", tick: 0 }
      });
      expect(await worker.request("frame", { sessionId: "limits" })).toMatchObject({ tick: 0, score: 0 });
    } finally { worker.close(); }
  });
});
