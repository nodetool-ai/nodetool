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
const fixtureDirectory = join(root, "packages/cli/tests/fixtures/native-game-sky");
const goldenFontconfig = join(root, "packages/cli/tests/fixtures/game-golden-fonts.conf");
const names = ["pbr-spheres", "sky-color", "sky-procedural"];
const tick = 60;
const channelTolerance = 16;
const changedFractionTolerance = 0.005;
const metadata = { tick, seed: 1, channelTolerance, changedFractionTolerance, fixtures: names, backend: "webgl2" };
let directory: string;
let originalExitCode: typeof process.exitCode;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "native-game-sky-goldens-"));
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

it("covers every sky fixture with a stored golden", async () => {
  const fixtures = (await readdir(fixtureDirectory)).filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .map((name) => name.replace(/\.json$/, "")).sort();
  expect(fixtures).toEqual(names);
  expect(JSON.parse(await readFile(join(fixtureDirectory, "manifest.json"), "utf8"))).toEqual(metadata);
});

it.each(names)("captures %s at the fixed tick within the stored pixel tolerance", async (name) => {
  const { png: actual, report } = await capture(join(fixtureDirectory, `${name}.json`), join(directory, `${name}.png`));
  expect(JSON.parse(report).tick, name).toBe(tick);
  const referencePath = join(fixtureDirectory, `${name}.png`);
  if (process.env["UPDATE_NATIVE_GAME_GOLDENS"] === "1") { await writeFile(referencePath, actual); }
  const reference = await readFile(referencePath);
  const difference = await compareGameCaptures(reference, actual, channelTolerance);
  const artifactDirectory = process.env["NODETOOL_GAME_GOLDEN_ARTIFACTS"];
  if (artifactDirectory && difference.changedFraction > changedFractionTolerance) {
    await mkdir(artifactDirectory, { recursive: true });
    await writeGameGoldenDiagnostics(artifactDirectory, name, reference, actual, difference, channelTolerance, report);
  }
  expect(difference.changedFraction, `${name}: ${JSON.stringify(difference)}`).toBeLessThanOrEqual(changedFractionTolerance);
}, 90000);

it("renders a color sky with the same pixels as a document without a sky", async () => {
  const document = JSON.parse(await readFile(join(fixtureDirectory, "sky-color.json"), "utf8")) as { scenes: { environment: Record<string, unknown> }[] };
  expect(document.scenes[0]?.environment["sky"]).toEqual({ kind: "color" });
  delete document.scenes[0]?.environment["sky"];
  const withoutSky = join(directory, "no-sky.json");
  await writeFile(withoutSky, JSON.stringify(document));
  const color = await capture(join(fixtureDirectory, "sky-color.json"), join(directory, "color-sky.png"));
  const none = await capture(withoutSky, join(directory, "no-sky.png"));
  expect((await compareGameCaptures(none.png, color.png, 0)).changedPixels).toBe(0);
}, 90000);

