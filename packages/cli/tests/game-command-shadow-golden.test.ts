import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { compareGameCaptures } from "@nodetool-ai/game-renderer/node";
import { withGameGoldenFontEnvironment } from "./gameGoldenFonts.js";
import { writeGameGoldenDiagnostics } from "./gameGoldenDiagnostics.js";
import { registerGameCommands } from "../src/commands/game.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixtureDirectory = join(root, "packages/cli/tests/fixtures/native-game-shadows");
const goldenFontconfig = join(root, "packages/cli/tests/fixtures/game-golden-fonts.conf");
const names = ["shadows-cascaded", "shadows-local"];
const tick = 60;
const channelTolerance = 16;
const changedFractionTolerance = 0.005;
const metadata = { tick, seed: 1, channelTolerance, changedFractionTolerance, fixtures: names, backend: "webgl2" };
let directory: string;
let originalExitCode: typeof process.exitCode;

interface ShadowDocument { scenes: { environment: { shadows: Record<string, unknown> } }[] }

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "native-game-shadow-goldens-"));
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

async function captureVariant(name: string, edit: (shadows: Record<string, unknown>) => void): Promise<Buffer> {
  const document = JSON.parse(await readFile(join(fixtureDirectory, "shadows-cascaded.json"), "utf8")) as ShadowDocument;
  const shadows = document.scenes[0]?.environment.shadows;
  if (!shadows) { throw new Error("Fixture scene has no shadow settings"); }
  edit(shadows);
  const path = join(directory, `${name}.json`);
  await writeFile(path, JSON.stringify(document));
  return (await capture(path, join(directory, `${name}.png`))).png;
}

async function rgb(png: Buffer): Promise<{ width: number; data: Uint8ClampedArray }> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return { width: image.width, data: context.getImageData(0, 0, image.width, image.height).data };
}

/** Counts pixels in rows [top, bottom) that a shadow darkens fully (umbra) or partly (penumbra) relative to an unshadowed capture. */
async function shadowBand(shadowed: Buffer, unshadowed: Buffer, top: number, bottom: number): Promise<{ umbra: number; penumbra: number }> {
  const lit = await rgb(unshadowed);
  const shaded = await rgb(shadowed);
  let umbra = 0; let penumbra = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < lit.width; x++) {
      const index = (y * lit.width + x) * 4;
      let darkening = 0;
      for (let channel = 0; channel < 3; channel++) { darkening += (lit.data[index + channel] ?? 0) - (shaded.data[index + channel] ?? 0); }
      if (darkening > 150) { umbra++; } else if (darkening > 30) { penumbra++; }
    }
  }
  return { umbra, penumbra };
}

it("covers every shadow fixture with a stored golden", async () => {
  const fixtures = (await readdir(fixtureDirectory)).filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .map((name) => name.replace(/\.json$/, "")).sort();
  expect(fixtures).toEqual(names);
  expect(JSON.parse(await readFile(join(fixtureDirectory, "manifest.json"), "utf8"))).toEqual(metadata);
});

it.each(names)("captures %s at the fixed tick within the stored pixel tolerance", async (name) => {
  const { png: actual, report } = await capture(join(fixtureDirectory, `${name}.json`), join(directory, `${name}.png`));
  expect(JSON.parse(report).tick, name).toBe(tick);
  expect(JSON.parse(report).stats.diagnostics, name).toEqual([]);
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

it("keeps near shadows sharp and far shadows continuous across a 200 m scene", async () => {
  const cascaded = (await capture(join(fixtureDirectory, "shadows-cascaded.json"), join(directory, "cascaded.png"))).png;
  const unshadowed = await captureVariant("unshadowed", (shadows) => { shadows["enabled"] = false; });
  const stretched = await captureVariant("stretched", (shadows) => { delete shadows["cascades"]; shadows["extent"] = 200; });
  // Rows from the bottom of the frame toward the horizon cover the pillars at 5, 12, 25 and 50 m, then 90 to 130 m.
  const near = await shadowBand(cascaded, unshadowed, 300, 360);
  expect(near.umbra).toBeGreaterThan(2500);
  expect(near.penumbra).toBeLessThan(near.umbra * 0.1);
  const middle = await shadowBand(cascaded, unshadowed, 210, 240);
  expect(middle.umbra).toBeGreaterThan(300);
  expect(middle.penumbra).toBeLessThan(middle.umbra * 0.2);
  expect((await shadowBand(cascaded, unshadowed, 170, 182)).umbra).toBeGreaterThan(40);
  expect((await shadowBand(cascaded, unshadowed, 150, 160)).umbra).toBeGreaterThan(8);
  // One map stretched over the same distance blurs the 12 m shadow into penumbra.
  const blurred = await shadowBand(stretched, unshadowed, 210, 240);
  expect(blurred.penumbra).toBeGreaterThan(blurred.umbra * 0.5);
}, 180000);
