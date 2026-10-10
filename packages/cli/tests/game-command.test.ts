import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameSession, createScriptedGameSession, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { gameParticles } from "@nodetool-ai/protocol";
import { registerGameCommands } from "../src/commands/game.js";

vi.mock("@nodetool-ai/game-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/game-runtime")>();
  return { ...actual, createScriptedGameSession: vi.fn(actual.createScriptedGameSession) };
});

let directory: string;
let gamePath: string;
let output: string;
let originalExitCode: typeof process.exitCode;

async function runSimulation(...args: string[]): Promise<Record<string, unknown>> {
  const program = new Command();
  registerGameCommands(program);
  await program.parseAsync(["node", "nodetool", "game", "simulate", gamePath, "--json", ...args]);
  return JSON.parse(output.trim()) as Record<string, unknown>;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "nodetool-game-command-"));
  gamePath = join(directory, "game.json");
  await writeFile(gamePath, JSON.stringify(createTopDownRoomGame("a".repeat(32))));
  output = "";
  originalExitCode = process.exitCode;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output += String(chunk);
    return true;
  });
  vi.spyOn(console, "log").mockImplementation((message) => { output += `${String(message)}\n`; });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = originalExitCode;
  await rm(directory, { recursive: true, force: true });
});

describe("game simulate behavioral contracts", () => {
  it("checks scene, position, activity, and exact ordered events at selected ticks", async () => {
    const assertions = join(directory, "assertions.json");
    await writeFile(assertions, JSON.stringify({
      ticks: [
        { tick: 0, sceneId: "room", entities: [{ id: "player", x: 0, y: 0, active: true }], events: [] },
        { tick: 1, sceneId: "room", entities: [{ id: "player", x: 5e-10, y: 0, active: true }], events: [] }
      ]
    }));
    const report = await runSimulation("--ticks", "1", "--assertions", assertions, "--verify-replay");
    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.replay).toMatchObject({ resumeTick: 0, verified: true });
    expect(process.exitCode).toBe(originalExitCode);
  });

  it("reports wrong coordinates, a missing entity, and event order failure", async () => {
    const assertions = join(directory, "wrong.json");
    await writeFile(assertions, JSON.stringify({
      ticks: [{ tick: 1, entities: [{ id: "player", x: 10, active: false }, { id: "lost", active: true }],
        events: [{ kind: "win", score: 1 }] }]
    }));
    const report = await runSimulation("--ticks", "1", "--assertions", assertions);
    expect(report.ok).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ tick: 1, path: "entities.player.x" }),
      expect.objectContaining({ tick: 1, path: "entities.player.active" }),
      expect.objectContaining({ tick: 1, path: "entities.lost" }),
      expect.objectContaining({ tick: 1, path: "events.length" })
    ]));
    expect(process.exitCode).toBe(1);
  });

  it("checks ordered events rather than just their presence", async () => {
    const session = createGameSession(createTopDownRoomGame("a".repeat(32)), 1);
    let eventTick = 0;
    let expectedEvents: readonly unknown[] = [];
    for (let tick = 1; tick <= 40; tick += 1) {
      const result = session.step({ pressed: ["right"], justPressed: [] });
      if (result.events.length > 1) {
        eventTick = tick;
        expectedEvents = [...result.events].reverse();
        break;
      }
    }
    session.dispose();
    expect(eventTick).toBeGreaterThan(0);
    const inputs = join(directory, "inputs.json");
    const assertions = join(directory, "order.json");
    await writeFile(inputs, JSON.stringify(Array.from({ length: eventTick }, () => ({ pressed: ["right"] }))));
    await writeFile(assertions, JSON.stringify({ ticks: [{ tick: eventTick, events: expectedEvents }] }));
    const report = await runSimulation("--ticks", String(eventTick), "--inputs", inputs, "--assertions", assertions);
    expect(report.failures).toEqual([expect.objectContaining({ tick: eventTick, path: "events[0].kind" })]);
    expect(process.exitCode).toBe(1);
  });

  it("checks a scene transition at its exact tick", async () => {
    const base = createTopDownRoomGame("b".repeat(32));
    const room = base.scenes[0];
    const scene = {
      ...room,
      entities: room.entities.map((entity) => {
        if (entity.id === "gem") {
          return { ...entity, transform2d: { ...entity.transform2d, x: 0 },
            behaviors: [{ kind: "trigger", event: "next" }], audioSource: undefined };
        }
        if (entity.id === "player") {
          return { ...entity, behaviors: [...entity.behaviors,
            { kind: "sceneTransition", sceneId: "next", onEvent: "next" }] };
        }
        return entity;
      })
    };
    await writeFile(gamePath, JSON.stringify({ ...base, scenes: [scene,
      { id: "next", name: "Next", entities: [{ id: "marker", transform2d: { x: 5, y: 0 } }] }] }));
    const assertions = join(directory, "transition.json");
    await writeFile(assertions, JSON.stringify({ ticks: [
      { tick: 1, sceneId: "room" },
      { tick: 2, sceneId: "next", entities: [{ id: "marker", x: 5, active: true }],
        events: [{ kind: "contact", entityId: "player", otherId: "gem", phase: "stay", normalX: 0, normalY: 0 },
          { kind: "sceneTransition", sceneId: "next" }] }
    ] }));
    const report = await runSimulation("--ticks", "2", "--assertions", assertions);
    expect(report.ok).toBe(true);
    expect(report.snapshot).toMatchObject({ sceneId: "next" });
  });

  it("rejects assertions beyond the run instead of silently skipping them", async () => {
    const assertions = join(directory, "late.json");
    await writeFile(assertions, JSON.stringify({ ticks: [{ tick: 2, sceneId: "room" }] }));
    const report = await runSimulation("--ticks", "1", "--assertions", assertions);
    expect(report).toMatchObject({ error: "Assertion tick 2 exceeds requested 1 ticks" });
    expect(process.exitCode).toBe(1);
  });

  it("rejects unknown event fields instead of ignoring a typo", async () => {
    const assertions = join(directory, "typo.json");
    await writeFile(assertions, JSON.stringify({ ticks: [{ tick: 1,
      events: [{ kind: "win", score: 1, scroe: 1 }] }] }));
    const report = await runSimulation("--ticks", "1", "--assertions", assertions);
    expect(String(report.error)).toContain("Unrecognized key");
    expect(String(report.error)).toContain("scroe");
    expect(process.exitCode).toBe(1);
  });

  it("verifies zero ticks by restoring the initial snapshot", async () => {
    const report = await runSimulation("--ticks", "0", "--verify-replay");
    expect(report.replay).toMatchObject({ resumeTick: 0, verified: true });
    expect(report.ok).toBe(true);
  });

  it("compares scripted replay state without script timing", async () => {
    // Replay state must not depend on CI scheduling delays between script checks.
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
      clock += 0.1;
      return clock;
    });
    const base = createTopDownRoomGame("c".repeat(32));
    await writeFile(gamePath, JSON.stringify({ ...base, scenes: base.scenes.map((scene) => ({
      ...scene,
      entities: scene.entities.map((entity) => entity.id === "player"
        ? { ...entity, behaviors: [{ kind: "script", maxTickMs: 50,
          source: "({state}) => ({state: {count: (state?.count ?? 0) + 1}, commands: []})" }] }
        : entity)
    })) }));
    const report = await runSimulation("--ticks", "4", "--verify-replay");
    expect(report.error).toBeUndefined();
    expect(report.replay).toMatchObject({ resumeTick: 2, verified: true });
    expect(report.ok).toBe(true);
  });

  it("takes only the final snapshot without tick assertions or replay", async () => {
    const actual = await vi.importActual<typeof import("@nodetool-ai/game-runtime")>("@nodetool-ai/game-runtime");
    let snapshotCalls = 0;
    vi.mocked(createScriptedGameSession).mockImplementation(async (document, seed, snapshot) => {
      const session = await actual.createScriptedGameSession(document, seed, snapshot);
      return { ...session, snapshot() {
        snapshotCalls += 1;
        return session.snapshot();
      } };
    });
    const report = await runSimulation("--ticks", "4");
    expect(report.ok).toBe(true);
    expect(snapshotCalls).toBe(1);
  });

  it("reports the first divergent replay tick and path", async () => {
    const actual = await vi.importActual<typeof import("@nodetool-ai/game-runtime")>("@nodetool-ai/game-runtime");
    vi.mocked(createScriptedGameSession).mockImplementation(async (document, seed, snapshot) => {
      const session = await actual.createScriptedGameSession(document, seed, snapshot);
      if (!snapshot) return session;
      return {
        ...session,
        step(input) {
          const result = session.step(input);
          return { ...result, events: [...result.events, { kind: "win", score: 99 }] };
        }
      };
    });
    const report = await runSimulation("--ticks", "4", "--verify-replay");
    expect(report.ok).toBe(false);
    expect(report.replay).toMatchObject({ resumeTick: 2, verified: false,
      divergence: { tick: 3, path: "events.length" } });
    expect(process.exitCode).toBe(1);
  });
});

describe("game capture backend", () => {
  it("reports omitted optional effects in Canvas2D and runs a required effect with WebGPU", async () => {
    const game = createTopDownRoomGame("capture-backend");
    game.schemaVersion = 2;
    game.renderEffects = [{ kind: "brightnessContrast", brightness: 0.2, contrast: 1, required: false }];
    await writeFile(gamePath, JSON.stringify(game));
    const program = new Command();
    registerGameCommands(program);
    const canvasPath = join(directory, "canvas.png");
    await program.parseAsync(["node", "nodetool", "game", "capture", gamePath,
      "--ticks", "1", "--out", canvasPath, "--json"]);
    expect(JSON.parse(output.trim())).toMatchObject({ diagnostics: ["Optional GPU effects omitted in Canvas2D capture"] });
    expect((await readFile(canvasPath)).length).toBeGreaterThan(0);
    game.renderEffects[0]!.required = true;
    await writeFile(gamePath, JSON.stringify(game));
    output = "";
    const gpuPath = join(directory, "gpu.png");
    await program.parseAsync(["node", "nodetool", "game", "capture", gamePath,
      "--ticks", "1", "--out", gpuPath, "--backend", "webgpu", "--json"]);
    expect(JSON.parse(output.trim())).toMatchObject({ diagnostics: [], path: gpuPath });
    expect((await readFile(gpuPath)).length).toBeGreaterThan(0);
  }, 30000);
});

describe("game capture particles", () => {
  it("simulates particles up to the captured tick and draws them", async () => {
    const game = createTopDownRoomGame("capture-particles");
    game.schemaVersion = 2;
    game.scenes[0]!.entities.push({ id: "torch", name: "Torch", transform2d: { x: 1, y: 1 }, behaviors: [],
      particles: gameParticles.parse({ emitters: [{ id: "glow", rate: 60, lifetime: 10, speed: 0, size: 1, color: "#00ff00", unlit: true }] }) });
    await writeFile(gamePath, JSON.stringify(game));
    const program = new Command();
    registerGameCommands(program);
    const imagePath = join(directory, "particles.png");
    await program.parseAsync(["node", "nodetool", "game", "capture", gamePath, "--ticks", "30", "--out", imagePath, "--json"]);
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const image = await loadImage(await readFile(imagePath));
    const canvas = createCanvas(image.width, image.height);
    canvas.getContext("2d").drawImage(image, 0, 0);
    const [red, green, blue] = canvas.getContext("2d").getImageData(288, 112, 1, 1).data;
    expect(green).toBeGreaterThan(200);
    expect(red).toBeLessThan(40);
    expect(blue).toBeLessThan(40);
  });
});

describe("game build assets", () => {
  it("reads TrueType fonts from the assets directory", async () => {
    const game = createTopDownRoomGame("font-build");
    game.schemaVersion = 2;
    const bytes = await readFile(fileURLToPath(new URL("../../timeline/fonts/BebasNeue-Regular.ttf", import.meta.url)));
    const assetId = "f".repeat(32);
    game.assets.display = { assetId, digest: createHash("sha256").update(bytes).digest("hex"), mediaKind: "font",
      fontFormat: "ttf", required: true, width: 1, height: 1, pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" };
    await writeFile(gamePath, JSON.stringify(game));
    const assetsDir = join(directory, "assets");
    await mkdir(assetsDir);
    await writeFile(join(assetsDir, `${assetId}.ttf`), bytes);
    const program = new Command();
    registerGameCommands(program);
    const outDir = join(directory, "web");
    await program.parseAsync(["node", "nodetool", "game", "build", gamePath, "--out", outDir, "--assets-dir", assetsDir, "--json"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect((await readdir(join(outDir, "assets"))).some((file) => file.endsWith(".ttf"))).toBe(true);
  }, 60000);
});

it("simulates authored metadata commands and verifies property snapshot replay", async () => {
  const actual = await vi.importActual<typeof import("@nodetool-ai/game-runtime")>("@nodetool-ai/game-runtime");
  vi.mocked(createScriptedGameSession).mockImplementation(actual.createScriptedGameSession);
  const document = createTopDownRoomGame("a".repeat(32));
  document.schemaVersion = 4;
  document.engineVersion = "3";
  const player = document.scenes[0].entities.find(entity=>entity.id==="player");
  if (!player) { throw new Error("CLI fixture requires player"); }
  player.tags = ["hero"];
  player.props = {health:10};
  player.behaviors = [{kind:"script",source:"({entity})=>({state:{tags:entity.tags,health:entity.props.health},commands:[{kind:'setProp',key:'health',value:entity.props.health-1}]})",maxCommands:1,maxTickMs:30}];
  await writeFile(gamePath,JSON.stringify(document));
  const report = await runSimulation("--ticks","3","--verify-replay");
  expect(report).toMatchObject({ok:true,replay:{verified:true}});
  const session = await createScriptedGameSession(document,1);
  try {
    for (let tick=0;tick<3;tick+=1) { session.step({pressed:[]}); }
    expect(session.snapshot().entities.find(entity=>entity.id==="player")?.props).toEqual({health:7});
  } finally { session.dispose(); }
});

it("validates and simulates a document with an audio mixer and verifies replay", async () => {
  const document = createTopDownRoomGame("a".repeat(32));
  await writeFile(gamePath, JSON.stringify({ ...document, audio: { mixer: { buses: { ambience: { parent: "sfx", volume: 0.6 } },
    assetBuses: { "sfx.collect": "ui" }, snapshots: { victory: { buses: { music: { volume: 0.2 } } } },
    transitions: [{ on: { kind: "win" }, snapshot: "victory", fadeTicks: 30 }] } } }));
  const program = new Command();
  registerGameCommands(program);
  await program.parseAsync(["node", "nodetool", "game", "validate", gamePath, "--json"]);
  expect(JSON.parse(output.trim())).toMatchObject({ valid: true });
  output = "";
  const report = await runSimulation("--ticks", "30", "--verify-replay");
  expect(report).toMatchObject({ ok: true, replay: { verified: true } });
});

it("validates and simulates a spatial audio source, reports its emitter, and verifies replay", async () => {
  const document = createTopDownRoomGame("a".repeat(32));
  const spatial = (audioSource: Record<string, unknown>) => ({ ...document, scenes: document.scenes.map((scene) => ({ ...scene,
    entities: scene.entities.map((entity) => entity.id === "gem" ? { ...entity, audioSource: { ...entity.audioSource, ...audioSource } } : entity) })) });
  await writeFile(gamePath, JSON.stringify(spatial({ spatial: true, minDistance: 8, maxDistance: 4 })));
  const invalid = new Command();
  registerGameCommands(invalid);
  await invalid.parseAsync(["node", "nodetool", "game", "validate", gamePath, "--json"]);
  expect(JSON.parse(output.trim())).toMatchObject({ valid: false });
  expect(output).toContain("maxDistance (4) must be greater than minDistance (8)");
  output = "";
  process.exitCode = originalExitCode;
  await writeFile(gamePath, JSON.stringify(spatial({ spatial: true, minDistance: 2, maxDistance: 20, distanceModel: "linear" })));
  const inputs = join(directory, "inputs.json");
  await writeFile(inputs, JSON.stringify(Array.from({ length: 60 }, () => ({ pressed: ["right"], justPressed: [] }))));
  const report = await runSimulation("--ticks", "60", "--inputs", inputs, "--verify-replay");
  expect(report).toMatchObject({ ok: true, replay: { verified: true } });
  const audio = (report.events as { kind: string; emitter?: unknown }[]).find((event) => event.kind === "audio");
  expect(audio?.emitter).toEqual({ entityId: "gem", position: { x: 2, y: 0, z: 0 }, minDistance: 2, maxDistance: 20, rolloff: 1,
    distanceModel: "linear", doppler: 0 });
});

it("simulates script params and verifies replay", async () => {
  const actual = await vi.importActual<typeof import("@nodetool-ai/game-runtime")>("@nodetool-ai/game-runtime");
  vi.mocked(createScriptedGameSession).mockImplementation(actual.createScriptedGameSession);
  const document = createTopDownRoomGame("b".repeat(32));
  document.schemaVersion = 4;
  document.engineVersion = "3";
  const player = document.scenes[0].entities.find(entity=>entity.id==="player");
  if (!player) { throw new Error("CLI fixture requires player"); }
  player.behaviors = [{kind:"script",source:"(input)=>({state:input.params,commands:[{kind:'setVelocity',x:input.params.speed,y:0}]})",maxCommands:1,maxTickMs:30,
    params:{speed:{type:"number",default:1,minimum:0,maximum:5},target:{type:"entity"}},values:{speed:3,target:"gem"}}];
  await writeFile(gamePath,JSON.stringify(document));
  const report = await runSimulation("--ticks","3","--verify-replay");
  expect(report).toMatchObject({ok:true,replay:{verified:true}});
  const session = await createScriptedGameSession(document,1);
  try {
    session.step({pressed:[]});
    expect(Object.values(session.snapshot().scriptState)).toEqual([{speed:3,target:"gem"}]);
  } finally { session.dispose(); }
});

it("reports a reserved 2D engine before any simulation starts", async () => {
  await writeFile(gamePath, JSON.stringify({ ...createTopDownRoomGame("a".repeat(32)), schemaVersion: 5, engineVersion: "4" }));
  const program = new Command();
  registerGameCommands(program);
  await program.parseAsync(["node", "nodetool", "game", "validate", gamePath, "--json"]);
  expect(process.exitCode).toBe(1);
  expect(JSON.parse(output.trim())).toMatchObject({ valid: false,
    diagnostics: [{ code: "engine_unavailable", path: ["engineVersion"] }] });
});

it("simulates particle emitters and emitParticles commands with a verified replay", async () => {
  const actual = await vi.importActual<typeof import("@nodetool-ai/game-runtime")>("@nodetool-ai/game-runtime");
  vi.mocked(createScriptedGameSession).mockImplementation(actual.createScriptedGameSession);
  const document = createTopDownRoomGame("a".repeat(32));
  document.schemaVersion = 2;
  const player = document.scenes[0].entities.find(entity=>entity.id==="player");
  if (!player) { throw new Error("CLI fixture requires player"); }
  player.particles = gameParticles.parse({ emitters: [{ id: "dust", rate: 12, lifetime: { min: 0.2, max: 0.6 } }] });
  player.behaviors = [{kind:"script",source:"({tick})=>({state:null,commands:tick%10===0?[{kind:'emitParticles',count:4}]:[]})",maxCommands:1,maxTickMs:50}];
  await writeFile(gamePath,JSON.stringify(document));
  const report = await runSimulation("--ticks","30","--verify-replay");
  expect(report).toMatchObject({ok:true,replay:{verified:true}});
});
