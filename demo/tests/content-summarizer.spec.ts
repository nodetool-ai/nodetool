import { test, expect } from "@playwright/test";

/** Max time to wait for a summary to appear in the UI. */
const WORKFLOW_RESULT_TIMEOUT = 30_000;

test.describe("Content Summarizer Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("renders the content-summarizer demo card", async ({ page }) => {
    const card = page.getByTestId("content-summarizer-demo");
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("heading", { name: /AI Content Summarizer/i })
    ).toBeVisible();
  });

  test("summarizes the default blog post sample", async ({ page }) => {
    // Default sample is pre-filled
    await page.getByTestId("run-content-summarizer").click();

    const result = page.getByTestId("content-summarizer-result");
    await expect(result).toBeVisible({ timeout: WORKFLOW_RESULT_TIMEOUT });
    await expect(result).not.toContainText("(no output)");
    // Summary must contain actual text (at least a few words)
    const text = await result.innerText();
    expect(text.trim().split(/\s+/).length).toBeGreaterThan(5);
  });

  test("summarizes the meeting notes sample", async ({ page }) => {
    await page.getByRole("button", { name: /Meeting notes/i }).click();
    await page.getByTestId("run-content-summarizer").click();

    const result = page.getByTestId("content-summarizer-result");
    await expect(result).toBeVisible({ timeout: WORKFLOW_RESULT_TIMEOUT });
    await expect(result).not.toContainText("(no output)");
    const text = await result.innerText();
    expect(text.trim().split(/\s+/).length).toBeGreaterThan(5);
  });

  test("summarizes the research abstract sample", async ({ page }) => {
    await page.getByRole("button", { name: /Research abstract/i }).click();
    await page.getByTestId("run-content-summarizer").click();

    const result = page.getByTestId("content-summarizer-result");
    await expect(result).toBeVisible({ timeout: WORKFLOW_RESULT_TIMEOUT });
    await expect(result).not.toContainText("(no output)");
    const text = await result.innerText();
    expect(text.trim().split(/\s+/).length).toBeGreaterThan(5);
  });
});
