import { expect, test } from "@playwright/test";

test("the header and the home hero link the live demo page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Live demo" })).toHaveAttribute("href", "/demo");
  await expect(page.getByRole("link", { name: /Or open the live demo/ })).toHaveAttribute("href", "/demo");
});

test("the mobile menu lists the live demo page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog", { name: "Site menu" });
  await expect(menu.getByRole("link", { name: "Live demo" })).toBeVisible();
});

test("the demo page offers both editors and loads neither before it is opened", async ({ page }) => {
  const editorRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/embed/")) {
      editorRequests.push(request.url());
    }
  });
  await page.goto("/demo");
  await expect(page.getByRole("heading", { level: 1, name: "Try NodeTool in your browser." })).toBeVisible();
  await expect(page).toHaveTitle(/NodeTool/);

  const timeline = page.getByRole("region", { name: "Try the timeline editor." });
  const nodes = page.getByRole("region", { name: "Try the node editor." });
  await timeline.scrollIntoViewIfNeeded();
  await expect(timeline.getByRole("button", { name: "Open Kite in the editor" })).toBeVisible();
  await nodes.scrollIntoViewIfNeeded();
  await expect(nodes.getByRole("button", { name: "Open the node editor" })).toBeVisible();
  expect(editorRequests).toEqual([]);

  await nodes.getByRole("button", { name: "Open the node editor" }).click();
  await expect(nodes.locator("iframe")).toHaveAttribute("src", "/embed/node-editor/node-editor-embed.html");
});
