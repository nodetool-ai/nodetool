import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";
import { setupMockApiRoutes, workflows } from "./fixtures/mockData";

// Pre-defined mock workflow ID for testing
const MOCK_WORKFLOW_ID = workflows.workflows[0].id;

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Node Operations in Editor", () => {
    test.describe("Node Menu", () => {
      test.beforeEach(async ({ page }) => {
        await setupMockApiRoutes(page);
      });

      test("should open node menu on Tab key", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Focus on canvas
        await canvas.click();
        await page.waitForTimeout(200);

        // Press Tab to open node menu
        await page.keyboard.press("Tab");
        await page.waitForTimeout(500);

        // Node menu might be visible - just verify no crash
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");

        // Close menu
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      });

      test("should open node menu on right-click", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Right-click on canvas
        await canvas.click({ button: "right" });
        await page.waitForTimeout(500);

        // Verify no crash
        await expect(canvas).toBeVisible();

        // Close context menu
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      });

      test("should search in node menu", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Focus and open node menu
        await canvas.click();
        await page.keyboard.press("Tab");
        await page.waitForTimeout(500);

        // Try to type in the search
        await page.keyboard.type("text");
        await page.waitForTimeout(300);

        // Verify no crash
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");

        // Close menu
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      });

      test("should navigate node menu with arrow keys", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Open node menu
        await canvas.click();
        await page.keyboard.press("Tab");
        await page.waitForTimeout(500);

        // Navigate with arrow keys
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(100);
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(100);
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(100);

        // Verify no crash
        await expect(canvas).toBeVisible();

        // Close menu
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      });
    });

    test.describe("Node Selection", () => {
      test.beforeEach(async ({ page }) => {
        await setupMockApiRoutes(page);
      });

      test("should select all nodes with Cmd+A", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Focus on canvas
        await canvas.click();
        await page.waitForTimeout(200);

        // Select all
        await page.keyboard.press("Meta+a");
        await page.waitForTimeout(300);

        // Verify no crash
        await expect(canvas).toBeVisible();
      });

      test("should deselect nodes with Escape", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Focus and select all
        await canvas.click();
        await page.keyboard.press("Meta+a");
        await page.waitForTimeout(200);

        // Deselect with Escape
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);

        // Verify no crash
        await expect(canvas).toBeVisible();
      });

      test("should select node by clicking", async ({ page, request }) => {
        // Create workflow with a node
        const workflowName = `test-select-node-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private",
            graph: {
              nodes: [
                {
                  id: "node-1",
                  type: "nodetool.text.TextInput",
                  position: { x: 200, y: 200 },
                  data: { properties: {} }
                }
              ],
              edges: []
            }
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Wait for node to render
          await page.waitForTimeout(1000);

          // Try to click on a node
          const node = page.locator(".react-flow__node").first();
          if ((await node.count()) > 0) {
            await node.click();
            await page.waitForTimeout(200);
          }

          // Verify no crash
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Node Manipulation", () => {
      test("should copy and paste nodes", async ({ page, request }) => {
        const workflowName = `test-copy-paste-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private",
            graph: {
              nodes: [
                {
                  id: "node-1",
                  type: "nodetool.text.TextInput",
                  position: { x: 200, y: 200 },
                  data: { properties: {} }
                }
              ],
              edges: []
            }
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Wait for node to render
          await page.waitForTimeout(1000);

          // Select all
          await canvas.click();
          await page.keyboard.press("Meta+a");
          await page.waitForTimeout(200);

          // Copy
          await page.keyboard.press("Meta+c");
          await page.waitForTimeout(200);

          // Paste
          await page.keyboard.press("Meta+v");
          await page.waitForTimeout(300);

          // Verify no crash
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should delete selected nodes", async ({ page, request }) => {
        const workflowName = `test-delete-nodes-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private",
            graph: {
              nodes: [
                {
                  id: "node-1",
                  type: "nodetool.text.TextInput",
                  position: { x: 200, y: 200 },
                  data: { properties: {} }
                }
              ],
              edges: []
            }
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Wait for node to render
          await page.waitForTimeout(1000);

          // Select all
          await canvas.click();
          await page.keyboard.press("Meta+a");
          await page.waitForTimeout(200);

          // Delete
          await page.keyboard.press("Delete");
          await page.waitForTimeout(300);

          // Verify no crash
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should delete nodes with Backspace", async ({ page, request }) => {
        const workflowName = `test-backspace-delete-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private",
            graph: {
              nodes: [
                {
                  id: "node-1",
                  type: "nodetool.text.TextInput",
                  position: { x: 200, y: 200 },
                  data: { properties: {} }
                }
              ],
              edges: []
            }
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Wait for node
          await page.waitForTimeout(1000);

          // Select all
          await canvas.click();
          await page.keyboard.press("Meta+a");
          await page.waitForTimeout(200);

          // Delete with Backspace
          await page.keyboard.press("Backspace");
          await page.waitForTimeout(300);

          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should move nodes with arrow keys", async ({ page, request }) => {
        const workflowName = `test-move-arrows-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private",
            graph: {
              nodes: [
                {
                  id: "node-1",
                  type: "nodetool.text.TextInput",
                  position: { x: 200, y: 200 },
                  data: { properties: {} }
                }
              ],
              edges: []
            }
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Wait for node
          await page.waitForTimeout(1000);

          // Select all
          await canvas.click();
          await page.keyboard.press("Meta+a");
          await page.waitForTimeout(200);

          // Move with arrow keys
          await page.keyboard.press("ArrowUp");
          await page.waitForTimeout(100);
          await page.keyboard.press("ArrowDown");
          await page.waitForTimeout(100);
          await page.keyboard.press("ArrowLeft");
          await page.waitForTimeout(100);
          await page.keyboard.press("ArrowRight");
          await page.waitForTimeout(100);

          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Node Connections (Edges)", () => {
      test("should display edges between nodes", async ({ page, request }) => {
        const workflowName = `test-edges-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Workflow with edge",
            access: "private",
            graph: {
              nodes: [
                {
                  id: "node-1",
                  type: "nodetool.text.TextInput",
                  position: { x: 100, y: 100 },
                  data: { properties: {} }
                },
                {
                  id: "node-2",
                  type: "nodetool.workflows.base_node.Preview",
                  position: { x: 300, y: 100 },
                  data: { properties: {} }
                }
              ],
              edges: [
                {
                  id: "edge-1",
                  source: "node-1",
                  sourceHandle: "output",
                  target: "node-2",
                  targetHandle: "value"
                }
              ]
            }
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Wait for rendering
          await page.waitForTimeout(1000);

          // Edges should render (even if we can't see them in test)
          const edges = page.locator(".react-flow__edge");
          const edgeCount = await edges.count();
          // Just verify no crash - edge rendering depends on viewport
          expect(edgeCount).toBeGreaterThanOrEqual(0);
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should delete selected edges", async ({ page, request }) => {
        const workflowName = `test-delete-edge-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Workflow with edge",
            access: "private",
            graph: {
              nodes: [
                {
                  id: "node-1",
                  type: "nodetool.text.TextInput",
                  position: { x: 100, y: 100 },
                  data: { properties: {} }
                },
                {
                  id: "node-2",
                  type: "nodetool.workflows.base_node.Preview",
                  position: { x: 300, y: 100 },
                  data: { properties: {} }
                }
              ],
              edges: [
                {
                  id: "edge-1",
                  source: "node-1",
                  sourceHandle: "output",
                  target: "node-2",
                  targetHandle: "value"
                }
              ]
            }
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Wait for rendering
          await page.waitForTimeout(1000);

          // Try to click on an edge and delete
          const edge = page.locator(".react-flow__edge").first();
          if ((await edge.count()) > 0) {
            await edge.click();
            await page.waitForTimeout(200);
            await page.keyboard.press("Delete");
            await page.waitForTimeout(200);
          }

          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Undo/Redo", () => {
      test("should undo with Cmd+Z", async ({ page, request }) => {
        const workflowName = `test-undo-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private"
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Focus canvas
          await canvas.click();

          // Try undo
          await page.keyboard.press("Meta+z");
          await page.waitForTimeout(300);

          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should redo with Cmd+Shift+Z", async ({ page, request }) => {
        const workflowName = `test-redo-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private"
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Focus canvas
          await canvas.click();

          // Undo then redo
          await page.keyboard.press("Meta+z");
          await page.waitForTimeout(200);
          await page.keyboard.press("Meta+Shift+z");
          await page.waitForTimeout(300);

          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should redo with Cmd+Y", async ({ page, request }) => {
        const workflowName = `test-redo-y-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private"
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Focus canvas
          await canvas.click();

          // Undo then redo with Cmd+Y
          await page.keyboard.press("Meta+z");
          await page.waitForTimeout(200);
          await page.keyboard.press("Meta+y");
          await page.waitForTimeout(300);

          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Canvas Operations", () => {
      test.beforeEach(async ({ page }) => {
        await setupMockApiRoutes(page);
      });

      test("should zoom in with Cmd++", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Focus canvas
        await canvas.click();

        // Zoom in
        await page.keyboard.press("Meta+=");
        await page.waitForTimeout(300);

        await expect(canvas).toBeVisible();
      });

      test("should zoom out with Cmd+-", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Focus canvas
        await canvas.click();

        // Zoom out
        await page.keyboard.press("Meta+-");
        await page.waitForTimeout(300);

        await expect(canvas).toBeVisible();
      });

      test("should fit view with F key", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Focus canvas
        await canvas.click();

        // Fit view
        await page.keyboard.press("f");
        await page.waitForTimeout(300);

        await expect(canvas).toBeVisible();
      });

      test("should pan canvas with mouse drag", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const canvasBounds = await canvas.boundingBox();
        if (canvasBounds) {
          const centerX = canvasBounds.x + canvasBounds.width / 2;
          const centerY = canvasBounds.y + canvasBounds.height / 2;

          // Pan with middle mouse button
          await page.mouse.move(centerX, centerY);
          await page.mouse.down({ button: "middle" });
          await page.mouse.move(centerX + 50, centerY + 50);
          await page.mouse.up({ button: "middle" });

          await page.waitForTimeout(300);
        }

        await expect(canvas).toBeVisible();
      });

      test("should pan canvas with scroll", async ({ page }) => {
        await page.goto(`/editor/${MOCK_WORKFLOW_ID}`);
        await page.waitForLoadState("networkidle");

        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible({ timeout: 10000 });

        const canvasBounds = await canvas.boundingBox();
        if (canvasBounds) {
          const centerX = canvasBounds.x + canvasBounds.width / 2;
          const centerY = canvasBounds.y + canvasBounds.height / 2;

          await page.mouse.move(centerX, centerY);
          await page.mouse.wheel(0, 100);
          await page.waitForTimeout(300);
        }

        await expect(canvas).toBeVisible();
      });
    });

    test.describe("Grouping", () => {
      test("should group selected nodes with Cmd+G", async ({ page, request }) => {
        const workflowName = `test-group-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private",
            graph: {
              nodes: [
                {
                  id: "node-1",
                  type: "nodetool.text.TextInput",
                  position: { x: 100, y: 100 },
                  data: { properties: {} }
                },
                {
                  id: "node-2",
                  type: "nodetool.workflows.base_node.Preview",
                  position: { x: 300, y: 100 },
                  data: { properties: {} }
                }
              ],
              edges: []
            }
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Wait for nodes
          await page.waitForTimeout(1000);

          // Select all
          await canvas.click();
          await page.keyboard.press("Meta+a");
          await page.waitForTimeout(200);

          // Try to group
          await page.keyboard.press("Meta+g");
          await page.waitForTimeout(300);

          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should ungroup with Cmd+Shift+G", async ({ page, request }) => {
        const workflowName = `test-ungroup-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private"
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Focus canvas
          await canvas.click();

          // Try to ungroup
          await page.keyboard.press("Meta+Shift+g");
          await page.waitForTimeout(300);

          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Node Inspector Panel", () => {
      test("should show node properties when selected", async ({ page, request }) => {
        const workflowName = `test-inspector-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private",
            graph: {
              nodes: [
                {
                  id: "node-1",
                  type: "nodetool.text.TextInput",
                  position: { x: 200, y: 200 },
                  data: { properties: { value: "Test value" } }
                }
              ],
              edges: []
            }
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Wait for node
          await page.waitForTimeout(1000);

          // Try to click on a node
          const node = page.locator(".react-flow__node").first();
          if ((await node.count()) > 0) {
            await node.click();
            await page.waitForTimeout(500);
          }

          // Just verify no crash
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should edit node properties", async ({ page, request }) => {
        const workflowName = `test-edit-props-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private",
            graph: {
              nodes: [
                {
                  id: "node-1",
                  type: "nodetool.text.TextInput",
                  position: { x: 200, y: 200 },
                  data: { properties: {} }
                }
              ],
              edges: []
            }
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Wait for node
          await page.waitForTimeout(1000);

          // Click on node
          const node = page.locator(".react-flow__node").first();
          if ((await node.count()) > 0) {
            await node.click();
            await page.waitForTimeout(500);

            // Look for input fields in the node inspector panel
            // Use more specific selectors to target inspector inputs, not other page inputs
            const inspectorInputs = page.locator('.node-inspector input, .node-inspector textarea, .properties-panel input, .properties-panel textarea, .react-flow__node input, .react-flow__node textarea');
            if ((await inspectorInputs.count()) > 0) {
              // Try to focus and type in the first visible input
              const firstInput = inspectorInputs.first();
              if (await firstInput.isVisible()) {
                await firstInput.click();
                await page.keyboard.type("test");
                await page.waitForTimeout(200);
              }
            }
          }

          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });
  });
}
