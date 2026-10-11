import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { compareGameCaptures } from "@nodetool-ai/game-renderer/node";
import { withGameGoldenFontEnvironment } from "./gameGoldenFonts.js";
import { writeGameGoldenDiagnostics } from "./gameGoldenDiagnostics.js";
import { registerGameCommands } from "../src/commands/game.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixtureDirectory = join(root, "packages/cli/tests/fixtures/native-game-post");
const goldenFontconfig = join(root, "packages/cli/tests/fixtures/game-golden-fonts.conf");
const names = ["post-agx", "post-bloom", "post-exposure", "post-fxaa", "post-linear", "post-neutral", "post-smaa", "post-stack", "post-vignette"];
const tick = 60;
const channelTolerance = 16;
const changedFractionTolerance = 0.005;
const metadata = { tick, seed: 1, channelTolerance, changedFractionTolerance, fixtures: names, backend: "webgl2" };
let directory: string;
let originalExitCode: typeof process.exitCode;

interface PostDocument { scenes: { environment: Record<string, unknown> }[] }

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "native-game-post-goldens-"));
  originalExitCode = process.exitCode;
  if (process.env["UPDATE_NATIVE_GAME_GOLDENS"] === "1") {
    await writeFile(join(fixtureDirectory, "manifest.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  }
});
afterAll(async () => {
  process.exitCode = originalExitCode;
  await rm(directory, { recursive: true, force: true });
});

async function capture(path: string, output: string): Promise<{ png: Buffer; report: string }> {
  let report = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { report += String(chunk); return true; });
  try {
    await withGameGoldenFontEnvironment(goldenFontconfig, join(directory, "font-cache"), async () => {
      process.exitCode = undefined;
      const program = new Command();
      registerGameCommands(program);
      await program.parseAsync(["node", "nodetool", "game", "capture", path, "--ticks", String(tick),
        "--seed", "1", "--backend", "webgl2", "--out", output, "--json"]);
    });
  } finally {
    stdout.mockRestore();
  }
  expect(process.exitCode, report).not.toBe(1);
  return { png: await readFile(output), report };
}

/** Writes a fixture's document with its post-processing replaced, or removed when `postProcessing` is undefined. */
async function variant(name: string, postProcessing: Record<string, unknown> | undefined, fixture = "post-stack"): Promise<string> {
  const document = JSON.parse(await readFile(join(fixtureDirectory, `${fixture}.json`), "utf8")) as PostDocument;
  const environment = document.scenes[0]?.environment;
  if (!environment) { throw new Error("Post-processing fixture has no scene environment"); }
  if (postProcessing) { environment["postProcessing"] = postProcessing; } else { delete environment["postProcessing"]; }
  const path = join(directory, `${name}.json`);
  await writeFile(path, JSON.stringify(document));
  return path;
}

it("covers every post-processing fixture with a stored golden", async () => {
  const fixtures = (await readdir(fixtureDirectory)).filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .map((name) => name.replace(/\.json$/, "")).sort();
  expect(fixtures).toEqual(names);
  expect(JSON.parse(await readFile(join(fixtureDirectory, "manifest.json"), "utf8"))).toEqual(metadata);
  const pngs = (await readdir(fixtureDirectory)).filter((name) => name.endsWith(".png")).map((name) => name.replace(/\.png$/, "")).sort();
  expect(pngs).toEqual(names);
});

it.each(names)("captures %s at the fixed tick within the stored pixel tolerance", async (name) => {
  const { png: actual, report } = await capture(join(fixtureDirectory, `${name}.json`), join(directory, `${name}.png`));
  expect(JSON.parse(report).tick, name).toBe(tick);
  const referencePath = join(fixtureDirectory, `${name}.png`);
  if (process.env["UPDATE_NATIVE_GAME_GOLDENS"] === "1") { await writeFile(referencePath, actual); }
  const artifactDirectory = process.env["NODETOOL_GAME_GOLDEN_ARTIFACTS"];
  const reference = await readFile(referencePath).catch(async (error: unknown) => {
    // A missing golden still fails. The capture is kept so a reviewer can inspect and commit it.
    if (artifactDirectory) {
      await mkdir(join(artifactDirectory, name), { recursive: true });
      await writeFile(join(artifactDirectory, name, "actual.png"), actual);
    }
    throw error;
  });
  const difference = await compareGameCaptures(reference, actual, channelTolerance);
  if (artifactDirectory && difference.changedFraction > changedFractionTolerance) {
    await mkdir(artifactDirectory, { recursive: true });
    await writeGameGoldenDiagnostics(artifactDirectory, name, reference, actual, difference, channelTolerance, report);
  }
  expect(difference.changedFraction, `${name}: ${JSON.stringify(difference)}`).toBeLessThanOrEqual(changedFractionTolerance);
}, 90000);

it("renders disabled or default post-processing with the same pixels as a scene without it", async () => {
  const none = await capture(await variant("none", undefined), join(directory, "none.png"));
  const disabled = await capture(await variant("disabled", { enabled: false, toneMapping: "agx", exposure: 3,
    bloom: { intensity: 4 }, vignette: { intensity: 1 }, antialias: "smaa" }), join(directory, "disabled.png"));
  const defaults = await capture(await variant("defaults", {}), join(directory, "defaults.png"));
  expect((await compareGameCaptures(none.png, disabled.png, 0)).changedPixels).toBe(0);
  expect((await compareGameCaptures(none.png, defaults.png, 0)).changedPixels).toBe(0);
  // SMAA must smooth edges in a single-frame capture, not pass the image through before its lookup textures load.
  const aliased = await capture(await variant("aliased", { antialias: "none" }, "post-smaa"), join(directory, "aliased.png"));
  const smaa = await capture(join(fixtureDirectory, "post-smaa.json"), join(directory, "smaa-live.png"));
  expect((await compareGameCaptures(aliased.png, smaa.png, 0)).changedPixels, "smaa must differ from no antialiasing").toBeGreaterThan(0);
  for (const name of names) {
    const effect = await capture(join(fixtureDirectory, `${name}.json`), join(directory, `${name}-live.png`));
    expect((await compareGameCaptures(none.png, effect.png, 0)).changedPixels, `${name} must change the image`).toBeGreaterThan(0);
  }
}, 300000);
