import { expect, test } from "@playwright/test";

interface NativeGame3DWindow extends Window {
  readonly nativeGame3DPlayer: { readonly snapshot: () => { readonly sceneId: string } };
}

interface NativeGameWindow extends Window {
  readonly nativeGamePlayer: {
    readonly snapshot: () => { readonly sceneId: string };
    readonly saves: {
      load(scope: "progress", slot: "quicksave"): Promise<{ readonly snapshot?: { readonly sceneId: string } } | null>;
    };
  };
}

const games = [
  { name: "Kindle", slug: "kindle", scene: "temple" },
  { name: "Lumen", slug: "lumen", scene: "forest" },
  { name: "Neon Drift", slug: "neon-drift", scene: "arena" }
];

for (const game of games) {
  test(`${game.name} opens in a new tab and starts its playable scene`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/gamedev");
    await expect(page).toHaveTitle(/Open-Source AI Game Engine/);
    await expect(page.locator("h1")).toHaveCount(1);
    const section = page.locator("#example-games");
    expect(await section.getByRole("group", { name: "Example games" }).getByRole("button").allTextContents()).toEqual([...games.map((example) => example.name), "RIDGELINE"]);
    await section.getByRole("button", { name: game.name, exact: true }).click();
    await expect(section.locator("iframe")).toHaveCount(0);
    const play = section.getByRole("link", { name: `Play ${game.name} in a new tab`, exact: true });
    await expect(play).toHaveAttribute("href", `/games/${game.slug}/index.html`);
    await expect(play).toHaveAttribute("target", "_blank");
    const [player] = await Promise.all([page.context().waitForEvent("page"), play.click()]);
    await expect(player.locator("#status")).toContainText("Ready", { timeout: 30_000 });
    // The stage fills the tab instead of a fixed embed.
    const stage = await player.locator("canvas").boundingBox();
    const viewport = player.viewportSize();
    expect(stage && viewport && (stage.width >= viewport.width - 1 || stage.height >= viewport.height - 160)).toBe(true);
    await player.locator("canvas").click();
    await player.keyboard.press("Space");
    // A running software-rendered frame blocks the player's main thread, so every later action waits on it.
    await player.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(player.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
    await player.getByRole("button", { name: "Save", exact: true }).click();
    await expect(player.locator("#status")).toHaveText("Game saved");
    const savedScene = await player.evaluate(async () => {
      const view = window as unknown as NativeGameWindow;
      return (await view.nativeGamePlayer.saves.load("progress", "quicksave"))?.snapshot?.sceneId;
    });
    expect(savedScene).toBe(game.scene);
    await player.getByRole("button", { name: "Load", exact: true }).click();
    await expect(player.locator("#status")).toHaveText("Game loaded");
    // This is the same public player boundary used by the standalone harness.
    const loadedScene = await player.evaluate(() => (window as unknown as NativeGameWindow).nativeGamePlayer.snapshot().sceneId);
    expect(loadedScene).toBe(game.scene);
    await player.close();
  });
}

test("RIDGELINE opens in a new tab and starts its 3D scene", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/gamedev");
  const section = page.locator("#example-games");
  await section.getByRole("button", { name: "RIDGELINE", exact: true }).click();
  await expect(section.getByText("hold Shift to open the throttle")).toBeVisible();
  const play = section.getByRole("link", { name: "Play RIDGELINE in a new tab", exact: true });
  await expect(play).toHaveAttribute("href", "/games/ridgeline/index.html");
  const [player] = await Promise.all([page.context().waitForEvent("page"), play.click()]);
  await expect(player.locator("#status")).toContainText("Ready", { timeout: 60_000 });
  await expect(player.getByRole("button", { name: "Fullscreen", exact: true })).toBeVisible();
  await player.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(player.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  // The 3D player exposes its public API on the page window.
  const scene = await player.evaluate(() => (window as unknown as NativeGame3DWindow).nativeGame3DPlayer.snapshot().sceneId);
  expect(scene).toBe("island");
  await player.close();
});

test("changing games updates the launcher and works by keyboard", async ({ page }) => {
  await page.goto("/gamedev");
  const section = page.locator("#example-games");
  const lumen = section.getByRole("button", { name: "Lumen", exact: true });
  await lumen.focus();
  await page.keyboard.press("Enter");
  await expect(lumen).toHaveAttribute("aria-pressed", "true");
  await expect(section.getByRole("img", { name: "Lumen gameplay", exact: true })).toBeVisible();
  await expect(section.getByRole("link", { name: "Play Lumen in a new tab", exact: true })).toHaveAttribute("href", "/games/lumen/index.html");
  await expect(section.locator("iframe")).toHaveCount(0);
});

test("the game page fits on a phone and offers the full touch player", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/gamedev");
  await page.locator("#example-games").getByRole("button", { name: "Neon Drift", exact: true }).click();
  await expect(page.getByRole("link", { name: "Play Neon Drift in a new tab", exact: true })).toHaveAttribute("target", "_blank");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("dialog", { name: "Site menu" }).getByRole("link", { name: "Game development", exact: true })).toBeVisible();
});
