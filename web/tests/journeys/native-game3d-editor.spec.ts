import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import { test, expect, waitForAppReady } from "./fixtures";

import { observeNativeGameReadiness, settleNativeGameEdit, finishNativeGameReadiness } from "./helpers/nativeGameReadiness";

const PROJECT_ID = "proj-scrapheart";

function modelFixture(): Buffer {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, scene: 0,
    scenes: [{ nodes: [0] }], nodes: [{ name: "Journey visual" }] }));
  const length = Math.ceil(json.length / 4) * 4;
  const bytes = Buffer.alloc(20 + length, 0x20);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  return bytes;
}

test("edits, undoes, installs a model, plays and publishes the same 3D draft", async ({ page }) => {
  const fixtureRoot = join(homedir(), ".cache", "nodetool-journeys");
  await mkdir(fixtureRoot, { recursive: true });
  const modelDirectory = await mkdtemp(join(fixtureRoot, "game3d-"));
  try {
    const port = Number(process.env.SCREENSHOT_WEB_PORT ?? 3000);
    const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `http://localhost:${port}/trpc`, methodOverride: "POST" })] });
    const created = await client.games.create.mutate({ projectId: PROJECT_ID, name: "3D editor journey", dimension: "3d" });
    await page.addInitScript(({ id, projectId }) => {
      const tabId = `game:${id}`;
      localStorage.setItem("workspace-tabs-storage", JSON.stringify({ version: 3, state: {
        tabs: [{ id: tabId, type: "game", ref: id, mode: "edit", title: "3D editor journey", projectId }],
        activeTabId: tabId, activeProjectId: projectId, personalProjectId: null,
        projectSessions: { [projectId]: { tabIds: [tabId], activeTabId: tabId, selectedChatThreadId: null } }
      } }));
    }, { id: created.game.id, projectId: PROJECT_ID });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await expect(page.getByRole("button", { name: "Add box", exact: true })).toBeEnabled();
    await expect(page.locator('canvas[aria-label="3D game viewport"]')).toBeVisible();
    await expect(page.getByText(/WebGL2/)).toBeVisible();
    const initial = (await client.games.getDraft.query({ id: created.game.id })).document;
    await page.getByRole("button", { name: "Add box", exact: true }).click();
    await expect.poll(async () => (await client.games.getDraft.query({ id: created.game.id })).document.scenes[0].entities.length).toBe(initial.scenes[0].entities.length + 1);
    await page.getByRole("button", { name: "Frame selection", exact: true }).click();
    const viewport = page.locator('canvas[aria-label="3D game viewport"]');
    const bounds = await viewport.boundingBox();
    if (!bounds) { throw new Error("3D viewport has no bounds"); }
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 120, center.y - 80, { steps: 10 });
    await page.mouse.up();
    const lastPosition = async () => {
      const draft = (await client.games.getDraft.query({ id: created.game.id })).document;
      return draft.schemaVersion === 3 ? draft.scenes[0].entities.at(-1)?.transform3d.position : null;
    };
    await expect.poll(lastPosition).not.toEqual({ x: 0, y: 0, z: 0 });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(lastPosition).toEqual({ x: 0, y: 0, z: 0 });
    const positionX = page.getByRole("textbox", { name: "position x", exact: true });
    await positionX.fill("3");
    await positionX.press("Enter");
    await expect.poll(async () => {
      const doc = (await client.games.getDraft.query({ id: created.game.id })).document;
      return doc.schemaVersion === 3 ? doc.scenes[0].entities.at(-1)?.transform3d.position.x : null;
    }).toBe(3);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(async () => {
      const doc = (await client.games.getDraft.query({ id: created.game.id })).document;
      return doc.schemaVersion === 3 ? doc.scenes[0].entities.at(-1)?.transform3d.position.x : null;
    }).toBe(0);
    const modelPath = join(modelDirectory, "journey.glb");
    await writeFile(modelPath, modelFixture());
    const source = await client.assets.createExternal.mutate({ path: modelPath, name: "journey.glb",
      content_type: "model/gltf-binary", project_id: PROJECT_ID });
    expect(source.id).toMatch(/^[a-f0-9]{32}$/);
    await page.getByRole("button", { name: "Model assets", exact: true }).click();
    await page.getByRole("textbox", { name: "Owned model asset ID", exact: true }).fill(source.id);
    await page.getByRole("textbox", { name: "Model slot", exact: true }).fill("journey_model");
    let releaseResponse = (): void => undefined;
    const released = new Promise<void>((resolve) => { releaseResponse = resolve; });
    let responseReady = (): void => undefined;
    const installed = new Promise<void>((resolve) => { responseReady = resolve; });
    await page.route(/\/trpc\/.*games\.installAsset/, async (route) => {
      const response = await route.fetch();
      responseReady();
      await released;
      await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "Prepare and install model", exact: true }).click();
    await installed;
    await positionX.fill("4");
    await positionX.press("Enter");
    releaseResponse();
    await expect.poll(async () => {
      const draft = (await client.games.getDraft.query({ id: created.game.id })).document;
      const binding = draft.assets.journey_model;
      return binding?.mediaKind === "model" ? binding.sourceAssetId : null;
    }).toBe(source.id);
    await expect(positionX).toHaveValue("4");
    await expect.poll(async () => {
      const draft = (await client.games.getDraft.query({ id: created.game.id })).document;
      return draft.schemaVersion === 3 ? draft.scenes[0].entities.at(-1)?.transform3d.position.x : null;
    }).toBe(4);
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
    await observeNativeGameReadiness(page);
    for (let edit = 1; edit <= 10; edit++) {
      const x = 4 + edit / 10;
      await positionX.fill(String(x));
      await positionX.press("Enter");
      await expect.poll(async () => {
        const draft = (await client.games.getDraft.query({ id: created.game.id })).document;
        return draft.schemaVersion === 3 ? draft.scenes[0].entities.at(-1)?.transform3d.position.x : null;
      }).toBe(x);
      await settleNativeGameEdit(page);
    }
    const readiness = await finishNativeGameReadiness(page);
    await test.info().attach("editor-readiness-3d", { body: JSON.stringify(readiness, null, 2), contentType: "application/json" });
    expect(readiness.observations.filter((entry) => entry.kind === "edit-settled")).toHaveLength(10);
    expect(readiness.observations.length).toBeGreaterThan(10);
    expect(readiness.failures).toEqual([]);
    const beforePlay = (await client.games.getDraft.query({ id: created.game.id })).document;
    expect(beforePlay.assets.journey_model.assetId).not.toBe(source.id);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
    await expect(page.getByText(/Tick [1-9]/)).toBeVisible();
    await page.locator('canvas[aria-label="3D game viewport"]').focus();
    await page.keyboard.down("KeyD");
    await expect(page.getByText(/Tick [2-9][0-9]/)).toBeVisible();
    await page.keyboard.up("KeyD");
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    expect((await client.games.getDraft.query({ id: created.game.id })).document).toEqual(beforePlay);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("textbox", { name: "Revision message" }).fill("3D browser verified");
    await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
    await expect.poll(async () => (await client.games.revisions.query({ id: created.game.id })).find((revision) => revision.current)?.message).toBe("3D browser verified");
  } finally {
    await rm(modelDirectory, { recursive: true, force: true });
  }
});

test("releases native 3D pointer lock when its dock tab becomes inactive and preserves the canvas", async ({ page }) => {
  const port = Number(process.env.SCREENSHOT_WEB_PORT ?? 3000);
  const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `http://localhost:${port}/trpc`, methodOverride: "POST" })] });
  const created = await client.games.create.mutate({ projectId: PROJECT_ID, name: "Dock controller lifetime", dimension: "3d" });
  await page.addInitScript(({ id, projectId }) => {
    const tabId = `game:${id}`;
    localStorage.setItem("workspace-tabs-storage", JSON.stringify({ version: 3, state: {
      tabs: [{ id: tabId, type: "game", ref: id, mode: "edit", title: "Dock controller lifetime", projectId }],
      activeTabId: tabId, activeProjectId: projectId, personalProjectId: null,
      projectSessions: { [projectId]: { tabIds: [tabId], activeTabId: tabId, selectedChatThreadId: null } }
    } }));
  }, { id: created.game.id, projectId: PROJECT_ID });
  await page.goto("/workspace", { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  const canvas = page.locator('canvas[aria-label="3D game viewport"]');
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  const original = await canvas.elementHandle();
  if (!original) { throw new Error("Native 3D canvas did not mount"); }
  const inspectorDrag = await page.getByRole("button", { name: "Drag inspector panel", exact: true }).boundingBox();
  const viewportGroup = await page.getByRole("tab", { name: "Viewport", exact: true }).locator("..").boundingBox();
  if (!inspectorDrag || !viewportGroup) { throw new Error("Native controller docking targets have no bounds"); }
  await page.mouse.move(inspectorDrag.x + inspectorDrag.width / 2, inspectorDrag.y + inspectorDrag.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewportGroup.x + viewportGroup.width / 2, viewportGroup.y + viewportGroup.height / 2, { steps: 8 });
  await page.mouse.up();
  const viewportTab = page.getByRole("tab", { name: "Viewport", exact: true });
  const inspectorTab = page.getByRole("tab", { name: "Inspector", exact: true });
  expect(await inspectorTab.evaluate((node) => node.closest("[data-game-dock-group]")?.getAttribute("data-game-dock-group")))
    .toEqual(await viewportTab.evaluate((node) => node.closest("[data-game-dock-group]")?.getAttribute("data-game-dock-group")));
  await viewportTab.click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByText(/Tick [1-9]/)).toBeVisible();
  await canvas.click();
  await expect.poll(() => original.evaluate((node) => document.pointerLockElement === node)).toBe(true);
  await inspectorTab.focus();
  expect(await original.evaluate((node) => document.pointerLockElement === node)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(canvas).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  expect(await original.evaluate((node) => node.isConnected)).toBe(true);
  await viewportTab.focus();
  await page.keyboard.press("Enter");
  await expect(canvas).toBeVisible();
  expect(await original.evaluate((node) => node === document.querySelector('canvas[aria-label="3D game viewport"]'))).toBe(true);
  await canvas.click();
  await expect.poll(() => original.evaluate((node) => document.pointerLockElement === node)).toBe(true);
  await page.getByRole("button", { name: "Stop", exact: true }).focus();
  expect(await original.evaluate((node) => document.pointerLockElement === node)).toBe(true);
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
});
