/**
 * Journey: generate in the Create view and find the results after a reload.
 *
 * The view submits through `generate_media`, so no chat thread is made. The
 * hermetic provider answers every image request with the same picture, which
 * is enough: the grid lists a take per request, newest first, and keeps them
 * across a reload because GenerationActivityStore persists them.
 */

import { test, expect } from "./fixtures";
import { CreatePage } from "./pages";

test("generates twice and finds both takes in the grid after a reload", async ({
  page
}) => {
  const create = new CreatePage(page);
  await create.seedImageModel();
  await create.open();

  await expect(
    page.getByText("Nothing created yet")
  ).toBeVisible();

  await create.generate("a lighthouse at dusk");
  await expect(create.tile("a lighthouse at dusk")).toHaveCount(1);
  await create.generate("a harbour at dawn");
  await expect(create.tile("a harbour at dawn")).toHaveCount(1);

  // Newest first.
  const tiles = page.getByTestId("create-grid-item");
  await expect(tiles.nth(0)).toContainText("a harbour at dawn");
  await expect(tiles.nth(1)).toContainText("a lighthouse at dusk");

  await page.reload();

  await expect(create.tile("a harbour at dawn")).toHaveCount(1);
  await expect(create.tile("a lighthouse at dusk")).toHaveCount(1);
  await expect(page.getByTestId("create-grid-item")).toHaveCount(2);
});

test("asks for a prompt instead of sending an empty one", async ({ page }) => {
  const create = new CreatePage(page);
  await create.seedImageModel();
  await create.open();

  await page.getByRole("button", { name: "Generate" }).click();

  await expect(page.getByText("Write a prompt to generate.")).toBeVisible();
  await expect(page.getByTestId("create-grid-item")).toHaveCount(0);
});
