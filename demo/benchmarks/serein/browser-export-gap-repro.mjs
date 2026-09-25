/** Export the local gap fixture through TimelineRenderer's real browser path. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { unzipSync } from "fflate";
import { createServer } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../../../web");
const fixture = JSON.parse(await readFile(resolve(here, "timeline-gap-repro.json"), "utf8"));
const outputDir = resolve(here, "../../out/serein-gap-repro");
await mkdir(outputDir, { recursive: true });

const server = await createServer({
  root: webRoot,
  configFile: resolve(webRoot, "vite.config.ts"),
  server: { host: "127.0.0.1", port: 0 },
  plugins: [{
    name: "serein-gap-export-page",
    configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url !== "/__serein_gap_export__") return next();
        response.setHeader("Content-Type", "text/html");
        response.end("<!doctype html><html><head><meta charset='utf-8'></head><body>timeline export harness</body></html>");
      });
    }
  }]
});

let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Vite did not bind a TCP port");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  page.on("pageerror", (error) => process.stderr.write(`Browser page error: ${error.message}\n`));
  await page.goto(`http://127.0.0.1:${address.port}/__serein_gap_export__`);
  const exportFrameSequence = async (input, width, height, durationMs) => page.evaluate(async ({ input, width, height, durationMs }) => {
    const { renderTimeline } = await import("/src/components/timeline/render/TimelineRenderer.ts");
    const result = await renderTimeline({
      tracks: input.document.tracks,
      clips: input.document.clips,
      camera2d: input.document.camera2d,
      width,
      height,
      fps: input.fps,
      durationMs,
      resolveUrl: async () => undefined,
      format: "png_sequence"
    });
    let base64 = "";
    for (let at = 0; at < result.bytes.length; at += 8192) {
      base64 += String.fromCharCode(...result.bytes.subarray(at, at + 8192));
    }
    return { base64: btoa(base64), extension: result.extension, mimeType: result.mimeType };
  }, { input, width, height, durationMs });
  const checkProjectiveSeams = process.argv.includes("--check-projective-seams");
  if (process.argv.includes("--native-samples") || checkProjectiveSeams) {
    const samples = checkProjectiveSeams
      ? [7600]
      : [100, 600, 1100, 1700, 2600, 3000, 3450, 4100, 4500, 5900, 6200, 6700, 7100, 7600, 8500, 9300, 9900];
    for (const sampleMs of samples) {
      const shifted = {
        ...fixture,
        document: {
          ...fixture.document,
          clips: fixture.document.clips.map((clip) => ({ ...clip, startMs: clip.startMs - sampleMs })),
          camera2d: fixture.document.camera2d && {
            ...fixture.document.camera2d,
            keyframes: fixture.document.camera2d.keyframes?.map((keyframe) => ({ ...keyframe, timeMs: keyframe.timeMs - sampleMs }))
          }
        }
      };
      const exported = await exportFrameSequence(shifted, fixture.width, fixture.height, 34);
      const files = unzipSync(Buffer.from(exported.base64, "base64"));
      const png = Object.entries(files).find(([name]) => name.endsWith(".png"))?.[1];
      if (!png) throw new Error(`No PNG in browser export for ${sampleMs}ms`);
      const outPath = resolve(outputDir, `browser-native-${String(sampleMs).padStart(4, "0")}.png`);
      await writeFile(outPath, png);
      if (checkProjectiveSeams) {
        const minimumGreen = await page.evaluate(async (base64) => {
          const image = new Image();
          image.src = `data:image/png;base64,${base64}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("No browser 2D context for projective check");
          context.drawImage(image, 0, 0);
          const row = context.getImageData(1500, 70, 250, 1).data;
          let minimum = 255;
          for (let x = 0; x < 250; x++) minimum = Math.min(minimum, row[x * 4 + 1]);
          return minimum;
        }, Buffer.from(png).toString("base64"));
        if (minimumGreen < 120) {
          throw new Error(`Projective tile seam in ${outPath}: interior green minimum ${minimumGreen} < 120`);
        }
        process.stdout.write(`Projective browser check passed: interior green minimum ${minimumGreen}\n`);
      }
      process.stdout.write(`Browser exported native frame ${sampleMs}ms to ${outPath}\n`);
    }
  } else {
    const exported = await exportFrameSequence(fixture, 480, 270, fixture.durationMs);
    const outPath = resolve(outputDir, "browser-export.zip");
    await writeFile(outPath, Buffer.from(exported.base64, "base64"));
    process.stdout.write(`Browser exported ${exported.mimeType} to ${outPath}\n`);
  }
} finally {
  await browser?.close();
  await server.close();
}
