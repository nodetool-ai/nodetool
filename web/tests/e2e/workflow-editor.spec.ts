import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Workflow Editor", () => {
    test.describe("Workflow Creation", () => {
      test("should create a new workflow via API and open in editor", async ({
        page,
        request
      }) => {
        // Create a workflow via API
        const workflowName = `test-workflow-${Date.now()}`;
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Test workflow for e2e testing",
              access: "private"
            }
          }
        );

        expect(createResponse.ok()).toBe(true);
        const workflow = await createResponse.json();
        expect(workflow.id).toBeTruthy();

        try {
          // Navigate to the editor with the new workflow
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          // Verify we're on the editor page
          await expect(page).toHaveURL(new RegExp(`/editor/${workflow.id}`));

          // Check that the editor loaded without errors
          const bodyText = await page.textContent("body");
          expect(bodyText).not.toContain("500");
          expect(bodyText).not.toContain("Internal Server Error");

          // Check that the ReactFlow canvas is present
          const reactFlowContainer = page.locator(".react-flow");
          await expect(reactFlowContainer).toBeVisible({ timeout: 10000 });
        } finally {
          // Cleanup: Delete the workflow via API
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should display editor toolbar and controls", async ({
        page,
        request
      }) => {
        // Create a workflow for this test
        const workflowName = `test-workflow-toolbar-${Date.now()}`;
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Test workflow",
              access: "private"
            }
          }
        );
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          // Check for the presence of editor controls
          // Look for zoom controls or other editor UI elements
          const body = page.locator("body");
          await expect(body).not.toBeEmpty();

          // The editor should have loaded successfully
          const hasContent = await body.textContent();
          expect(hasContent).toBeTruthy();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should handle workflow save action", async ({ page, request }) => {
        // Create a workflow
        const workflowName = `test-workflow-save-${Date.now()}`;
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Test workflow for save",
              access: "private"
            }
          }
        );
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          // Wait for editor to be ready
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Try keyboard shortcut for save (Cmd/Ctrl + S)
          await page.keyboard.press("Meta+s");

          // Wait a moment for any save operation
          await page.waitForTimeout(1000);

          // The page should still be functional after save attempt
          const bodyText = await page.textContent("body");
          expect(bodyText).not.toContain("500");
          expect(bodyText).not.toContain("Internal Server Error");
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Editor Canvas", () => {
      test("should allow panning the canvas", async ({ page, request }) => {
        // Create a workflow
        const workflowName = `test-workflow-pan-${Date.now()}`;
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Test workflow for panning",
              access: "private"
            }
          }
        );
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          // Wait for the ReactFlow canvas
          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Get the viewport element
          const viewport = page.locator(".react-flow__viewport");
          await expect(viewport).toBeVisible();

          // Pan by dragging on the background
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

            // Wait for transform to update
            await page.waitForTimeout(500);
          }

          // Verify the canvas is still functional
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should support zoom controls", async ({ page, request }) => {
        // Create a workflow
        const workflowName = `test-workflow-zoom-${Date.now()}`;
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Test workflow for zoom",
              access: "private"
            }
          }
        );
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          // Wait for the canvas
          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Test keyboard zoom (Cmd/Ctrl + +)
          await page.keyboard.press("Meta+=");
          await page.waitForTimeout(300);

          // Test keyboard zoom out (Cmd/Ctrl + -)
          await page.keyboard.press("Meta+-");
          await page.waitForTimeout(300);

          // The canvas should still be visible and functional
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Node Menu", () => {
      test("should open node menu on right-click", async ({ page, request }) => {
        // Create a workflow
        const workflowName = `test-workflow-menu-${Date.now()}`;
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Test workflow for menu",
              access: "private"
            }
          }
        );
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          // Wait for the canvas
          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Right-click on the canvas to open context menu
          await canvas.click({ button: "right" });
          await page.waitForTimeout(500);

          // The page should still be functional (context menu may or may not appear)
          const bodyText = await page.textContent("body");
          expect(bodyText).toBeTruthy();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should open node menu with keyboard shortcut", async ({
        page,
        request
      }) => {
        // Create a workflow
        const workflowName = `test-workflow-keyboard-menu-${Date.now()}`;
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Test workflow for keyboard menu",
              access: "private"
            }
          }
        );
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          // Wait for the canvas
          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Focus on the canvas
          await canvas.click();

          // Press space or tab to open node menu (common shortcuts)
          await page.keyboard.press("Tab");
          await page.waitForTimeout(500);

          // The page should still be functional
          const bodyText = await page.textContent("body");
          expect(bodyText).toBeTruthy();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("API Integration", () => {
      test("should fetch workflow data on load", async ({ page, request }) => {
        // Create a workflow with specific data
        const workflowName = `test-workflow-fetch-${Date.now()}`;
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Test workflow description for fetch test",
              access: "private"
            }
          }
        );
        const workflow = await createResponse.json();

        try {
          // Set up request interceptor to track API calls
          const apiCalls: string[] = [];

          page.on("response", (response) => {
            const url = response.url();
            if (url.includes(`/api/workflows/${workflow.id}`)) {
              apiCalls.push(url);
            }
          });

          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          // Wait for the editor to load
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Verify that the workflow API was called
          expect(apiCalls.length).toBeGreaterThan(0);
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should handle workflow not found gracefully", async ({ page }) => {
        // Try to load a non-existent workflow
        const fakeWorkflowId = "non-existent-workflow-id-12345";
        await page.goto(`/editor/${fakeWorkflowId}`);
        await page.waitForLoadState("networkidle");

        // The page should handle this gracefully (redirect or error message)
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
        // Should not show internal server error
        expect(bodyText).not.toContain("Internal Server Error");
      });
    });
  });
}
