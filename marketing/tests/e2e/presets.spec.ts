import { test, expect } from "@playwright/test";
import { presetShowcase, presetAnchor } from "../../src/data/presets";

test("lists every preset with a lazy poster and no video until a preview starts", async ({
  page
}) => {
  await page.goto("/presets");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Every preset"
  );
  await expect(page.locator("article")).toHaveCount(presetShowcase.length);
  expect(await page.locator("article video").count()).toBe(0);
  const posters = page.locator("article img");
  for (const loading of await posters.evaluateAll((imgs) =>
    imgs.map((img) => img.getAttribute("loading"))
  )) {
    expect(loading).toBe("lazy");
  }
});

test("a preview plays on hover and stops on leave, one at a time", async ({
  page
}) => {
  await page.goto("/presets");
  const first = presetShowcase[0];
  const second = presetShowcase[1];
  const playing = () =>
    page
      .locator("article video")
      .evaluateAll((videos) =>
        videos.map((video) => !(video as HTMLVideoElement).paused)
      );

  await page.locator(`#${presetAnchor(first)} button`).hover();
  await expect.poll(playing).toEqual([true]);
  await page.locator(`#${presetAnchor(second)} button`).hover();
  await expect.poll(playing).toEqual([false, true]);
  await page.mouse.move(0, 0);
  await expect.poll(playing).toEqual([false, false]);
});

test("a preview plays on keyboard focus", async ({ page }) => {
  await page.goto("/presets");
  const first = presetShowcase[0];
  await page.locator(`#${presetAnchor(first)} button`).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(() =>
      page
        .locator(`#${presetAnchor(first)} video`)
        .evaluate((video: HTMLVideoElement) => !video.paused)
    )
    .toBe(true);
});

test("under reduced motion the posters stay still", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/presets");
  const first = presetShowcase[0];
  await page.locator(`#${presetAnchor(first)}`).hover();
  await page.locator(`#${presetAnchor(first)}`).focus();
  await expect(page.locator("article button")).toHaveCount(0);
  await expect(page.locator("article video")).toHaveCount(0);
  await context.close();
});

test("the page names the model and says nothing about cost or paths", async ({
  page
}) => {
  await page.goto("/presets");
  const text = await page.locator("main").innerText();
  expect(text).toContain("Dreamina Seedance 2.5 (for preview)");
  expect(text).not.toContain("/home/");
  expect(text).not.toMatch(/credits|\$\d/i);
});
