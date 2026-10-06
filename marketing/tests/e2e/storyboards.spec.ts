import { test, expect } from "@playwright/test";
import { storyboards } from "../../src/data/storyboards";

test("overview links to every storyboard", async ({ page }) => {
  await page.goto("/storyboards");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Watch the film"
  );
  for (const board of storyboards) {
    await expect(page.locator(`main a[href="${board.route}"]`).first()).toBeVisible();
  }
});

test("each storyboard page leads with its film, then every shot", async ({
  page
}) => {
  for (const board of storyboards) {
    await page.goto(board.route);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      board.title
    );
    const film = page.getByLabel(`${board.title}, the finished film`);
    await expect(film).toHaveAttribute("src", board.video.src);
    const filmTop = (await film.boundingBox())?.y ?? Infinity;
    const stillTop =
      (await page.getByRole("img", { name: /the storyboard still/ }).first().boundingBox())
        ?.y ?? 0;
    expect(filmTop).toBeLessThan(stillTop);
    for (const shot of board.shots) {
      const still = page.getByRole("img", {
        name: `Shot ${shot.number}, ${shot.title}: the storyboard still`
      });
      await still.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          still.evaluate((img: HTMLImageElement) => img.naturalWidth)
        )
        .toBeGreaterThan(0);
    }
  }
});

test("a shot button moves the film to that shot", async ({ page }) => {
  const board = storyboards[0];
  await page.goto(board.route);
  const film = page.getByLabel(`${board.title}, the finished film`);
  await page.getByRole("button", { name: /^Play shot 2:/ }).click();
  await expect
    .poll(() => film.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(1);
});
