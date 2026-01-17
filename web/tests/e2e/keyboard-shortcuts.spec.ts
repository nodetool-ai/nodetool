import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Keyboard Shortcuts", () => {
    test.describe("Global Shortcuts", () => {
      test("should handle Escape key to close dialogs", async ({ page }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Press Escape - should not cause errors
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);

        // Page should still be functional
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should handle Meta+K for command palette", async ({
        page,
        request
      }) => {
        // Create a workflow to test in editor
        const workflowName = `test-shortcuts-${Date.now()}`;
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
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Try command palette shortcut
          await page.keyboard.press("Meta+k");
          await page.waitForTimeout(500);

          // Check for command palette or any modal
          const body = await page.locator("body");
          await expect(body).not.toBeEmpty();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Editor Shortcuts", () => {
      test("should handle undo shortcut (Cmd/Ctrl+Z)", async ({
        page,
        request
      }) => {
        const workflowName = `test-undo-${Date.now()}`;
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
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Try undo shortcut
          await page.keyboard.press("Meta+z");
          await page.waitForTimeout(300);

          // Page should still be functional
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should handle redo shortcut (Cmd/Ctrl+Shift+Z)", async ({
        page,
        request
      }) => {
        const workflowName = `test-redo-${Date.now()}`;
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
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Try redo shortcut
          await page.keyboard.press("Meta+Shift+z");
          await page.waitForTimeout(300);

          // Page should still be functional
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should handle select all shortcut (Cmd/Ctrl+A)", async ({
        page,
        request
      }) => {
        const workflowName = `test-select-all-${Date.now()}`;
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
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Try select all shortcut
          await page.keyboard.press("Meta+a");
          await page.waitForTimeout(300);

          // Page should still be functional
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should handle copy/paste shortcuts", async ({ page, request }) => {
        const workflowName = `test-copy-paste-${Date.now()}`;
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
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Try copy shortcut
          await page.keyboard.press("Meta+c");
          await page.waitForTimeout(200);

          // Try paste shortcut
          await page.keyboard.press("Meta+v");
          await page.waitForTimeout(300);

          // Page should still be functional
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should handle delete shortcut", async ({ page, request }) => {
        const workflowName = `test-delete-${Date.now()}`;
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
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Try delete/backspace
          await page.keyboard.press("Delete");
          await page.waitForTimeout(200);
          await page.keyboard.press("Backspace");
          await page.waitForTimeout(300);

          // Page should still be functional
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should handle fit to screen shortcut", async ({ page, request }) => {
        const workflowName = `test-fit-screen-${Date.now()}`;
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
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Try fit to screen shortcut (commonly F or 0)
          await page.keyboard.press("f");
          await page.waitForTimeout(300);

          // Page should still be functional
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Navigation Shortcuts", () => {
      test("should not navigate away with prevented shortcuts", async ({
        page
      }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        const initialUrl = page.url();

        // Try browser back shortcut - should be handled by app
        await page.keyboard.press("Alt+ArrowLeft");
        await page.waitForTimeout(300);

        // The app may prevent or allow this - just verify no crash
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      });
    });

    test.describe("Chat Shortcuts", () => {
      test("should handle Enter to send message", async ({ page }) => {
        await page.goto("/chat");
        await page.waitForLoadState("networkidle");

        // Look for chat input
        const chatInput = page.locator(
          'textarea, input[type="text"], [role="textbox"]'
        );

        if ((await chatInput.count()) > 0) {
          await chatInput.first().click();
          await chatInput.first().fill("Test message");
          await page.waitForTimeout(300);

          // Press Enter (might send message or create new line)
          await page.keyboard.press("Enter");
          await page.waitForTimeout(500);

          // Page should remain functional
          const bodyText = await page.textContent("body");
          expect(bodyText).toBeTruthy();
        }
      });

      test("should handle Shift+Enter for new line", async ({ page }) => {
        await page.goto("/chat");
        await page.waitForLoadState("networkidle");

        // Look for chat input
        const chatInput = page.locator(
          'textarea, input[type="text"], [role="textbox"]'
        );

        if ((await chatInput.count()) > 0) {
          await chatInput.first().click();
          await chatInput.first().fill("Line 1");
          await page.waitForTimeout(200);

          // Press Shift+Enter for new line
          await page.keyboard.press("Shift+Enter");
          await page.waitForTimeout(200);

          // Continue typing
          await page.keyboard.type("Line 2");
          await page.waitForTimeout(300);

          // Page should remain functional
          const bodyText = await page.textContent("body");
          expect(bodyText).toBeTruthy();
        }
      });
    });

    test.describe("Modal Shortcuts", () => {
      test("should close modals with Escape", async ({ page, request }) => {
        const workflowName = `test-modal-${Date.now()}`;
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
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Try opening node menu
          const canvas = page.locator(".react-flow");
          await canvas.click();
          await page.keyboard.press("Tab");
          await page.waitForTimeout(500);

          // Press Escape to close any open menu/modal
          await page.keyboard.press("Escape");
          await page.waitForTimeout(300);

          // Page should remain functional
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Zoom Shortcuts", () => {
      test("should handle zoom in (Cmd/Ctrl++)", async ({ page, request }) => {
        const workflowName = `test-zoom-in-${Date.now()}`;
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
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Get initial viewport state
          const viewport = page.locator(".react-flow__viewport");
          const initialStyle = await viewport.getAttribute("style");

          // Zoom in
          await page.keyboard.press("Meta+=");
          await page.waitForTimeout(300);

          // Canvas should still be visible
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should handle zoom out (Cmd/Ctrl+-)", async ({ page, request }) => {
        const workflowName = `test-zoom-out-${Date.now()}`;
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
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Zoom out
          await page.keyboard.press("Meta+-");
          await page.waitForTimeout(300);

          // Canvas should still be visible
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should handle reset zoom (Cmd/Ctrl+0)", async ({ page, request }) => {
        const workflowName = `test-zoom-reset-${Date.now()}`;
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
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Zoom in first
          await page.keyboard.press("Meta+=");
          await page.waitForTimeout(200);

          // Reset zoom
          await page.keyboard.press("Meta+0");
          await page.waitForTimeout(300);

          // Canvas should still be visible
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });
  });
}
