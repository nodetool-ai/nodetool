/**
 * Journey: add an effect to a photo.
 *
 * Open the Effects gallery from the New menu, drop a picture, pick an effect
 * and apply it with the fake provider. The result shows in the gallery, and
 * the same run shows in the Generations panel under the effect's name.
 */

import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { EffectsPage } from "./pages";

const FIXTURE = new URL(
  "../../../packages/websocket/tests/fixtures/price-drop/product.jpg",
  import.meta.url
);

test("drops a picture, applies an effect and finds the result in the gallery and in Generations", async ({
  page
}) => {
  await EffectsPage.rememberVideoModel(page, "openai", "test-video-model");
  const effects = new EffectsPage(page);
  await effects.open();

  // Nothing chosen yet: the button is off and says what is missing.
  await expect(effects.applyButton()).toBeDisabled();
  await expect(effects.gallery().getByText("Add a picture to apply an effect.")).toBeVisible();

  await effects.dropPicture({
    name: "product.jpg",
    mimeType: "image/jpeg",
    buffer: await readFile(FIXTURE)
  });
  await expect(effects.gallery().getByText("Pick an effect below.")).toBeVisible();

  await effects.card("Levitate").click();
  await expect(effects.card("Levitate")).toHaveAttribute("aria-pressed", "true");
  await expect(effects.applyButton()).toBeEnabled();
  await effects.applyButton().click();

  // The result appears in place, as a playable video.
  await expect(effects.result()).toBeVisible({ timeout: 60_000 });
  await expect(effects.gallery().getByText("Levitate is ready.")).toBeVisible();
  await expect(effects.result().locator("video, img").first()).toBeVisible();

  // The same run is listed in Generations, named after the effect.
  const generations = await effects.openGenerations();
  const tile = generations.getByRole("listitem").filter({ hasText: "Levitate" });
  await expect(tile).toHaveCount(1);
  await expect(tile).toContainText("test-video-model");
  await expect(tile.getByRole("button", { name: "Open as workflow" })).toBeAttached();
});
