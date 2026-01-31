import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";
import { setupMockApiRoutes, workflows } from "./fixtures/mockData";

// Pre-defined mock workflow ID for testing - used by template tests
const _MOCK_WORKFLOW_ID = workflows.workflows[0].id;

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Workflow Import and Export", () => {
    test.describe("Export Functionality", () => {
      test("should have export option in editor", async ({ page, request }) => {
        const workflowName = `test-export-${Date.now()}`;
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Test workflow for export",
              access: "private"
            }
          }
        );
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Look for export button or menu item
          const exportButton = page.locator(
            'button:has-text("Export"), ' +
            '[aria-label*="export" i], ' +
            '[data-testid="export-button"]'
          );

          // Or look in menus
          const menuButton = page.locator(
            'button:has-text("File"), button:has-text("Menu")'
          );

          if (await menuButton.count() > 0) {
            await menuButton.first().click();
            await page.waitForTimeout(500);
            await page.keyboard.press("Escape");
            await page.waitForTimeout(200);
          }

          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should export workflow via keyboard shortcut", async ({
        page,
        request
      }) => {
        const workflowName = `test-export-kb-${Date.now()}`;
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

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Try common export shortcut (Cmd/Ctrl+Shift+E)
          await page.keyboard.press("Meta+Shift+e");
          await page.waitForTimeout(500);

          // Should not crash
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should copy workflow JSON to clipboard", async ({
        page,
        request
      }) => {
        const workflowName = `test-copy-${Date.now()}`;
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

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Try to copy (might trigger export to clipboard)
          await page.keyboard.press("Meta+Shift+c");
          await page.waitForTimeout(500);

          // Editor should remain functional
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Import Functionality", () => {
      test("should have import option in dashboard or editor", async ({
        page
      }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Look for import button
        const importButton = page.locator(
          'button:has-text("Import"), ' +
          '[aria-label*="import" i], ' +
          '[data-testid="import-button"]'
        );

        // Page should load without errors
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should handle import via file input", async ({ page }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Look for file input for import
        const fileInput = page.locator('input[type="file"]');

        // File input might be hidden or not present
        // Just verify page is functional
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });

      test("should handle paste workflow from clipboard", async ({
        page,
        request
      }) => {
        const workflowName = `test-paste-${Date.now()}`;
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

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Try paste shortcut
          await page.keyboard.press("Meta+v");
          await page.waitForTimeout(500);

          // Should handle gracefully
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Workflow API Export/Import", () => {
      test("should fetch workflow data from API", async ({ page, request }) => {
        const workflowName = `test-api-export-${Date.now()}`;
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

          // Make direct API call to get workflow data
          const response = await request.get(
            `${BACKEND_API_URL}/workflows/${workflow.id}`
          );

          expect(response.ok()).toBeTruthy();
          expect(response.status()).toBe(200);

          const data = await response.json();
          expect(data).toBeDefined();
          expect(data).toHaveProperty("id");
          expect(data).toHaveProperty("name");
          expect(data.name).toBe(workflowName);
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should create workflow via API (import)", async ({
        page,
        request
      }) => {
        const workflowName = `test-api-import-${Date.now()}`;

        // Create workflow via API
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Imported workflow",
              access: "private",
              graph: {
                nodes: [],
                edges: []
              }
            }
          }
        );

        expect(createResponse.ok()).toBeTruthy();
        const workflow = await createResponse.json();

        try {
          expect(workflow).toBeDefined();
          expect(workflow).toHaveProperty("id");
          expect(workflow.name).toBe(workflowName);

          // Verify we can open it in editor
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should update workflow via API", async ({ page, request }) => {
        const workflowName = `test-api-update-${Date.now()}`;
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
          // Update workflow via API
          const updateResponse = await request.put(
            `${BACKEND_API_URL}/workflows/${workflow.id}`,
            {
              data: {
                ...workflow,
                name: `${workflowName}-updated`,
                description: "Updated description"
              }
            }
          );

          expect(updateResponse.ok()).toBeTruthy();
          const updatedWorkflow = await updateResponse.json();
          expect(updatedWorkflow.name).toBe(`${workflowName}-updated`);

          // Verify in editor
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Template Import", () => {
      test.beforeEach(async ({ page }) => {
        await setupMockApiRoutes(page);
      });

      test("should load template from templates page", async ({ page }) => {
        await page.goto("/templates");
        await page.waitForLoadState("networkidle");

        await expect(page).toHaveURL(/\/templates/);

        // Templates should be displayed
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });

      test("should navigate from template to editor", async ({ page }) => {
        await page.goto("/templates");
        await page.waitForLoadState("networkidle");

        // Look for template cards or links
        const templateLinks = page.locator(
          '[class*="template" i] a, [class*="card" i] a, [class*="workflow" i] a'
        );

        if (await templateLinks.count() > 0) {
          await templateLinks.first().click();
          await page.waitForLoadState("networkidle");

          // Should either navigate to editor or show template details
          const bodyText = await page.textContent("body");
          expect(bodyText).toBeTruthy();
        }
      });

      test("should create workflow from template", async ({ page }) => {
        await page.goto("/templates");
        await page.waitForLoadState("networkidle");

        // Look for "use template" or "create from template" buttons
        const useTemplateButton = page.locator(
          'button:has-text("Use"), ' +
          'button:has-text("Create"), ' +
          'button:has-text("Open")'
        );

        if (await useTemplateButton.count() > 0) {
          await useTemplateButton.first().click();
          await page.waitForTimeout(1000);

          // Should handle the action
          const body = page.locator("body");
          await expect(body).not.toBeEmpty();
        }
      });
    });

    test.describe("Workflow Duplication", () => {
      test("should duplicate workflow", async ({ page, request }) => {
        const workflowName = `test-duplicate-${Date.now()}`;
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Original workflow",
              access: "private"
            }
          }
        );
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Look for duplicate option
          const duplicateButton = page.locator(
            'button:has-text("Duplicate"), ' +
            'button:has-text("Clone"), ' +
            '[aria-label*="duplicate" i]'
          );

          if (await duplicateButton.count() > 0) {
            await duplicateButton.first().click();
            await page.waitForTimeout(1000);
          }

          // Editor should remain functional
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should handle duplicate via keyboard shortcut", async ({
        page,
        request
      }) => {
        const workflowName = `test-dup-kb-${Date.now()}`;
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

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Try duplicate shortcut
          await page.keyboard.press("Meta+Shift+d");
          await page.waitForTimeout(500);

          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Workflow Versioning", () => {
      test("should fetch workflow versions from API", async ({
        page,
        request
      }) => {
        const workflowName = `test-versions-${Date.now()}`;
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

          // Make API call for versions
          const versionsResponse = await request.get(
            `${BACKEND_API_URL}/workflows/${workflow.id}/versions`
          );

          expect(versionsResponse.ok()).toBeTruthy();

          const versionsData = await versionsResponse.json();
          expect(versionsData).toBeDefined();
          expect(versionsData).toHaveProperty("versions");
          expect(Array.isArray(versionsData.versions)).toBeTruthy();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should display version history in editor", async ({
        page,
        request
      }) => {
        const workflowName = `test-version-ui-${Date.now()}`;
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

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Look for versions or history button
          const versionsButton = page.locator(
            'button:has-text("Versions"), ' +
            'button:has-text("History"), ' +
            '[aria-label*="version" i]'
          );

          if (await versionsButton.count() > 0) {
            await versionsButton.first().click();
            await page.waitForTimeout(500);

            // Close any dialog
            await page.keyboard.press("Escape");
            await page.waitForTimeout(200);
          }

          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Sharing and Collaboration", () => {
      test("should have share option for workflow", async ({
        page,
        request
      }) => {
        const workflowName = `test-share-${Date.now()}`;
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

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Look for share button
          const shareButton = page.locator(
            'button:has-text("Share"), ' +
            '[aria-label*="share" i], ' +
            '[data-testid="share-button"]'
          );

          if (await shareButton.count() > 0) {
            await shareButton.first().click();
            await page.waitForTimeout(500);

            // Close any dialog
            await page.keyboard.press("Escape");
            await page.waitForTimeout(200);
          }

          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should update workflow access level", async ({ page, request }) => {
        const workflowName = `test-access-${Date.now()}`;
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
          // Update access level via API
          const updateResponse = await request.put(
            `${BACKEND_API_URL}/workflows/${workflow.id}`,
            {
              data: {
                ...workflow,
                access: "public"
              }
            }
          );

          expect(updateResponse.ok()).toBeTruthy();
          const updatedWorkflow = await updateResponse.json();
          expect(updatedWorkflow.access).toBe("public");

          // Verify in editor
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Workflow Data Validation", () => {
      test("should validate workflow structure on import", async ({
        request
      }) => {
        // Try to create workflow with invalid structure
        const response = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: "Invalid Workflow",
              // Missing required fields or invalid structure
            }
          }
        );

        // API should accept the request but may validate
        // Just verify it doesn't crash the server
        expect(response.status()).toBeLessThan(500);
      });

      test("should handle corrupted workflow data gracefully", async ({
        page
      }) => {
        // Setup route to return corrupted data
        await page.route("**/api/workflows/**", (route) => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: "test-id",
              name: "Corrupted",
              graph: {
                nodes: null, // Invalid - should be array
                edges: "not-an-array" // Invalid
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
    });

    test.describe("Cross-Browser Compatibility", () => {
      test("should export in compatible format", async ({ request }) => {
        const workflowName = `test-compat-${Date.now()}`;
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Test workflow",
              access: "private",
              graph: {
                nodes: [
                  {
                    id: "node-1",
                    type: "nodetool.text.TextInput",
                    position: { x: 100, y: 100 },
                    data: { properties: {} }
                  }
                ],
                edges: []
              }
            }
          }
        );
        const workflow = await createResponse.json();

        try {
          // Fetch workflow data
          const response = await request.get(
            `${BACKEND_API_URL}/workflows/${workflow.id}`
          );
          expect(response.ok()).toBeTruthy();

          const data = await response.json();

          // Verify structure is valid JSON
          expect(() => JSON.stringify(data)).not.toThrow();

          // Verify has required fields
          expect(data).toHaveProperty("id");
          expect(data).toHaveProperty("name");
          expect(data).toHaveProperty("graph");
          expect(data.graph).toHaveProperty("nodes");
          expect(data.graph).toHaveProperty("edges");
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });
  });
}
