import { expect, test } from "@playwright/test";

/*
 * Each page keeps its own argument (site-editorial.spec.md § Page ownership).
 * These checks fail when a section that belongs to another page comes back.
 */

test("local-first shows a local model run, not the film pitch", async ({ page }) => {
  await page.goto("/solutions/local-first");
  await expect(
    page.getByRole("heading", { level: 2, name: /Ask your notes a question/ })
  ).toBeVisible();
  await expect(page.locator("#local-hardware table tbody tr")).toHaveCount(4);
  await expect(page.locator("#local-offline")).toContainText("With the network off");
  await expect(page.getByText("One canvas. The whole production.")).toHaveCount(0);
  await expect(page.locator("#features")).toHaveCount(0);
});

test("agents demonstrates the harness and leaves MCP setup to developers", async ({ page }) => {
  await page.goto("/agents");
  await expect(page.locator("#agent-validation li")).toHaveCount(6);
  await expect(page.locator("#connect-agent")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy the install command" })
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Connect your agent" })
  ).toHaveAttribute("href", "/developers#connect-agent");

  await page.goto("/developers");
  await expect(page.locator("#connect-agent")).toBeVisible();
});

test("the still-versus-clip cost example lives on the homepage only", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#surface-panel-storyboard")).toContainText(
    "before spending money on video"
  );

  await page.goto("/studio");
  await page.locator("#surface-tab-storyboard").dispatchEvent("click");
  const panel = page.locator("#surface-panel-storyboard");
  await expect(panel).toContainText("Edit a shot yourself");
  await expect(panel).toContainText("Other shots are unchanged.");
  await expect(panel).not.toContainText("$");
});

test("the ComfyUI page answers with the ComfyUI node, not generic positioning", async ({ page }) => {
  await page.goto("/alternatives/comfyui");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Keep the ComfyUI graph."
  );
  await expect(page.getByText("Can NodeTool run my existing ComfyUI workflows?")).toBeVisible();
  await expect(page.getByText("Is NodeTool open source like ComfyUI?")).toHaveCount(0);
});
