import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Command } from "commander";
import { z } from "zod";
import { gameEvent, gameInputFrame, type GameEvent, type GameInputFrame, type GameSnapshot } from "@nodetool-ai/protocol/game.js";
import { gameEvent3D, gameInputFrame3D, type GameDocument3D, type GameEvent3D, type GameSnapshot3D } from "@nodetool-ai/protocol";
import { createScriptedGameSession, createGameSession3D, decodePreparedGameCollider3D, hashGameSnapshot3D, validateGame, validateAnyGame } from "@nodetool-ai/game-runtime";
import { benchmarkNativeGame } from "./game-benchmark.js";
import { printCommandError } from "../command-errors.js";
import { registerGameSmokeCommand } from "./game-smoke.js";

interface SimulateOptions {
  ticks: string;
  seed: string;
  inputs?: string;
  assetsDir?: string;
  expectScore?: string;
  expectWin?: boolean;
  assertions?: string;
  verifyReplay?: boolean;
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

interface CaptureOptions {
  ticks: string;
  seed: string;
  inputs?: string;
  out: string;
  scale: string;
  backend: string;
  assetsDir?: string;
  json?: boolean;
}

interface BuildOptions {
  out: string;
  assetsDir?: string;
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

async function readBuildAsset(directory: string | undefined, sourceAssetId: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (sourceAssetId.startsWith("builtin:")) return null;
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
    diagnostics: result.diagnostics, errors: result.diagnostics.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
}

/** Register native game validation and deterministic simulation commands. */
export function registerGameCommands(program: Command): void {
  const game = program.command("game").description("Validate and playtest native games");
  registerGameSmokeCommand(game);

  game
    .command("validate <game_file>")
    .description("Validate a native game document and its references")
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: { json?: boolean }) => {
      try {
        const report = validateCliDocument(await readDocument(path));
        if (options.json) {
          process.stdout.write(`${JSON.stringify(report)}\n`);
        } else {
          process.stdout.write(
            report.valid
              ? "Game document is valid\n"
              : `${report.errors.join("\n")}\n`
          );
        }
        if (!report.valid) process.exitCode = 1;
      } catch (error) {
        printCommandError(error, options.json);
        process.exitCode = 1;
      }
    });

  game.command("bench <game_file>")
    .description("Measure headless native game tick, script and sampled allocation costs")
    .option("--ticks <count>", "Measured ticks", "1200")
    .option("--warmup <count>", "Warmup ticks", "300")
    .option("--seed <integer>", "Random seed", "1")
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: { ticks: string; warmup: string; seed: string; json?: boolean }) => {
      try {
        const validated = validateCliDocument(await readDocument(path));
        if (!validated.valid || !validated.document) { throw new Error(validated.errors.join("\n")); }
        const report = await benchmarkNativeGame(validated.document, Number(options.ticks), Number(options.warmup), Number(options.seed));
        process.stdout.write(`${JSON.stringify(report, null, options.json ? undefined : 2)}\n`);
      } catch (error) { printCommandError(error, options.json); process.exitCode = 1; }
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
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: SimulateOptions) => {
      try {
        const validated = validateCliDocument(await readDocument(path));
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
            const input = inputs[tick] ?? EMPTY_INPUT;
            const result = session.step(input);
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
        printCommandError(error, options.json);
        process.exitCode = 1;
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
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: CaptureOptions, command: Command) => {
      try {
        const validated = validateCliDocument(await readDocument(path));
        if (!validated.valid || !validated.document) {
          throw new Error(validated.errors.join("\n"));
        }
        if (validated.document.schemaVersion === 3) {
          const backend = command.getOptionValueSource("backend") === "default" ? "webgl2" : options.backend;
          await captureGame3D(validated.document, { ...options, backend }); return;
        }
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
          let frame;
          for (let tick = 0; tick < ticks; tick += 1) {
            frame = session.step(inputs[tick] ?? EMPTY_INPUT).frame;
          }
          if (!frame) throw new Error("Game produced no render frame");
          const { captureGameFrame } = await import("@nodetool-ai/game-renderer/node");
          const diagnostics: string[] = [];
          const png = await captureGameFrame(frame, {
            scale,
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
        printCommandError(error, options.json);
        process.exitCode = 1;
      }
    });

  game
    .command("build <game_file>")
    .description("Build a standalone web player with local, content-addressed assets")
    .requiredOption("--out <directory>", "Build output directory")
    .option("--assets-dir <directory>", "Local media files named <full-asset-id>.<extension>")
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: BuildOptions) => {
      try {
        const validated = validateCliDocument(await readDocument(path));
        if (!validated.valid || !validated.document) {
          throw new Error(validated.errors.join("\n"));
        }
        const result = validated.document.schemaVersion === 3 ? await (await import("@nodetool-ai/game-renderer/build3d")).buildStandaloneGame3D({
          document: validated.document, outputDir: resolve(options.out), resolveAsset: (assetId) => readBuildAsset(options.assetsDir, assetId)
        }) : await (await import("@nodetool-ai/game-renderer/build")).buildStandaloneGame({
          document: validated.document, outputDir: options.out, resolveAsset: (assetId) => readBuildAsset(options.assetsDir, assetId)
        });
        process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : `Built game in ${result.outputDir}\n`);
      } catch (error) {
        printCommandError(error, options.json);
        process.exitCode = 1;
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
      const input = inputs[tick] ?? gameInputFrame3D.parse({ pressed: [] });
      const result = session.step(input);
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
      ok: Object.values(assertions).every(Boolean) };
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
    for (let tick = 0; tick < ticks; tick++) { session.step(inputs[tick] ?? gameInputFrame3D.parse({ pressed: [] })); }
    const frame = session.frame();
    const stateHash = await hashGameSnapshot3D(session.snapshot());
    const { captureGameFrame3D } = await import("@nodetool-ai/game-renderer/node3d");
    const captured = await captureGameFrame3D(frame, { stateHash, interpolation: 1,
      width: Math.round(document.presentation.hudWidth * scale), height: Math.round(document.presentation.hudHeight * scale),
      resolveAsset: async (slot) => {
        const binding = document.assets[slot];
        const asset = binding ? await readBuildAsset(options.assetsDir, binding.assetId) : null;
        return asset ? { bytes: asset.bytes, digest: binding.digest } : null;
      } });
    const path = resolve(options.out);
    await writeFile(path, captured.png);
    const report = { dimension: "3d", path, tick: frame.tick, bytes: captured.png.byteLength, state_hash: stateHash,
      capabilities: captured.capabilities, stats: captured.stats, projected_bounds: captured.projectedBounds, diagnostics: [] };
    process.stdout.write(options.json ? `${JSON.stringify(report)}\n` : `Captured tick ${report.tick} to ${report.path}\n`);
  } finally { session.dispose(); }
}
