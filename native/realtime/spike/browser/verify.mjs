import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import sharp from "sharp";

const root = fileURLToPath(new URL("../..", import.meta.url));
const [candidateDirectory, nativeExecutable] = process.argv.slice(2);
if (!candidateDirectory || !nativeExecutable || process.argv.length !== 4) {
  throw new Error("Usage: node verify.mjs CANDIDATE_DIRECTORY NATIVE_EXECUTABLE");
}
const render = JSON.parse(readFileSync(join(root, "tests/fixtures/offline-render.json"), "utf8"));
const audio = JSON.parse(readFileSync(join(root, "tests/fixtures/offline-audio.json"), "utf8"));
const mixed = structuredClone(render);
mixed.audio = audio.audio; mixed.params = audio.params;
mixed.control.ops.push(...audio.control.ops); mixed.control.stateful = audio.control.stateful;
const routes = new Map([["/", ["text/html", Buffer.from("<!doctype html><title>RT-Q8 offline comparison</title>")]]]);
const typescript = await build({ entryPoints: [fileURLToPath(new URL("typescript-candidate.mjs", import.meta.url))],
  bundle: true, format: "esm", platform: "browser", write: false });
routes.set("/typescript.mjs", ["text/javascript", typescript.outputFiles[0].contents]);
for (const [name, type] of [["candidate.mjs", "text/javascript"], ["candidate.wasm", "application/wasm"], ["candidate.data", "application/octet-stream"]]) {
  routes.set(`/${name}`, [type, readFileSync(join(candidateDirectory, name))]);
}
const server = createServer((request, response) => {
  const route = routes.get(request.url);
  if (!route) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "Content-Type": route[0] }).end(route[1]);
});
const directory = mkdtempSync(join(tmpdir(), "realtime-browser-"));
let browser;
try {
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  browser = await chromium.launch({ channel: process.env.SPIKE_BROWSER ?? "chrome", headless: true,
    args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-unsafe-swiftshader"] });
  const endpoint = server.address();
  assert.ok(endpoint && typeof endpoint !== "string");
  for (const [name, plan] of [["render", render], ["mixed", mixed]]) {
    const input = join(directory, `${name}.json`), output = join(directory, name);
    writeFileSync(input, JSON.stringify(plan));
    const native = spawnSync(resolve(nativeExecutable), ["live", input, "--duration", "0.05", "--fps", "60", "--out", output], { encoding: "utf8", timeout: 60000 });
    assert.ifError(native.error);
    assert.equal(native.status, 0, native.stderr);
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.error(`${name}: ${error.message}`));
    const watchdog = setTimeout(() => { void browser.close(); }, 150000);
    try {
      await page.goto(`http://127.0.0.1:${endpoint.port}`);
      const result = await page.evaluate(async (plan) => {
        const { default: createCandidate } = await import("/candidate.mjs");
        return await new Promise((accept, reject) => {
          let runtime;
          const messages = [];
          const timeout = setTimeout(() => reject(new Error(`Browser export timed out: ${messages.join("\n")}`)), 120000);
          createCandidate({
            arguments: ["live", "/plan.json", "--duration", "0.05", "--fps", "60", "--out", "/output"],
            preRun: [(module) => { runtime = module; module.FS.writeFile("/plan.json", JSON.stringify(plan)); }],
            print: (text) => messages.push(text), printErr: (text) => messages.push(text),
            onAbort: (error) => { clearTimeout(timeout); reject(new Error(String(error))); },
            onExit: (status) => {
              clearTimeout(timeout);
              if (status !== 0) { reject(new Error(`Browser export exited ${status}: ${messages.join("\n")}`)); return; }
              try {
                const files = {};
                for (const file of runtime.FS.readdir("/output").filter((name) => name !== "." && name !== "..")) {
                  files[file] = Array.from(runtime.FS.readFile(`/output/${file}`));
                }
                accept(files);
              } catch (error) { reject(new Error(`Output read failed (${error.errno}): ${messages.join("\n")}; root=${runtime.FS.readdir("/").join(",")}`)); }
            }
          }).catch((error) => { clearTimeout(timeout); reject(error); });
        });
      }, plan);
      function compareArtifacts(actualFiles) {
        const expected = readdirSync(output).sort();
        assert.equal(expected.filter((file) => file.endsWith(".png")).length, 3);
        assert.deepEqual(Object.keys(actualFiles).sort(), expected);
        for (const file of expected) {
          const actual = Buffer.from(actualFiles[file]), reference = readFileSync(join(output, file));
          if (file.endsWith(".wav")) {
            // WP10 compares frames. Native/Wasm audio parity belongs to WP24.
            assert.equal(actual.length, reference.length);
            assert.deepEqual(actual.subarray(0, 58), reference.subarray(0, 58));
          } else {
            assert.deepEqual(actual, reference, `${name}/${file}: browser/native bytes differ`);
          }
        }
      }
      compareArtifacts(result);
      const corrupted = structuredClone(result);
      const firstFrame = Object.keys(corrupted).find((file) => file.endsWith(".png"));
      assert.ok(firstFrame);
      corrupted[firstFrame][0] ^= 1;
      assert.throws(() => compareArtifacts(corrupted), /browser\/native bytes differ/);
      assert.throws(() => compareArtifacts({}));
      console.log(`${name}: three PNG frames and manifest match native bytes; WAV header/length match`);
      const typescriptPixels = await page.evaluate(async (plan) => {
        const { renderFixture } = await import("/typescript.mjs");
        for (const [change, reason] of [
          [(invalid) => { invalid.render.passes[0].module = "unsupported@1"; }, "Unsupported shader module"],
          [(invalid) => { invalid.control.ops[0].op = "time"; }, "Unsupported render control operation"],
          [(invalid) => { invalid.render.passes[1].inputs.source = "missing"; }, "Unsupported invert binding"]
        ]) {
          const invalid = structuredClone(plan);
          change(invalid);
          let rejected = false;
          try { await renderFixture(invalid); } catch (error) {
            if (!error.message.includes(reason)) { throw error; }
            rejected = true;
          }
          if (!rejected) { throw new Error(`Invalid fixture was accepted: ${reason}`); }
        }
        return await renderFixture(plan);
      }, plan);
      for (const file of readdirSync(output).filter((file) => file.endsWith(".png"))) {
        const { data, info } = await sharp(readFileSync(join(output, file))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        assert.deepEqual([info.width, info.height, info.channels], [4, 4, 4]);
        assert.deepEqual(Buffer.from(typescriptPixels), data, `${name}/${file}: TypeScript/native pixels differ`);
        const corruptedPixels = Buffer.from(typescriptPixels);
        corruptedPixels[0] ^= 1;
        assert.throws(() => assert.deepEqual(corruptedPixels, data));
      }
      console.log(`${name}: existing TypeScript Executor pixels match all three native frames`);
    } finally { clearTimeout(watchdog); await page.close(); }
  }
  console.log(`Browser: ${browser.version()}. Fixture comparisons pass; Q8 timing and size evidence remains open.`);
} finally {
  await browser?.close();
  if (server.listening) { await new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept())); }
  rmSync(directory, { recursive: true, force: true });
}
