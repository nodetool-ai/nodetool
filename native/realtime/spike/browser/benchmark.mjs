import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { arch, cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const [directory, reportPath] = process.argv.slice(2);
if (!directory || !reportPath || process.argv.length !== 4) {
  throw new Error("Usage: node benchmark.mjs BENCHMARK_DIRECTORY REPORT_JSON");
}
const root = fileURLToPath(new URL("../..", import.meta.url));
const nativeCatalogKeys = Object.keys(JSON.parse(readFileSync(join(directory, "gpu-catalog.json"), "utf8")).modules).sort();
assert.ok(nativeCatalogKeys.length > 0);
assert.deepEqual(readFileSync(join(directory, "candidate.data")), readFileSync(join(directory, "gpu-catalog.json")), "Preloaded catalog differs from measured inventory");
const sourceHashes = {};
for (const name of ["spike/browser/benchmark.cpp", "spike/browser/benchmark.mjs", "spike/browser/typescript-candidate.mjs",
  "spike/browser/build_candidate.py", "src/offline_gpu.cpp", "src/render.cpp"]) {
  sourceHashes[name] = createHash("sha256").update(readFileSync(join(root, name))).digest("hex");
}
const plan = JSON.parse(readFileSync(join(root, "tests/fixtures/offline-render.json"), "utf8"));
const solid = plan.render.passes[0], invert = plan.render.passes[1];
plan.render.passes = Array.from({ length: 64 }, (_, index) => ({
  ...structuredClone(index ? invert : solid), node: `pass-${index}`, retention: "volatile",
  inputs: index ? { source: `pass-${index - 1}` } : {}
}));
plan.render.present.source = "pass-63";
const typescript = await build({ entryPoints: [fileURLToPath(new URL("typescript-candidate.mjs", import.meta.url))],
  bundle: true, format: "esm", platform: "browser", minify: true, write: false });
const routes = new Map([["/", ["text/html", Buffer.from("<!doctype html><title>RT-Q8 benchmark</title>")]],
  ["/typescript.mjs", ["text/javascript", typescript.outputFiles[0].contents]]]);
const sizes = {};
function measure(name, bytes) {
  sizes[name] = { bytes: bytes.length, gzip9: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes).length, sha256: createHash("sha256").update(bytes).digest("hex") };
}
measure("typescript.mjs", typescript.outputFiles[0].contents);
for (const [name, type] of [["candidate.mjs", "text/javascript"], ["candidate.wasm", "application/wasm"], ["candidate.data", "application/octet-stream"]]) {
  const bytes = readFileSync(join(directory, name));
  routes.set(`/${name}`, [type, bytes]); measure(name, bytes);
}
function validate(result) {
  for (const key of ["encodeMs", "completeMs"]) {
    assert.equal(result[key].length, 120);
    assert.ok(result[key].every((value) => Number.isFinite(value) && value >= 0));
  }
  assert.deepEqual(result.pixels, Array.from({ length: 64 }, (_, i) => [0, 128, 128, 128][i % 4]));
}
assert.throws(() => validate({ encodeMs: [], completeMs: [], pixels: [] }));
function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1],
    min: sorted[0], max: sorted.at(-1) };
}
const server = createServer((request, response) => {
  const route = routes.get(request.url);
  if (!route) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "Content-Type": route[0], "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp" }).end(route[1]);
});
let browser;
try {
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  browser = await chromium.launch({ channel: process.env.SPIKE_BROWSER ?? "chrome", headless: true,
    args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-unsafe-swiftshader"] });
  const trials = [];
  for (let trial = 0; trial < 3; trial++) {
    for (const candidate of trial % 2 ? ["typescript", "cpp"] : ["cpp", "typescript"]) {
      const page = await browser.newPage();
      const watchdog = setTimeout(() => { void browser.close(); }, 180000);
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        const result = await page.evaluate(async ({ plan, candidate, nativeCatalogKeys }) => {
          if (!crossOriginIsolated) { throw new Error("High-resolution timing requires isolated page"); }
          const { renderFixture, catalogKeys } = await import("/typescript.mjs");
          function checkCatalog(expected) {
            if (JSON.stringify(catalogKeys) !== JSON.stringify(expected)) {
              throw new Error("Candidate catalog inventories differ");
            }
          }
          let rejected = false;
          try { checkCatalog([...nativeCatalogKeys, "invalid@1"]); } catch { rejected = true; }
          if (!rejected) { throw new Error("Catalog mismatch guard accepted an extra module"); }
          checkCatalog(nativeCatalogKeys);
          if (candidate === "typescript") {
            return await renderFixture(plan, true);
          }
          const { default: createCandidate } = await import("/candidate.mjs");
          return await new Promise((accept, reject) => {
            const logs = [];
            let result;
            createCandidate({
              preRun: [(module) => module.FS.writeFile("/plan.json", JSON.stringify(plan))],
              print: (line) => {
                logs.push(line);
                if (line.startsWith("RT_BENCH ")) { result = JSON.parse(line.slice(9)); }
              },
              printErr: (line) => logs.push(line),
              onAbort: (error) => reject(new Error(String(error))),
              onExit: (code) => code === 0 && result ? accept(result) : reject(new Error(`Exit ${code}: ${logs.join("\n")}`))
            }).catch(reject);
          });
        }, { plan, candidate, nativeCatalogKeys });
        validate(result);
        const summary = { encodeMs: summarize(result.encodeMs), completeMs: summarize(result.completeMs) };
        trials.push({ trial, candidate, ...result, summary });
        console.log(JSON.stringify({ trial, candidate, ...summary }));
      } finally { clearTimeout(watchdog); await page.close(); }
    }
  }
  writeFileSync(reportPath, JSON.stringify({ browser: browser.version(), platform: process.platform,
    architecture: arch(), cpu: cpus()[0]?.model, node: process.version, sourceHashes,
    adapter: "SwiftShader (forced software)", dimensions: [4, 4], passes: 64, warmup: 30, samples: 120,
    scope: "Matching catalog inventories, two executed shaders, constant controls, 64 volatile passes plus presentation, private device, RGBA8 readback. CPU encode/submit includes readback setup, excludes completion wait. Completion includes CPU row copy and unmap. C++ includes scheduler/loader and texture reuse; TS fixture host lacks general scheduling and prepares one texture per pass. No audio, PNG, or hardware deadline claim.",
    plan, nativeCatalogKeys, sizes, trials }, null, 2));
} finally {
  await browser?.close();
  if (server.listening) { await new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept())); }
}
