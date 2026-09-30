import { test, expect, waitForAppReady } from "./fixtures";

test.use({ trace: "on", screenshot: "on", video: "on", actionTimeout: 10_000 });

test("mobile Help survives navigation sheet dismissal and reopens", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspace");
  await waitForAppReady(page);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page
      .getByRole("button", { name: "Open left panel", exact: true })
      .click();
    const navigation = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("button", { name: "More", exact: true }) });
    await expect(navigation).toBeVisible();
    if (!(await navigation.getByText("Help", { exact: true }).isVisible())) {
      await navigation
        .getByRole("button", { name: "More", exact: true })
        .click();
    }
    await navigation.getByText("Help", { exact: true }).click();
    const help = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("tablist", { name: "help tabs" }) });
    await expect(navigation).toHaveCount(0);
    await expect(help).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await help.getByRole("tab", { name: "DataTypes", exact: true }).click();
    await expect(
      help.getByRole("tab", { name: "DataTypes", exact: true })
    ).toHaveAttribute("aria-selected", "true");
    await help.getByRole("button", { name: "Close", exact: true }).click();
    await expect(help).toHaveCount(0);
    await expect(page.locator(".MuiBackdrop-root:visible")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open left panel", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open left panel", exact: true })
    ).toBeFocused();
  }
});

test("desktop More and app menu produce a single Help dialog", async ({
  page
}) => {
  await page.goto("/workspace");
  await waitForAppReady(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByRole("button", { name: "Open app menu", exact: true })
    .click();
  await page.getByText("Help", { exact: true }).click();
  const help = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("tablist", { name: "help tabs" }) });
  await expect(help).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await help.getByRole("tab", { name: "DataTypes", exact: true }).click();
  await expect(
    help.getByRole("tab", { name: "DataTypes", exact: true })
  ).toHaveAttribute("aria-selected", "true");
  await help.getByRole("button", { name: "Close", exact: true }).click();
  await expect(help).toHaveCount(0);
  await expect(page.locator(".MuiBackdrop-root:visible")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open app menu", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open app menu", exact: true })
  ).toBeFocused();
});
