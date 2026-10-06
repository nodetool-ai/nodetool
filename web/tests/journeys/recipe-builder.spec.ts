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
  for (const carried of bundle.workflows) {
    const workflow = await mutate("workflows.create", {
      name: carried.name,
      graph: carried.graph
    });
    const version = await mutate("workflows.versions.create", { id: workflow.id });
    for (const operation of bundle.app.operations) {
      if (operation.workflowId === carried.key) {
        operation.workflowId = workflow.id;
        operation.workflowVersion = version.version;
      }
    }
    await mutate("workflows.update", {
      id: workflow.id,
      name: carried.name,
      graph: { nodes: [], edges: [] }
    });
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
  // An app tab opens in View mode; the builder is the Edit surface.
  await page
    .locator(".mode-toggle")
    .getByRole("button", { name: "Edit", exact: true })
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
  expect(roundTrip.operations).toEqual(application.document.operations);
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
  // Running the recipe stops here. Its finish runs an agent, which the
  // journey backend's fake provider cannot drive. Planning and finishing are
  // covered by packages/websocket/tests/product-price-drop.test.ts.
});
