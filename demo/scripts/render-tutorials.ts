import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { TUTORIAL_CATALOG, inspectionFrames, posterFrame } from "../src/tutorialCatalog";
import { webpackOverride } from "../src/webpackOverride";

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(demoRoot, "../docs/assets/tutorials");
const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
};

async function main(): Promise<void> {
  const only = option("--only")?.split(",");
  const entries = only ? TUTORIAL_CATALOG.filter((entry) => only.includes(entry.slug)) : TUTORIAL_CATALOG;
  if (entries.length === 0 || only?.some((slug) => !entries.some((entry) => entry.slug === slug))) {
    throw new Error(`Unknown tutorial selection: ${only?.join(",")}`);
  }
  if (args.includes("--list")) {
    console.log(entries.map((entry) => `${entry.compositionId} → ${entry.slug}`).join("\n"));
    return;
  }
  const inspection = args.includes("--inspect");
  const stillsOnly = args.includes("--stills-only") || inspection;
  const inspectionDir = path.resolve(demoRoot, "../.tmp/tutorial-focus/inspection");
  await mkdir(outDir, { recursive: true });
  const serveUrl = option("--serve-url") ?? await bundle({
    entryPoint: path.join(demoRoot, "src/index.ts"),
    outDir: path.resolve(option("--bundle-dir") ?? path.resolve(demoRoot, "../.tmp/tutorial-focus/bundle")),
    webpackOverride,
  });
  console.log(`Bundle: ${serveUrl}`);
  const browser = await openBrowser("chrome", { browserExecutable: process.env.CHROMIUM_PATH });
  try {
    for (const entry of entries) {
      console.log(`Rendering ${entry.compositionId}`);
      const composition = await selectComposition({ serveUrl, id: entry.compositionId, puppeteerInstance: browser });
      if (inspection) {
        const frames = inspectionFrames(entry);
        if (frames.length === 0) {
          throw new Error(`${entry.slug} has no inspection frames`);
        }
        const directory = path.join(inspectionDir, entry.slug);
        await mkdir(directory, { recursive: true });
        for (const { label, frame } of frames) {
          await renderStill({ composition, serveUrl, puppeteerInstance: browser, frame,
            output: path.join(directory, `${label}.jpg`), imageFormat: "jpeg", jpegQuality: 85 });
          console.log(`  ${label}: ${frame}`);
        }
        await writeFile(path.join(directory, "frames.json"), JSON.stringify(frames, null, 2) + "\n");
        continue;
      }
      if (!stillsOnly) {
        let lastProgress = -1;
        await renderMedia({ composition, serveUrl, puppeteerInstance: browser,
          codec: "h264", concurrency: 1, outputLocation: path.join(outDir, `${entry.slug}.mp4`),
          onProgress: ({ progress }) => {
            const percent = Math.floor(progress * 5) * 20;
            if (percent !== lastProgress) {
              lastProgress = percent;
              console.log(`${entry.slug} ${percent}%`);
            }
          },
        });
      }
      await renderStill({ composition, serveUrl, puppeteerInstance: browser,
        output: path.join(outDir, `${entry.slug}.jpg`), frame: posterFrame(entry), imageFormat: "jpeg", jpegQuality: 85 });
      if (!stillsOnly) {
        const result = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path.join(outDir, `${entry.slug}.mp4`)], { encoding: "utf8" });
        const duration = Number(result.stdout.trim());
        if (result.status !== 0 || !Number.isFinite(duration) || duration <= 0) {
          throw new Error(`Cannot measure encoded duration for ${entry.slug}: ${result.stderr}`);
        }
        const expected = composition.durationInFrames / composition.fps;
        if (Math.abs(duration - expected) > 2 / composition.fps) {
          throw new Error(`${entry.slug}: encoded ${duration}s, expected ${expected}s`);
        }
        const seconds = Math.round(duration);
        const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
        const catalogPath = path.resolve(demoRoot, "../web/src/components/tutorials/tutorialsData.ts");
        const source = await readFile(catalogPath, "utf8");
        const pattern = new RegExp(`(id: "${entry.slug}"[\\s\\S]*?durationLabel: ")[^"]+(")`);
        if (!pattern.test(source)) {
          throw new Error(`No displayed duration for ${entry.slug}`);
        }
        await writeFile(catalogPath, source.replace(pattern, (_match, prefix: string, suffix: string) => `${prefix}${label}${suffix}`));
      }
    }
  } finally {
    await browser.close({ silent: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
