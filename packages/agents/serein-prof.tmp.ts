import { readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
const require_write = (f: number, png: Uint8Array) => writeFileSync(`/private/tmp/claude-501/-Users-mg-workspace-nodetool/4f1b35c7-4b57-456e-8d99-83352c19fb0b/scratchpad/loc-${f}.png`, png);
import { renderTimelineFrames } from "./src/timeline-preview/frames.js";
const { document } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const frames = process.argv.slice(3).map(Number);
for (const f of frames) {
  const t0 = performance.now();
  const r = await renderTimelineFrames({
    sequence: { ...document, fps: 30, width: 1920, height: 1080, durationMs: 26000 },
    timesMs: [Math.floor((f * 1000) / 30)],
    loadAsset: async () => null
  });
  const fr = r.frames[0] as unknown as Record<string, unknown>;
  require_write(f, r.frames[0].png); console.log(`frame ${f}: ${(performance.now() - t0).toFixed(0)} ms, layers=${Array.isArray(fr.layers) ? fr.layers.length : "?"}`);
}
