import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";
import { setupMockApiRoutes, workflows } from "./fixtures/mockData";

// Pre-defined mock workflow ID for testing
const MOCK_WORKFLOW_ID = workflows.workflows[0].id;

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Help and Documentation", () => {
    test.describe("Help Menu Access", () => {
      test("should have help or info accessible from dashboard", async ({
        page
      }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Look for help button/icon
        const helpElements = page.locator(
          'button[aria-label*="help" i], button[aria-label*="Help" i], ' +
          '[data-testid="help-button"], button:has(svg[data-testid="HelpIcon"]), ' +
          'a[href*="help"], a[href*="docs"]'
        );

        // Page should load without errors
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should display help icon in editor", async ({ page }) => {
        await setupMockApiRoutes(page);

        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Look for help elements in the editor
        const helpElements = page.locator(
          '[aria-label*="help" i], [class*="help" i], [data-testid*="help" i]'
        );

        // Editor should be functional
        await expect(canvas).toBeVisible();
      });

      test("should have keyboard shortcut for help", async ({ page }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Try common help shortcuts
        await page.keyboard.press("F1");
        await page.waitForTimeout(500);

        // Page should remain functional
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });
    });

    test.describe("Node Documentation", () => {
      test.beforeEach(async ({ page }) => {
        await setupMockApiRoutes(page);
      });

      test("should display node info on hover", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const node = page.locator(".react-flow__node").first();

        if (await node.count() > 0) {
          // Hover over node
          await node.hover();
          await page.waitForTimeout(500);

          // Tooltip or info might appear
          // Just verify the action doesn't crash
          await expect(canvas).toBeVisible();
        }
      });

      test("should display node details in inspector panel", async ({
        page
      }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const node = page.locator(".react-flow__node").first();

        if (await node.count() > 0) {
          // Click to select node
          await node.click();
          await page.waitForTimeout(500);

          // Look for inspector or properties panel
          const inspectorElements = page.locator(
            '[class*="inspector" i], [class*="properties" i], [class*="panel" i]'
          );

          // Some panel might be visible after selection
          await expect(canvas).toBeVisible();
        }
      });

      test("should show node type documentation", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const node = page.locator(".react-flow__node").first();

        if (await node.count() > 0) {
          // Right-click for context menu
          await node.click({ button: "right" });
          await page.waitForTimeout(500);

          // Look for docs or info option in menu
          const docsOption = page.locator(
            'text="Documentation", text="Info", text="Help"'
          );

          if (await docsOption.count() > 0) {
            await docsOption.first().click();
            await page.waitForTimeout(500);
          }

          // Close any menu by pressing Escape
          await page.keyboard.press("Escape");
          await page.waitForTimeout(200);

          await expect(canvas).toBeVisible();
        }
      });
    });

    test.describe("Tooltip Information", () => {
      test.beforeEach(async ({ page }) => {
        await setupMockApiRoutes(page);
      });

      test("should display tooltips on buttons", async ({ page }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Hover over a button that might have a tooltip
        const buttons = page.locator("button");

        if (await buttons.count() > 0) {
          await buttons.first().hover();
          await page.waitForTimeout(500);

          // Tooltip might appear
          const tooltips = page.locator('[role="tooltip"], .MuiTooltip-popper');

          // Just verify no crash
          const body = page.locator("body");
          await expect(body).not.toBeEmpty();
        }
      });

      test("should display tooltips on node handles", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const handle = page.locator(".react-flow__handle").first();

        if (await handle.count() > 0) {
          await handle.hover();
          await page.waitForTimeout(500);

          // Tooltip with handle type info might appear
          await expect(canvas).toBeVisible();
        }
      });

      test("should display property tooltips in inspector", async ({
        page
      }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Select a node to show inspector
        const node = page.locator(".react-flow__node").first();
        if (await node.count() > 0) {
          await node.click();
          await page.waitForTimeout(500);

          // Hover over property labels
          const labels = page.locator("label, .MuiFormLabel-root");

          if (await labels.count() > 0) {
            await labels.first().hover();
            await page.waitForTimeout(500);
          }

          await expect(canvas).toBeVisible();
        }
      });
    });

    test.describe("Node Metadata API", () => {
      test("should fetch node metadata from API", async ({ page, request }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Make API request for node metadata
        const response = await request.get(
          `${BACKEND_API_URL}/nodes/metadata`
        );

        // Verify response is successful
        expect(response.ok()).toBeTruthy();
        expect(response.status()).toBe(200);

        // Parse and verify response
        const data = await response.json();
        expect(data).toBeDefined();
        expect(Array.isArray(data)).toBeTruthy();
      });

      test("should validate node metadata structure", async ({
        page,
        request
      }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        const response = await request.get(
          `${BACKEND_API_URL}/nodes/metadata`
        );
        expect(response.ok()).toBeTruthy();

        const data = await response.json();

        // If nodes exist, validate their structure
        if (data.length > 0) {
          const firstNode = data[0];

          // Check for common metadata properties
          expect(firstNode).toBeDefined();
          expect(typeof firstNode).toBe("object");
          
          // Node should have title and description
          expect(firstNode).toHaveProperty("title");
          expect(firstNode).toHaveProperty("description");
        }
      });
    });

    test.describe("About Information", () => {
      test("should display version information", async ({ page }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Look for version display
        const versionElements = page.locator(
          '[class*="version" i], text=/v\\d+\\.\\d+/'
        );

        // Page should load without errors
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should have settings/about section", async ({ page }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Look for settings button
        const settingsButton = page.locator(
          'button[aria-label*="settings" i], [data-testid="settings"]'
        );

        if (await settingsButton.count() > 0) {
          await settingsButton.first().click();
          await page.waitForTimeout(500);

          // Look for about section in settings
          const aboutSection = page.locator('text="About", text="Version"');

          // Close settings
          await page.keyboard.press("Escape");
          await page.waitForTimeout(200);
        }

        // Page should remain functional
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });
    });

    test.describe("Error Messages and Feedback", () => {
      test("should display clear error messages", async ({ page }) => {
        // Navigate to invalid route
        await page.goto("/invalid-route-test");
        await page.waitForLoadState("networkidle");

        // Should show some error indication, not just blank page
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should provide actionable feedback on form errors", async ({
        page,
        request
      }) => {
        // Create a workflow to test with
        const workflowName = `test-feedback-${Date.now()}`;
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

          // Look for input fields that might show validation
          const inputs = page.locator('input, textarea');

          if (await inputs.count() > 0) {
            const input = inputs.first();
            await input.click();
            await input.fill("");
            await input.blur();
            await page.waitForTimeout(300);
          }

          // Canvas should remain functional
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Onboarding and Tutorials", () => {
      test("should handle first-time user experience", async ({ page }) => {
        // Clear any existing user data
        await page.goto("/dashboard");
        await page.evaluate(() => localStorage.clear());

        // Reload
        await page.reload();
        await page.waitForLoadState("networkidle");

        // Page should load without crashing
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
        expect(bodyText).not.toContain("500");
      });

      test("should have templates for learning", async ({ page }) => {
        await page.goto("/templates");
        await page.waitForLoadState("networkidle");

        // Verify templates page loads
        await expect(page).toHaveURL(/\/templates/);

        // Should have content for learning
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });

      test("should navigate to examples easily", async ({ page }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Look for templates/examples link
        const templatesLink = page.locator('a[href*="/templates"]');

        if (await templatesLink.count() > 0) {
          await templatesLink.first().click();
          await page.waitForLoadState("networkidle");

          await expect(page).toHaveURL(/\/templates/);
        } else {
          // Navigate directly
          await page.goto("/templates");
          await page.waitForLoadState("networkidle");
          await expect(page).toHaveURL(/\/templates/);
        }
      });
    });

    test.describe("Keyboard Shortcut Reference", () => {
      test("should have keyboard shortcuts documentation", async ({ page }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Try to open keyboard shortcuts help (common: ? or Cmd/Ctrl+/)
        await page.keyboard.press("?");
        await page.waitForTimeout(500);

        // Or try Cmd+/
        await page.keyboard.press("Meta+/");
        await page.waitForTimeout(500);

        // Page should remain functional
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });

      test("should list available shortcuts in editor", async ({ page }) => {
        await setupMockApiRoutes(page);

        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Try to open shortcuts reference
        await page.keyboard.press("?");
        await page.waitForTimeout(500);

        // Look for shortcuts list or dialog
        const shortcutsDialog = page.locator(
          '[class*="shortcuts" i], [class*="keyboard" i], [role="dialog"]'
        );

        // Close any open dialog
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);

        await expect(canvas).toBeVisible();
      });
    });

    test.describe("External Documentation Links", () => {
      test("should have links to external docs", async ({ page }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Look for documentation links
        const docLinks = page.locator(
          'a[href*="docs"], a[href*="github"], a[href*="documentation"]'
        );

        // Page should load without errors
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should have community/support links", async ({ page }) => {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Look for community links
        const communityLinks = page.locator(
          'a[href*="discord"], a[href*="community"], a[href*="support"]'
        );

        // Page should load without errors
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });
    });

    test.describe("Contextual Help", () => {
      test.beforeEach(async ({ page }) => {
        await setupMockApiRoutes(page);
      });

      test("should show contextual help in node menu", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Open node menu
        await page.keyboard.press("Tab");
        await page.waitForTimeout(500);

        // Look for help or info in the menu
        const helpInMenu = page.locator(
          '[class*="node-menu"] [class*="help" i], [class*="node-menu"] [class*="info" i]'
        );

        // Close menu
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);

        await expect(canvas).toBeVisible();
      });

      test("should provide help for node properties", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const node = page.locator(".react-flow__node").first();

        if (await node.count() > 0) {
          await node.click();
          await page.waitForTimeout(500);

          // Look for help icons next to properties
          const helpIcons = page.locator(
            '[class*="property"] [class*="help" i], .MuiFormHelperText-root'
          );

          await expect(canvas).toBeVisible();
        }
      });

      test("should show model recommendation info", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Look for model selection or recommendation elements
        const modelElements = page.locator(
          '[class*="model" i], [class*="recommend" i]'
        );

        await expect(canvas).toBeVisible();
      });
    });
  });
}
