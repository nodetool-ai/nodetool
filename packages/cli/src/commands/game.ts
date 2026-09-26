import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import { gameInputFrame, type GameInputFrame } from "@nodetool-ai/protocol/game.js";
import { createScriptedGameSession, validateGame } from "@nodetool-ai/game-runtime";
import { printCommandError } from "../command-errors.js";

interface SimulateOptions {
  ticks: string;
  seed: string;
  inputs?: string;
  expectScore?: string;
  expectWin?: boolean;
  json?: boolean;
}

interface CaptureOptions {
  ticks: string;
  seed: string;
  inputs?: string;
  out: string;
  scale: string;
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
  mp3: "audio/mpeg"
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

async function readInputs(path: string | undefined): Promise<GameInputFrame[]> {
  if (!path) return [];
  const raw = await readDocument(path);
  if (!Array.isArray(raw)) {
    throw new Error("Input recording must be an array of tick input frames");
  }
  return raw.map((input, index) => {
    const parsed = gameInputFrame.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid input at tick ${index}: ${parsed.error.message}`);
    }
    return parsed.data;
  });
}

/** Register native game validation and deterministic simulation commands. */
export function registerGameCommands(program: Command): void {
  const game = program.command("game").description("Validate and playtest native games");

  game
    .command("validate <game_file>")
    .description("Validate a native game document and its references")
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: { json?: boolean }) => {
      try {
        const report = validateGame(await readDocument(path));
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

  game
    .command("simulate <game_file>")
    .description("Run a fixed number of game ticks without a renderer")
    .requiredOption("--ticks <count>", "Number of ticks to run")
    .option("--seed <integer>", "Random seed", "1")
    .option("--inputs <file>", "JSON array of tick-indexed input frames")
    .option("--expect-score <score>", "Fail if the final score differs")
    .option("--expect-win", "Fail unless the win condition is reached")
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: SimulateOptions) => {
      try {
        const validated = validateGame(await readDocument(path));
        if (!validated.valid || !validated.document) {
          throw new Error(validated.errors.join("\n"));
        }
        const ticks = nonnegativeInteger(options.ticks, "ticks");
        const seed = nonnegativeInteger(options.seed, "seed");
        const expectedScore = options.expectScore === undefined
          ? undefined
          : nonnegativeInteger(options.expectScore, "expect-score");
        const inputs = await readInputs(options.inputs);
        const session = await createScriptedGameSession(validated.document, seed);
        try {
          const events = [];
          for (let tick = 0; tick < ticks; tick += 1) {
            const result = session.step(inputs[tick] ?? { pressed: [], justPressed: [] });
            events.push(...result.events);
          }
          const snapshot = session.snapshot();
          const assertions = {
            score: expectedScore === undefined || snapshot.score === expectedScore,
            win: options.expectWin !== true || snapshot.won
          };
          const report = { ticks, seed, snapshot, events, assertions, ok: assertions.score && assertions.win };
          if (options.json) {
            process.stdout.write(`${JSON.stringify(report)}\n`);
          } else {
            process.stdout.write(`Tick ${snapshot.tick}: score ${snapshot.score}, won ${snapshot.won}\n`);
            if (!report.ok) process.stdout.write("Game assertions failed\n");
          }
          if (!report.ok) process.exitCode = 1;
        } finally {
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
    .option("--assets-dir <directory>", "Local media files named <full-asset-id>.<extension>")
    .option("--json", "Print a machine-readable report")
    .action(async (path: string, options: CaptureOptions) => {
      try {
        const validated = validateGame(await readDocument(path));
        if (!validated.valid || !validated.document) {
          throw new Error(validated.errors.join("\n"));
        }
        const ticks = nonnegativeInteger(options.ticks, "ticks");
        if (ticks === 0) throw new Error("ticks must be at least 1 for capture");
        const seed = nonnegativeInteger(options.seed, "seed");
        const scale = Number(options.scale);
        if (!Number.isFinite(scale) || scale <= 0) {
          throw new Error("scale must be a positive number");
        }
        const inputs = await readInputs(options.inputs);
        const session = await createScriptedGameSession(validated.document, seed);
        try {
          let frame;
          for (let tick = 0; tick < ticks; tick += 1) {
            frame = session.step(inputs[tick] ?? EMPTY_INPUT).frame;
          }
          if (!frame) throw new Error("Game produced no render frame");
          const { captureGameFrame } = await import("@nodetool-ai/game-renderer/node");
          const png = await captureGameFrame(frame, {
            scale,
            resolveAsset: async (key) => {
              const sourceId = validated.document?.assets[key]?.assetId;
              if (!sourceId) return null;
              return (await readBuildAsset(options.assetsDir, sourceId))?.bytes ?? null;
            }
          });
          await writeFile(options.out, png);
          const report = { path: options.out, tick: frame.tick, bytes: png.byteLength };
          process.stdout.write(options.json ? `${JSON.stringify(report)}\n` : `Captured tick ${report.tick} to ${report.path}\n`);
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
        const validated = validateGame(await readDocument(path));
        if (!validated.valid || !validated.document) {
          throw new Error(validated.errors.join("\n"));
        }
        const { buildStandaloneGame } = await import("@nodetool-ai/game-renderer/build");
        const result = await buildStandaloneGame({
          document: validated.document,
          outputDir: options.out,
          resolveAsset: (assetId) => readBuildAsset(options.assetsDir, assetId)
        });
        process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : `Built game in ${result.outputDir}\n`);
      } catch (error) {
        printCommandError(error, options.json);
        process.exitCode = 1;
      }
    });
}

const EMPTY_INPUT: GameInputFrame = { pressed: [], justPressed: [] };
