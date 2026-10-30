import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { nativeGameDocument } from "@nodetool-ai/protocol/native-game";
import { NativeGameWorker, benchmarkNativeCppGame, captureNativeCppGame, exportNativeCppGame, createNativeCppCourse, createNativeCpp2dCourse, nativeCppFrameDigest, createNativeMemorySaveStorage, runNativeCppProcess, simulateNativeCppGame } from "../src/native.js";
const executable = process.env.NODETOOL_NATIVE_GAME_WORKER ?? fileURLToPath(new URL("../../../native/game/build/game-worker", import.meta.url));
afterEach(() => vi.unstubAllEnvs());
describe("native C++ creation and verification", () => {
  it("bounds child output, strips provider secrets, and propagates cancellation", async () => {
    vi.stubEnv("A6_PROVIDER_SECRET", "test-secret");
    expect(await runNativeCppProcess(process.execPath, ["-e", "process.stdout.write(String(process.env.A6_PROVIDER_SECRET === undefined))"])).toBe("true");
    await expect(runNativeCppProcess(process.execPath, ["-e", "process.stdout.write('x'.repeat(1100000))"])).rejects.toThrow("output exceeds limit");
    const abort = new AbortController(); abort.abort();
    await expect(runNativeCppProcess(process.execPath, [], abort.signal)).rejects.toThrow();
  });
  it("compares authored generation fields while ignoring only presentation ownership metadata", () => {
    const first = { generation: 1, entities: [{ props: { generation: 1 } }], presentationEvents: [{ generation: 1, data: { generation: 1 } }] };
    expect(nativeCppFrameDigest(first)).toBe(nativeCppFrameDigest({ ...first, generation: 2, presentationEvents: [{ generation: 2, data: { generation: 1 } }] }));
    expect(nativeCppFrameDigest(first)).not.toBe(nativeCppFrameDigest({ ...first, entities: [{ props: { generation: 2 } }] }));
    expect(nativeCppFrameDigest(first)).not.toBe(nativeCppFrameDigest({ ...first, presentationEvents: [{ generation: 1, data: { generation: 2 } }] }));
  });

  it.each(["2d", "3d"] as const)("records bounded JSON save loads and replays %s source without durable IO", async (dimension) => {
    const source = "i=>({commands:i.tick===0?[{kind:'save',scope:'progress',slot:'slot',data:{version:1,value:7}},{kind:'save',scope:'settings',slot:'slot',data:{version:1,value:2}},{kind:'load',scope:'progress',slot:'slot'},{kind:'load',scope:'settings',slot:'slot'}]:(i.input.loaded||[]).map(r=>({kind:'score',amount:r.data.value}))})";
    const document = nativeGameDocument.parse({ engine: "native-cpp-1", schemaVersion: dimension === "2d" ? 5 : 4, dimension, id: `save-${dimension}`, title: "JSON save fixture", initialSceneId: "scene", scenes: [{ id: "scene", entities: [{ id: "actor", behaviors: [{ id: "behavior", scriptId: "script" }] }] }], scripts: [{ id: "script", source }] });
    const storage = createNativeMemorySaveStorage(), read = vi.spyOn(storage, "read"), write = vi.spyOn(storage, "write");
    const result = await simulateNativeCppGame(document, { ticks: 4, executable, storage, verifyReplay: true, assertions: [{ tick: 4, path: ["score"], equals: 9 }] });
    expect(result.valid).toBe(true); expect(result.replayVerified).toBe(true);
    expect(write).toHaveBeenCalledTimes(2); expect(read).toHaveBeenCalledTimes(2);
    const recorded = z.array(z.record(z.string(), z.unknown())).parse(result.recordedInputs);
    expect(recorded[0]?.loaded).toBeUndefined();
    expect(recorded[1]?.loaded).toEqual([{ scope: "progress", slot: "slot", data: { version: 1, value: 7 } }, { scope: "settings", slot: "slot", data: { version: 1, value: 2 } }]);
    read.mockClear(); write.mockClear();
    const replay = await simulateNativeCppGame(document, { ticks: 4, executable, storage, replay: true, inputs: recorded });
    expect(z.object({ score: z.number() }).parse(replay.frame).score).toBe(9);
    expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
    expect(document.scripts[0]?.source).toBe(source);
  });

  it("creates, edits, saves/reopens, verifies a route and corrects faulty source through the worker", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-course-"));
    const worker = new NativeGameWorker({ executable });
    try {
      const course = createNativeCppCourse("a".repeat(32));
      await writeFile(join(directory, "collect.wav"), course.audio);
      const trace: Array<Readonly<Record<string, unknown>>> = [];
      const request = async (operation: string, input: Readonly<Record<string, unknown>> = {}): Promise<unknown> => {
        const result = await worker.request(operation, input); trace.push({ operation, input, result }); return result;
      };
      await request("hello");
      await request("open", { sessionId: "author", document: course.document });
      await expect(request("transaction", { sessionId: "author", expectedRevision: 0, operations: [{ kind: "setScript", script: { id: "faulty", source: "({ invalid source" } }] })).rejects.toThrow();
      const unchanged = z.object({ revision: z.number() }).parse(await request("inspect", { sessionId: "author" }));
      expect(unchanged.revision).toBe(0);
      await request("transaction", { sessionId: "author", expectedRevision: 0, operations: [{ kind: "setTitle", title: "Verified course" }, { kind: "setScript", script: { id: "fixed", source: "i=>({state:i.state})" } }] });
      const accepted = z.object({ document: nativeGameDocument }).parse(await request("inspect", { sessionId: "author" }));
      await writeFile(join(directory, "game.json"), JSON.stringify(accepted.document));
      const reopened = nativeGameDocument.parse(JSON.parse(await readFile(join(directory, "game.json"), "utf8")));
      await request("open", { sessionId: "reopened", document: reopened });
      await request("start", { sessionId: "reopened", seed: 1 });
      const inputs = Array.from({ length: 8 }, (_, tick) => ({ actions: { finish: tick === 5 } }));
      const result = await simulateNativeCppGame(reopened, { executable, ticks: 8, inputs, verifyReplay: true, assertions: [{ tick: 8, path: ["score"], equals: 11 }] });
      expect(result.valid).toBe(true); expect(result.replayVerified).toBe(true);
      const restarted = await simulateNativeCppGame(reopened, { executable, ticks: 9, inputs: [...inputs, { actions: { restart: true } }], assertions: [{ tick: 9, path: ["score"], equals: 0 }] });
      expect(restarted.valid).toBe(true);
      await writeFile(join(directory, "trace.json"), JSON.stringify(trace));
      expect(trace.map((item) => item.operation)).toContain("transaction");
    } finally { worker.close(); await rm(directory, { recursive: true, force: true }); }
  });
  it("authors and reopens a native2D course with dimensional operations and same-session replay", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-2d-course-"));
    const worker = new NativeGameWorker({ executable });
    try {
      const course = createNativeCpp2dCourse("c".repeat(32));
      for (const [path, bytes] of Object.entries(course.files)) { await writeFile(join(directory, path), bytes); }
      expect(course.document.dimension).toBe("2d");
      await worker.request("open", { sessionId: "author2d", document: course.document });
      await expect(worker.request("transaction", { sessionId: "author2d", expectedRevision: 0, operations: [{ kind: "setScript", script: { id: "faulty", source: "({ invalid source" } }] })).rejects.toThrow();
      expect(z.object({ revision: z.number() }).parse(await worker.request("inspect", { sessionId: "author2d" })).revision).toBe(0);
      await worker.request("transaction", { sessionId: "author2d", expectedRevision: 0, operations: [{ kind: "addEntity", sceneId: "course", entity: { id: "authored" } }] });
      const accepted = z.object({ document: nativeGameDocument }).parse(await worker.request("inspect", { sessionId: "author2d" }));
      expect(accepted.document.scenes[0]?.entities.find(entity => entity.id === "authored")?.transform).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      await writeFile(join(directory, "game.json"), JSON.stringify(accepted.document));
      const reopened = nativeGameDocument.parse(JSON.parse(await readFile(join(directory, "game.json"), "utf8")));
      const inputs = Array.from({ length: 8 }, (_, tick) => ({ move: { x: tick < 4 ? 1 : 0, y: 0 }, actions: { finish: tick === 5 } }));
      const result = await simulateNativeCppGame(reopened, { executable, ticks: 8, inputs, verifyReplay: true, assertions: [{ tick: 8, path: ["score"], equals: 11 }] });
      expect(result.valid).toBe(true); expect(result.replayVerified).toBe(true);
      const finalFrame = z.object({ entities: z.array(z.object({ id: z.string(), transform: z.object({ x: z.number() }) })) }).parse(result.frame);
      expect(finalFrame.entities.find(entity => entity.id === "player")?.transform.x).toBeGreaterThan(0);
    } finally { worker.close(); await rm(directory, { recursive: true, force: true }); }
  });
  it("carries an authored2D rider on the course moving platform", async () => {
    const course = createNativeCpp2dCourse("f".repeat(32));
    const document = nativeGameDocument.parse({ ...course.document, scenes: course.document.scenes.map(scene => ({ ...scene, entities: scene.entities.map(entity => entity.id === "player" ? { ...entity, transform: { ...entity.transform, x: -3, y: 0.65 } } : entity) })) });
    const result = await simulateNativeCppGame(document, { executable, ticks: 30, inputs: Array.from({ length: 30 }, () => ({ move: { x: 0, y: 0 } })), verifyReplay: true });
    expect(result.valid).toBe(true); expect(result.replayVerified).toBe(true);
    const frame = z.object({ entities: z.array(z.object({ id: z.string(), transform: z.object({ x: z.number() }) })) }).parse(result.frame);
    const player = frame.entities.find(entity => entity.id === "player"), platform = frame.entities.find(entity => entity.id === "platform");
    expect(player).toBeDefined(); expect(platform).toBeDefined();
    expect((player?.transform.x ?? -3) + 3).toBeGreaterThan(0.3);
    expect(player?.transform.x).toBeCloseTo(platform?.transform.x ?? 0, 2);
  });
  it.runIf(process.env.NODETOOL_NATIVE_GAME_PLAYER && (process.env.NODETOOL_NATIVE_GAME_RUNTIME_DIR || process.env.NODETOOL_NATIVE_GAME_BUILD_DIR))("captures and exports the authored2D course using prepared assets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-2d-delivery-"));
    try {
      const course = createNativeCpp2dCourse("e".repeat(32));
      for (const [path, bytes] of Object.entries(course.files)) { await writeFile(join(directory, path), bytes); }
      const inputs = Array.from({ length: 8 }, (_, tick) => ({ move: { x: tick < 4 ? 1 : 0, y: 0 }, actions: { finish: tick === 5 } }));
      const capture = await captureNativeCppGame(course.document, { assetsDir: directory, out: join(directory, "frame.png"), ticks: 8, inputs });
      expect(capture.tick).toBe(8);
      expect((await readFile(join(directory, "frame.png"))).subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
      const bundle = await exportNativeCppGame(course.document, { assetsDir: directory, out: join(directory, "standalone"), buildDir: process.env.NODETOOL_NATIVE_GAME_BUILD_DIR });
      expect(bundle).toMatchObject({ schemaVersion: 5, dimension: "2d", smoke: { captureVerified: true } });
      const exported = nativeGameDocument.parse(JSON.parse(await readFile(join(directory, "standalone", "game.json"), "utf8")));
      expect(exported).toEqual(course.document);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 120_000);
  it("reports mismatched assertions and identifies roundtrip benchmark measurements", async () => {
    const { document } = createNativeCppCourse("b".repeat(32));
    const result = await simulateNativeCppGame(document, { executable, ticks: 1, assertions: [{ tick: 1, path: ["score"], equals: 100 }] });
    expect(result.valid).toBe(false);
    const bench = await benchmarkNativeCppGame(document, { executable, ticks: 2, warmup: 1 });
    expect(bench.metric).toBe("host-roundtrip-ms");
  });
});
