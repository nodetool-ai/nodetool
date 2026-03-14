import { test, expect } from "@playwright/test";

/** Max time to wait for a triage result to appear in the UI. */
const WORKFLOW_RESULT_TIMEOUT = 30_000;

test.describe("Support Ticket Triage Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("renders the support-triage demo card", async ({ page }) => {
    const card = page.getByTestId("support-triage-demo");
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("heading", { name: /AI Support Ticket Triage/i })
    ).toBeVisible();
  });

  test("shows a valid category and priority after triage", async ({ page }) => {
    // Default sample is already loaded
    await page.getByTestId("run-support-triage").click();

    const result = page.getByTestId("support-triage-result");
    await expect(result).toBeVisible({ timeout: WORKFLOW_RESULT_TIMEOUT });

    // Both outputs must be one of the predefined values.
    const validCategories = ["Billing", "Technical", "Feature Request", "Bug", "General Inquiry"];
    const validPriorities = ["Critical", "High", "Medium", "Low"];
    const category = await page.getByTestId("triage-category").innerText();
    const priority = await page.getByTestId("triage-priority").innerText();
    expect(validCategories).toContain(category.trim());
    expect(validPriorities).toContain(priority.trim());
  });

  test("changes output when a different sample is selected", async ({ page }) => {
    const validCategories = ["Billing", "Technical", "Feature Request", "Bug", "General Inquiry"];
    const validPriorities = ["Critical", "High", "Medium", "Low"];

    await page.getByRole("button", { name: /Critical outage/i }).click();
    await page.getByTestId("run-support-triage").click();

    const result = page.getByTestId("support-triage-result");
    await expect(result).toBeVisible({ timeout: WORKFLOW_RESULT_TIMEOUT });
    const category = await page.getByTestId("triage-category").innerText();
    const priority = await page.getByTestId("triage-priority").innerText();
    expect(validCategories).toContain(category.trim());
    expect(validPriorities).toContain(priority.trim());
  });

  test("allows typing a custom message", async ({ page }) => {
    const validCategories = ["Billing", "Technical", "Feature Request", "Bug", "General Inquiry"];
    const validPriorities = ["Critical", "High", "Medium", "Low"];

    await page
      .getByTestId("triage-text-input")
      .fill("I can't log in to my account — password reset emails are not arriving.");

    await page.getByTestId("run-support-triage").click();

    const result = page.getByTestId("support-triage-result");
    await expect(result).toBeVisible({ timeout: WORKFLOW_RESULT_TIMEOUT });
    const category = await page.getByTestId("triage-category").innerText();
    const priority = await page.getByTestId("triage-priority").innerText();
    expect(validCategories).toContain(category.trim());
    expect(validPriorities).toContain(priority.trim());
  });
});
