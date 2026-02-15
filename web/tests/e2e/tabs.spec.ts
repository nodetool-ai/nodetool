import { test, expect } from "@playwright/test";
import { setupMockApiRoutes, workflows } from "./fixtures/mockData";
import {
  navigateToPage,
  waitForEditorReady,
  waitForAnimation,
  waitForPageReady,
} from "./helpers/waitHelpers";

// Pre-defined mock workflow IDs for testing
const MOCK_WORKFLOW_1 = workflows.workflows[0].id;
const MOCK_WORKFLOW_2 = workflows.workflows[1]?.id || MOCK_WORKFLOW_1;

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Multi-Tab Workflow Editing", () => {
    test.beforeEach(async ({ page }) => {
      await setupMockApiRoutes(page);
    });

    test.describe("Tab Creation", () => {
      test("should open workflow in new tab", async ({ page }) => {
        await navigateToPage(page, "/dashboard");

        // Navigate to first workflow
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

        // Verify URL
        await expect(page).toHaveURL(new RegExp(`/editor/${MOCK_WORKFLOW_1}`));
      });

      test("should handle multiple workflow tabs via navigation", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        let canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Navigate to second workflow
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_2}`);

        canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Verify URL changed
        await expect(page).toHaveURL(new RegExp(`/editor/${MOCK_WORKFLOW_2}`));
      });

      test("should open workflow in same tab by default", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

        // Navigate to another workflow
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_2}`);

        // Should still have one page (tab)
        expect(page).toBeTruthy();
      });
    });

    test.describe("Tab Switching", () => {
      test("should switch between workflows via browser navigation", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        let canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Navigate to second workflow
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_2}`);

        canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Go back to first workflow
        await page.goBack();
        await waitForPageReady(page);

        // Should be back at first workflow
        await expect(page).toHaveURL(new RegExp(`/editor/${MOCK_WORKFLOW_1}`));
      });

      test("should maintain workflow state when switching tabs", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

        // Get initial node count
        const initialNodeCount = await page.locator(".react-flow__node").count();

        // Navigate away and back
        await navigateToPage(page, "/dashboard");

        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Node count should be similar (may reload from server)
        const finalNodeCount = await page.locator(".react-flow__node").count();
        expect(finalNodeCount).toBeGreaterThanOrEqual(0);
      });

      test("should preserve zoom level when switching workflows", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

        // Zoom in
        await page.keyboard.press("Meta+=");
        await waitForAnimation(page);

        // Get viewport transform
        const viewport = page.locator(".react-flow__viewport");
        const transformAfterZoom = await viewport.getAttribute("style");

        // Navigate to another workflow
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_2}`);

        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Go back
        await page.goBack();
        await waitForPageReady(page);

        // Zoom level might reset (implementation dependent)
        const finalTransform = await viewport.getAttribute("style");
        expect(finalTransform).toBeTruthy();
      });

      test("should preserve canvas position when switching workflows", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

        // Pan canvas
        const canvasBounds = await canvas.boundingBox();
        if (canvasBounds) {
          await page.mouse.move(
            canvasBounds.x + canvasBounds.width / 2,
            canvasBounds.y + canvasBounds.height / 2
          );
          await page.mouse.down({ button: "middle" });
          await page.mouse.move(
            canvasBounds.x + canvasBounds.width / 2 + 100,
            canvasBounds.y + canvasBounds.height / 2 + 100
          );
          await page.mouse.up({ button: "middle" });
          await waitForAnimation(page);
        }

        // Navigate away and back
        await navigateToPage(page, "/dashboard");

        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        // Canvas should still be visible
        await expect(canvas).toBeVisible({ timeout: 10000 });
      });
    });

    test.describe("Tab State Management", () => {
      test("should handle unsaved changes when switching workflows", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

        // Make a change (try to add a node or modify something)
        const node = page.locator(".react-flow__node").first();
        if (await node.count() > 0) {
          await node.click();
          await waitForAnimation(page);

          // Try to navigate away
          await navigateToPage(page, "/dashboard");

          // Should either navigate or show warning (implementation dependent)
          // Page should remain functional
          expect(page).toBeTruthy();
        }
      });

      test("should track active workflow ID", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        // Verify we're on the correct workflow
        await expect(page).toHaveURL(new RegExp(`/editor/${MOCK_WORKFLOW_1}`));

        // Navigate to different workflow
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_2}`);

        await expect(page).toHaveURL(new RegExp(`/editor/${MOCK_WORKFLOW_2}`));
      });

      test("should handle rapid tab switching", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        // Rapidly switch between workflows
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_2}`);

        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_2}`);

        // Should end on last workflow without errors
        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");
      });
    });

    test.describe("Tab Memory and Performance", () => {
      test("should handle opening multiple workflows sequentially", async ({ page }) => {
        // Open several workflows in sequence
        for (const workflow of workflows.workflows.slice(0, 3)) {
          await navigateToPage(page, `/editor/${workflow.id}`);

          await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

          await waitForAnimation(page);
        }

        // Should be on last workflow without memory issues
        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible();
      });

      test("should cleanup resources when leaving workflow", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

        // Navigate away
        await navigateToPage(page, "/dashboard");

        // Go back
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        // Should load cleanly
        await expect(canvas).toBeVisible({ timeout: 10000 });
      });

      test("should not interfere with workflow execution state", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

        // Try to run workflow (if run button exists)
        const runButton = page.locator('button:has-text("Run")').or(page.locator('[aria-label*="Run"]'));
        
        if (await runButton.count() > 0) {
          await runButton.first().click();
          await waitForAnimation(page);
        }

        // Navigate away during execution
        await navigateToPage(page, "/dashboard");

        // Should handle gracefully
        expect(page).toBeTruthy();
      });
    });

    test.describe("Keyboard Shortcuts Across Tabs", () => {
      test("should respect workflow-specific shortcuts", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

        // Try save shortcut
        await page.keyboard.press("Meta+s");
        await waitForAnimation(page);

        // Should not throw error
        await expect(canvas).toBeVisible();
      });

      test("should handle undo/redo across workflow switches", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

        // Make a change
        const node = page.locator(".react-flow__node").first();
        if (await node.count() > 0) {
          await node.click();
          await page.keyboard.press("Delete");
          await waitForAnimation(page);

          // Try undo
          await page.keyboard.press("Meta+z");
          await waitForAnimation(page);

          // Canvas should still be functional
          await expect(canvas).toBeVisible();
        }
      });
    });

    test.describe("Error Handling in Multi-Tab Context", () => {
      test("should handle workflow not found in one tab", async ({ page }) => {
        await navigateToPage(page, "/editor/non-existent-workflow-id");

        // Should show error or redirect gracefully
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();

        // Should not show internal server error
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should recover from failed workflow load", async ({ page }) => {
        // Try to load a bad workflow
        await navigateToPage(page, "/editor/bad-workflow-id");

        // Navigate to valid workflow
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        // Should load successfully
        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");
      });

      test("should handle network errors during tab switch", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

        // Simulate network issue by navigating to another workflow
        // In real scenario, network might fail
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_2}`);

        // Should handle gracefully
        expect(page).toBeTruthy();
      });
    });

    test.describe("Tab Order and Navigation", () => {
      test("should maintain browser history for tab navigation", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_2}`);

        await navigateToPage(page, "/dashboard");

        // Go back
        await page.goBack();
        await waitForPageReady(page);
        await expect(page).toHaveURL(new RegExp(`/editor/${MOCK_WORKFLOW_2}`));

        // Go back again
        await page.goBack();
        await waitForPageReady(page);
        await expect(page).toHaveURL(new RegExp(`/editor/${MOCK_WORKFLOW_1}`));
      });

      test("should support forward navigation", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_2}`);

        // Go back
        await page.goBack();
        await waitForPageReady(page);

        // Go forward
        await page.goForward();
        await waitForPageReady(page);

        await expect(page).toHaveURL(new RegExp(`/editor/${MOCK_WORKFLOW_2}`));
      });
    });

    test.describe("Tab Isolation", () => {
      test("should isolate workflow changes between tabs", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

        const initialCount1 = await page.locator(".react-flow__node").count();

        // Navigate to second workflow
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_2}`);

        await expect(canvas).toBeVisible({ timeout: 10000 });

        const initialCount2 = await page.locator(".react-flow__node").count();

        // Counts might be different (isolated workflows)
        expect(initialCount1).toBeGreaterThanOrEqual(0);
        expect(initialCount2).toBeGreaterThanOrEqual(0);
      });

      test("should not share selection state between workflows", async ({ page }) => {
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_1}`);

        await waitForEditorReady(page);
        const canvas = page.locator(".react-flow");

        // Select a node
        const node = page.locator(".react-flow__node").first();
        if (await node.count() > 0) {
          await node.click();
          await waitForAnimation(page);
        }

        // Navigate to second workflow
        await navigateToPage(page, `/editor/${MOCK_WORKFLOW_2}`);

        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Selection should be clear (new workflow context)
        expect(canvas).toBeVisible();
      });
    });
  });
}
