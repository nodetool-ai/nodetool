import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import type { GameDocument } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

const USER = "game-route-owner";
const PROJECT = "game-route-project";
let directory: string;
const { captureGameFrame } = vi.hoisted(() => ({ captureGameFrame: vi.fn(async () => new Uint8Array([1, 2, 3])) }));
vi.mock("@nodetool-ai/game-renderer/node", () => ({ captureGameFrame }));

function run(user = USER) {
  return createCapabilityRun({ context: { userId: user } as ProcessingContext, gate: UNGATED });
}

interface GameReply { game: { id: string; revision: string }; document: GameDocument }
interface RouteReply {
  game_id: string;
  status: string;
  tick: number;
  win_tick: number | null;
  route: unknown[];
  level_stats: { entities: number };
}

describe("agent game routes", () => {
  beforeEach(async () => {
    initTestDb();
    directory = await mkdtemp(join(tmpdir(), "nodetool-game-routes-"));
    await Project.insertNew({ id: PROJECT, user_id: USER, name: "Routes", kind: "game" });
    await Workspace.create({ user_id: USER, project_id: PROJECT, name: "Files", path: directory, is_default: false });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    captureGameFrame.mockClear();
    ModelObserver.clear();
    await rm(directory, { recursive: true, force: true });
  });

  it("finds and replays an owned draft win beyond 3600 ticks", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Long route" }) as GameReply;
    expect(created.document.schemaVersion).toBe(2);
    const document = structuredClone(created.document);
    const scene = document.scenes[0];
    scene.entities = scene.entities.filter((entity) => !entity.id.startsWith("wall"));
    const gem = scene.entities.find((entity) => entity.id === "gem");
    if (!gem) throw new Error("Missing gem");
    gem.transform2d.x = 192;
    await agent.invoke("edit_native_game", { game_id: created.game.id, ops: [{ op: "set_document", document }] });
    const found = await agent.invoke("autoplay_native_game", { game_id: created.game.id.slice(0, 12), win: true, max_ticks: 4000, seed: 7 }) as RouteReply;
    expect(found).toMatchObject({ status: "reached", level_stats: { entities: scene.entities.length } });
    expect(found.win_tick).toBeGreaterThan(3600);
    const replay = await agent.invoke("playtest_native_game", { game_id: found.game_id, inputs: found.route, seed: 7, assertions: [{ event: "win", before_tick: found.win_tick }] });
    expect(replay).toMatchObject({ ticks: found.tick, route_complete: true, assertion_results: [{ passed: true }] });
    expect(await run("stranger").invoke("autoplay_native_game", { game_id: found.game_id, win: true })).toEqual({ error: "Game not found" });
    expect(await agent.invoke("autoplay_native_game", { game_id: found.game_id, target_prefix: "gem", win: true })).toMatchObject({ error: expect.any(String) });
  });

  it("checks an emitted victory signal and a selected tick on a long replay", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Victory signal" }) as GameReply;
    const document = structuredClone(created.document);
    document.scenes[0].entities.push({ id: "victory-script", transform2d: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, behaviors: [{ kind: "script", source: '({tick}) => ({state: null, commands: tick === 3700 ? [{kind: "emit", event: "victory"}] : []})', maxTickMs: 30, maxCommands: 8 }] });
    await agent.invoke("edit_native_game", { game_id: created.game.id, ops: [{ op: "set_document", document }] });
    const result = await agent.invoke("playtest_native_game", { game_id: created.game.id, inputs: [{ pressed: [], ticks: 3800 }], assertions: [{ event: "victory", before_tick: 3800 }, { event: "win", before_tick: 3800 }, { at_tick: 3700, entity_id: "player", near: { x: 0, y: 0 } }] });
    expect(result).toMatchObject({ ticks: 3800, route_complete: true, assertion_results: [{ passed: true }, { passed: true }, { passed: true }] });
  });

  it("returns an inconclusive budget result and validates the route cap", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Budget" }) as GameReply;
    expect(await agent.invoke("autoplay_native_game", { game_id: created.game.id, max_ticks: 1 })).toMatchObject({ status: "failed", reason: "tick_budget", win_tick: null });
    expect(await agent.invoke("autoplay_native_game", { game_id: created.game.id, max_ticks: 18001 })).toMatchObject({ error: expect.any(String) });
  });

  it("reports a script failure with the last successful state", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Failing script" }) as GameReply;
    const document = structuredClone(created.document);
    document.scenes[0].entities[0].behaviors.push({ kind: "script", source: '() => { throw new Error("route failed"); }', maxTickMs: 30, maxCommands: 8 });
    await agent.invoke("edit_native_game", { game_id: created.game.id, ops: [{ op: "set_document", document }] });
    expect(await agent.invoke("playtest_native_game", { game_id: created.game.id, inputs: [{ pressed: [], ticks: 2 }], assertions: [{ no_script_errors: true }] })).toMatchObject({ ticks: 0, route_complete: false, script_error: { tick: 1, message: expect.stringContaining("route failed") }, assertion_results: [{ passed: false }] });
  });
  it("does not resume a cancelled playtest to render future captures", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Cancelled captures" }) as GameReply;
    const controller = new AbortController();
    controller.abort();
    const cancelled = createCapabilityRun({ context: { userId: USER, signal: controller.signal } as ProcessingContext, gate: UNGATED });
    const result = await cancelled.invoke("playtest_native_game", { game_id: created.game.id, inputs: [{ pressed: [], ticks: 240 }], capture_ticks: [240], assertions: [{ event: "win" }] });
    expect(result).toMatchObject({ ticks: 0, cancelled: true, route_complete: false, assertion_results: [{ passed: false }] });
    expect(captureGameFrame).not.toHaveBeenCalled();
  });

  it("does not replay a wall-time-limited playtest for captures", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Capture budget" }) as GameReply;
    let clock = 0;
    vi.spyOn(Date, "now").mockImplementation(() => { clock += 16_000; return clock; });
    const result = await agent.invoke("playtest_native_game", { game_id: created.game.id, inputs: [{ pressed: [], ticks: 240 }], capture_ticks: [240] });
    expect(result).toMatchObject({ ticks: 0, wall_time_limited: true, route_complete: false });
    expect(captureGameFrame).not.toHaveBeenCalled();
  });

  it("bounds direct capture replay when cancelled", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Cancelled frame" }) as GameReply;
    const controller = new AbortController();
    controller.abort();
    const cancelled = createCapabilityRun({ context: { userId: USER, signal: controller.signal } as ProcessingContext, gate: UNGATED });
    const result = await cancelled.invoke("capture_native_game_frame", { game_id: created.game.id, ticks: [18_000], sheet: true });
    expect(result).toMatchObject({ frames: [], cancelled: true, route_complete: false, ticks: 0 });
    expect(result).not.toHaveProperty("image");
    expect(captureGameFrame).not.toHaveBeenCalled();
  });

  it("bounds direct capture replay by wall time", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Frame budget" }) as GameReply;
    let clock = 0;
    vi.spyOn(Date, "now").mockImplementation(() => { clock += 16_000; return clock; });
    const result = await agent.invoke("capture_native_game_frame", { game_id: created.game.id, ticks: [18_000], deadlineAt: Number.MAX_SAFE_INTEGER });
    expect(result).toMatchObject({ frames: [], wall_time_limited: true, route_complete: false, ticks: 0 });
    expect(captureGameFrame).not.toHaveBeenCalled();
  });

  it("keeps only completed frames when cancellation arrives during direct replay", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Partial captures" }) as GameReply;
    const controller = new AbortController();
    const cancelled = createCapabilityRun({ context: { userId: USER, signal: controller.signal } as ProcessingContext, gate: UNGATED });
    const pending = cancelled.invoke("capture_native_game_frame", { game_id: created.game.id, ticks: [0, 18_000] });
    const timer = setTimeout(() => controller.abort(), 20);
    try {
      const result = await pending;
      expect(result).toMatchObject({ frames: [{ tick: 0 }], cancelled: true, route_complete: false });
      expect(captureGameFrame).toHaveBeenCalledTimes(1);
    } finally {
      clearTimeout(timer);
    }
  });

});
