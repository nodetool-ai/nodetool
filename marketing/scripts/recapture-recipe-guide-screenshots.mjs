// Recapture the recipe walkthroughs from the real NodeTool UI at 2x density.
//
// Requires the local NodeTool API on :7777 and web app on :3000. The script
// clones the source documents, moves only those temporary clones through the
// saved setup stages, captures one browser page at a time, then removes them.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const marketing = path.resolve(here, "..");
const runId = "2026-09-10-marketing-recipes-01";
const runRoot = path.join(marketing, "recipe-assets", runId);
const appUrl = process.env.NODETOOL_CAPTURE_WEB_URL ?? "http://127.0.0.1:3000/workspace";
const apiUrl = process.env.NODETOOL_CAPTURE_API_URL ?? "http://127.0.0.1:7777/trpc";
const viewport = { width: 1600, height: 1000 };
const pixelRatio = 2;
const output = { width: viewport.width * pixelRatio, height: viewport.height * pixelRatio };
const onlyIndex = process.argv.indexOf("--only");
const onlySlug = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;
const reconcileExisting = process.argv.includes("--reconcile-existing");

const api = createTRPCProxyClient({
  links: [httpBatchLink({ url: apiUrl, methodOverride: "POST" })]
});

const recipes = [
  {
    slug: "viral-video-ad-engine",
    kind: "storyboard",
    sourceId: "af795795297f43bf9e66d0318f422c83",
    prepareDocument: prepareProductAdDocument,
    captures: [
      ["idea", "captures/raw/ad-c1.png"],
      ["genre", "captures/raw/ad-c2.png"],
      ["review", "captures/raw/ad-c3.png"],
      ["entities", "captures/raw/ad-c4.png"],
      ["look", "captures/raw/ad-c5.png"],
      ["done", "captures/raw/ad-c6.png"],
      ["done", "captures/raw/ad-c8.png", "attach-clips-select-first"]
    ],
    additionalTabs: [
      ["project-new", "new", "New project", "captures/raw/ad-c0.png"],
      ["script", "58f7b179a7d74d989a650f52a3ce8ff5", null, "captures/raw/ad-c7.png"],
      ["timeline", "ecaf4b138411428e83d8071bc2a7cdcb", null, "captures/raw/ad-c9.png"],
      ["timeline", "58d280ee969c41448fcb09b6891ee0ab", null, "captures/raw/ad-c10.png"],
      ["timeline", "c80736b7dff447d4bb21789f95a438ea", null, "captures/raw/ad-c11.png"]
    ]
  },
  {
    slug: "multilingual-video-dubber",
    kind: "script",
    sourceId: "229cbcbc8172462fa3b6d220d5a60956",
    captures: [
      ["idea", "captures/steps/du-c3.png"],
      ["format", "captures/steps/du-c4.png"],
      ["review", "captures/steps/du-c5.png"],
      ["voices", "captures/steps/du-c6.png"],
      ["done", "captures/steps/du-c7.png"],
      ["done", "captures/steps/du-c8.png", "focus-second-line"]
    ]
  },
  {
    slug: "ecommerce-sku-visual-factory",
    kind: "storyboard",
    sourceId: "3b95fdd8e581466382eca86de61cfb1c",
    captures: [
      ["idea", "captures/steps/sku-c1.png"],
      ["genre", "captures/steps/sku-c2.png"],
      ["review", "captures/steps/sku-c3.png"],
      ["entities", "captures/steps/sku-c4.png"],
      ["look", "captures/steps/sku-c5.png"],
      ["done", "captures/steps/sku-c6.png"],
      ["done", "captures/steps/sku-c7.png", "select-third-shot"]
    ]
  },
  {
    slug: "storyboard-to-trailer",
    kind: "storyboard",
    sourceId: "1420c5e4701a4269ba362c384813c2ec",
    selectedKeyframes: [
      "5bb892c8451b4112a11050f7c48828c7",
      "88ac486fbc034e739f3caf0a7ee15187",
      "9dc50d939de94fc9a46d102a447e048a",
      "43375d2cb021491eb8b3b94b83cf1269",
      "ff8e7d66c1f347c38674d64c6bb59a8d",
      "2f8d02bef32c4406a480086ae4455be0"
    ],
    captures: [
      ["idea", "captures/raw/tr-c1.png"],
      ["genre", "captures/raw/tr-c2.png"],
      ["review", "captures/raw/tr-c3.png"],
      ["entities", "captures/raw/tr-c4.png"],
      ["look", "captures/raw/tr-c5.png"],
      ["done", "captures/raw/tr-c6.png"]
    ]
  }
];

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function stagedPath(staging, relativePath) {
  return path.join(staging, relativePath.replaceAll("/", "__"));
}

function tabState(kind, id, title, projectId) {
  const type = kind;
  const tab = {
    id: `${type}:${id}`,
    type,
    ref: id,
    mode: "edit",
    title,
    projectId
  };
  return JSON.stringify({
    state: { tabs: [tab], activeTabId: tab.id, activeProjectId: projectId },
    version: 1
  });
}

function prepareProductAdDocument(document) {
  const prepared = structuredClone(document);
  const guideShots = prepared.shots.slice(0, 4).map((shot, index) => ({
    ...shot,
    index,
    status: "planned",
    scene_id: "scene-0"
  }));
  prepared.brief =
    "Create a quiet morning commercial for the Olive Travel Cup. Four shots: a cup on a pale kitchen worktop, a close view of the lid, the cup beside a plain cream book, and a final hero view. Warm window light. Keep the cup's shape and colour consistent. Vertical 9:16, for a 15-second ad. No generated lettering or product-performance claims.";
  prepared.genre = "Commercial";
  prepared.directorModel = {
    type: "language_model",
    id: "gpt-5.6-sol",
    provider: "codex",
    name: "GPT-5.6-Sol"
  };
  prepared.setupShotCount = 4;
  prepared.screenplay = {
    type: "screenplay",
    id: "d1-recipe-capture-screenplay",
    title: "Olive Travel Cup — Quiet Morning",
    genre: "Commercial",
    aspect_ratio: "9:16",
    logline: "A quiet morning product film built around one consistent Olive Travel Cup.",
    style_bible: prepared.style,
    scenes: [
      {
        type: "scene",
        id: "scene-0",
        slugline: "INT. QUIET MORNING KITCHEN — DAY",
        lighting: "Soft warm window light from camera-left over pale stone and warm off-white surfaces."
      }
    ],
    shots: guideShots
  };
  prepared.shots = prepared.shots.map((shot) => ({
    ...shot,
    status: "keyframe_ready",
    clip: undefined,
    clip_versions: []
  }));
  return prepared;
}

const productAdClips = [
  "6417ad9304c9469eaf38929cc3d37cd6",
  "c52bae64a4634aea81786c7e04bb802f",
  "56373aa8fb5c4472a66abbec798c5f81",
  "4c0fb8f4afb94d9d8825eaeb60170fd0",
  "4676695df4774947b2f964a85ebb6a19",
  "6766c8ae46b94aca8f93b7f218ba99a9"
];

async function loadCapturePage(browser, recipe, clone, stage, action) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: pixelRatio });
  const page = await context.newPage();
  await page.addInitScript(
    ({ tabs }) => {
      localStorage.setItem("workspace-tabs-storage", tabs);
      localStorage.setItem(
        "nodetool-onboarding",
        JSON.stringify({
          state: { completedSteps: [], dismissed: true, providerSignInOffered: true },
          version: 1
        })
      );
    },
    { tabs: tabState(recipe.kind, clone.id, clone.name, clone.projectId) }
  );
  await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByText("Loading NodeTool…").waitFor({ state: "detached", timeout: 60_000 }).catch(() => {});

  if (stage === "done") {
    await page.locator("[data-setup-flow]").waitFor({ state: "detached", timeout: 60_000 });
    await page.getByText(clone.name, { exact: false }).first().waitFor({ state: "visible", timeout: 60_000 });
  } else {
    await page.locator("[data-setup-flow]").waitFor({ state: "visible", timeout: 60_000 });
  }

  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    [...document.images].filter((image) => image.currentSrc).every((image) => image.complete && image.naturalWidth > 0)
  );
  await page.waitForTimeout(1200);

  if (action === "select-third-shot") {
    const card = page.locator('.shot-card[data-shot-id="shot-2"]');
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await page.getByText("SH 03 selected", { exact: false }).waitFor({ state: "visible" });
    await page.waitForTimeout(400);
  } else if (action === "attach-clips-select-first") {
    const card = page.locator(".shot-card").first();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await page.getByText("SH 01 selected", { exact: false }).waitFor({ state: "visible" });
    await page.waitForTimeout(400);
  } else if (action === "focus-second-line") {
    const line = page.locator('[data-line-id="wmtvs3l270_line_2"]');
    await line.scrollIntoViewIfNeeded();
    await line.hover();
    await page.waitForTimeout(400);
  }

  return { context, page };
}

async function attachProductAdClips(recipe, cloneId) {
  const current = await api.storyboards.get.query({ id: cloneId });
  const document = structuredClone(current.document);
  document.shots = document.shots.map((shot, index) => {
    const assetId = productAdClips[index];
    const clip = { type: "video", uri: `asset://${assetId}`, asset_id: assetId };
    return { ...shot, status: "rendered", clip, clip_versions: [clip] };
  });
  return api.storyboards.update.mutate({
    id: cloneId,
    baseUpdatedAt: current.updatedAt,
    document
  });
}

async function updateStage(recipe, cloneId, stage) {
  const router = recipe.kind === "storyboard" ? api.storyboards : api.scripts;
  const current = await router.get.query({ id: cloneId });
  const document = structuredClone(current.document);
  if (recipe.kind === "storyboard") {
    document.setupStage = stage;
  } else {
    document.setup = { ...document.setup, stage };
  }
  return router.update.mutate({
    id: cloneId,
    baseUpdatedAt: current.updatedAt,
    document
  });
}

function repairSelectedKeyframes(document, assetIds) {
  if (!assetIds) return document;
  const repaired = structuredClone(document);
  repaired.shots = repaired.shots.map((shot, index) => ({
    ...shot,
    keyframe: {
      type: "image",
      uri: `asset://${assetIds[index]}`,
      asset_id: assetIds[index]
    }
  }));
  return repaired;
}

async function createClone(recipe) {
  const router = recipe.kind === "storyboard" ? api.storyboards : api.scripts;
  const source = await router.get.query({ id: recipe.sourceId });
  const id = crypto.randomUUID().replaceAll("-", "");
  let document = repairSelectedKeyframes(source.document, recipe.selectedKeyframes);
  if (recipe.prepareDocument) document = recipe.prepareDocument(document);
  const input = {
    id,
    projectId: source.projectId,
    name: source.name,
    document
  };
  if (recipe.kind === "script") {
    input.timelineId = source.timelineId;
    input.storyboardId = source.storyboardId;
  } else {
    input.timelineId = source.timelineId;
  }
  return { source, clone: await router.create.mutate(input) };
}

async function captureStandaloneTab(browser, kind, id, suppliedTitle, relativePath, staging) {
  let title = suppliedTitle;
  let projectId;
  if (kind === "script") {
    const document = await api.scripts.get.query({ id });
    title = document.name;
    projectId = document.projectId;
  } else if (kind === "timeline") {
    const document = await api.timeline.get.query({ id });
    title = document.name;
    projectId = document.projectId;
  }

  const context = await browser.newContext({ viewport, deviceScaleFactor: pixelRatio });
  const page = await context.newPage();
  await page.addInitScript(
    ({ tabs }) => {
      localStorage.setItem("workspace-tabs-storage", tabs);
      localStorage.setItem(
        "nodetool-onboarding",
        JSON.stringify({
          state: { completedSteps: [], dismissed: true, providerSignInOffered: true },
          version: 1
        })
      );
    },
    { tabs: tabState(kind, id, title, projectId) }
  );
  await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (kind === "project-new") {
    await page.getByText("What do you want to make?").waitFor({ state: "visible", timeout: 60_000 });
  } else if (kind === "timeline") {
    await page.locator('[data-testid="timeline-toolbar"]').waitFor({ state: "visible", timeout: 60_000 });
  } else {
    await page.getByText(title, { exact: false }).first().waitFor({ state: "visible", timeout: 60_000 });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  const staged = stagedPath(staging, `viral-video-ad-engine/${relativePath}`);
  try {
    await page.screenshot({ path: staged, type: "png", animations: "disabled" });
  } finally {
    await context.close();
  }
  return {
    relativePath,
    staged,
    hash: sha256(staged),
    bytes: fs.statSync(staged).size,
    projectId: projectId ?? "default",
    documentId: kind === "project-new" ? null : id
  };
}

async function deleteClone(recipe, id) {
  const router = recipe.kind === "storyboard" ? api.storyboards : api.scripts;
  await router.delete.mutate({ id });
}

function updateCaptureLog(recipe, captures) {
  const file = path.join(runRoot, recipe.slug, "capture-log.json");
  const log = JSON.parse(fs.readFileSync(file, "utf8"));
  const byPath = new Map(captures.map((capture) => [capture.relativePath, capture]));

  if (log.viewport) {
    log.viewport = { width: viewport.width, height: viewport.height, pixelRatio };
  }
  for (const entry of log.captures) {
    const relativePath = entry.path ?? entry.rawPath ?? entry.editedPath;
    const capture = byPath.get(relativePath);
    if (!capture) continue;
    entry.viewport = {
      width: viewport.width,
      height: viewport.height,
      devicePixelRatio: pixelRatio
    };
    entry.captureMode = "playwright-cli-live-ui";
    entry.mimeType = "image/png";
    entry.dimensions = `${output.width}x${output.height}`;
    if (Object.hasOwn(entry, "sha256")) entry.sha256 = capture.hash;
    if (Object.hasOwn(entry, "rawSha256")) entry.rawSha256 = capture.hash;
    if (!Object.hasOwn(entry, "sha256") && !Object.hasOwn(entry, "rawSha256")) {
      entry.rawSha256 = capture.hash;
    }
    if (Object.hasOwn(entry, "status")) entry.status = "captured";
    entry.projectId = capture.projectId;
    if (Array.isArray(entry.documentIds) && capture.documentId) {
      entry.documentIds = [capture.documentId];
    }
    if (entry.editedPath && !fs.existsSync(path.join(runRoot, recipe.slug, entry.editedPath))) {
      entry.editedPath = null;
    }
    if (recipe.kind === "script") {
      entry.projectId = capture.projectId;
      entry.documentId = recipe.sourceId;
    }
  }
  if (Array.isArray(log.notes)) {
    log.notes = log.notes.filter(
      (note) => !/1045|below the preferred delivery size|not upscaled|format mismatch|JPEG-encoded/i.test(note)
    );
    log.notes.unshift(
      `Guide screenshots were recaptured from the live UI at ${viewport.width}x${viewport.height} with a ${pixelRatio}x device pixel ratio, producing lossless ${output.width}x${output.height} PNG files.`
    );
  }
  fs.writeFileSync(file, `${JSON.stringify(log, null, 2)}\n`);
}

function updateManifest(recipe, captures) {
  const file = path.join(runRoot, recipe.slug, "asset-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const byPath = new Map(captures.map((capture) => [capture.relativePath, capture]));
  const usesD1Schema = recipe.slug === "viral-video-ad-engine";
  if (usesD1Schema) {
    manifest.assets = manifest.assets.filter(
      (asset) => !byPath.has(asset.path ?? asset.relativePath)
    );
  }
  for (const capture of captures) {
    if (manifest.assets.some((asset) => (asset.path ?? asset.relativePath) === capture.relativePath)) continue;
    const captureId = path.basename(capture.relativePath, ".png").toUpperCase();
    manifest.assets.push(usesD1Schema ? {
      stableId: `D1-${captureId.toLowerCase()}`,
      role: "guided-flow-capture",
      relativePath: capture.relativePath,
      sha256: capture.hash,
      mimeType: "image/png",
      bytes: capture.bytes,
      width: output.width,
      height: output.height,
      durationSeconds: null,
      fps: null,
      hasAudio: false,
      alphaStatus: "none",
      sourceIds: [],
      producingDocument: capture.documentId ?? recipe.sourceId ?? null,
      shotOrLineIds: [],
      provenance: "playwright-cli-live-ui",
      transformation: null
    } : {
      id: captureId,
      role: "guided-flow-capture",
      path: capture.relativePath,
      sha256: capture.hash,
      mimeType: "image/png",
      width: output.width,
      height: output.height,
      duration: null,
      fps: null,
      bytes: capture.bytes,
      hasAudio: false,
      alpha: false,
      sourceIds: [],
      producingDocumentId: capture.documentId ?? recipe.sourceId,
      shotIds: [],
      lineIds: [],
      provenance: { type: "playwright-cli-live-ui" }
    });
  }
  for (const asset of manifest.assets) {
    const relativePath = asset.path ?? asset.relativePath;
    const capture = byPath.get(relativePath);
    if (!capture) continue;
    asset.sha256 = capture.hash;
    asset.mimeType = "image/png";
    asset.width = output.width;
    asset.height = output.height;
    asset.bytes = capture.bytes;
    if (Object.hasOwn(asset, "hasAlpha")) asset.hasAlpha = false;
    if (Object.hasOwn(asset, "alpha")) asset.alpha = false;
    if (Object.hasOwn(asset, "producingDocumentId")) {
      asset.producingDocumentId = capture.documentId ?? recipe.sourceId;
    }
    if (Object.hasOwn(asset, "producingDocument")) {
      asset.producingDocument = capture.documentId ?? recipe.sourceId ?? null;
    }
    asset.provenance = "playwright-cli-live-ui";
  }

  const captureLog = path.join(runRoot, recipe.slug, "capture-log.json");
  const captureLogAsset = manifest.assets.find(
    (asset) => (asset.path ?? asset.relativePath) === "capture-log.json"
  );
  if (captureLogAsset) {
    captureLogAsset.sha256 = sha256(captureLog);
    captureLogAsset.bytes = fs.statSync(captureLog).size;
  }
  for (const asset of manifest.assets) {
    const relativePath = asset.path ?? asset.relativePath;
    if (!relativePath) continue;
    const absolutePath = path.join(runRoot, recipe.slug, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    asset.sha256 = sha256(absolutePath);
    asset.bytes = fs.statSync(absolutePath).size;
  }
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  if (reconcileExisting) {
    for (const recipe of recipes.filter((item) => !onlySlug || item.slug === onlySlug)) {
      const log = JSON.parse(
        fs.readFileSync(path.join(runRoot, recipe.slug, "capture-log.json"), "utf8")
      );
      const captures = log.captures
        .filter((entry) => entry.status === "captured" && entry.rawPath)
        .map((entry) => {
          const absolutePath = path.join(runRoot, recipe.slug, entry.rawPath);
          return {
            relativePath: entry.rawPath,
            hash: sha256(absolutePath),
            bytes: fs.statSync(absolutePath).size,
            documentId: entry.documentIds?.[0] ?? null
          };
        });
      updateManifest(recipe, captures);
    }
    return;
  }
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-recipe-captures-"));
  const browser = await chromium.launch({ headless: true });
  const completed = [];
  try {
    for (const recipe of recipes.filter((item) => !onlySlug || item.slug === onlySlug)) {
      const { source, clone } = await createClone(recipe);
      const captured = [];
      try {
        for (const [stage, relativePath, action] of recipe.captures) {
          let updated = await updateStage(recipe, clone.id, stage);
          if (action === "attach-clips-select-first") {
            updated = await attachProductAdClips(recipe, clone.id);
          }
          const staged = stagedPath(staging, `${recipe.slug}/${relativePath}`);
          const { context, page } = await loadCapturePage(
            browser,
            recipe,
            updated,
            stage,
            action
          );
          try {
            await page.screenshot({ path: staged, type: "png", animations: "disabled" });
          } finally {
            await context.close();
          }
          const capture = {
            relativePath,
            staged,
            hash: sha256(staged),
            bytes: fs.statSync(staged).size,
            projectId: source.projectId,
            documentId: recipe.sourceId
          };
          captured.push(capture);
          process.stdout.write(
            `${recipe.slug} ${path.basename(relativePath)} ${output.width}x${output.height}\n`
          );
        }
        for (const tab of recipe.additionalTabs ?? []) {
          const capture = await captureStandaloneTab(browser, ...tab, staging);
          captured.push(capture);
          process.stdout.write(
            `${recipe.slug} ${path.basename(capture.relativePath)} ${output.width}x${output.height}\n`
          );
        }
      } finally {
        await deleteClone(recipe, clone.id);
      }
      completed.push({ recipe, captures: captured });
    }
  } finally {
    await browser.close();
  }

  for (const { recipe, captures } of completed) {
    for (const capture of captures) {
      const destination = path.join(runRoot, recipe.slug, capture.relativePath);
      fs.copyFileSync(capture.staged, destination);
    }
    updateCaptureLog(recipe, captures);
    updateManifest(recipe, captures);
  }
  fs.rmSync(staging, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
