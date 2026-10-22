import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { MIDI_PPQ } from "@nodetool-ai/timeline";
import { validateTimelineSequence } from "@nodetool-ai/execution/timeline-debug";

const webRoot = new URL("../../../../../web/", import.meta.url);

/** Render the score with the editor's instruments and AudioWorklet effects. */
export async function renderScore() {
  const { document, ...settings } = JSON.parse(await readFile(new URL("../music.timeline.json", import.meta.url), "utf8"));
  const validation = validateTimelineSequence(document, settings);
  if (!validation.ok) {
    throw new Error(`Invalid Sunrush soundtrack: ${JSON.stringify(validation.errors)}`);
  }
  const sequence = { ...settings, ...document };
  const durationSeconds = sequence.durationMs / 1000;
  const loopTicks = sequence.durationMs * sequence.tempo.bpm * MIDI_PPQ / 60000;
  // The middle cycle includes the preceding cycle's releases and effect tails.
  const repeated = {
    ...sequence,
    durationMs: sequence.durationMs * 3,
    clips: sequence.clips.map(clip => ({
      ...clip,
      durationMs: clip.durationMs + sequence.durationMs * 2,
      notes: [0, 1, 2].flatMap(cycle => clip.notes.map(note => ({
        ...note, id: `${note.id}-${cycle}`, startTick: note.startTick + cycle * loopTicks
      })))
    }))
  };
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL("music-page.mjs", import.meta.url))],
    bundle: true, write: false, format: "esm", platform: "browser",
    target: "es2022", conditions: ["nodetool-dev"],
    define: { "import.meta.env": JSON.stringify({ MODE: "production", DEV: false, PROD: true, SSR: false }) },
    plugins: [{
      name: "timeline-audio-assets",
      setup(builder) {
        // esbuild does not relocate new URL(..., import.meta.url) assets.
        // Embed the unchanged processors and factory samples from the editor.
        builder.onLoad({ filter: /(?:fableWorkletUrls|oneshotUrls)\.ts$/ }, async ({ path }) => {
          let contents = await readFile(path, "utf8");
          // The standalone sequencer master is not used by AudioGraph.
          contents = contents.replace(/^\s*master: new URL.*$/m, "");
          const matches = [...contents.matchAll(/new URL\("([^"]+)", import\.meta\.url\)\.href/g)];
          for (const match of matches) {
            const source = await readFile(new URL(match[1], pathToFileURL(path)));
            contents = contents.replace(match[0], JSON.stringify(`data:${match[1].toLowerCase().endsWith(".wav") ? "audio/wav" : "text/javascript"};base64,${source.toString("base64")}`));
          }
          return { contents, loader: "ts" };
        });
        builder.onResolve({ filter: /^node:/ }, ({ path }) => ({
          path: fileURLToPath(new URL(`vite-node-stubs/${({
            "node:crypto": "crypto-stub.js", "node:fs": "fs-stub.js",
            "node:fs/promises": "fs-promises-stub.js", "node:path": "path-stub.js",
            "node:url": "url-stub.js"
          })[path] ?? "empty.js"}`, webRoot))
        }));
      }
    }]
  });
  const server = createServer((req, res) => {
    if (req.url === "/score.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" }).end(bundled.outputFiles[0].text);
    } else if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" }).end('<script type="module" src="/score.js"></script>');
    } else {
      res.writeHead(404).end();
    }
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => typeof window.renderScore === "function");
    const base64 = await page.evaluate(async ({ repeated, durationSeconds }) => {
      return await window.renderScore(repeated, durationSeconds);
    }, { repeated, durationSeconds });
    if (errors.length) {
      throw new Error(`Soundtrack render failed: ${errors.join("\n")}`);
    }
    return {
      bytes: Buffer.from(base64, "base64"),
      durationSeconds: Math.round(durationSeconds * 48000) / 48000
    };
  } finally {
    try {
      await browser?.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
}
