import { expect, test } from "@playwright/test";

test("the node editor demo loads only when asked and runs with sample media", async ({ page }) => {
  const editorRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/embed/node-editor/")) {
      editorRequests.push(request.url());
    }
  });
  await page.goto("/node-based-workflows");
  const section = page.getByRole("region", { name: "Try the node editor." });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("button", { name: "Open the node editor" })).toBeVisible();
  expect(editorRequests).toEqual([]);

  await section.getByRole("button", { name: "Open the node editor" }).click();
  const frame = section.frameLocator("iframe");
  await expect(frame.getByText("Text To Image").first()).toBeVisible({ timeout: 30_000 });
  await expect(frame.getByText("Image To Video").first()).toBeVisible();

  await frame.getByRole("button", { name: /^Run/ }).first().click();
  await expect(frame.locator('img[src$="/node-editor-demo/lighthouse.webp"]').first()).toBeVisible({
    timeout: 15_000
  });
  await expect(frame.locator('video[src$="/node-editor-demo/lighthouse.mp4"]').first()).toBeAttached({
    timeout: 15_000
  });
});
