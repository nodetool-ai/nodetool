import { test, expect } from "@playwright/test";

/** Max time to wait for a workflow result to appear in the UI. */
const WORKFLOW_RESULT_TIMEOUT = 20_000;

test.describe("Compare Numbers Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("renders the compare-numbers demo card", async ({ page }) => {
    const card = page.getByTestId("compare-numbers-demo");
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("heading", { name: /Number Compare Workflow/i })
    ).toBeVisible();
  });

  test("returns true when 10 > 5", async ({ page }) => {
    await page.getByTestId("compare-a-input").fill("10");
    await page.getByTestId("compare-b-input").fill("5");
    await page.getByTestId("compare-op-select").selectOption(">");

    await page.getByTestId("run-compare-numbers").click();

    const result = page.getByTestId("compare-numbers-result");
    await expect(result).toBeVisible({ timeout: WORKFLOW_RESULT_TIMEOUT });
    await expect(result).toContainText("true");
  });

  test("returns false when 3 > 7", async ({ page }) => {
    await page.getByTestId("compare-a-input").fill("3");
    await page.getByTestId("compare-b-input").fill("7");
    await page.getByTestId("compare-op-select").selectOption(">");

    await page.getByTestId("run-compare-numbers").click();

    const result = page.getByTestId("compare-numbers-result");
    await expect(result).toBeVisible({ timeout: WORKFLOW_RESULT_TIMEOUT });
    await expect(result).toContainText("false");
  });

  test("returns true when 5 == 5", async ({ page }) => {
    await page.getByTestId("compare-a-input").fill("5");
    await page.getByTestId("compare-b-input").fill("5");
    await page.getByTestId("compare-op-select").selectOption("==");

    await page.getByTestId("run-compare-numbers").click();

    const result = page.getByTestId("compare-numbers-result");
    await expect(result).toBeVisible({ timeout: WORKFLOW_RESULT_TIMEOUT });
    await expect(result).toContainText("true");
  });
});
