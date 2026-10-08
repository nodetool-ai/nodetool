import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import { test, expect, waitForAppReady } from "./fixtures";

import { observeNativeGameReadiness, settleNativeGameEdit, finishNativeGameReadiness } from "./helpers/nativeGameReadiness";

const PROJECT_ID = "proj-scrapheart";

test("reviews a game change, undoes it, and publishes the draft", async ({ page }) => {
  const port = Number(process.env.SCREENSHOT_WEB_PORT ?? 3000);
  const client = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `http://localhost:${port}/trpc`, methodOverride: "POST" })]
  });
  const created = await client.games.create.mutate({ projectId: PROJECT_ID, name: "Game editor journey" });
  await client.games.saveDraft.mutate({
    id: created.game.id,
    baseUpdatedAt: created.game.draftUpdatedAt,
    ops: [{ op: "add_entity", scene_id: "room", entity: { id: "assistant-added", name: "Assistant added" } }]
  });
  const [change] = await client.games.draftChanges.query({ id: created.game.id });
  if (!change) throw new Error("The game edit created no change log entry");

  // The provider is mocked in this suite. Give its saved edit agent provenance
  // while keeping the real draft, change id, and undo snapshot on the server.
  await page.route(/\/trpc\/.*games\.draftChanges/, async (route) => {
    const response = await route.fetch();
    const body = JSON.parse(await response.text()) as unknown;
    const markAgent = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(markAgent); return; }
      const record = value as Record<string, unknown>;
      if (record.id === change.id) record.actor = "agent";
      Object.values(record).forEach(markAgent);
    };
    markAgent(body);
    await route.fulfill({ response, body: JSON.stringify(body) });
  });
  await page.addInitScript(({ id, projectId }) => {
    const tabId = `game:${id}`;
    localStorage.setItem("workspace-tabs-storage", JSON.stringify({ version: 3, state: {
      tabs: [{ id: tabId, type: "game", ref: id, mode: "edit", title: "Game editor journey", projectId }],
      activeTabId: tabId,
      activeProjectId: projectId,
      personalProjectId: null,
      projectSessions: { [projectId]: { tabIds: [tabId], activeTabId: tabId, selectedChatThreadId: null } }
    } }));
  }, { id: created.game.id, projectId: PROJECT_ID });

  await page.goto("/workspace", { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  await expect(page.getByText("Assistant added")).toBeVisible();
  const sceneTreeDivider = page.getByRole("separator", { name: "Resize game left panels" });
  const inspectorDivider = page.getByRole("separator", { name: "Resize game right panels" });
  await sceneTreeDivider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(sceneTreeDivider).toHaveAttribute("aria-valuenow", "296");
  await inspectorDivider.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(inspectorDivider).toHaveAttribute("aria-valuenow", "356");
  expect(await page.evaluate(() => {
    const stored = localStorage.getItem("nodetool.game-layout.v1:user:1");
    if (!stored) { throw new Error("The signed-in game layout was not persisted"); }
    return JSON.parse(stored).state.layout.sizes;
  })).toMatchObject({ left: 296, right: 356 });
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  await page.getByText("Assistant added", { exact: true }).click();
  await observeNativeGameReadiness(page);
  for (let edit = 1; edit <= 10; edit++) {
    const name = `Assistant edit ${edit}`;
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await page.getByRole("textbox", { name: "Name", exact: true }).press("Tab");
    await expect.poll(async () => (await client.games.getDraft.query({ id: created.game.id })).document.scenes[0]?.entities
      .find((entity) => entity.id === "assistant-added")?.name).toBe(name);
    await settleNativeGameEdit(page);
  }
  const readiness = await finishNativeGameReadiness(page);
  await test.info().attach("editor-readiness-2d", { body: JSON.stringify(readiness, null, 2), contentType: "application/json" });
  expect(readiness.observations.filter((entry) => entry.kind === "edit-settled")).toHaveLength(10);
  expect(readiness.observations.length).toBeGreaterThan(10);
  expect(readiness.failures).toEqual([]);
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Assistant added");
  await page.getByRole("textbox", { name: "Name", exact: true }).press("Tab");
  await expect.poll(async () => (await client.games.getDraft.query({ id: created.game.id })).document.scenes[0]?.entities
    .find((entity) => entity.id === "assistant-added")?.name).toBe("Assistant added");
  const beforePlay = (await client.games.getDraft.query({ id: created.game.id })).document;
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await expect(page.getByText(/Tick [1-9]/)).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  expect((await client.games.getDraft.query({ id: created.game.id })).document).toEqual(beforePlay);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await client.games.getDraft.query({ id: created.game.id })).document.scenes[0]?.entities.some((entity) => entity.id === "assistant-added")).toBe(false);

  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("textbox", { name: "Revision message" }).fill("Reviewed in editor");
  await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  await expect.poll(async () => (await client.games.revisions.query({ id: created.game.id })).find((revision) => revision.current)?.message).toBe("Reviewed in editor");
  await page.unrouteAll({ behavior: "ignoreErrors" });
});


for (const dimension of ["2d", "3d"] as const) {
  test(`docks a focused ${dimension} inspector without replacing its DOM and restores the saved layout after reload`, async ({ page }) => {
  const port = Number(process.env.SCREENSHOT_WEB_PORT ?? 3000);
  const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `http://localhost:${port}/trpc`, methodOverride: "POST" })] });
  const created = await client.games.create.mutate({ projectId: PROJECT_ID, name: "Docking journey", dimension });
  const document = (await client.games.getDraft.query({ id: created.game.id })).document;
  const entity = dimension === "3d"
    ? { id: "dock-focus", name: "Dock focus entity", transform3d: {} }
    : { id: "dock-focus", name: "Dock focus entity" };
  await client.games.saveDraft.mutate({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
    ops: [{ op: "add_entity", scene_id: document.entrySceneId, entity }] });
  await page.addInitScript(({ id, projectId }) => {
    const tabId = `game:${id}`;
    localStorage.setItem("workspace-tabs-storage", JSON.stringify({ version: 3, state: {
      tabs: [{ id: tabId, type: "game", ref: id, mode: "edit", title: "Docking journey", projectId }],
      activeTabId: tabId, activeProjectId: projectId, personalProjectId: null,
      projectSessions: { [projectId]: { tabIds: [tabId], activeTabId: tabId, selectedChatThreadId: null } }
    } }));
  }, { id: created.game.id, projectId: PROJECT_ID });
  await page.goto("/workspace", { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  await page.getByText("Dock focus entity", { exact: true }).click();
  const input = page.getByRole("textbox", { name: "Name", exact: true });
  await input.focus();
  const original = await input.elementHandle();
  if (!original) { throw new Error("Inspector input was not mounted"); }
  const drag = await page.getByRole("button", { name: "Drag inspector panel" }).boundingBox();
  const target = await page.getByLabel("New dock group targets").locator('[data-game-dock-region="bottom"]').boundingBox();
  if (!drag || !target) { throw new Error("Native docking targets have no bounds"); }
  await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(input).toBeFocused();
  expect(await original.evaluate((node) => node.isConnected && node === window.document.activeElement)).toBe(true);
  await expect(input).toHaveValue("Dock focus entity");
  await expect(page.getByRole("region", { name: "Game bottom panels" }).getByRole("textbox", { name: "Name", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Layout name", exact: true }).fill("Docked inspector");
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nodetool.game-layout.v1:user:1") ?? "null").state);
  expect(saved.customLayouts.map((entry: { name: string }) => entry.name)).toContain("Docked inspector");
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  await expect(page.getByRole("tab", { name: "Inspector", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Game bottom panels" }).getByRole("tab", { name: "Inspector", exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nodetool.game-layout.v1:user:1") ?? "null").state.layout)).toEqual(saved.layout);
});
}

for (const dimension of ["2d", "3d"] as const) {
  test(`keeps the real ${dimension} script editor mounted when its panel docks`, async ({ page }) => {
    const port = Number(process.env.SCREENSHOT_WEB_PORT ?? 3000);
    const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `http://localhost:${port}/trpc`, methodOverride: "POST" })] });
    const created = await client.games.create.mutate({ projectId: PROJECT_ID, name: "Script dock lifetime", dimension });
    const draft = (await client.games.getDraft.query({ id: created.game.id })).document;
    const behaviors = [{ kind: "script" as const, source: "({ state }) => ({ state, commands: [] })", maxCommands: 16, maxTickMs: 8 }];
    const entity = dimension === "3d"
      ? { id: "dock-script", name: "Dock script entity", behaviors, transform3d: {} }
      : { id: "dock-script", name: "Dock script entity", behaviors };
    await client.games.saveDraft.mutate({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      ops: [{ op: "add_entity", scene_id: draft.entrySceneId, entity }] });
    await page.addInitScript(({ id, projectId }) => {
      const tabId = `game:${id}`;
      localStorage.setItem("workspace-tabs-storage", JSON.stringify({ version: 3, state: {
        tabs: [{ id: tabId, type: "game", ref: id, mode: "edit", title: "Script dock lifetime", projectId }],
        activeTabId: tabId, activeProjectId: projectId, personalProjectId: null,
        projectSessions: { [projectId]: { tabIds: [tabId], activeTabId: tabId, selectedChatThreadId: null } }
      } }));
    }, { id: created.game.id, projectId: PROJECT_ID });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await page.getByText("Dock script entity", { exact: true }).click();
    await page.getByRole("button", { name: "Edit script", exact: true }).click();
    const editor = page.locator('[data-game-panel-host="scripts"] .monaco-editor');
    await expect(editor).toBeVisible();
    const original = await editor.elementHandle();
    if (!original) { throw new Error("Real Monaco script editor did not mount"); }
    const input = editor.locator(".native-edit-context, textarea.inputarea");
    await expect(input).toHaveCount(1);
    await input.focus();
    const focused = await input.elementHandle();
    if (!focused) { throw new Error("Real Monaco input did not mount"); }
    const drag = await page.getByRole("button", { name: "Drag scripts panel", exact: true }).boundingBox();
    const target = await page.getByLabel("New dock group targets").locator('[data-game-dock-region="left"]').boundingBox();
    if (!drag || !target) { throw new Error("Script docking targets have no bounds"); }
    await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(input).toBeFocused();
    expect(await focused.evaluate((node) => node.isConnected && node === document.activeElement)).toBe(true);
    expect(await original.evaluate((node) => node === document.querySelector('[data-game-panel-host="scripts"] .monaco-editor'))).toBe(true);
    await expect(page.getByRole("region", { name: "Game left panels" }).locator(".monaco-editor")).toBeVisible();
    await page.locator('[data-game-panel-host="scripts"]').getByRole("button", { name: "Close", exact: true }).click();
    await expect(editor).toHaveCount(0);
    expect(await original.evaluate((node) => node.isConnected)).toBe(false);
  });
}
