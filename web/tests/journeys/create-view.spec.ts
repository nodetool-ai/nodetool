/**
 * Journey: generate in a Create tab and find the results after a reload.
 *
 * New → Image opens a Create tab, a thread of kind "create". Each take goes
 * through `generate_media` tagged with that thread, so no chat turn is made.
 * The hermetic provider answers every image request with the same picture,
 * which is enough: the grid lists a take per request, newest first, and keeps
 * them across a reload.
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
    page.getByText("Nothing in this tab yet")
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
