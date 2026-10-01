import { readFile } from "node:fs/promises";
import { test, expect, waitForAppReady } from "./fixtures";

test("Recipe metadata survives a real App Builder UI edit and save", async ({
  page,
  request
}) => {
  const bundle = JSON.parse(
    await readFile(
      new URL(
        "../../../packages/base-nodes/nodetool/examples/apps/product-price-drop.app.json",
        import.meta.url
      ),
      "utf8"
    )
  );
  const mutate = async (procedure: string, input: unknown) => {
    const response = await request.post(`/trpc/${procedure}`, { data: input });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).result.data;
  };
  // This journey backend exposes the same normal tRPC creation procedures the
  // browser uses. The bundle's REST installation is covered by its integration test.
  for (const carried of bundle.scripts) {
    const script = await mutate("jsScripts.create", {
      name: carried.name,
      document: carried.document
    });
    const version = await mutate("jsScripts.documentVersions.create", {
      id: script.id
    });
    for (const operation of bundle.app.operations) {
      if (operation.target.scriptId === carried.key) {
        operation.target = {
          kind: "script",
          scriptId: script.id,
          scriptVersion: version.version
        };
      }
    }
  }
  const application = await mutate("applications.create", {
    name: bundle.name,
    description: bundle.description,
    document: bundle.app
  });
  await page.goto("/workspace");
  await waitForAppReady(page);
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page
    .locator('[role="treeitem"][aria-level="1"]')
    .filter({ hasText: /^Apps/ })
    .locator('[role="treeitem"][aria-level="2"]')
    .filter({ hasText: "Product Price Drop" })
    .click();
  const builder = page.locator(".appbuilder-editor");
  await expect(
    builder.getByRole("button", { name: "Save", exact: true })
  ).toBeVisible();
  await builder
    .getByRole("button", { name: "Toggle right sidebar", exact: true })
    .click();
  await builder
    .getByRole("textbox", { name: "App title", exact: true })
    .fill("My exact Price Drop");
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("applications.update") &&
      response.request().method() === "POST"
  );
  await builder.getByRole("button", { name: "Save", exact: true }).click();
  expect((await saved).ok()).toBe(true);
  const reloaded = await request.get(
    `/trpc/applications.get?input=${encodeURIComponent(JSON.stringify({ id: application.id }))}`
  );
  expect(reloaded.ok()).toBe(true);
  const roundTrip = (await reloaded.json()).result.data.document;
  expect(roundTrip.ui.root.props.title).toBe("My exact Price Drop");
  expect(roundTrip.recipe).toEqual(bundle.app.recipe);
  expect(
    roundTrip.operations.map((operation: { id: string }) => operation.id)
  ).toEqual(["plan", "finish"]);
  await page.reload();
  await waitForAppReady(page);
  await expect(
    page
      .locator(".appbuilder-editor")
      .getByRole("heading", { name: "My exact Price Drop", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Run", exact: true }).first().click();
  const runtime = page
    .getByTestId("application-run-layer")
    .locator('.appbuilder-runtime[data-focus-id="app-runtime"]');
  await expect(
    runtime.getByRole("button", { name: "Plan", exact: true })
  ).toBeVisible();
  const images = runtime.locator(".image-property");
  await expect(images).toHaveCount(2);
  await images
    .nth(0)
    .locator('input[type="file"]')
    .setInputFiles(
      new URL(
        "../../../packages/websocket/tests/fixtures/price-drop/product.jpg",
        import.meta.url
      ).pathname
    );
  await images
    .nth(1)
    .locator('input[type="file"]')
    .setInputFiles(
      new URL(
        "../../../packages/websocket/tests/fixtures/price-drop/logo.svg",
        import.meta.url
      ).pathname
    );
  await runtime
    .getByRole("textbox", { name: "Headline", exact: true })
    .fill("Fresh coffee. Lower price.");
  await runtime
    .getByRole("textbox", { name: "Old price", exact: true })
    .fill("€49");
  await runtime
    .getByRole("textbox", { name: "New price", exact: true })
    .fill("€29");
  await runtime
    .getByRole("textbox", { name: "Call to action", exact: true })
    .fill("Shop now");
  await runtime
    .getByRole("button", { name: "Choose color", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Custom Color…", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Hex color", exact: true })
    .fill("#1248AB");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(images.nth(0).locator(".dropzone")).toHaveClass(/dropped/);
  await expect(images.nth(1).locator(".dropzone")).toHaveClass(/dropped/);
  const planned = page.waitForResponse(
    (response) =>
      response.url().includes("/api/js-scripts/") &&
      response.url().endsWith("/run")
  );
  await runtime.getByRole("button", { name: "Plan", exact: true }).click();
  const planResult = await (await planned).json();
  expect(planResult.ok, JSON.stringify(planResult)).toBe(true);
  await expect(
    runtime.getByText("Fresh coffee. Lower price.", { exact: false }).last()
  ).toBeVisible();
  await runtime.getByRole("button", { name: "Approve", exact: true }).click();
  await runtime
    .getByRole("button", { name: "Build editable ad", exact: true })
    .click();
  const openTimeline = runtime.getByRole("link", {
    name: "Open editable timeline",
    exact: true
  });
  await expect(openTimeline).toBeVisible({ timeout: 60_000 });
  await openTimeline.click();
  await expect(page).toHaveURL(/\/timeline\/[a-f0-9]{32}/);
  await waitForAppReady(page);
  await expect(
    page.getByLabel("Resize tracks panel", { exact: true })
  ).toBeVisible();
  const timelineId = new URL(page.url()).pathname.split("/").at(-1);
  const produced = await request.get(
    `/trpc/timeline.get?input=${encodeURIComponent(JSON.stringify({ id: timelineId }))}`
  );
  expect(produced.ok()).toBe(true);
  const timeline = (await produced.json()).result.data;
  await expect(page.getByTestId("preview-compositor")).toHaveAttribute(
    "data-preview-ready",
    "true",
    { timeout: 60_000 }
  );
  expect(timeline.clips).toHaveLength(9);
  expect(
    timeline.clips.filter(
      (clip: { mediaType: string }) => clip.mediaType === "image"
    )
  ).toHaveLength(3);
  expect(
    timeline.clips.filter(
      (clip: { mediaType: string }) => clip.mediaType === "text"
    )
  ).toHaveLength(4);
  expect(
    timeline.clips.every(
      (clip: { storyboardElementId?: unknown }) =>
        clip.storyboardElementId !== undefined
    )
  ).toBe(true);
});
