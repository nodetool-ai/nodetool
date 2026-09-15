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
});
