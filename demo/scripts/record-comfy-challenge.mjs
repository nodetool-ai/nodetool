// Records the Comfy challenge beats from the real app, headless.
//   node demo/scripts/record-comfy-challenge.mjs <outDir>
// Needs the API on :7777 and the web app on :3000. A full run submits one paid
// LTX-2.3 render on Comfy Cloud and one workflow run.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const WEB = "http://localhost:3000";
const out = path.resolve(process.argv[2]);
const CASTS = new URL("../public/casts/comfy-challenge/", import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: out, size: { width: 1920, height: 1080 } }
});
await context.addInitScript(() => {
  const add = () => {
    const c = document.createElement("div");
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M5 3l14 7-6 2-2 6z" fill="#fff" stroke="#000"/></svg>';
    c.style.cssText = "position:fixed;left:960px;top:800px;z-index:2147483647;pointer-events:none";
    document.documentElement.appendChild(c);
    window.addEventListener("mousemove", (e) => { c.style.left = `${e.clientX}px`; c.style.top = `${e.clientY}px`; }, true);
  };
  if (document.documentElement) add(); else addEventListener("DOMContentLoaded", add);
});
const page = await context.newPage();
const t0 = Date.now();
const marks = {};
const mark = (name) => { marks[name] = (Date.now() - t0) / 1000; console.log(name, marks[name]); };

async function upload(file, mimeType) {
  const res = await context.request.post(`${WEB}/api/assets`, {
    multipart: { file: { name: file, mimeType, buffer: fs.readFileSync(path.join(CASTS, file)) } }
  });
  if (!res.ok()) throw new Error(await res.text());
  const { id } = await res.json();
  return { type: mimeType.split("/")[0], asset_id: id, uri: `asset://${id}` };
}

const stills = [await upload("h3-still-1.jpg", "image/jpeg"), await upload("h3-still-2.jpg", "image/jpeg"), await upload("h3-still-3.jpg", "image/jpeg")];
const clips = [await upload("h3-shot-1.mp4", "video/mp4"), await upload("h3-shot-2.mp4", "video/mp4"), await upload("h3-shot-3.mp4", "video/mp4")];
const shot = (id, index, action, preset, clip) => ({
  type: "shot", id, index, action, slug: id,
  camera: { framing: "", movement: "", preset_ids: [preset] },
  duration_seconds: 5,
  status: "rendered",
  keyframe: stills[index], keyframe_versions: [stills[index]],
  clip, clip_versions: [clip]
});
const created = await context.request.post(`${WEB}/trpc/storyboards.create`, {
  data: {
    name: `Coffee ad ${Date.now() % 10000}`,
    document: {
      screenplay: null, brief: "A 15-second coffee ad: a café table, the cup, the steam.",
      style: "warm low light", aspectRatio: "16:9", directorModel: null, imageModel: null,
      videoModel: { type: "video_model", provider: "comfy_cloud", id: "comfyui-workflow/ltx-2.3-i2v", name: "LTX-2.3" },
      setupStage: "done",
      shots: [
        shot("wide-of-the-table", 0, "Wide of the café table among scattered coffee beans.", "camera.orbit", clips[0]),
        shot("dolly-in-on-the-cup", 1, "Steam curls up from the espresso cup.", "camera.dolly-in", clips[1]),
        shot("close-up-of-steam", 2, "Close-up of the steam rising, warm low light.", "camera.crane-up", clips[2])
      ]
    }
  }
});
if (!created.ok()) throw new Error(await created.text());
const body = await created.json();
const id = body.result.data.id;
const name = body.result.data.name;
console.log("board", id, name);

await page.goto(`${WEB}/workspace`);
await page.getByRole("button", { name: "Documents", exact: true }).click();
await page.getByRole("treeitem", { name: `${name} Storyboard`, exact: true }).click();
await page.locator(".shot-card").first().waitFor({ timeout: 30000 });
await page.waitForTimeout(3000);
mark("board");
await page.screenshot({ path: path.join(out, "1-board.png") });

const wait = (ms) => page.waitForTimeout(ms);
const snap = (n) => page.screenshot({ path: path.join(out, `${n}.png`) });
let cx = 960, cy = 800;
async function moveTo(loc) {
  const b = await loc.boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y, { steps: 25 });
  cx = x; cy = y;
  await wait(350);
}
async function clickOn(loc) { await moveTo(loc); await page.mouse.click(cx, cy); }
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
async function step(name, fn) {
  if (ONLY && !ONLY.has(name)) return;
  mark(name);
  try { await fn(); } catch (e) { console.log("STEP FAILED", name, String(e).slice(0, 300)); }
  await snap(name);
  mark(`${name}-end`);
}
const takes = async () => {
  const r = await context.request.get(`${WEB}/trpc/storyboards.get?input=${encodeURIComponent(JSON.stringify({ id }))}`);
  const doc = (await r.json()).result.data.document;
  const d = typeof doc === "string" ? JSON.parse(doc) : doc;
  return d.shots[1].clip_versions?.length ?? 0;
};
const cards = page.locator(".shot-card");
const openRender = async () => {
  await moveTo(cards.nth(1));
  await wait(500);
  await clickOn(cards.nth(1).getByRole("button", { name: /actions/i }).first());
  await wait(600);
  await clickOn(page.getByRole("menuitem", { name: /Render clip/ }));
  await page.getByRole("dialog").waitFor();
  await wait(1200);
};

await step("board-tour", async () => {
  for (const n of [0, 1, 2]) { await moveTo(cards.nth(n)); await wait(1800); }
});
await step("inspector", async () => {
  await moveTo(cards.nth(1));
  await clickOn(cards.nth(1).getByRole("button", { name: "Edit shot" }));
  await wait(3000);
  await clickOn(page.getByRole("button", { name: "Browse presets" }).or(page.getByText("Browse presets")).first());
  await wait(6000);
  await snap("presets");
  await page.keyboard.press("Escape");
  await wait(1500);
});
await step("inspector-close", async () => {
  await clickOn(page.getByText("Back to storyboard"));
  await wait(1500);
});
await step("dialog", async () => {
  await openRender();
  await wait(1500);
});
await step("picker", async () => {
  await clickOn(page.getByRole("dialog").getByText(/LTX-2.3 22B/).first());
  await wait(1500);
  await clickOn(page.getByText("Comfy Cloud", { exact: true }).first());
  await wait(1500);
  const search = page.getByPlaceholder(/Search text-to-video models/);
  await clickOn(search);
  await page.keyboard.type("ComfyUI workflow", { delay: 70 });
  await wait(4000);
  await snap("picker-workflows");
  mark("router-list");
  await search.fill("");
  await wait(1500);
  await snap("picker-open");
  await moveTo(page.getByText("LTX-2.3 22B").last().or(search).first());
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 120); await wait(500); }
  await snap("picker-scrolled");
  mark("router-list-end");
  await page.keyboard.press("Escape");
  await wait(1200);
});
const DRY = process.env.DRY === "1";
await step("render", async () => {
  if (DRY) { await page.getByRole("button", { name: "Cancel" }).click(); await wait(800); return; }
  if (!(await page.getByRole("dialog").isVisible())) await openRender();
  const before = await takes();
  await clickOn(page.getByRole("dialog").getByRole("button", { name: "Render clip", exact: true }).last());
  mark("render-start");
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline && (await takes()) <= before) await wait(2000);
  mark("render-done");
  await wait(3000);
});
await step("takes", async () => {
  await moveTo(cards.nth(1));
  await clickOn(cards.nth(1).getByRole("button", { name: "Edit shot" }));
  await wait(2000);
  const view = page.getByRole("button", { name: /View takes/ }).first();
  if (await view.isVisible()) { await clickOn(view); await wait(2000); }
  await snap("takes-open");
  const pick = page.getByRole("button", { name: /Use clip \d as the current clip/ }).first();
  if (await pick.count()) await clickOn(pick);
  else { await page.mouse.move(750, 518, { steps: 25 }); await wait(400); await page.mouse.click(750, 518); }
  await wait(4000);
  await clickOn(page.getByText("Back to storyboard"));
  await wait(1500);
});
await step("timeline", async () => {
  const back = page.getByText("Back to storyboard");
  if (await back.isVisible()) { await clickOn(back); await wait(1000); }
  await clickOn(page.getByRole("button", { name: "More board actions" }));
  await wait(1000);
  await snap("board-menu");
  await clickOn(page.getByRole("menuitem", { name: /timeline/i }).first());
  await wait(9000);
  await snap("timeline-open");
  mark("timeline-play");
  await page.keyboard.press("Space");
  await wait(10000);
  await snap("timeline-playing");
  await page.keyboard.press("Space");
  await wait(800);
  mark("export");
  await clickOn(page.getByRole("button", { name: "Export" }).first());
  await wait(2500);
  await snap("export-dialog");
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    console.log("export dialog:", (await dialog.first().innerText()).slice(0, 500));
    const go = dialog.first().getByRole("button", { name: /export|render|start/i }).last();
    if (await go.count()) await clickOn(go);
    for (let i = 0; i < 4; i++) { await wait(10000); await snap(`export-${i}`); }
    mark("export-end");
    if (await dialog.count() && await dialog.first().isVisible()) await page.keyboard.press("Escape");
  }
  await wait(800);
});
await step("graph", async () => {
  await clickOn(page.getByText(name, { exact: true }).first());
  await wait(2500);
  const back = page.getByText("Back to storyboard");
  if (await back.isVisible()) { await clickOn(back); await wait(1000); }
  await openRender();
  await clickOn(page.getByRole("button", { name: "Open ComfyUI workflow" }));
  await page.getByRole("button", { name: /Run entire workflow/ }).waitFor({ timeout: 30000 });
  await wait(3000);
  console.log("buttons:", (await page.getByRole("button").evaluateAll((e) => e.map((x) => x.getAttribute("aria-label") || x.innerText).filter(Boolean))).slice(12).join(" | "));
  // The example's nodes open stacked, so tidy them with the toolbar's own controls.
  await page.mouse.click(1843, 83);
  await page.mouse.click(1883, 109);
  await wait(800);
  const run = await page.getByRole("button", { name: /Run entire workflow/ }).boundingBox();
  const layout = page.getByRole("button", { name: /layout/i }).first();
  if (await layout.count()) await clickOn(layout);
  else { await page.mouse.move(run.x - 25, run.y + run.height / 2, { steps: 20 }); await wait(300); await page.mouse.click(run.x - 25, run.y + run.height / 2); }
  await wait(1500);
  const noThanks = page.getByRole("button", { name: /no thanks/i });
  if (await noThanks.count()) await noThanks.first().click();
  await page.mouse.click(300, 200);
  await page.keyboard.press("Escape");
  await wait(500);
  await page.keyboard.press("f");
  await wait(3000);
  await snap("graph-open");
});
await step("graph-run", async () => {
  if (DRY) return;
  await clickOn(page.getByRole("button", { name: /Run entire workflow/ }));
  mark("run-start");
  for (let i = 0; i < 6; i++) { await wait(20000); await snap(`run-${i}`); }
  mark("run-done");
});
await context.close();
await browser.close();
fs.writeFileSync(path.join(out, "marks.json"), JSON.stringify(marks, null, 2));
