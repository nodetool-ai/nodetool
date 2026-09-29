import { test, expect } from "@playwright/test";
import { adRecipes } from "../../src/data/adLibrary";

test("ad library links to every separate recipe and loads beat illustrations", async ({
  page
}) => {
  await page.goto("/ad-library");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "An ad worth making"
  );
  for (const recipe of adRecipes) {
    const link = page.locator(`a[href="${recipe.route}"]`);
    await expect(link).toHaveCount(1);
    const thumbnail = link.getByRole("img");
    await expect(thumbnail).toHaveAttribute(
      "src",
      `/ad-library/illustrations/${recipe.id}-B05.webp`
    );
    await thumbnail.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        thumbnail.evaluate((element: HTMLImageElement) => element.naturalWidth)
      )
      .toBeGreaterThan(0);
    await page.goto(recipe.route);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      recipe.title
    );
    const images = page
      .getByRole("complementary", { name: "Sequence preview" })
      .locator('img[src^="/ad-library/illustrations/"]');
    await expect(images).toHaveCount(recipe.beats.length);
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          image.evaluate((element: HTMLImageElement) => element.naturalWidth)
        )
        .toBeGreaterThan(0);
    }
    await page.goto("/ad-library");
  }
});

test("the sequence preview selects a beat and plays", async ({ page }) => {
  const recipe = adRecipes[0];
  await page.goto(recipe.route);
  const preview = page.getByRole("complementary", {
    name: "Sequence preview"
  });
  await preview.getByRole("button", { name: /^Show beat 3:/ }).click();
  await expect(preview.getByText(`3/${recipe.beats.length}`)).toBeVisible();
  await preview.getByRole("button", { name: "Play preview" }).click();
  await expect(
    preview.getByRole("button", { name: "Pause preview" })
  ).toBeVisible();
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
