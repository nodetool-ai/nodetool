import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron } from "@playwright/test";
import { blockoutFrame, skinnedGlb } from "../tests/fixtures/game3d.js";
import type { GameCapturePageInput3D } from "../src/renderer3d/capture-page.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const temporaryRoot = join(tmpdir(), "nodetool-game3d-electron");
await mkdir(temporaryRoot, { recursive: true });
const temporary = await mkdtemp(join(temporaryRoot, "electron-"));
const main = join(temporary, "main.mjs");
await writeFile(main, `import { app, BrowserWindow } from "electron";
app.setPath("userData", ${JSON.stringify(join(temporary, "user-data"))});
let window;
app.whenReady().then(() => {
  window = new BrowserWindow({ show: false, width: 128, height: 128,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  window.loadURL("about:blank");
  window.webContents.setWindowOpenHandler(() => ({action:"deny"}));
});`);
const application = await _electron.launch({ args: [main, "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], timeout: 20_000 });
try {
  const bundle = await readFile(join(root, "packages/game-renderer/dist/game3d-capture-page.js"), "utf8");
  await writeFile(join(temporaryRoot, "game3d-electron-launch.json"), JSON.stringify(await application.evaluate(({ app, BrowserWindow }) => ({ ready: app.isReady(), windows: BrowserWindow.getAllWindows().length, electron: process.versions.electron, argv: process.argv })), null, 2));
  const windows = application.windows();
  const page = windows[0] ?? await application.firstWindow({ timeout: 10_000 });
  await page.route("**/*", (route) => {
    if (route.request().url() === "http://127.0.0.1/") { return route.fulfill({ contentType: "text/html", body: '<body style="margin:0"><canvas></canvas><script src="/capture.js"></script></body>' }); }
    if (route.request().url() === "http://127.0.0.1/capture.js") { return route.fulfill({ contentType: "text/javascript", body: bundle }); }
    return route.abort();
  });
  await page.goto("http://127.0.0.1/");
  const frame = blockoutFrame();
  const transform = frame.entities[0]?.transform;
  if (!transform) { throw new Error("Fixture transform is missing"); }
  frame.tick = 30;
  frame.entities = [-1.5, 1.5].map((x, index) => ({ entityId: `skin-${index}`, transform: { ...transform, position: { x, y: 0, z: 0 } },
    previousTransform: { ...transform, position: { x, y: 0, z: 0 } }, model: { assetId: "skin", castShadow: true, receiveShadow: true },
    animation: { clipId: index === 0 ? "clip:1" : "clip:0", startTick: 0, playbackRate: 1, loop: false } }));
  frame.lights = [{ entityId: "sun", transform: { ...transform, position: { x: 0, y: 4, z: 3 }, rotation: [-0.3826834323650898, 0, 0, 0.9238795325112867] },
    light: { kind: "directional", color: "#ffffff", intensity: 2, castShadow: true } }];
  frame.environment.shadows.enabled = true;
  const request: GameCapturePageInput3D = { frame, width: 128, height: 128, interpolation: 1, assets: { skin: { base64: Buffer.from(skinnedGlb()).toString("base64") } } };
  const started = performance.now();
  const report = await page.evaluate((input) => window.captureNativeGame3D(input), request);
  if (!report.capabilities.minimalRenderSucceeded || report.stats.triangles < 2 || report.projectedBounds.length !== 2) { throw new Error("Electron skinning fixture did not render"); }
  const png = await page.evaluate(() => document.querySelector("canvas")?.toDataURL("image/png").split(",")[1]);
  if (!png) { throw new Error("Electron renderer did not return PNG pixels"); }
  await writeFile(join(temporaryRoot, "game3d-electron.png"), Buffer.from(png, "base64"));
  await writeFile(join(temporaryRoot, "game3d-electron-spike.json"), JSON.stringify({ ...report, captureMs: performance.now() - started, userAgent: await page.evaluate(() => navigator.userAgent) }, null, 2));
} finally { await application.close(); await rm(temporary, { recursive: true, force: true }); }
