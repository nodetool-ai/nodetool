import type { Page } from "@playwright/test";

/**
 * Drags a game editor dock tab onto a drop target, the way a user does. The
 * target is located after the drag starts, because empty-region edge targets
 * exist only while a tab is being dragged.
 */
export async function dragGameDockTab(page: Page, tabName: string, targetSelector: string): Promise<void> {
  const tab = await page.getByRole("tab").filter({ has: page.getByText(tabName, { exact: true }) }).boundingBox();
  if (!tab) { throw new Error(`Dock tab "${tabName}" has no bounds`); }
  const x = tab.x + tab.width / 2, y = tab.y + tab.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 12, { steps: 3 });
  const target = await page.locator(targetSelector).first().boundingBox();
  if (!target) { throw new Error(`Dock drop target ${targetSelector} has no bounds`); }
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
}

/** Saves the current game editor layout under a name through the toolbar Layout menu. */
export async function saveGameLayout(page: Page, name: string): Promise<void> {
  await page.locator("[data-game-layout-menu]").click();
  await page.getByRole("menuitem", { name: "Save layout as…", exact: true }).click();
  await page.getByRole("textbox", { name: "Layout name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
}
