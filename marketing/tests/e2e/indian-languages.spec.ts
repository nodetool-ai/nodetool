import { expect, test } from "@playwright/test";
import { TRANSCRIBE_LANGUAGES, VOICE_LANGUAGES } from "../../src/data/indianLanguagesPage";

test("/indian-languages lists the Sarvam languages and links both ways with /hi", async ({ page }) => {
  await page.goto("/indian-languages");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hindi, Tamil");
  // The hero lists every voice language except Indian English in its own script.
  await expect(page.locator("figure li")).toHaveCount(VOICE_LANGUAGES.length - 1);
  await expect(page.getByRole("list", { name: "Languages Saaras transcribes" }).getByRole("listitem")).toHaveCount(TRANSCRIBE_LANGUAGES.length);
  await expect(page.locator('main a[href="/hi"][hreflang="hi"]')).toBeVisible();
  expect(await page.locator('header a[href="/indian-languages"]').count()).toBeGreaterThan(0);

  await page.goto("/hi");
  await expect(page.locator('main a[href="/indian-languages"]')).toBeVisible();
});

test("the counts in the copy match the language lists", () => {
  // Ten Indian languages plus Indian English, and 22 plus English.
  expect(VOICE_LANGUAGES).toHaveLength(11);
  expect(TRANSCRIBE_LANGUAGES).toHaveLength(23);
});

test.describe("hero reel on a slow or metered connection", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const connection = Object.assign(new EventTarget(), { saveData: false, effectiveType: "3g" });
      Object.defineProperty(navigator, "connection", { value: connection, configurable: true });
    });
  });

  test("waits for the play button before downloading", async ({ page }) => {
    const reelRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/hero-[a-z-]+\.(webm|mp4)$/.test(new URL(request.url()).pathname)) {
        reelRequests.push(request.url());
      }
    });
    await page.setViewportSize({ width: 412, height: 823 });
    await page.goto("/");
    const hero = page.locator(".hero-demo").first();
    const play = hero.getByRole("button", { name: "Play the demo", exact: true });
    await expect(play).toBeVisible();
    await page.waitForTimeout(1500);
    expect(reelRequests).toEqual([]);
    await expect(hero.locator("video")).toHaveCount(0);

    await play.click();
    await expect(hero.locator("video")).toHaveCount(1);
    await expect.poll(() => reelRequests.length).toBeGreaterThan(0);
  });
});
