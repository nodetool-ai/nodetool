// Turns build.js into one sandbox action for the NodeTool MCP `execute_code` tool:
// the same document, written with set_timeline_document and previewed at the frames given.
// Usage: node guest.mjs [frame ...] > ../../out/serein-guest.js
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "build.js"), "utf8");
const body = src.slice(src.indexOf("const TIMELINE_ID"), src.indexOf("const outDir"));
const frames = process.argv.slice(2).map(Number);
const tail = `
const written = await set_timeline_document({ timeline_id: TIMELINE_ID, document });
const result = { ok: written.ok, clips: clips.length, errors: written.validation?.errors?.slice(0, 15), warnings: (written.validation?.warnings ?? []).filter((w) => w.code !== "binding_incomplete").slice(0, 15), issues: written.issues?.slice?.(0, 15) };
const FRAMES = ${JSON.stringify(frames)};
if (written.ok) {
  result.frames = [];
  for (let i = 0; i < FRAMES.length; i += 8) {
    const pv = await preview_timeline_frame({ timeline_id: TIMELINE_ID, times_ms: FRAMES.slice(i, i + 8).map((f) => ms(f) + 5) });
    for (const f of pv.frames) result.frames.push([Math.floor((f.time_ms * 30) / 1000), f.image?.asset_id, f.dropped?.length ? f.dropped : undefined, f.degraded?.length ? f.degraded : undefined]);
  }
}
return result;`;
const code = transformSync(`async function main(){${body}${tail}}`, { minify: true, loader: "js" }).code;
process.stdout.write(`import { set_timeline_document, preview_timeline_frame } from "@nodetool-ai/sandbox-nodetool/timelines";\n${code.trim()}\nreturn await main();\n`);
