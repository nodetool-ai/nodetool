import { importPack } from "@nodetool-ai/node-catalog";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Command } from "commander";
import { z } from "zod";
import { gameEvent, gameInputFrame, type GameEvent, type GameInputFrame, type GameSnapshot } from "@nodetool-ai/protocol/game.js";
import { gameEvent3D, gameInputFrame3D, parsePackageAssetUri, type GameDocument3D, type GameEvent3D, type GameSnapshot3D } from "@nodetool-ai/protocol";
import { createMemoryGameSaveStorage, createScriptedGameSession, createGameSession3D, decodePreparedGameCollider3D, GamePlayerSaves, hashGameSnapshot3D, validateGame, validateAnyGame } from "@nodetool-ai/game-runtime";
import { benchmarkNativeGame } from "./game-benchmark.js";
import { printCommandError } from "@nodetool-ai/pack-manager/command-errors";
import { checkoutPackageAssetsDir } from "@nodetool-ai/cli-common/package-assets";
import { registerGameSmokeCommand } from "./game-smoke.js";
import { registerNativeCppGameCommands } from "./game-native-cpp.js";

interface SimulateOptions {
  ticks: string;
  seed: string;
  inputs?: string;
  assetsDir?: string;
  expectScore?: string;
  expectWin?: boolean;
  assertions?: string;
  verifyReplay?: boolean;
  saves?: string;
  json?: boolean;
}

const strictGameEvent = z.union(gameEvent.options.map((variant) => variant.strict()));
const jsonFields = z.record(z.string(), z.unknown());

const tickAssertion = z.strictObject({
  tick: z.number().int().nonnegative(),
  sceneId: z.string().min(1).optional(),
  entities: z.array(z.strictObject({
    id: z.string().min(1),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    active: z.boolean().optional()
  })).optional(),
  events: z.array(strictGameEvent).optional()
});

const gameAssertions = z.strictObject({
  tolerance: z.number().finite().nonnegative().default(1e-9),
  ticks: z.array(tickAssertion)
});

type TickAssertion = z.infer<typeof tickAssertion>;

interface AssertionFailure {
  readonly tick: number;
  readonly path: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

interface BenchOptions {
  ticks: string;
  warmup: string;
  seed: string;
  inputs?: string;
  assetsDir?: string;
  failOnBudget?: boolean;
  json?: boolean;
}

interface PerfOptions {
  inputs?: string;
  seconds: string;
  warmup: string;
  assetsDir?: string;
  software?: boolean;
  vsync?: boolean;
  keepBuild?: string;
  profile?: string;
  failOnBudget?: boolean;
  json?: boolean;
}

interface CaptureOptions {
  ticks: string;
  seed: string;
  inputs?: string;
  out: string;
  scale: string;
  backend: string;
  assetsDir?: string;
  failOnBudget?: boolean;
  json?: boolean;
}

interface BuildOptions {
  out: string;
  assetsDir?: string;
  target: string;
  name?: string;
  identifier?: string;
  appVersion?: string;
  icon?: string;
  orientation?: string;
  compile?: boolean;
  json?: boolean;
}

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  ttf: "font/ttf",
  otf: "font/otf",
  glb: "model/gltf-binary",
  json: "application/json"
};

/** Reads a shipped `package://` asset from the package asset directory of this checkout or of NODETOOL_PACKAGE_ASSETS_DIR. */
async function readPackageAsset(uri: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const ref = parsePackageAssetUri(uri);
  const root = process.env.NODETOOL_PACKAGE_ASSETS_DIR || checkoutPackageAssetsDir();
  if (!ref || !root) return null;
  const base = await realpath(root);
  let path: string;
  try { path = await realpath(join(base, ref.packageName, ref.path)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  if (!path.startsWith(`${base}${sep}`)) { throw new Error(`Package asset escapes the asset directory: ${uri}`); } // key-boundary-ok: node:path sep anchors containment after realpath.
  return { bytes: await readFile(path), mimeType: MEDIA_TYPES[extname(path).slice(1).toLowerCase()] ?? "application/octet-stream" };
}

async function readBuildAsset(directory: string | undefined, sourceAssetId: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (sourceAssetId.startsWith("builtin:")) return null;
  if (sourceAssetId.startsWith("package://")) return readPackageAsset(sourceAssetId);
  if (!directory) return null;
  if (!/^[a-f0-9]{32}$/.test(sourceAssetId)) {
    throw new Error(`Asset ID must be a full 32-character resource ID: ${sourceAssetId}`);
  }
  for (const [extension, mimeType] of Object.entries(MEDIA_TYPES)) {
    try {
      return { bytes: await readFile(join(directory, `${sourceAssetId}.${extension}`)), mimeType };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return null;
}

function nonnegativeInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a nonnegative integer`);
  }
  return parsed;
}

async function readDocument(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

/** A shipped example file. A game document never has `name` and `document` without `schemaVersion`. */
const exampleWrapper = z.object({ name: z.string(), document: z.record(z.string(), z.unknown()), schemaVersion: z.never().optional() });

/** Reads a game document, or the `document` of a shipped example file `{name, document, …}`. */
async function readGameDocument(path: string): Promise<unknown> {
  const raw = await readDocument(path);
  const wrapped = exampleWrapper.safeParse(raw);
  return wrapped.success ? wrapped.data.document : raw;
}

async function readInputs<Schema extends z.ZodType>(path: string | undefined, schema: Schema): Promise<z.output<Schema>[]> {
  if (!path) return [];
  const raw = await readDocument(path);
  if (!Array.isArray(raw)) {
    throw new Error("Input recording must be an array of tick input frames");
  }
  return raw.map((input, index) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input at tick ${index}: ${parsed.error.message}`);
    }
    return parsed.data;
  });
}

const savesFile = z.strictObject({ progress: z.record(z.string(), z.unknown()).optional(), settings: z.record(z.string(), z.unknown()).optional() });

/**
 * In-memory saves for a headless run, seeded from `--saves`. Script loads read this storage only, so a run is
 * repeatable. The report lists each slot's data after the run.
 */
async function headlessSaves(path: string | undefined) {
  const storage = createMemoryGameSaveStorage();
  const errors: string[] = [];
  const saves = new GamePlayerSaves(storage, { onError: (error, request) => errors.push(`Tick ${request.tick} ${request.kind} ${request.scope}/${request.slot}: ${error.message}`) });
  const seeded = path ? savesFile.parse(await readDocument(path)) : {};
  for (const scope of ["progress", "settings"] as const) {
    for (const [slot, data] of Object.entries(seeded[scope] ?? {})) { await saves.save(scope, slot, data); }
  }
  let used = path !== undefined;
  return {
    saves,
    /** Performs a step's requests before the next tick. */
    async after(requests: Parameters<GamePlayerSaves["handle"]>[0], snapshot: () => unknown): Promise<void> {
      if (!requests) { return; }
      used = true;
      saves.handle(requests, snapshot);
      await saves.idle();
    },
    report() {
      if (!used) { return undefined; }
      const entries = storage.entries();
      const data = (scope: "progress" | "settings") => Object.fromEntries(Object.entries(entries[scope]).map(([slot, record]) => [slot, record.data]));
      return { progress: data("progress"), settings: data("settings"), errors };
    }
  };
}

async function readAssertions(path: string | undefined, ticks: number): Promise<{ byTick: Map<number, TickAssertion>; tolerance: number } | undefined> {
  if (!path) {
    return undefined;
  }
  const parsed = gameAssertions.safeParse(await readDocument(path));
  if (!parsed.success) {
    throw new Error(`Invalid game assertions: ${parsed.error.message}`);
  }
  const byTick = new Map<number, TickAssertion>();
  for (const assertion of parsed.data.ticks) {
    if (assertion.tick > ticks) {
      throw new Error(`Assertion tick ${assertion.tick} exceeds requested ${ticks} ticks`);
    }
    if (byTick.has(assertion.tick)) {
      throw new Error(`Duplicate assertion for tick ${assertion.tick}`);
    }
    byTick.set(assertion.tick, assertion);
  }
  return { byTick, tolerance: parsed.data.tolerance };
}

function firstDifference(expected: unknown, actual: unknown, path: string): { path: string; expected: unknown; actual: unknown } | undefined {
  if (isDeepStrictEqual(expected, actual)) {
    return undefined;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return { path: `${path}.length`, expected: expected.length, actual: actual.length };
    }
    for (let index = 0; index < expected.length; index += 1) {
      const difference = firstDifference(expected[index], actual[index], `${path}[${index}]`);
      if (difference) {
        return difference;
      }
    }
  }
  const expectedObject = jsonFields.safeParse(expected);
  const actualObject = jsonFields.safeParse(actual);
  if (expectedObject.success && actualObject.success) {
    const expectedFields = expectedObject.data;
    const actualFields = actualObject.data;
    for (const key of new Set([...Object.keys(expectedFields), ...Object.keys(actualFields)])) {
      const difference = firstDifference(expectedFields[key], actualFields[key], `${path}.${key}`);
      if (difference) {
        return difference;
      }
    }
  }
  return { path, expected: expected ?? null, actual: actual ?? null };
}

function checkTick(assertion: TickAssertion | undefined, snapshot: GameSnapshot, events: readonly GameEvent[], tolerance: number): AssertionFailure[] {
  if (!assertion) {
    return [];
  }
  const failures: AssertionFailure[] = [];
  const check = (path: string, expected: unknown, actual: unknown): void => {
    if (!isDeepStrictEqual(expected, actual)) {
      failures.push({ tick: assertion.tick, path, expected, actual: actual ?? null });
    }
  };
  if (assertion.sceneId !== undefined) {
    check("sceneId", assertion.sceneId, snapshot.sceneId);
  }
  for (const entityAssertion of assertion.entities ?? []) {
    const entity = snapshot.entities.find((candidate) => candidate.id === entityAssertion.id);
    if (!entity) {
      failures.push({ tick: assertion.tick, path: `entities.${entityAssertion.id}`, expected: "present", actual: "missing" });
      continue;
    }
    for (const coordinate of ["x", "y"] as const) {
      const expected = entityAssertion[coordinate];
      if (expected !== undefined && Math.abs(entity[coordinate] - expected) > tolerance) {
        failures.push({ tick: assertion.tick, path: `entities.${entity.id}.${coordinate}`, expected, actual: entity[coordinate] });
      }
    }
    if (entityAssertion.active !== undefined) {
      check(`entities.${entity.id}.active`, entityAssertion.active, entity.active);
    }
  }
  if (assertion.events !== undefined) {
    const difference = firstDifference(assertion.events, events, "events");
    if (difference) {
      failures.push({ tick: assertion.tick, ...difference });
    }
  }
  return failures;
}

function validateCliDocument(value: unknown) {
  const legacyVersion = z.object({ schemaVersion: z.union([z.literal(1), z.literal(2)]) }).safeParse(value);
  if (legacyVersion.success) { return validateGame(value); }
  const result = validateAnyGame(value);
  return { valid: result.valid, document: result.valid ? result.document : undefined, issues: result.diagnostics,
    diagnostics: result.diagnostics, errors: result.diagnostics.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    warnings: result.valid ? result.warnings : [] };
}

/** Register native game validation and deterministic simulation commands. */
export function registerGameCommands(program: Command): void {
  const game = program.command("game").description("Validate and playtest native games");
  registerGameSmokeCommand(game);
  registerNativeCppGameCommands(game);

  game
    .command("validate <game_file>")
    .description("Validate a native game document and its references")
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: { json?: boolean }) => {
      try {
        const report = validateCliDocument(await readGameDocument(path));
        if (options.json) {
          process.stdout.write(`${JSON.stringify(report)}\n`);
        } else {
          process.stdout.write(
            report.valid
              ? "Game document is valid\n"
              : `${report.errors.join("\n")}\n`
          );
          for (const warning of report.warnings ?? []) { process.stdout.write(`Warning ${warning.path.join(".")}: ${warning.message}\n`); }
        }
        if (!report.valid) process.exitCode = 1;
      } catch (error) {
        process.exitCode = printCommandError(error, options.json);
      }
    });

  game.command("bench <game_file>")
    .description("Measure headless native game tick, script and sampled allocation costs")
    .option("--ticks <count>", "Measured ticks", "1200")
    .option("--warmup <count>", "Warmup ticks", "300")
    .option("--seed <integer>", "Random seed", "1")
    .option("--inputs <file>", "JSON array of tick-indexed input frames from tick 0 (warmup included), so the bench measures play")
    .option("--assets-dir <directory>", "Prepared 3D collider files named <full-asset-id>.json. Shipped package:// assets resolve without it")
    .option("--fail-on-budget", "Exit 1 when the tick p95 exceeds performance.budgets.tickMs (default 4 ms)")
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: BenchOptions) => {
      try {
        const validated = validateCliDocument(await readGameDocument(path));
        if (!validated.valid || !validated.document) { throw new Error(validated.errors.join("\n")); }
        const document = validated.document;
        const inputs = document.schemaVersion === 3 ? await readInputs(options.inputs, gameInputFrame3D) : await readInputs(options.inputs, gameInputFrame);
        const report = await benchmarkNativeGame(document, Number(options.ticks), Number(options.warmup), Number(options.seed),
          { inputs, resolveCollider: sessionAssetOptions3D(options.assetsDir).resolveCollider });
        const { formatGameTimeBudgetOverrun, gameTimeBudgetOverruns, resolveGameTimeBudgets } = await importPack<typeof import("@nodetool-ai/game-renderer")>("game", "@nodetool-ai/game-renderer");
        const limits = resolveGameTimeBudgets(document.schemaVersion === 3 ? document.performance?.budgets : undefined);
        const overruns = gameTimeBudgetOverruns({ tickMs: report.tickMs.p95 }, limits);
        process.stdout.write(`${JSON.stringify({ ...report, budget: { limits: { tickMs: limits.tickMs }, overruns } }, null, options.json ? undefined : 2)}\n`);
        if (!options.json) { for (const overrun of overruns) { process.stderr.write(`${formatGameTimeBudgetOverrun(overrun)}\n`); } }
        if (options.failOnBudget && overruns.length > 0) { process.exitCode = 1; }
      } catch (error) { process.exitCode = printCommandError(error, options.json); }
    });

  game
    .command("simulate <game_file>")
    .description("Run a fixed number of game ticks without a renderer")
    .requiredOption("--ticks <count>", "Number of ticks to run")
    .option("--seed <integer>", "Random seed", "1")
    .option("--inputs <file>", "JSON array of tick-indexed input frames")
    .option("--assets-dir <directory>", "Prepared 3D collider files named <full-asset-id>.json")
    .option("--expect-score <score>", "Fail if the final score differs")
    .option("--expect-win", "Fail unless the win condition is reached")
    .option("--assertions <file>", "JSON assertions for scene, entities, and ordered events at selected ticks")
    .option("--verify-replay", "Resume at the midpoint and compare snapshots and events tick by tick")
    .option("--saves <file>", "JSON {progress?, settings?} of slot data that script loads read. Saves stay in memory")
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: SimulateOptions) => {
      try {
        const validated = validateCliDocument(await readGameDocument(path));
        if (!validated.valid || !validated.document) {
          throw new Error(validated.errors.join("\n"));
        }
        const document = validated.document;
        if (document.schemaVersion === 3) { await simulateGame3D(document, options); return; }
        const ticks = nonnegativeInteger(options.ticks, "ticks");
        const seed = nonnegativeInteger(options.seed, "seed");
        const expectedScore = options.expectScore === undefined
          ? undefined
          : nonnegativeInteger(options.expectScore, "expect-score");
        const inputs = await readInputs(options.inputs, gameInputFrame);
        const contract = await readAssertions(options.assertions, ticks);
        const storage = await headlessSaves(options.saves);
        const session = await createScriptedGameSession(document, seed);
        let resumed: Awaited<ReturnType<typeof createScriptedGameSession>> | undefined;
        try {
          const events: GameEvent[] = [];
          const initialAssertion = contract?.byTick.get(0);
          const failures = initialAssertion
            ? checkTick(initialAssertion, session.snapshot(), [], contract?.tolerance ?? 1e-9)
            : [];
          const resumeTick = Math.floor(ticks / 2);
          let replayDivergence: AssertionFailure | undefined;
          const startReplay = async (saved: GameSnapshot): Promise<void> => {
            resumed = await createScriptedGameSession(document, seed, saved);
            const difference = firstDifference(saved, resumed.snapshot(), "snapshot");
            if (difference) {
              replayDivergence = { tick: saved.tick, ...difference };
            }
          };
          if (options.verifyReplay && resumeTick === 0) {
            await startReplay(session.snapshot());
          }
          for (let tick = 0; tick < ticks; tick += 1) {
            // The replay session steps the same frame, so a delivered load reaches both without storage.
            const input = storage.saves.withLoaded(inputs[tick] ?? EMPTY_INPUT);
            const result = session.step(input);
            await storage.after(result.saveRequests, () => session.snapshot());
            events.push(...result.events);
            const assertion = contract?.byTick.get(result.tick);
            const snapshot = assertion || (options.verifyReplay && result.tick >= resumeTick)
              ? session.snapshot()
              : undefined;
            if (assertion && snapshot) {
              failures.push(...checkTick(assertion, snapshot, result.events, contract?.tolerance ?? 1e-9));
            }
            if (snapshot && options.verifyReplay && result.tick === resumeTick) {
              await startReplay(snapshot);
            }
            if (resumed && snapshot && !replayDivergence && result.tick > resumeTick) {
              const replayStep = resumed.step(input);
              const difference = firstDifference(result.events, replayStep.events, "events")
                ?? firstDifference(snapshot, resumed.snapshot(), "snapshot");
              if (difference) {
                replayDivergence = { tick: result.tick, ...difference };
              }
            }
          }
          const snapshot = session.snapshot();
          const assertions = {
            score: expectedScore === undefined || snapshot.score === expectedScore,
            win: options.expectWin !== true || snapshot.won,
            ticks: failures.length === 0,
            replay: !replayDivergence
          };
          const replay = options.verifyReplay
            ? { resumeTick, verified: !replayDivergence, divergence: replayDivergence }
            : undefined;
          const report = {
            ticks, seed, snapshot, events, assertions, failures,
            replay,
            saves: storage.report(),
            ok: Object.values(assertions).every(Boolean)
          };
          if (options.json) {
            process.stdout.write(`${JSON.stringify(report)}\n`);
          } else {
            process.stdout.write(`Tick ${snapshot.tick}: score ${snapshot.score}, won ${snapshot.won}\n`);
            for (const failure of failures) {
              process.stdout.write(`Tick ${failure.tick} ${failure.path}: expected ${JSON.stringify(failure.expected)}, got ${JSON.stringify(failure.actual)}\n`);
            }
            if (replayDivergence) {
              process.stdout.write(`Replay diverged at tick ${replayDivergence.tick} ${replayDivergence.path}: expected ${JSON.stringify(replayDivergence.expected)}, got ${JSON.stringify(replayDivergence.actual)}\n`);
            }
            if (!assertions.score || !assertions.win) {
              process.stdout.write("Game assertions failed\n");
            }
          }
          if (!report.ok) {
            process.exitCode = 1;
          }
        } finally {
          resumed?.dispose();
          session.dispose();
        }
      } catch (error) {
        process.exitCode = printCommandError(error, options.json);
      }
    });

  game
    .command("capture <game_file>")
    .description("Capture one headless game frame as PNG")
    .requiredOption("--ticks <count>", "Tick to capture")
    .requiredOption("--out <file>", "PNG output path")
    .option("--seed <integer>", "Random seed", "1")
    .option("--inputs <file>", "JSON array of tick-indexed input frames")
    .option("--scale <factor>", "Output scale", "1")
    .option("--backend <canvas2d|webgpu|webgl2>", "Capture backend. Defaults to WebGL2 for 3D", "canvas2d")
    .option("--assets-dir <directory>", "Local media files named <full-asset-id>.<extension>")
    .option("--fail-on-budget", "3D only. Exit 1 when the frame exceeds a performance.budgets count (draw calls, triangles, particles)")
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: CaptureOptions, command: Command) => {
      try {
        const validated = validateCliDocument(await readGameDocument(path));
        if (!validated.valid || !validated.document) {
          throw new Error(validated.errors.join("\n"));
        }
        if (validated.document.schemaVersion === 3) {
          const backend = command.getOptionValueSource("backend") === "default" ? "webgl2" : options.backend;
          await captureGame3D(validated.document, { ...options, backend }); return;
        }
        if (options.failOnBudget) { throw new Error("--fail-on-budget applies to 3D games. 2D capture reports no frame counters"); }
        const ticks = nonnegativeInteger(options.ticks, "ticks");
        if (ticks === 0) throw new Error("ticks must be at least 1 for capture");
        const seed = nonnegativeInteger(options.seed, "seed");
        const scale = Number(options.scale);
        if (!Number.isFinite(scale) || scale <= 0) {
          throw new Error("scale must be a positive number");
        }
        if (options.backend !== "canvas2d" && options.backend !== "webgpu") {
          throw new Error("backend must be canvas2d or webgpu");
        }
        const inputs = await readInputs(options.inputs, gameInputFrame);
        const session = await createScriptedGameSession(validated.document, seed);
        try {
          const { captureGameFrame } = await importPack<typeof import("@nodetool-ai/game-renderer/node")>("game", "@nodetool-ai/game-renderer/node");
          const { GameParticles2D } = await importPack<typeof import("@nodetool-ai/game-renderer")>("game", "@nodetool-ai/game-renderer");
          const particles = new GameParticles2D(validated.document.tickRate);
          let frame;
          for (let tick = 0; tick < ticks; tick += 1) {
            frame = session.step(inputs[tick] ?? EMPTY_INPUT).frame;
            particles.tick(frame, session.takePresentationEvents());
          }
          if (!frame) throw new Error("Game produced no render frame");
          const diagnostics: string[] = [];
          const png = await captureGameFrame(frame, {
            scale,
            particles,
            backend: options.backend,
            effects: validated.document.renderEffects,
            hudEffectOrder: validated.document.hudEffectOrder,
            onDiagnostic: (message) => diagnostics.push(message),
            resolveAsset: async (key) => {
              const sourceId = validated.document?.assets[key]?.assetId;
              if (!sourceId) return null;
              return (await readBuildAsset(options.assetsDir, sourceId))?.bytes ?? null;
            }
          });
          await writeFile(options.out, png);
          const report = { path: options.out, tick: frame.tick, bytes: png.byteLength, diagnostics };
          process.stdout.write(options.json ? `${JSON.stringify(report)}\n` : `Captured tick ${report.tick} to ${report.path}\n${diagnostics.map((message) => `${message}\n`).join("")}`);
        } finally {
          session.dispose();
        }
      } catch (error) {
        process.exitCode = printCommandError(error, options.json);
      }
    });

  game.command("perf <game_file>")
    .description("Export a 3D game, play it in Chromium on the machine GPU and measure frame time, draw calls, triangles and shader program growth")
    .option("--inputs <file>", "JSON array of input frames replayed with advance before live play")
    .option("--seconds <seconds>", "Measured seconds of live play", "10")
    .option("--warmup <seconds>", "Seconds of live play before the measurement", "2")
    .option("--assets-dir <directory>", "Local media files named <full-asset-id>.<extension>. Shipped package:// assets resolve without it")
    .option("--software", "Use SwiftShader instead of the machine GPU. Frame times then say nothing about real hardware")
    .option("--vsync", "Keep vsync and Chromium's frame rate limit. By default frames are uncapped, so frame time shows the real cost")
    .option("--keep-build <directory>", "Export into this directory and keep it, instead of a temporary directory")
    .option("--profile <file>", "Write a Chrome CPU profile of the measured window and list its hottest functions. A source checkout keeps readable names")
    .option("--fail-on-budget", "Exit 1 when frame p95 exceeds performance.budgets.frameMs (default 16.6), draw calls or triangles exceed their budgets, or shader programs grow during play")
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: PerfOptions) => {
      let temporary: string | undefined;
      try {
        const validated = validateCliDocument(await readGameDocument(path));
        if (!validated.valid || !validated.document) { throw new Error(validated.errors.join("\n")); }
        const document = validated.document;
        if (document.schemaVersion !== 3) { throw new Error("game perf measures 3D games. Use game bench for 2D tick cost"); }
        const inputs = await readInputs(options.inputs, gameInputFrame3D);
        const outputDir = options.keepBuild ? resolve(options.keepBuild) : (temporary = await mkdtemp(join(tmpdir(), "nodetool-game-perf-")));
        const { buildStandaloneGame3D } = await importPack<typeof import("@nodetool-ai/game-renderer/build3d")>("game", "@nodetool-ai/game-renderer/build3d");
        await buildStandaloneGame3D({ document, outputDir, resolveAsset: (assetId) => readBuildAsset(options.assetsDir, assetId) });
        const { measureStandaloneGame3D, formatGamePerfOverrun } = await importPack<typeof import("@nodetool-ai/game-renderer/perf")>("game", "@nodetool-ai/game-renderer/perf");
        // A recorded route never carries save loads, so the frames go to the page without them.
        const report = await measureStandaloneGame3D(outputDir, { inputs: inputs.map(({ loaded: _loaded, ...frame }) => frame),
          seconds: Number(options.seconds), warmupSeconds: Number(options.warmup), software: options.software, vsync: options.vsync,
          profile: options.profile ? resolve(options.profile) : undefined });
        if (options.json) { process.stdout.write(`${JSON.stringify(report)}\n`); }
        else {
          const round = (value: number) => Math.round(value * 100) / 100;
          process.stdout.write([
            `GPU ${report.gpu.renderer} (${report.gpu.adapterType}), canvas ${report.canvas.width}x${report.canvas.height}, ${report.vsync ? "vsync" : "uncapped"}`,
            `${report.renderedFrames} frames in ${report.seconds} s: ${round(report.fps)} fps`,
            `Frame ms p50 ${round(report.frameMs.p50)}, p95 ${round(report.frameMs.p95)}, p99 ${round(report.frameMs.p99)}, max ${round(report.frameMs.max)}`,
            `Draw calls p95 ${report.drawCalls.p95}, triangles p95 ${report.triangles.p95}`,
            `Shader programs ${report.programs.start} -> ${report.programs.end} (growth ${report.programs.growth})`,
            ...report.profile ? [`Profile ${report.profile.path}, ${round(report.profile.sampledMs)} ms sampled. Hottest self time:`,
              ...report.profile.top.slice(0, 10).map((entry) => `  ${entry.percent}% ${entry.functionName} ${entry.url}:${entry.line}`),
              ...report.profile.suspects.map((entry) => `Suspect in steady play: ${entry.functionName} ${entry.percent}%`)] : [],
            ...report.warnings, ...report.errors
          ].join("\n") + "\n");
          for (const overrun of report.budget.overruns) { process.stderr.write(`${formatGamePerfOverrun(overrun)}\n`); }
        }
        if (!report.ok || (options.failOnBudget && report.budget.overruns.length > 0)) { process.exitCode = 1; }
      } catch (error) {
        process.exitCode = printCommandError(error, options.json);
      } finally {
        if (temporary) { await rm(temporary, { recursive: true, force: true }); }
      }
    });

  game
    .command("build <game_file>")
    .description("Build a standalone web player, a Tauri desktop app project or an Expo mobile app project, with local, content-addressed assets")
    .requiredOption("--out <directory>", "Build output directory")
    .option("--assets-dir <directory>", "Local media files named <full-asset-id>.<extension>")
    .option("--target <target>", "web for a static web player, tauri for a desktop app project, expo for an iOS and Android app project", "web")
    .option("--name <name>", "App name (tauri and expo targets)")
    .option("--identifier <identifier>", "Reverse-DNS app identifier (tauri and expo targets)")
    .option("--app-version <version>", "App version MAJOR.MINOR.PATCH (tauri and expo targets)")
    .option("--icon <file>", "PNG, JPEG or WebP image for the app icon (tauri and expo targets)")
    .option("--orientation <orientation>", "default, portrait or landscape screen lock (expo target)")
    .option("--compile", "Also compile a release executable with cargo (tauri target)")
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: BuildOptions) => {
      try {
        const validated = validateCliDocument(await readGameDocument(path));
        if (!validated.valid || !validated.document) {
          throw new Error(validated.errors.join("\n"));
        }
        if (options.target !== "web" && options.target !== "tauri" && options.target !== "expo") {
          throw new Error("--target must be web, tauri or expo");
        }
        if (options.target === "web" && (options.name || options.identifier || options.appVersion || options.icon || options.orientation || options.compile)) {
          throw new Error("--name, --identifier, --app-version, --icon, --orientation and --compile apply to --target tauri or expo");
        }
        if (options.compile && options.target !== "tauri") {
          throw new Error("--compile applies to --target tauri");
        }
        if (options.orientation && options.target !== "expo") {
          throw new Error("--orientation applies to --target expo");
        }
        if (options.target === "expo") {
          const orientation = options.orientation;
          if (orientation !== undefined && orientation !== "default" && orientation !== "portrait" && orientation !== "landscape") {
            throw new Error("--orientation must be default, portrait or landscape");
          }
          const { buildExpoGameProject } = await importPack<typeof import("@nodetool-ai/game-renderer/build-expo")>("game", "@nodetool-ai/game-renderer/build-expo");
          const project = await buildExpoGameProject({
            document: validated.document, outputDir: resolve(options.out), resolveAsset: (assetId) => readBuildAsset(options.assetsDir, assetId),
            app: { name: options.name, identifier: options.identifier, version: options.appVersion, orientation,
              icon: options.icon ? await readFile(options.icon) : undefined }
          });
          process.stdout.write(options.json ? `${JSON.stringify(project)}\n`
            : `Built mobile app project in ${project.outputDir}\nRun npm install && npx expo start there to play it on a phone.\n`);
          return;
        }
        if (options.target === "tauri") {
          const { buildTauriGameProject, compileTauriGameProject } = await importPack<typeof import("@nodetool-ai/game-renderer/build-tauri")>("game", "@nodetool-ai/game-renderer/build-tauri");
          const project = await buildTauriGameProject({
            document: validated.document, outputDir: resolve(options.out), resolveAsset: (assetId) => readBuildAsset(options.assetsDir, assetId),
            app: { name: options.name, identifier: options.identifier, version: options.appVersion,
              icon: options.icon ? await readFile(options.icon) : undefined }
          });
          const compiled = options.compile
            ? await compileTauriGameProject(project, { onOutput: options.json ? undefined : (chunk) => process.stderr.write(chunk) })
            : undefined;
          const report: Record<string, unknown> = { ...project };
          if (compiled) { report.binaryPath = compiled.binaryPath; }
          process.stdout.write(options.json ? `${JSON.stringify(report)}\n`
            : `Built desktop app project in ${project.outputDir}\n${compiled ? `Compiled ${compiled.binaryPath}\n` : "Run npm install && npm run build there to make installers.\n"}`);
          return;
        }
        const result = validated.document.schemaVersion === 3 ? await (await importPack<typeof import("@nodetool-ai/game-renderer/build3d")>("game", "@nodetool-ai/game-renderer/build3d")).buildStandaloneGame3D({
          document: validated.document, outputDir: resolve(options.out), resolveAsset: (assetId) => readBuildAsset(options.assetsDir, assetId)
        }) : await (await importPack<typeof import("@nodetool-ai/game-renderer/build")>("game", "@nodetool-ai/game-renderer/build")).buildStandaloneGame({
          document: validated.document, outputDir: options.out, resolveAsset: (assetId) => readBuildAsset(options.assetsDir, assetId)
        });
        process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : `Built game in ${result.outputDir}\n`);
      } catch (error) {
        process.exitCode = printCommandError(error, options.json);
      }
    });
}

const EMPTY_INPUT: GameInputFrame = { pressed: [], justPressed: [] };

const tickAssertion3D = z.strictObject({
  tick: z.number().int().nonnegative(), sceneId: z.string().min(1).optional(),
  entities: z.array(z.strictObject({ id: z.string().min(1), x: z.number().finite().optional(), y: z.number().finite().optional(),
    z: z.number().finite().optional(), active: z.boolean().optional(), grounded: z.boolean().optional() })).optional(),
  events: z.array(z.union(gameEvent3D.options.map((variant) => variant.strict()))).optional()
});
type TickAssertion3D = z.infer<typeof tickAssertion3D>;

async function readAssertions3D(path: string | undefined, ticks: number) {
  if (!path) { return undefined; }
  const parsed = gameAssertions.extend({ ticks: z.array(tickAssertion3D) }).safeParse(await readDocument(path));
  if (!parsed.success) { throw new Error(`Invalid 3D game assertions: ${parsed.error.message}`); }
  const byTick = new Map<number, TickAssertion3D>();
  for (const assertion of parsed.data.ticks) {
    if (assertion.tick > ticks) { throw new Error(`Assertion tick ${assertion.tick} exceeds requested ${ticks} ticks`); }
    if (byTick.has(assertion.tick)) { throw new Error(`Duplicate assertion for tick ${assertion.tick}`); }
    byTick.set(assertion.tick, assertion);
  }
  return { byTick, tolerance: parsed.data.tolerance };
}

function checkTick3D(assertion: TickAssertion3D, snapshot: GameSnapshot3D, events: readonly GameEvent3D[], tolerance: number): AssertionFailure[] {
  const failures: AssertionFailure[] = [];
  const check = (path: string, expected: unknown, actual: unknown) => {
    if (!isDeepStrictEqual(expected, actual)) { failures.push({ tick: assertion.tick, path, expected, actual: actual ?? null }); }
  };
  if (assertion.sceneId !== undefined) { check("sceneId", assertion.sceneId, snapshot.sceneId); }
  for (const expected of assertion.entities ?? []) {
    const entity = snapshot.entities.find((candidate) => candidate.id === expected.id);
    if (!entity) { check(`entities.${expected.id}`, "present", "missing"); continue; }
    for (const axis of ["x", "y", "z"] as const) {
      if (expected[axis] !== undefined && Math.abs(entity.transform.position[axis] - expected[axis]) > tolerance) {
        check(`entities.${entity.id}.${axis}`, expected[axis], entity.transform.position[axis]);
      }
    }
    if (expected.active !== undefined) { check(`entities.${entity.id}.active`, expected.active, entity.active); }
    if (expected.grounded !== undefined) { check(`entities.${entity.id}.grounded`, expected.grounded, entity.grounded); }
  }
  if (assertion.events !== undefined) {
    const difference = firstDifference(assertion.events, events, "events");
    if (difference) { failures.push({ tick: assertion.tick, ...difference }); }
  }
  return failures;
}

function sessionAssetOptions3D(directory?: string) {
  return { resolveCollider: async (binding: Parameters<typeof decodePreparedGameCollider3D>[1]) => {
    const asset = await readBuildAsset(directory, binding.assetId);
    if (!asset) { throw new Error(`Prepared collider ${binding.assetId} is unavailable. Pass --assets-dir.`); }
    return decodePreparedGameCollider3D(asset.bytes, binding);
  } };
}

async function simulateGame3D(document: GameDocument3D, options: SimulateOptions): Promise<void> {
  const ticks = nonnegativeInteger(options.ticks, "ticks");
  const seed = nonnegativeInteger(options.seed, "seed");
  const expectedScore = options.expectScore === undefined ? undefined : nonnegativeInteger(options.expectScore, "expect-score");
  const inputs = await readInputs(options.inputs, gameInputFrame3D);
  const contract = await readAssertions3D(options.assertions, ticks);
  const storage = await headlessSaves(options.saves);
  const sessionOptions = sessionAssetOptions3D(options.assetsDir);
  const session = await createGameSession3D(document, seed, undefined, sessionOptions);
  let resumed: Awaited<ReturnType<typeof createGameSession3D>> | undefined;
  try {
    const events: GameEvent3D[] = [];
    const initialAssertion = contract?.byTick.get(0);
    const failures = initialAssertion ? checkTick3D(initialAssertion, session.snapshot(), [], contract?.tolerance ?? 1e-9) : [];
    const resumeTick = Math.floor(ticks / 2);
    let replayDivergence: AssertionFailure | undefined;
    const startReplay = async (snapshot: GameSnapshot3D) => {
      resumed = await createGameSession3D(document, seed, snapshot, sessionOptions);
      const difference = firstDifference(snapshot, resumed.snapshot(), "snapshot");
      if (difference) { replayDivergence = { tick: snapshot.tick, ...difference }; }
    };
    if (options.verifyReplay && resumeTick === 0) { await startReplay(session.snapshot()); }
    for (let tick = 0; tick < ticks; tick++) {
      if (tick % 240 === 0) { await new Promise<void>((resolveTick) => setTimeout(resolveTick, 0)); }
      const input = storage.saves.withLoaded(inputs[tick] ?? gameInputFrame3D.parse({ pressed: [] }));
      const result = session.step(input);
      await storage.after(result.saveRequests, () => session.snapshot());
      events.push(...result.events);
      const assertion = contract?.byTick.get(result.tick);
      const snapshot = assertion || options.verifyReplay && result.tick >= resumeTick ? session.snapshot() : undefined;
      if (assertion && snapshot) { failures.push(...checkTick3D(assertion, snapshot, result.events, contract?.tolerance ?? 1e-9)); }
      if (snapshot && options.verifyReplay && result.tick === resumeTick) { await startReplay(snapshot); }
      if (snapshot && resumed && !replayDivergence && result.tick > resumeTick) {
        const replayStep = resumed.step(input);
        const difference = firstDifference(result.events, replayStep.events, "events") ?? firstDifference(snapshot, resumed.snapshot(), "snapshot");
        if (difference) { replayDivergence = { tick: result.tick, ...difference }; }
      }
    }
    const snapshot = session.snapshot();
    const assertions = { score: expectedScore === undefined || snapshot.score === expectedScore, win: options.expectWin !== true || snapshot.won,
      ticks: failures.length === 0, replay: !replayDivergence };
    const report = { dimension: "3d", ticks, seed, snapshot, state_hash: await hashGameSnapshot3D(snapshot), events, assertions, failures,
      replay: options.verifyReplay ? { resumeTick, verified: !replayDivergence, divergence: replayDivergence } : undefined,
      saves: storage.report(), ok: Object.values(assertions).every(Boolean) };
    if (options.json) { process.stdout.write(`${JSON.stringify(report)}\n`); }
    else {
      process.stdout.write(`Tick ${snapshot.tick}: score ${snapshot.score}, won ${snapshot.won}\n`);
      for (const failure of failures) { process.stdout.write(`Tick ${failure.tick} ${failure.path}: expected ${JSON.stringify(failure.expected)}, got ${JSON.stringify(failure.actual)}\n`); }
      if (replayDivergence) { process.stdout.write(`Replay diverged at tick ${replayDivergence.tick} ${replayDivergence.path}\n`); }
    }
    if (!report.ok) { process.exitCode = 1; }
  } finally { resumed?.dispose(); session.dispose(); }
}

async function captureGame3D(document: GameDocument3D, options: CaptureOptions): Promise<void> {
  const ticks = nonnegativeInteger(options.ticks, "ticks");
  if (ticks === 0) { throw new Error("ticks must be at least 1 for capture"); }
  const seed = nonnegativeInteger(options.seed, "seed");
  const scale = Number(options.scale);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 4) { throw new Error("3D capture scale must be greater than 0 and at most 4"); }
  if (options.backend !== "webgl2") { throw new Error("3D capture backend must be webgl2"); }
  const inputs = await readInputs(options.inputs, gameInputFrame3D);
  const session = await createGameSession3D(document, seed, undefined, sessionAssetOptions3D(options.assetsDir));
  try {
    const { GameParticles3D } = await importPack<typeof import("@nodetool-ai/game-renderer")>("game", "@nodetool-ai/game-renderer");
    const particles = new GameParticles3D(document.tickRate);
    for (let tick = 0; tick < ticks; tick++) {
      const step = session.step(inputs[tick] ?? gameInputFrame3D.parse({ pressed: [] }));
      particles.tick(step.frame, session.takePresentationEvents());
    }
    const frame = session.frame();
    const stateHash = await hashGameSnapshot3D(session.snapshot());
    const { captureGameFrame3D } = await importPack<typeof import("@nodetool-ai/game-renderer/node3d")>("game", "@nodetool-ai/game-renderer/node3d");
    const captured = await captureGameFrame3D(frame, { stateHash, interpolation: 1, particles,
      width: Math.round(document.presentation.hudWidth * scale), height: Math.round(document.presentation.hudHeight * scale),
      resolveAsset: async (slot) => {
        const binding = document.assets[slot];
        const asset = binding ? await readBuildAsset(options.assetsDir, binding.assetId) : null;
        return asset ? { bytes: asset.bytes, digest: binding.digest } : null;
      } });
    const path = resolve(options.out);
    await writeFile(path, captured.png);
    const { formatGameFrameBudgetOverrun, gameFrameBudgetOverruns, resolveGameFrameBudgets } = await importPack<typeof import("@nodetool-ai/game-renderer")>("game", "@nodetool-ai/game-renderer");
    const limits = resolveGameFrameBudgets(document.performance?.budgets);
    const overruns = gameFrameBudgetOverruns({ drawCalls: captured.stats.drawCalls, triangles: captured.stats.triangles, particles: particles.count }, limits);
    const report = { dimension: "3d", path, tick: frame.tick, bytes: captured.png.byteLength, state_hash: stateHash,
      capabilities: captured.capabilities, stats: captured.stats, budget: { limits, overruns }, projected_bounds: captured.projectedBounds, diagnostics: [] };
    process.stdout.write(options.json ? `${JSON.stringify(report)}\n` : `Captured tick ${report.tick} to ${report.path}\n`);
    if (!options.json) { for (const overrun of overruns) { process.stderr.write(`${formatGameFrameBudgetOverrun(overrun)}\n`); } }
    if (options.failOnBudget && overruns.length > 0) { process.exitCode = 1; }
  } finally { session.dispose(); }
}
