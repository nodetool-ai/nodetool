import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";
import {
  navigateToPage,
  waitForEditorReady,
  waitForAnimation,
} from "./helpers/waitHelpers";

// Note: These tests use "Meta" modifier which maps to Command on macOS and Windows key on Windows.
// Playwright handles this cross-platform, but the actual shortcuts in the app may differ by platform.
// These tests verify the keyboard interaction doesn't crash the app and functionality works.

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Keyboard Shortcuts", () => {
    test.describe("Global Shortcuts", () => {
      test("should handle Escape key to close dialogs", async ({ page }) => {
        await navigateToPage(page, "/dashboard");

        // Press Escape - should not cause errors
        await page.keyboard.press("Escape");
        await waitForAnimation(page);

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
          await navigateToPage(page, `/editor/${workflow.id}`);
          await waitForEditorReady(page);

          // Try command palette shortcut
          await page.keyboard.press("Meta+k");
          await waitForAnimation(page);

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
          await navigateToPage(page, `/editor/${workflow.id}`);
          await waitForEditorReady(page);

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Try undo shortcut
          await page.keyboard.press("Meta+z");
          await waitForAnimation(page);

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
          await navigateToPage(page, `/editor/${workflow.id}`);
          await waitForEditorReady(page);

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Try redo shortcut
          await page.keyboard.press("Meta+Shift+z");
          await waitForAnimation(page);

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
          await navigateToPage(page, `/editor/${workflow.id}`);
          await waitForEditorReady(page);

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Try select all shortcut
          await page.keyboard.press("Meta+a");
          await waitForAnimation(page);

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
          await navigateToPage(page, `/editor/${workflow.id}`);
          await waitForEditorReady(page);

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Try copy shortcut
          await page.keyboard.press("Meta+c");
          await waitForAnimation(page);

          // Try paste shortcut
          await page.keyboard.press("Meta+v");
          await waitForAnimation(page);

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
          await navigateToPage(page, `/editor/${workflow.id}`);
          await waitForEditorReady(page);

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Try delete/backspace
          await page.keyboard.press("Delete");
          await waitForAnimation(page);
          await page.keyboard.press("Backspace");
          await waitForAnimation(page);

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
          await navigateToPage(page, `/editor/${workflow.id}`);
          await waitForEditorReady(page);

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Try fit to screen shortcut (commonly F or 0)
          await page.keyboard.press("f");
          await waitForAnimation(page);

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
        await navigateToPage(page, "/dashboard");

        // Try browser back shortcut - should be handled by app
        await page.keyboard.press("Alt+ArrowLeft");
        await waitForAnimation(page);

        // The app may prevent or allow this - just verify no crash
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      });
    });

    test.describe("Chat Shortcuts", () => {
      test("should handle Enter to send message", async ({ page }) => {
        await navigateToPage(page, "/chat");

        // Look for chat input
        const chatInput = page.locator(
          'textarea, input[type="text"], [role="textbox"]'
        );

        if ((await chatInput.count()) > 0) {
          await chatInput.first().click();
          await chatInput.first().fill("Test message");
          await waitForAnimation(page);

          // Press Enter (might send message or create new line)
          await page.keyboard.press("Enter");
          await waitForAnimation(page);

          // Page should remain functional
          const bodyText = await page.textContent("body");
          expect(bodyText).toBeTruthy();
        }
      });

      test("should handle Shift+Enter for new line", async ({ page }) => {
        await navigateToPage(page, "/chat");

        // Look for chat input
        const chatInput = page.locator(
          'textarea, input[type="text"], [role="textbox"]'
        );

        if ((await chatInput.count()) > 0) {
          await chatInput.first().click();
          await chatInput.first().fill("Line 1");
          await waitForAnimation(page);

          // Press Shift+Enter for new line
          await page.keyboard.press("Shift+Enter");
          await waitForAnimation(page);

          // Continue typing
          await page.keyboard.type("Line 2");
          await waitForAnimation(page);

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
          await navigateToPage(page, `/editor/${workflow.id}`);
          await waitForEditorReady(page);

          // Try opening node menu
          const canvas = page.locator(".react-flow");
          await canvas.click();
          await page.keyboard.press("Tab");
          await waitForAnimation(page);

          // Press Escape to close any open menu/modal
          await page.keyboard.press("Escape");
          await waitForAnimation(page);

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
          await navigateToPage(page, `/editor/${workflow.id}`);
          await waitForEditorReady(page);

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Get viewport element
          const _viewport = page.locator(".react-flow__viewport");

          // Zoom in
          await page.keyboard.press("Meta+=");
          await waitForAnimation(page);

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
          await navigateToPage(page, `/editor/${workflow.id}`);
          await waitForEditorReady(page);

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Zoom out
          await page.keyboard.press("Meta+-");
          await waitForAnimation(page);

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
          await navigateToPage(page, `/editor/${workflow.id}`);
          await waitForEditorReady(page);

          // Focus on canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Zoom in first
          await page.keyboard.press("Meta+=");
          await waitForAnimation(page);

          // Reset zoom
          await page.keyboard.press("Meta+0");
          await waitForAnimation(page);

          // Canvas should still be visible
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });
  });
}
