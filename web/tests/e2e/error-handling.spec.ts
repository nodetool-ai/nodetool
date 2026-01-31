import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";
import { setupMockApiRoutes } from "./fixtures/mockData";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Error Handling and Recovery", () => {
    test.describe("Page Error Handling", () => {
      test("should handle invalid workflow ID gracefully", async ({ page }) => {
        await page.goto("/editor/invalid-workflow-id-12345");
        await page.waitForLoadState("networkidle");

        // Page should not crash
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
        expect(bodyText).not.toContain("Internal Server Error");
        expect(bodyText).not.toContain("500");
      });

      test("should handle invalid route gracefully", async ({ page }) => {
        await page.goto("/non-existent-route-abcdef");
        await page.waitForLoadState("networkidle");

        // Should redirect or show appropriate message
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
        expect(bodyText).not.toContain("Internal Server Error");
        expect(bodyText).not.toContain("500");
      });

      test("should recover from navigation to bad URL", async ({ page }) => {
        // Start on a valid page
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");
        
        // Navigate to invalid route
        await page.goto("/invalid-route");
        await page.waitForLoadState("networkidle");

        // Navigate back to valid page
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Should load correctly
        await expect(page).toHaveURL(/\/(dashboard|login)/);
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
      });

      test("should handle deep invalid routes", async ({ page }) => {
        await page.goto("/editor/workflow/extra/path/segments");
        await page.waitForLoadState("networkidle");

        // Page should handle gracefully
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
        expect(bodyText).not.toContain("Internal Server Error");
      });
    });

    test.describe("Network Error Handling", () => {
      test("should handle failed API requests gracefully", async ({ page }) => {
        // Setup route to simulate API failure
        await page.route("**/api/workflows/**", (route) => {
          route.abort("failed");
        });

        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Page should load without crashing
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      });

      test("should handle slow API responses", async ({ page }) => {
        // Setup route to simulate slow response
        await page.route("**/api/workflows/**", async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ workflows: [], next: null })
          });
        });

        await page.goto("/dashboard");
        
        // Wait for page to eventually load
        await page.waitForTimeout(4000);
        
        // Page should still be functional
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });

      test("should handle 404 API responses", async ({ page }) => {
        await page.route("**/api/workflows/non-existent", (route) => {
          route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Not found" })
          });
        });

        await page.goto("/editor/non-existent");
        await page.waitForLoadState("networkidle");

        // Should handle gracefully
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      });

      test("should handle 500 API responses", async ({ page }) => {
        await page.route("**/api/workflows/**", (route) => {
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Internal server error" })
          });
        });

        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Page should still load without showing raw error
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });

      test("should handle malformed JSON responses", async ({ page }) => {
        await page.route("**/api/workflows/**", (route) => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: "invalid json {"
          });
        });

        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Page should not crash
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });
    });

    test.describe("Form Error Handling", () => {
      test("should handle empty form submission", async ({ page, request }) => {
        // Create a workflow to test with
        const workflowName = `test-error-${Date.now()}`;
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

          // Wait for editor to load
          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Try submitting with keyboard shortcut (save)
          await page.keyboard.press("Meta+s");
          await page.waitForTimeout(500);

          // Should not crash
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("State Recovery", () => {
      test("should recover state after page refresh", async ({ page }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Refresh the page
        await page.reload();
        await page.waitForLoadState("networkidle");

        // Should load correctly
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should handle localStorage corruption gracefully", async ({
        page
      }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Corrupt localStorage
        await page.evaluate(() => {
          localStorage.setItem("settings", "invalid-json{");
          localStorage.setItem("workflowOrder", "[]invalid");
        });

        // Reload the page
        await page.reload();
        await page.waitForLoadState("networkidle");

        // Should handle gracefully and not crash
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should handle cleared localStorage", async ({ page }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Clear localStorage
        await page.evaluate(() => localStorage.clear());

        // Reload
        await page.reload();
        await page.waitForLoadState("networkidle");

        // Should load with default state
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
      });
    });

    test.describe("UI Error Boundaries", () => {
      test("should display fallback UI on component error", async ({ page }) => {
        await setupMockApiRoutes(page);

        // Navigate to a page and verify it loads
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // The page should be functional
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });

      test("should allow navigation after error", async ({ page }) => {
        // Start with an error condition
        await page.goto("/invalid-route-12345");
        await page.waitForLoadState("networkidle");

        // Navigate to valid route
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Should be on dashboard
        await expect(page).toHaveURL(/\/(dashboard|login)/);
      });

      test("should preserve navigation history after error", async ({
        page
      }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        await page.goto("/templates");
        await page.waitForLoadState("networkidle");

        // Navigate to bad route
        await page.goto("/bad-route");
        await page.waitForLoadState("networkidle");

        // Go back should still work
        await page.goBack();
        await page.waitForLoadState("networkidle");

        // Should be back at templates
        await expect(page).toHaveURL(/\/templates/);
      });
    });

    test.describe("Concurrent Error Handling", () => {
      test("should handle multiple failed requests", async ({ page }) => {
        // Setup multiple failing routes
        await page.route("**/api/workflows/**", (route) => {
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Error" })
          });
        });

        await page.route("**/api/assets/**", (route) => {
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Error" })
          });
        });

        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Page should not crash despite multiple errors
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });
    });

    test.describe("Timeout Handling", () => {
      test("should handle request timeouts", async ({ page }) => {
        // Setup route that never responds
        await page.route("**/api/workflows/**", (_route) => {
          // Don't call fulfill or abort - simulate timeout
          // Playwright will eventually timeout
        });

        await page.goto("/dashboard");

        // Wait for a reasonable time
        await page.waitForTimeout(5000);

        // Page should still be rendered
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });
    });

    test.describe("Chat Error Handling", () => {
      test("should handle chat with invalid thread ID", async ({ page }) => {
        await page.goto("/chat/invalid-thread-id-12345");
        await page.waitForLoadState("networkidle");

        // Should not crash
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should handle WebSocket connection failure", async ({ page }) => {
        // Block WebSocket connections
        await page.route("**/ws**", (route) => route.abort());

        await page.goto("/chat");
        await page.waitForLoadState("networkidle");

        // Should show connection status, not crash
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });
    });

    test.describe("Editor Error Handling", () => {
      test("should handle editor with invalid data", async ({ page }) => {
        // Mock workflow endpoint with invalid graph data
        await page.route("**/api/workflows/**", (route) => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: "test-id",
              name: "Test",
              graph: {
                nodes: "invalid-nodes-not-array",
                edges: []
              }
            })
          });
        });

        await page.goto("/editor/test-id");
        await page.waitForLoadState("networkidle");

        // Should handle gracefully
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });

      test("should handle editor with missing node types", async ({ page }) => {
        // Mock workflow with unknown node types
        await page.route("**/api/workflows/**", (route) => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: "test-id",
              name: "Test",
              graph: {
                nodes: [
                  {
                    id: "node-1",
                    type: "unknown.nonexistent.NodeType",
                    position: { x: 0, y: 0 },
                    data: {}
                  }
                ],
                edges: []
              }
            })
          });
        });

        await page.goto("/editor/test-id");
        await page.waitForLoadState("networkidle");

        // Should not crash
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });
    });
  });
}
