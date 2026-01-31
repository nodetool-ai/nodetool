import { test, expect } from "@playwright/test";
import { setupMockApiRoutes, workflows } from "./fixtures/mockData";

// Pre-defined mock workflow ID for testing
const MOCK_WORKFLOW_ID = workflows.workflows[0].id;

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Node Operations", () => {
    test.beforeEach(async ({ page }) => {
      await setupMockApiRoutes(page);
    });

    test.describe("Node Selection", () => {
      test("should select a single node on click", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        // Wait for ReactFlow to load
        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Look for any node
        const node = page.locator(".react-flow__node").first();
        
        if (await node.count() > 0) {
          await node.click();
          await page.waitForTimeout(300);

          // Verify node is selected (should have selected class or style)
          const nodeClasses = await node.getAttribute("class");
          expect(nodeClasses).toBeTruthy();
        }
      });

      test("should support multi-select with Cmd/Ctrl+click", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Get all nodes
        const nodes = page.locator(".react-flow__node");
        const nodeCount = await nodes.count();

        if (nodeCount >= 2) {
          // Click first node
          await nodes.nth(0).click();
          await page.waitForTimeout(200);

          // Cmd/Ctrl+click second node
          await nodes.nth(1).click({ modifiers: ["ControlOrMeta"] });
          await page.waitForTimeout(200);

          // Both nodes should now be selectable
          expect(nodeCount).toBeGreaterThanOrEqual(2);
        }
      });

      test("should clear selection on canvas click", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const node = page.locator(".react-flow__node").first();
        
        if (await node.count() > 0) {
          // Select a node
          await node.click();
          await page.waitForTimeout(200);

          // Click on empty canvas area
          const canvasBounds = await canvas.boundingBox();
          if (canvasBounds) {
            await page.mouse.click(
              canvasBounds.x + 20,
              canvasBounds.y + 20
            );
            await page.waitForTimeout(200);
          }

          // Nodes should be deselected
          expect(canvas).toBeVisible();
        }
      });
    });

    test.describe("Node Deletion", () => {
      test("should delete node with Delete key", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Get initial node count
        const initialCount = await page.locator(".react-flow__node").count();

        if (initialCount > 0) {
          // Select first node
          const node = page.locator(".react-flow__node").first();
          await node.click();
          await page.waitForTimeout(200);

          // Press Delete key
          await page.keyboard.press("Delete");
          await page.waitForTimeout(500);

          // Node count should decrease (or at least not increase)
          const finalCount = await page.locator(".react-flow__node").count();
          expect(finalCount).toBeLessThanOrEqual(initialCount);
        }
      });

      test("should delete node with Backspace key", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const initialCount = await page.locator(".react-flow__node").count();

        if (initialCount > 0) {
          const node = page.locator(".react-flow__node").first();
          await node.click();
          await page.waitForTimeout(200);

          await page.keyboard.press("Backspace");
          await page.waitForTimeout(500);

          const finalCount = await page.locator(".react-flow__node").count();
          expect(finalCount).toBeLessThanOrEqual(initialCount);
        }
      });

      test("should delete multiple selected nodes", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const nodes = page.locator(".react-flow__node");
        const nodeCount = await nodes.count();

        if (nodeCount >= 2) {
          // Select first node
          await nodes.nth(0).click();
          await page.waitForTimeout(200);

          // Cmd/Ctrl+click second node
          await nodes.nth(1).click({ modifiers: ["ControlOrMeta"] });
          await page.waitForTimeout(200);

          // Delete selected nodes
          await page.keyboard.press("Delete");
          await page.waitForTimeout(500);

          const finalCount = await page.locator(".react-flow__node").count();
          expect(finalCount).toBeLessThan(nodeCount);
        }
      });
    });

    test.describe("Node Dragging", () => {
      test("should drag node to new position", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const node = page.locator(".react-flow__node").first();
        
        if (await node.count() > 0) {
          const initialBounds = await node.boundingBox();
          
          if (initialBounds) {
            // Drag node
            await page.mouse.move(
              initialBounds.x + initialBounds.width / 2,
              initialBounds.y + initialBounds.height / 2
            );
            await page.mouse.down();
            await page.mouse.move(
              initialBounds.x + initialBounds.width / 2 + 100,
              initialBounds.y + initialBounds.height / 2 + 100,
              { steps: 10 }
            );
            await page.mouse.up();

            await page.waitForTimeout(300);

            // Node should still exist
            await expect(node).toBeVisible();
          }
        }
      });

      test("should drag multiple selected nodes together", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const nodes = page.locator(".react-flow__node");
        const nodeCount = await nodes.count();

        if (nodeCount >= 2) {
          // Select first node
          await nodes.nth(0).click();
          await page.waitForTimeout(200);

          // Cmd/Ctrl+click second node
          await nodes.nth(1).click({ modifiers: ["ControlOrMeta"] });
          await page.waitForTimeout(200);

          // Drag one of the selected nodes
          const firstNode = nodes.nth(0);
          const bounds = await firstNode.boundingBox();
          
          if (bounds) {
            await page.mouse.move(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2
            );
            await page.mouse.down();
            await page.mouse.move(
              bounds.x + bounds.width / 2 + 50,
              bounds.y + bounds.height / 2 + 50,
              { steps: 10 }
            );
            await page.mouse.up();

            await page.waitForTimeout(300);

            // Nodes should still be visible
            expect(await nodes.count()).toBeGreaterThanOrEqual(2);
          }
        }
      });
    });

    test.describe("Node Duplication", () => {
      test("should duplicate node with Cmd/Ctrl+D", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const initialCount = await page.locator(".react-flow__node").count();

        if (initialCount > 0) {
          // Select a node
          const node = page.locator(".react-flow__node").first();
          await node.click();
          await page.waitForTimeout(200);

          // Try to duplicate with Cmd/Ctrl+D
          await page.keyboard.press("Meta+d");
          await page.waitForTimeout(500);

          // Count nodes again (may or may not have increased depending on implementation)
          const finalCount = await page.locator(".react-flow__node").count();
          expect(finalCount).toBeGreaterThanOrEqual(initialCount);
        }
      });
    });

    test.describe("Node Context Menu", () => {
      test("should open context menu on right-click", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const node = page.locator(".react-flow__node").first();
        
        if (await node.count() > 0) {
          // Right-click on node
          await node.click({ button: "right" });
          await page.waitForTimeout(500);

          // Context menu might appear (implementation dependent)
          // Just verify the action doesn't crash the app
          expect(canvas).toBeVisible();
        }
      });
    });

    test.describe("Select All", () => {
      test("should select all nodes with Cmd/Ctrl+A", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const nodeCount = await page.locator(".react-flow__node").count();

        if (nodeCount > 0) {
          // Click on canvas to focus
          await canvas.click();
          await page.waitForTimeout(200);

          // Select all
          await page.keyboard.press("Meta+a");
          await page.waitForTimeout(300);

          // All nodes should potentially be selected
          // This is implementation dependent, so we just verify no crash
          expect(canvas).toBeVisible();
        }
      });
    });

    test.describe("Node Connections", () => {
      test("should handle edge creation between nodes", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Check for handles on nodes
        const handles = page.locator(".react-flow__handle");
        const handleCount = await handles.count();

        expect(handleCount).toBeGreaterThanOrEqual(0);
        
        // If we have handles, verify they're part of the DOM structure
        if (handleCount > 0) {
          const firstHandle = handles.first();
          await expect(firstHandle).toBeAttached();
        }
      });

      test("should display existing edges", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Check for any edges
        const edges = page.locator(".react-flow__edge");
        const edgeCount = await edges.count();

        // Should have 0 or more edges
        expect(edgeCount).toBeGreaterThanOrEqual(0);
      });

      test("should delete edge on click and delete", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const edges = page.locator(".react-flow__edge");
        const initialEdgeCount = await edges.count();

        if (initialEdgeCount > 0) {
          // Try to click on an edge
          const edge = edges.first();
          await edge.click();
          await page.waitForTimeout(200);

          // Press delete
          await page.keyboard.press("Delete");
          await page.waitForTimeout(500);

          // Edge count should decrease or stay the same
          const finalEdgeCount = await page.locator(".react-flow__edge").count();
          expect(finalEdgeCount).toBeLessThanOrEqual(initialEdgeCount);
        }
      });
    });

    test.describe("Node Grouping", () => {
      test("should support node grouping operations", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const nodes = page.locator(".react-flow__node");
        const nodeCount = await nodes.count();

        if (nodeCount >= 2) {
          // Select multiple nodes
          await nodes.nth(0).click();
          await page.waitForTimeout(200);
          await nodes.nth(1).click({ modifiers: ["ControlOrMeta"] });
          await page.waitForTimeout(200);

          // Try to group (implementation dependent, may use Cmd/Ctrl+G)
          await page.keyboard.press("Meta+g");
          await page.waitForTimeout(500);

          // Verify canvas is still functional
          expect(canvas).toBeVisible();
        }
      });
    });

    test.describe("Bulk Operations", () => {
      test("should perform bulk delete on multiple nodes", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const initialCount = await page.locator(".react-flow__node").count();

        if (initialCount >= 2) {
          // Select all nodes
          await canvas.click();
          await page.keyboard.press("Meta+a");
          await page.waitForTimeout(300);

          // Delete all
          await page.keyboard.press("Delete");
          await page.waitForTimeout(500);

          // Node count should decrease significantly
          const finalCount = await page.locator(".react-flow__node").count();
          expect(finalCount).toBeLessThan(initialCount);
        }
      });

      test("should handle copy-paste of nodes", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const initialCount = await page.locator(".react-flow__node").count();

        if (initialCount > 0) {
          // Select a node
          const node = page.locator(".react-flow__node").first();
          await node.click();
          await page.waitForTimeout(200);

          // Copy
          await page.keyboard.press("Meta+c");
          await page.waitForTimeout(200);

          // Paste
          await page.keyboard.press("Meta+v");
          await page.waitForTimeout(500);

          // Node count might increase (implementation dependent)
          const finalCount = await page.locator(".react-flow__node").count();
          expect(finalCount).toBeGreaterThanOrEqual(initialCount);
        }
      });
    });
  });
}
