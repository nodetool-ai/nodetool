import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL(".", import.meta.url));
const blocks = 512;
const frames = blocks * 128;
const input = new Float32Array(blocks * 512);
let seed = 12345;
for (let block = 0; block < blocks; ++block) {
  for (let index = 0; index < 512; ++index) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    input[block * 512 + index] = block < 256 ? (seed >>> 8) / 8388608 - 1 : 0;
  }
}
// Distinct stereo impulses also exercise channel isolation after the noise tail.
input[400 * 512] = 1;
input[401 * 512 + 1] = -1;
const fixture = Buffer.from(input.buffer);
const executable = join(root, "build", process.platform === "win32" ? "native.exe" : "native");
function nativeRender(bytes) {
  return spawnSync(executable, [], { input: bytes, maxBuffer: 8 * 1024 * 1024 });
}
const native = nativeRender(fixture);
if (native.error) { throw native.error; }
assert.equal(native.status, 0, native.stderr.toString());
assert.equal(native.stdout.length, frames * 2 * 4);
assert.equal(nativeRender(fixture.subarray(0, fixture.length - 4)).status, 1,
  "The native driver must reject a truncated quantum");
assert.deepEqual(nativeRender(fixture).stdout, native.stdout, "Native repeatability");

function compare(bytes, label) {
  assert.equal(bytes.length, native.stdout.length, `${label}: output length`);
  const mismatch = bytes.findIndex((byte, index) => byte !== native.stdout[index]);
  assert.equal(mismatch, -1, `${label}: first differing byte`);
}
const corrupted = Buffer.from(native.stdout);
corrupted[0] ^= 1;
assert.throws(() => compare(corrupted, "Deliberate corruption"));
assert.throws(() => compare(Buffer.alloc(0), "Empty output"));
const wasm = readFileSync(join(root, "build/kernels.wasm"));
const module = await WebAssembly.compile(wasm);
const instance = new WebAssembly.Instance(module);
const address = instance.exports.nt_context();
const arena = new Float32Array(instance.exports.memory.buffer, address, 772);
arena.fill(0);
const direct = Buffer.alloc(native.stdout.length);
for (let block = 0; block < blocks; ++block) {
  arena.set(input.subarray(block * 512, (block + 1) * 512));
  instance.exports.nt_process(address);
  direct.set(new Uint8Array(arena.buffer, address + 512 * 4, 256 * 4), block * 256 * 4);
}
compare(direct, "Node WebAssembly");
assert.ok(new Float32Array(direct.buffer, direct.byteOffset, frames * 2).every(Number.isFinite));
assert.ok(direct.some((byte) => byte !== 0), "The fixture must render nonzero output");

const routes = new Map([
  ["/", ["text/html", Buffer.from("<!doctype html><title>WP03 parity runner</title>")]],
  ["/kernels.wasm", ["application/wasm", wasm]],
  ["/input", ["application/octet-stream", fixture]],
  ["/worklet.js", ["text/javascript", readFileSync(join(root, "worklet.js"))]]
]);
const server = createServer((request, response) => {
  const route = routes.get(request.url);
  if (!route) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "Content-Type": route[0] }).end(route[1]);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
let browser;
try {
  browser = await chromium.launch({ channel: process.env.SPIKE_BROWSER ?? "chrome", headless: true });
  const page = await browser.newPage();
  const endpoint = server.address();
  assert.ok(endpoint && typeof endpoint !== "string");
  await page.goto(`http://127.0.0.1:${endpoint.port}`);
  const started = performance.now();
  const bytes = await page.evaluate(async ({ frames, blocks }) => {
    const context = new OfflineAudioContext(2, frames, 44100);
    const input = new Float32Array(await (await fetch("/input")).arrayBuffer());
    const module = await WebAssembly.compile(await (await fetch("/kernels.wasm")).arrayBuffer());
    await context.audioWorklet.addModule("/worklet.js");
    const buffer = context.createBuffer(4, frames, 44100);
    for (let block = 0; block < blocks; ++block) {
      for (let frame = 0; frame < 128; ++frame) {
        for (let channel = 0; channel < 4; ++channel) {
          const offset = channel < 2 ? frame * 2 + channel : 256 + frame * 2 + channel - 2;
          buffer.getChannelData(channel)[block * 128 + frame] = input[block * 512 + offset];
        }
      }
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const worklet = new AudioWorkletNode(context, "kernel-spike", {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      channelCount: 4, channelCountMode: "explicit", channelInterpretation: "discrete",
      processorOptions: { module }
    });
    source.connect(worklet).connect(context.destination);
    source.start();
    let deadline;
    let result;
    try {
      result = await Promise.race([
        context.startRendering(),
        new Promise((_, reject) => {
          worklet.onprocessorerror = () => reject(new Error("AudioWorklet processor failed"));
          deadline = setTimeout(() => reject(new Error("AudioWorklet render timed out")), 60000);
        })
      ]);
    } finally {
      clearTimeout(deadline);
    }
    const interleaved = new Float32Array(frames * 2);
    for (let frame = 0; frame < frames; ++frame) {
      interleaved[frame * 2] = result.getChannelData(0)[frame];
      interleaved[frame * 2 + 1] = result.getChannelData(1)[frame];
    }
    return Array.from(new Uint8Array(interleaved.buffer));
  }, { frames, blocks });
  compare(Buffer.from(bytes), "Chrome AudioWorklet");
  const result = {
    build: JSON.parse(readFileSync(join(root, "build/build.json"), "utf8")),
    platform: process.platform, architecture: process.arch, browser: browser.version(),
    blocks, frames, sampleRate: 44100, bytesCompared: native.stdout.length,
    sha256: createHash("sha256").update(native.stdout).digest("hex"),
    nativeRepeatable: true, nodeWasmEqual: true, audioWorkletEqual: true,
    negativeControls: ["truncated input", "corrupted output", "empty output"],
    offlineRunWallMs: performance.now() - started,
    limits: "Offline wall time includes setup and transfer. It is not per-quantum render time or live-device evidence."
  };
  writeFileSync(join(root, "build/result.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
