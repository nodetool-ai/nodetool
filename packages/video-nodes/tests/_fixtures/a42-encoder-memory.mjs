// Control for the GPU-render abort series. No GPU or compositor is imported.
import { openVideoFrameEncoder } from "@nodetool-ai/runtime/media";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = await mkdtemp(join(tmpdir(), "a42-encoder-control-"));
const rss = [];
try {
  for (let i = 0; i < 30; i++) {
    const outPath = join(dir, `${i}.mp4`);
    const encoder = await openVideoFrameEncoder({outPath, input: "rgba", width: 1920,
      height: 1080, fps: 10, spec: {codec: "libx264", pixelFormat: "yuv420p", options: {preset: "medium"}}});
    await encoder.write(new Uint8Array(1920 * 1080 * 4));
    await encoder.abort();
    await rm(outPath, {force: true});
    globalThis.gc?.();
    rss.push(process.memoryUsage().rss / 1024 / 1024);
  }
  console.log(JSON.stringify({adapter: "none (encoder-only control)", rssMiB: rss}));
} finally { await rm(dir, {recursive: true, force: true}); }
