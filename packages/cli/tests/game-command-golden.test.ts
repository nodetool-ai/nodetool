import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { AnyGameDocument } from "@nodetool-ai/protocol";
import { getExampleGameBundle, listExampleGames, readExampleGameFile } from "@nodetool-ai/agents/game-examples";
import { compareGameCaptures } from "@nodetool-ai/game-renderer/node";
import { assertGameGoldenFont, withGameGoldenFontEnvironment } from "./gameGoldenFonts.js";
import { writeGameGoldenDiagnostics } from "./gameGoldenDiagnostics.js";
import { registerGameCommands } from "../src/commands/game.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const examples = { examplesDir: join(root, "packages/base-nodes/nodetool/examples/workflows") };
const goldenDirectory = join(root, "packages/cli/tests/fixtures/native-game-goldens");
const goldenFontconfig = join(root, "packages/cli/tests/fixtures/game-golden-fonts.conf");
const benchDirectory = join(root, "packages/game-runtime/bench");
const benchmarkNames = ["bench-2d-500", "bench-3d-1000", "bench-3d-64-scripted"];
const tick = 60;
const channelTolerance = 16;
const changedFractionTolerance = 0.005;
const cards = listExampleGames(examples);
const names = [...cards.map((card) => card.slug), ...benchmarkNames].sort();
const metadata = { tick, seed: 1, channelTolerance, changedFractionTolerance, fixtures: names, backends: { "2d": "webgpu", "3d": "webgl2" } };
let directory: string;
let originalExitCode: typeof process.exitCode;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "native-game-goldens-"));
  originalExitCode = process.exitCode;
  const fontEvidence = await assertGameGoldenFont(goldenFontconfig, join(directory, "font-cache"));
  const artifacts = process.env["NODETOOL_GAME_GOLDEN_ARTIFACTS"];
  if (artifacts) {
    await mkdir(artifacts, { recursive: true });
    await writeFile(join(artifacts, "effective-font.json"), JSON.stringify(fontEvidence, null, 2));
  }
  if (process.env["UPDATE_NATIVE_GAME_GOLDENS"] === "1") {
    await mkdir(goldenDirectory, { recursive: true });
    await writeFile(join(goldenDirectory, "manifest.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  }
});
afterAll(async () => {
  process.exitCode = originalExitCode;
  await rm(directory, { recursive: true, force: true });
});

async function stageExample(slug: string): Promise<{ path: string; assetsDir: string; document: AnyGameDocument }> {
  const bundle = getExampleGameBundle(examples, slug);
  if (!bundle) { throw new Error(`Example ${slug} is unavailable`); }
  const document = structuredClone(bundle.document);
  const assetsDir = join(directory, slug);
  await mkdir(assetsDir, { recursive: true });
  for (const binding of Object.values(document.assets)) {
    if (binding.assetId.startsWith("builtin:")) { continue; }
    const source = binding.assetId;
    const bytes = readExampleGameFile(examples, source);
    if (!bytes) { throw new Error(`Example asset ${source} is unavailable`); }
    const id = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    binding.assetId = id;
    await writeFile(join(assetsDir, `${id}${extname(source)}`), bytes);
  }
  const path = join(directory, `${slug}.json`);
  await writeFile(path, JSON.stringify(document));
  return { path, assetsDir, document };
}

it("verifies the actual Chromium font used for generic HUD text", async () => {
  const evidence = await assertGameGoldenFont(goldenFontconfig, join(directory, "font-cache"));
  expect(evidence.fonts.length).toBeGreaterThan(0);
  expect(evidence.fonts.every((font) => font.familyName === "Liberation Sans" && font.postScriptName === "LiberationSans")).toBe(true);
});

it("rejects a different effective browser font before capturing goldens", async () => {
  const invalid = join(directory, "invalid-fonts.conf");
  const source = await readFile(goldenFontconfig, "utf8");
  await writeFile(invalid, source.replace('<dir prefix="relative">game-golden-fonts</dir>', `<dir>${join(root, "packages/cli/tests/fixtures/game-golden-fonts")}</dir>`).replaceAll("<string>Liberation Sans</string></edit>", "<string>DejaVu Sans</string></edit>"));
  await expect(assertGameGoldenFont(invalid, join(directory, "font-cache"))).rejects.toThrow(/Golden captures require Liberation Sans.*"familyName":"DejaVu Sans".*"postScriptName":"DejaVuSans"/);
});

it("restores absent and existing font environment after a thrown capture", async () => {
  const originalFontconfig = process.env["FONTCONFIG_FILE"];
  const originalCache = process.env["XDG_CACHE_HOME"];
  try {
    for (const previous of [undefined, "previous-font-environment"]) {
      if (previous === undefined) { delete process.env["FONTCONFIG_FILE"]; delete process.env["XDG_CACHE_HOME"]; }
      else { process.env["FONTCONFIG_FILE"] = previous; process.env["XDG_CACHE_HOME"] = previous; }
      await expect(withGameGoldenFontEnvironment(goldenFontconfig, join(directory, "font-cache"), async () => {
        expect(process.env["FONTCONFIG_FILE"]).toBe(goldenFontconfig);
        expect(process.env["XDG_CACHE_HOME"]).toBe(join(directory, "font-cache"));
        throw new Error("capture failed deliberately");
      })).rejects.toThrow("capture failed deliberately");
      expect(process.env["FONTCONFIG_FILE"]).toBe(previous);
      expect(process.env["XDG_CACHE_HOME"]).toBe(previous);
    }
  } finally {
    if (originalFontconfig === undefined) { delete process.env["FONTCONFIG_FILE"]; } else { process.env["FONTCONFIG_FILE"] = originalFontconfig; }
    if (originalCache === undefined) { delete process.env["XDG_CACHE_HOME"]; } else { process.env["XDG_CACHE_HOME"] = originalCache; }
  }
});

it("captures every shipped example and benchmark at a fixed tick within the stored pixel tolerance", async () => {
  expect(cards.length).toBeGreaterThan(0);
  const shippedFiles = (await readdir(join(root, "packages/base-nodes/nodetool/examples/games")))
    .filter((name) => name.endsWith(".game.json")).map((name) => name.replace(/\.game\.json$/, "")).sort();
  expect(cards.map((card) => card.slug).sort()).toEqual(shippedFiles);
  const benchmarkFiles = (await readdir(benchDirectory))
    .filter((name) => /^bench.*\.json$/.test(name)).map((name) => name.replace(/\.json$/, "")).sort();
  expect(benchmarkFiles.length).toBeGreaterThan(0);
  expect([...benchmarkNames].sort()).toEqual(benchmarkFiles);
  expect(JSON.parse(await readFile(join(goldenDirectory, "manifest.json"), "utf8"))).toEqual(metadata);
});

it.each(names)("captures %s at the fixed tick within the stored pixel tolerance", async (name) => {
    const staged = benchmarkNames.includes(name)
      ? { path: join(benchDirectory, `${name}.json`), assetsDir: join(benchDirectory, "assets"),
        document: JSON.parse(await readFile(join(benchDirectory, `${name}.json`), "utf8")) as AnyGameDocument }
      : await stageExample(name);
    const backend = staged.document.schemaVersion === 3 ? "webgl2" : "webgpu";
    const output = join(directory, `${name}.png`);
    let report = "";
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { report += String(chunk); return true; });
    try {
      await withGameGoldenFontEnvironment(goldenFontconfig, join(directory, "font-cache"), async () => {
        process.exitCode = undefined;
        const program = new Command();
        registerGameCommands(program);
        await program.parseAsync(["node", "nodetool", "game", "capture", staged.path, "--ticks", String(tick),
          "--seed", "1", "--backend", backend, "--assets-dir", staged.assetsDir, "--out", output, "--json"]);
      });
    } finally {
      stdout.mockRestore();
    }
    expect(process.exitCode, `${name}: ${report}`).not.toBe(1);
    expect(JSON.parse(report).tick, name).toBe(tick);
    const actual = await readFile(output);
    expect(actual.length, name).toBeGreaterThan(0);
    const referencePath = join(goldenDirectory, `${name}.png`);
    if (process.env["UPDATE_NATIVE_GAME_GOLDENS"] === "1") { await writeFile(referencePath, actual); }
    const reference = await readFile(referencePath);
    const difference = await compareGameCaptures(reference, actual, channelTolerance);
    const artifactDirectory = process.env["NODETOOL_GAME_GOLDEN_ARTIFACTS"];
    if (artifactDirectory && difference.changedFraction > changedFractionTolerance) {
      await writeGameGoldenDiagnostics(artifactDirectory, name, reference, actual, difference, channelTolerance, report);
    }
    expect(difference.changedFraction, `${name}: ${JSON.stringify(difference)}`).toBeLessThanOrEqual(changedFractionTolerance);
}, 90000);
