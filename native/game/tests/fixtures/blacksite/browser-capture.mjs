import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const required = (name) => { const value = option(name); if (!value) { throw new Error(`Required option: ${name}`); } return resolve(value); };
const documentPath = required("--document"), framePath = required("--frame"), probePath = required("--shared-probe"), runtime = required("--runtime"), output = required("--out");
const fixture = dirname(fileURLToPath(import.meta.url));
const repository = resolve(fixture, "../../../../..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const routes = new Map();
const addFile = async (url, path, mime) => { const bytes = await readFile(path); routes.set(url, { bytes, mime }); return sha256(bytes); };
const game = JSON.parse(await readFile(documentPath, "utf8"));
const probe = JSON.parse(await readFile(probePath, "utf8"));
if (sha256(await readFile(framePath)) !== probe.nativeFrameDigest || JSON.stringify(game.assets.map(({ id, digest }) => ({ id, digest }))) !== JSON.stringify(probe.nativeAssets)) {
  throw new Error("Controlled frame or asset inventory differs from shared probe");
}
if (probe.resolution.width !== 1280 || probe.resolution.height !== 720) {
  throw new Error("BLACKSITE paired probe requires 1280x720");
}
await mkdir(dirname(output), { recursive: true });
const bundles = {};
for (const [name, entry] of [["probe", resolve(fixture, "browser-probe.mjs")], ["worker", resolve(repository, "packages/game-runtime/src/native-browser/worker.ts")]]) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", conditions: ["nodetool-dev"], metafile: true, logLevel: "silent" });
  const inputs = Object.keys(result.metafile.inputs);
  const forbidden = inputs.filter((path) => /packages\/game-runtime\/src\//.test(path) && !/packages\/game-runtime\/src\/native-browser\//.test(path));
  if (forbidden.length) {
    throw new Error(`Native probe bundled legacy runtime: ${forbidden.join(", ")}`);
  }
  const bytes = result.outputFiles[0].contents;
  routes.set(`/${name}.js`, { bytes, mime: "text/javascript" });
  bundles[name] = { sha256: sha256(bytes), inputs };
  await writeFile(`${output}-${name}.js`, bytes, { flag: "wx" });
}
const runtimeDigests = {
  module: await addFile("/native-game.mjs", resolve(runtime, "native-game.mjs"), "text/javascript"),
  wasm: await addFile("/native-game.wasm", resolve(runtime, "native-game.wasm"), "application/wasm")
};
await addFile("/game.json", documentPath, "application/json");
await addFile("/frame.json", framePath, "application/json");
await addFile("/shared-probe.json", probePath, "application/json");
const paths = new Set();
for (const asset of game.assets) {
  if (!asset.path || asset.path.startsWith("/") || /[\\?#:%]/.test(asset.path) || asset.path.split("/").some((part) => !part || part === "." || part === "..") || paths.has(asset.path)) {
    throw new Error("Invalid or duplicate closed asset path");
  }
  paths.add(asset.path);
  const bytes = await readFile(resolve(dirname(documentPath), asset.path));
  if (bytes.length !== asset.size || sha256(bytes) !== asset.digest) {
    throw new Error(`Declared asset mismatch: ${asset.id}`);
  }
  routes.set(`/assets/${asset.path}`, { bytes, mime: "application/octet-stream" });
}
routes.set("/", { bytes: Buffer.from('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}canvas{display:block}</style><canvas></canvas><script type="module" src="/probe.js"></script>'), mime: "text/html" });
if (args.includes("--prepare-only")) {
  await writeFile(`${output}-preparation.json`, JSON.stringify({ runtimeDigests, bundles, declaredRoutes: [...routes.keys()] }, null, 2) + "\n", { flag: "wx" });
  process.stdout.write(JSON.stringify({ preparation: `${output}-preparation.json`, gpuStarted: false }) + "\n");
  process.exit(0);
}
const requests = [], errors = [];
const server = createServer((request, response) => {
  const entry = routes.get(request.url);
  requests.push({ path: request.url, admitted: !!entry });
  response.writeHead(entry ? 200 : 404, { "Content-Type": entry?.mime ?? "text/plain", "Cache-Control": "no-store", "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" });
  response.end(entry?.bytes ?? "Closed probe route not declared");
});
await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const context = await browser.newContext({ viewport: probe.resolution, deviceScaleFactor: 1, serviceWorkers: "block" });
  await context.route("**/*", (route) => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(origin, { waitUntil: "load", timeout: 120000 });
  const report = await page.evaluate(async () => await window.probeReady);
  if (!report || errors.length || requests.some((request) => !request.admitted)) {
    throw new Error(`Native probe failed: ${JSON.stringify({ errors, requests })}`);
  }
  await page.locator("canvas").screenshot({ path: `${output}.png`, timeout: 120000 });
  await writeFile(`${output}-report.json`, JSON.stringify({ ...report, runtimeDigests, bundles, requests, errors, softwareRendering: true, hardwarePerformanceClaim: false }, null, 2) + "\n", { flag: "wx" });
  await page.evaluate(() => window.disposeProbe());
  await context.close();
  process.stdout.write(JSON.stringify({ screenshot: `${output}.png`, report: `${output}-report.json`, sourceFrameDigest: report.sourceFrameDigest }) + "\n");
} catch (error) {
  await writeFile(`${output}-failure.json`, JSON.stringify({ error: String(error.stack ?? error), requests, errors, runtimeDigests, bundles }, null, 2) + "\n", { flag: "wx" });
  throw error;
} finally {
  await browser?.close();
  await new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept()));
}
