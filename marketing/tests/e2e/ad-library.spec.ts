import { test, expect } from "@playwright/test";
import { adRecipes } from "../../src/data/adLibrary";

test("ad library links to every recipe, and each recipe loads its rendered ad", async ({
  page
}) => {
  await page.goto("/ad-library");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "An ad worth making"
  );
  for (const recipe of adRecipes) {
    const link = page.locator(`a[href="${recipe.route}"]`);
    await expect(link).toHaveCount(1);
    const card = link.locator("video");
    await expect(card).toHaveAttribute("src", recipe.video.src);
    await expect(card).toHaveAttribute("poster", recipe.video.poster);
    // In view, the card plays its ad muted.
    await card.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        card.evaluate((element: HTMLVideoElement) => element.currentTime)
      )
      .toBeGreaterThan(0);
    await page.goto(recipe.route);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      recipe.title
    );
    const film = page
      .getByRole("complementary", { name: "Sequence preview" })
      .locator("video");
    await expect(film).toHaveAttribute(
      "src",
      `/ad-library/videos/${recipe.slug}.mp4`
    );
    await expect
      .poll(() =>
        film.evaluate((element: HTMLVideoElement) => element.videoWidth)
      )
      .toBeGreaterThan(0);
    await page.goto("/ad-library");
  }
});

test("the sequence preview moves the video to a beat and plays it", async ({
  page
}) => {
  const recipe = adRecipes[0];
  const beat = recipe.beats[2];
  await page.goto(recipe.route);
  const preview = page.getByRole("complementary", {
    name: "Sequence preview"
  });
  const film = preview.locator("video");
  await preview.getByRole("button", { name: /^Show beat 3:/ }).click();
  await expect(preview.getByText(`3/${recipe.beats.length}`)).toBeVisible();
  const seconds = await film.evaluate(
    (element: HTMLVideoElement) => element.currentTime
  );
  expect(seconds * 1000).toBeGreaterThanOrEqual(beat.start_ms);
  expect(seconds * 1000).toBeLessThan(beat.end_ms);
  await preview.getByRole("button", { name: "Play preview" }).click();
  await expect(
    preview.getByRole("button", { name: "Pause preview" })
  ).toBeVisible();
  await expect
    .poll(() =>
      film.evaluate((element: HTMLVideoElement) => element.currentTime)
    )
    .toBeGreaterThan(seconds);
});

test("marketing exposes the ad library alongside existing recipes", async ({
  page
}) => {
  await page.goto("/marketing");
  await expect(
    page.getByRole("link", { name: "Explore the ad library" })
  ).toHaveAttribute("href", "/ad-library");
  await expect(
    page.getByRole("link", { name: "Explore all recipes" })
  ).toHaveAttribute("href", "/recipes");
});
