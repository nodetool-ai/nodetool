import { expect, test } from "@playwright/test";

const games = [
  { name: "Kindle", slug: "kindle", scene: "temple" },
  { name: "Lumen", slug: "lumen", scene: "forest" },
  { name: "Neon Drift", slug: "neon-drift", scene: "arena" }
];

for (const game of games) {
  test(`${game.name} loads only on request and starts its playable scene`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/gamedev");
    await expect(page).toHaveTitle(/Game Development with NodeTool/);
    await expect(page.locator("h1")).toHaveCount(1);
    const section = page.locator("#example-games");
    expect(await section.getByRole("group", { name: "Example games" }).getByRole("button").allTextContents()).toEqual(games.map((example) => example.name));
    await expect(section.locator("iframe")).toHaveCount(0);
    await section.getByRole("button", { name: game.name, exact: true }).click();
    await expect(section.locator("iframe")).toHaveCount(0);
    await section.getByRole("button", { name: `Play ${game.name} here`, exact: true }).click();
    const player = section.frameLocator("iframe");
    await expect(player.locator("#status")).toContainText("Ready", { timeout: 30_000 });
    await player.locator("canvas").click();
    await page.keyboard.press("Space");
    await player.getByRole("button", { name: "Save", exact: true }).click();
    const savedScene = await player.locator("canvas").evaluate((element, slug) => {
      const storage = element.ownerDocument.defaultView?.localStorage;
      const key = Object.keys(storage ?? {}).find((entry) => entry.startsWith(`nodetool-game:${slug}:`));
      return key && storage ? JSON.parse(storage.getItem(key) ?? "{}").sceneId : undefined;
    }, game.slug);
    expect(savedScene).toBe(game.scene);
    await expect(section.getByRole("link", { name: "Open full game" })).toHaveAttribute("href", `/games/${game.slug}/index.html`);
    await section.getByRole("button", { name: "Stop game", exact: true }).click();
    await expect(section.locator("iframe")).toHaveCount(0);
  });
}

test("changing games removes the running player and works by keyboard", async ({ page }) => {
  await page.goto("/gamedev");
  const section = page.locator("#example-games");
  await section.getByRole("button", { name: "Play Kindle here", exact: true }).click();
  await expect(section.locator("iframe")).toHaveCount(1);
  const lumen = section.getByRole("button", { name: "Lumen", exact: true });
  await lumen.focus();
  await page.keyboard.press("Enter");
  await expect(lumen).toHaveAttribute("aria-pressed", "true");
  await expect(section.locator("iframe")).toHaveCount(0);
  await expect(section.getByRole("img", { name: "Lumen gameplay", exact: true })).toBeVisible();
});

test("the game page fits on a phone and offers the full touch player", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/gamedev");
  await page.locator("#example-games").getByRole("button", { name: "Neon Drift", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open full game", exact: true })).toHaveAttribute("target", "_blank");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("dialog", { name: "Site menu" }).getByRole("link", { name: "Game dev", exact: true })).toBeVisible();
});
