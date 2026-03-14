import { test, expect } from "@playwright/test";

/** Max time to wait for a workflow result to appear in the UI. */
const WORKFLOW_RESULT_TIMEOUT = 20_000;

test.describe("Format Text Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("renders the format-text demo card", async ({ page }) => {
    const card = page.getByTestId("format-text-demo");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: /Text Format Workflow/i })).toBeVisible();
  });

  test("runs the default template and shows the formatted output", async ({ page }) => {
    // Default values are pre-filled: template="Hello {{ name }} from {{ city }}!", name="Alice", city="Wonderland"
    await page.getByTestId("run-format-text").click();

    const result = page.getByTestId("format-text-result");
    await expect(result).toBeVisible({ timeout: WORKFLOW_RESULT_TIMEOUT });
    await expect(result).toContainText("Alice");
    await expect(result).toContainText("Wonderland");
  });

  test("runs with custom inputs and shows updated output", async ({ page }) => {
    await page.getByTestId("template-input").fill("Hi {{ name }}, welcome to {{ city }}.");
    await page.getByTestId("name-input").fill("Bob");
    await page.getByTestId("city-input").fill("Paris");

    await page.getByTestId("run-format-text").click();

    const result = page.getByTestId("format-text-result");
    await expect(result).toBeVisible({ timeout: WORKFLOW_RESULT_TIMEOUT });
    await expect(result).toContainText("Bob");
    await expect(result).toContainText("Paris");
  });
});
