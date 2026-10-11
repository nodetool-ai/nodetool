/**
 * Representative accessibility smoke for the application runtime.
 *
 * The page-load suite proves that the route mounts, while this check proves
 * that the user-facing Run surface remains discoverable to assistive
 * technology. Keep the scan scoped to the active runtime: the Design layer is
 * intentionally mounted beside it and is not part of this journey.
 */

import { AxeBuilder } from "@axe-core/playwright";
import { test, expect, FIXTURES } from "./fixtures";
import { MiniAppPage } from "./pages";

test.describe("Application accessibility", () => {
  test("mini-app Run surface has no serious or critical violations", async ({
    page
  }) => {
    const app = new MiniAppPage(page);
    await app.open(FIXTURES.miniAppName);

    const runtime = page.getByTestId("application-run-layer");
    await expect(runtime).toBeVisible();
    await expect(app.promptInput()).toBeVisible();
    await expect(app.runButton()).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-testid="application-run-layer"]')
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const blockingViolations = results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical"
    );

    expect(
      blockingViolations,
      blockingViolations
        .map(
          (violation) =>
            `${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`
        )
        .join("\n")
    ).toEqual([]);
  });

  test("tooltips stay readable in the light theme", async ({ page }) => {
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Switch to light mode" }).click();

    // A first-time participant read this tooltip as a blank dark box.
    // The pointer is still on the toggle, so leave it before hovering again.
    await page.mouse.move(800, 500);
    await page.getByRole("button", { name: "Switch to dark mode" }).hover();
    const tooltip = page.getByRole("tooltip").filter({ hasText: "dark mode" });
    await expect(tooltip).toBeVisible();
    // Contrast is only measurable once the fade-in has finished.
    await expect(tooltip).toHaveCSS("opacity", "1");

    const results = await new AxeBuilder({ page })
      .include('[role="tooltip"]')
      .withRules(["color-contrast"])
      .analyze();
    expect(results.passes.length + results.violations.length).toBeGreaterThan(0);
    expect(
      results.violations.map((violation) => violation.nodes[0]?.failureSummary)
    ).toEqual([]);
  });
});
