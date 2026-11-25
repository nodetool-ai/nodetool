import { expect, test } from "@playwright/test";

test("the timeline editor demo loads only when asked and keeps the film unchanged", async ({ page }) => {
  const editorRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/embed/timeline/")) {
      editorRequests.push(request.url());
    }
  });
  await page.goto("/studio");
  const section = page.getByRole("region", { name: "Try the timeline editor." });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("button", { name: /^Kite/ })).toHaveAttribute("aria-pressed", "true");
  expect(editorRequests).toEqual([]);

  await section.getByRole("button", { name: /^Cadence/ }).click();
  await section.getByRole("button", { name: "Open Cadence in the editor" }).click();
  const frame = section.frameLocator("iframe");
  await expect(section.locator("iframe")).toHaveAttribute("src", /film=cadence/);
  const editor = frame.locator("body");
  await expect(editor).toContainText("paper finish", { timeout: 30_000 });
  const clip = frame.getByTestId("clip-S6");
  await expect(clip).toBeVisible();

  // Moving a clip is put back, and the reader is told why.
  const before = await clip.boundingBox();
  await clip.dragTo(frame.getByTestId("clip-S5"));
  await expect(frame.getByRole("status")).toContainText("read-only");
  expect(await clip.boundingBox()).toEqual(before);
});
