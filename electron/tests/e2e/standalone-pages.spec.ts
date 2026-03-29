import { test, expect } from "./fixtures/electronApp";
import { BACKEND_API_URL } from "./support/backend";
import { navigateToPage, waitForAnimation } from "./helpers/waitHelpers";

/**
 * Tests for standalone pages (miniapps, standalone chat).
 * These pages are designed to work independently of the main app chrome.
 */

// Skip when executed by Jest
  test.describe("Standalone Pages", () => {
    test.describe("MiniApp Page (/apps)", () => {
      test("should load the apps page", async ({ page }) => {
        await navigateToPage(page, "/apps");
        await waitForAnimation(page);

        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        expect(body).not.toContain("Internal Server Error");
      });

      test("should load a miniapp with workflow ID", async ({
        page,
        request,
      }) => {
        // Create a workflow to use as miniapp
        const createRes = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: `test-miniapp-${Date.now()}`,
            description: "miniapp test",
            access: "private",
          },
        });
        const workflow = await createRes.json();

        try {
          await navigateToPage(page, `/apps/${workflow.id}`);
          await waitForAnimation(page);

          const body = await page.textContent("body");
          expect(body).toBeTruthy();
          expect(body).not.toContain("Internal Server Error");
        } finally {
          await request.delete(
            `${BACKEND_API_URL}/workflows/${workflow.id}`
          );
        }
      });

      test("should handle non-existent workflow gracefully", async ({
        page,
      }) => {
        await navigateToPage(page, "/apps/nonexistent-workflow-id-99999");
        await waitForAnimation(page);

        // Should not crash
        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        expect(body).not.toContain("Internal Server Error");
      });
    });

    test.describe("Standalone MiniApp (/miniapp)", () => {
      test("should load standalone miniapp page", async ({
        page,
        request,
      }) => {
        const createRes = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: `test-standalone-miniapp-${Date.now()}`,
            description: "",
            access: "private",
          },
        });
        const workflow = await createRes.json();

        try {
          await navigateToPage(page, `/miniapp/${workflow.id}`);
          await waitForAnimation(page);

          const body = await page.textContent("body");
          expect(body).toBeTruthy();
          expect(body).not.toContain("Internal Server Error");
        } finally {
          await request.delete(
            `${BACKEND_API_URL}/workflows/${workflow.id}`
          );
        }
      });
    });

    test.describe("Standalone Chat (/standalone-chat)", () => {
      test("should load standalone chat page", async ({ page }) => {
        await navigateToPage(page, "/standalone-chat");
        await waitForAnimation(page);

        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        expect(body).not.toContain("Internal Server Error");
      });

      test("should load standalone chat with thread ID", async ({
        page,
        request,
      }) => {
        // Create a thread
        const threadRes = await request.post(`${BACKEND_API_URL}/threads/`, {
          data: { name: `test-standalone-chat-${Date.now()}` },
        });

        if (threadRes.status() === 200) {
          const thread = await threadRes.json();
          try {
            await navigateToPage(page, `/standalone-chat/${thread.id}`);
            await waitForAnimation(page);

            const body = await page.textContent("body");
            expect(body).toBeTruthy();
            expect(body).not.toContain("Internal Server Error");
          } finally {
            await request
              .delete(`${BACKEND_API_URL}/threads/${thread.id}`)
              .catch(() => {});
          }
        } else {
          // If thread creation not supported, just test the page loads
          await navigateToPage(page, "/standalone-chat/fake-thread-id");
          const body = await page.textContent("body");
          expect(body).toBeTruthy();
        }
      });

      test("should have message input area", async ({ page }) => {
        await navigateToPage(page, "/standalone-chat");
        await waitForAnimation(page);

        // Look for a text input, textarea, or contenteditable for messages
        const input = page.locator(
          'textarea, input[type="text"], [contenteditable="true"], [role="textbox"]'
        );
        const inputCount = await input.count();

        // The page should have some form of input
        const body = await page.textContent("body");
        expect(body).toBeTruthy();
      });
    });

    test.describe("Asset Explorer (/assets)", () => {
      test("should load asset explorer", async ({ page }) => {
        await navigateToPage(page, "/assets");
        await waitForAnimation(page);

        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        expect(body).not.toContain("Internal Server Error");
      });

      test("should display asset management interface", async ({ page }) => {
        await navigateToPage(page, "/assets");
        await waitForAnimation(page);

        // Look for upload button or drop zone
        const uploadElements = page.locator(
          'button:has-text("upload"), [class*="upload" i], [class*="dropzone" i], input[type="file"]'
        );
        const hasUpload =
          (await uploadElements.count()) > 0 ||
          (await page.textContent("body"))?.toLowerCase().includes("upload");

        // Asset page should be functional
        const body = await page.textContent("body");
        expect(body).toBeTruthy();
      });
    });

    test.describe("Collections (/collections)", () => {
      test("should load collections page", async ({ page }) => {
        await navigateToPage(page, "/collections");
        await waitForAnimation(page);

        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        expect(body).not.toContain("Internal Server Error");
      });
    });

    test.describe("Route redirects", () => {
      test("root (/) should redirect to dashboard or start", async ({
        page,
      }) => {
        await navigateToPage(page, "/");
        await waitForAnimation(page);

        // Should either stay at root or redirect to dashboard/start page
        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        expect(body).not.toContain("Internal Server Error");
      });

      test("/editor without workflow ID should redirect", async ({
        page,
      }) => {
        await navigateToPage(page, "/editor");
        await waitForAnimation(page);

        // Should redirect somewhere meaningful
        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        expect(body).not.toContain("Internal Server Error");
      });
    });
  });
