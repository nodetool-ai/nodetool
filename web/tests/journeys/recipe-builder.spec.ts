import { readFile } from "node:fs/promises";
import { test, expect, waitForAppReady } from "./fixtures";
import { openProjectFile } from "./pages";

test("Recipe metadata survives a real App Builder UI edit and save", async ({
  page,
  request,
  pageErrors
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
  await openProjectFile(page, "Apps", "Product Price Drop.app.json");
  // The Files panel opens an app in Design mode, on the builder.
  const builder = page.locator(".appbuilder-editor");
  // Save sits in the document toolbar above the builder.
  const save = page
    .getByRole("toolbar", { name: / document$/ })
    .getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeVisible();
  // The page's fields show in the docked Properties panel while nothing is selected.
  await builder
    .getByRole("textbox", { name: "App title", exact: true })
    .fill("My exact Price Drop");
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("applications.update") &&
      response.request().method() === "POST"
  );
  await save.click();
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
  // The app sends a projects query as the page unloads, and the reload
  // cancels it. Only what the reload aborted is dropped from the journey's
  // browser errors: the aborted request and the tRPC log line for each query
  // in it.
  const beforeReload = pageErrors.length;
  await page.reload();
  await waitForAppReady(page);
  const duringReload = pageErrors.splice(beforeReload);
  pageErrors.push(
    ...duringReload.filter(
      (error) =>
        !error.text.includes("net::ERR_ABORTED") &&
        !/^%c << query #\d+ %cprojects\./.test(error.text)
    )
  );
  await expect(
    page
      .locator(".appbuilder-editor")
      .getByRole("textbox", { name: "App title", exact: true })
  ).toHaveValue("My exact Price Drop");
  // Running the recipe stops here. Its finish runs an agent, which the
  // journey backend's fake provider cannot drive. Planning and finishing are
  // covered by packages/websocket/tests/product-price-drop.test.ts.
});
