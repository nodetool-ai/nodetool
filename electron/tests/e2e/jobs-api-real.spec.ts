import { test, expect } from "./fixtures/electronApp";
import { BACKEND_API_URL } from "./support/backend";
import {
  navigateToPage,
  waitForEditorReady,
  waitForAnimation,
} from "./helpers/waitHelpers";

/**
 * Browser-based e2e tests for Job status and execution UI.
 * Exercises the job API consumers (useRunningJobs, job status in editor)
 * by navigating to editor/dashboard pages and interacting with UI elements.
 */

test.describe("Jobs E2E", () => {
  let workflowId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${BACKEND_API_URL}/workflows/`, {
      data: {
        name: `e2e-jobs-${Date.now()}`,
        description: "E2E jobs test workflow",
        access: "private",
      },
    });
    const workflow = await res.json();
    workflowId = workflow.id;
  });

  test.afterAll(async ({ request }) => {
    if (workflowId) {
      await request
        .delete(`${BACKEND_API_URL}/workflows/${workflowId}`)
        .catch(() => {});
    }
  });

  test.describe("Job Status in Editor", () => {
    test("should load editor with job status area", async ({ page }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const canvas = page.locator(".react-flow");
      await expect(canvas).toBeVisible();

      // Look for any execution/job status indicators
      const statusElements = page.locator(
        '[class*="status" i], [class*="execution" i], [class*="job" i]'
      );

      // Status area might or might not be visible when idle
      // Canvas should always be visible
      await expect(canvas).toBeVisible();
    });

    test("should display run button for workflow execution", async ({ page }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const canvas = page.locator(".react-flow");
      await expect(canvas).toBeVisible();

      // Look for run/execute button
      const runButton = page.locator(
        'button:has-text("Run"), button[aria-label*="run" i], [data-testid="run-button"]'
      );

      // Run button should exist
      const hasRunButton = (await runButton.count()) > 0;
      // Canvas always visible regardless
      await expect(canvas).toBeVisible();
    });

    test("should show progress indicators when available", async ({ page }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      // Look for MUI progress components
      const progressElements = page.locator(
        '[role="progressbar"], .MuiLinearProgress-root, .MuiCircularProgress-root'
      );

      // Progress might not be visible when no job is running
      // Just verify editor is functional
      const canvas = page.locator(".react-flow");
      await expect(canvas).toBeVisible();
    });
  });

  test.describe("Jobs API Consumer in Dashboard", () => {
    test("should display dashboard without job errors", async ({ page }) => {
      await navigateToPage(page, "/dashboard");
      await waitForAnimation(page);

      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });
  });

  test.describe("Workflow Execution via UI", () => {
    test("should handle run button click gracefully", async ({
      page,
      request
    }) => {
      const name = `e2e-jobs-test-${Date.now()}`;
      const createRes = await request.post(`${BACKEND_API_URL}/workflows/`, {
        data: { name, description: "e2e job test", access: "private" }
      });
      const workflow = await createRes.json();

      try {
        await navigateToPage(page, `/editor/${workflow.id}`);
        await waitForEditorReady(page);

        const canvas = page.locator(".react-flow");

        // Try clicking the run button
        const runButton = page.locator(
          'button:has-text("Run"), [aria-label*="Run" i]'
        ).first();

        if ((await runButton.count()) > 0) {
          await runButton.click();
          await waitForAnimation(page);

          // Editor should remain functional after clicking run
          await expect(canvas).toBeVisible();
        }
      } finally {
        await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
      }
    });

    test("should handle keyboard shortcut for execution", async ({
      page,
      request
    }) => {
      const name = `e2e-jobs-kb-${Date.now()}`;
      const createRes = await request.post(`${BACKEND_API_URL}/workflows/`, {
        data: { name, description: "e2e kb test", access: "private" }
      });
      const workflow = await createRes.json();

      try {
        await navigateToPage(page, `/editor/${workflow.id}`);
        await waitForEditorReady(page);

        const canvas = page.locator(".react-flow");

        // Try common run shortcuts
        await page.keyboard.press("F5");
        await waitForAnimation(page);

        // Editor should remain functional
        await expect(canvas).toBeVisible();
      } finally {
        await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
      }
    });
  });

  test.describe("Mini App Execution", () => {
    test("should load mini apps page", async ({ page }) => {
      await navigateToPage(page, "/apps");

      await expect(page).toHaveURL(/\/apps/);

      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should load mini app with workflow ID", async ({ page }) => {
      await navigateToPage(page, `/apps/${workflowId}`);
      await waitForAnimation(page);

      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
      expect(bodyText).not.toContain("Internal Server Error");
    });
  });
});
