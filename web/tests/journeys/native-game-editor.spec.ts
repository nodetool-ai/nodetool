import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import { test, expect, waitForAppReady } from "./fixtures";

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
