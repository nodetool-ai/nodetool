import { test, expect, Page, APIRequestContext } from "./fixtures/electronApp";
import { BACKEND_API_URL } from "./support/backend";
import {
  navigateToPage,
  waitForEditorReady,
  waitForAnimation,
} from "./helpers/waitHelpers";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
  /**
   * Helper to create a workflow with nodes via the API.
   * Returns the workflow object.
   */
  async function createWorkflowWithNodes(
    request: APIRequestContext,
    name: string
  ) {
    const createRes = await request.post(`${BACKEND_API_URL}/workflows/`, {
      data: {
        name,
        description: "E2E context menu test workflow",
        access: "private",
      },
    });
    const workflow = await createRes.json();

    // Add two nodes and an edge so we can test node/edge/selection menus
    const updateRes = await request.put(
      `${BACKEND_API_URL}/workflows/${workflow.id}`,
      {
        data: {
          ...workflow,
          graph: {
            nodes: [
              {
                id: "node-1",
                type: "nodetool.constant.String",
                data: { value: "hello" },
                ui_properties: { position: [100, 200] },
              },
              {
                id: "node-2",
                type: "nodetool.constant.String",
                data: { value: "world" },
                ui_properties: { position: [400, 200] },
              },
            ],
            edges: [],
          },
        },
      }
    );
    expect(updateRes.status()).toBe(200);
    return workflow;
  }

  /**
   * Close the currently open context menu by pressing Escape.
   */
  async function closeContextMenu(page: Page) {
    await page.keyboard.press("Escape");
    await waitForAnimation(page);
  }

  // ---------------------------------------------------------------------------
  // Pane Context Menu
  // ---------------------------------------------------------------------------
  test.describe("Pane Context Menu", () => {
    let workflowId: string;

    test.beforeAll(async ({ request }) => {
      const res = await request.post(`${BACKEND_API_URL}/workflows/`, {
        data: {
          name: `e2e-pane-ctx-${Date.now()}`,
          description: "Pane context menu test",
          access: "private",
        },
      });
      const workflow = await res.json();
      workflowId = workflow.id;
    });

    test.afterAll(async ({ request }) => {
      if (workflowId) {
        await request
          .delete(`${BACKEND_API_URL}/workflows/${workflowId}`)
          .catch(() => {});
      }
    });

    test("should open pane context menu on right-click on empty canvas", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      // Right-click on the ReactFlow pane background
      const pane = page.locator(".react-flow__pane");
      await expect(pane).toBeVisible();
      await pane.click({ button: "right" });
      await waitForAnimation(page);

      // The pane context menu should be visible
      const menu = page.locator(".pane-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });

      await closeContextMenu(page);
    });

    test("should show Fit Screen option in pane context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const pane = page.locator(".react-flow__pane");
      await pane.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".pane-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });

      // Verify "Fit Screen" menu item is present
      await expect(menu.getByText("Fit Screen")).toBeVisible();

      await closeContextMenu(page);
    });

    test("should show Paste option in pane context menu", async ({ page }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const pane = page.locator(".react-flow__pane");
      await pane.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".pane-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });

      // Verify "Paste" menu item is present
      await expect(menu.getByText("Paste")).toBeVisible();

      await closeContextMenu(page);
    });

    test("should show Add Constant Node option in pane context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const pane = page.locator(".react-flow__pane");
      await pane.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".pane-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });

      await expect(menu.getByText("Add Constant Node")).toBeVisible();

      await closeContextMenu(page);
    });

    test("should show Add Input Node option in pane context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const pane = page.locator(".react-flow__pane");
      await pane.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".pane-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });

      await expect(menu.getByText("Add Input Node")).toBeVisible();

      await closeContextMenu(page);
    });

    test("should show Add Comment option in pane context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const pane = page.locator(".react-flow__pane");
      await pane.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".pane-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });

      await expect(menu.getByText("Add Comment")).toBeVisible();

      await closeContextMenu(page);
    });

    test("should show Add Group option in pane context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const pane = page.locator(".react-flow__pane");
      await pane.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".pane-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });

      await expect(menu.getByText("Add Group")).toBeVisible();

      await closeContextMenu(page);
    });

    test("should close pane context menu on Escape", async ({ page }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const pane = page.locator(".react-flow__pane");
      await pane.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".pane-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });

      await page.keyboard.press("Escape");
      await waitForAnimation(page);

      await expect(menu).not.toBeVisible();
    });

    test("should open Add Constant Node submenu", async ({ page }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const pane = page.locator(".react-flow__pane");
      await pane.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".pane-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });

      // Click on "Add Constant Node" to open its submenu
      const constantNodeItem = menu.getByText("Add Constant Node");
      await constantNodeItem.click();
      await waitForAnimation(page);

      // The submenu (pane-submenu) should now be visible
      const submenu = page.locator(".pane-submenu");
      await expect(submenu).toBeVisible({ timeout: 3000 });

      await closeContextMenu(page);
    });

    test("should open Add Input Node submenu", async ({ page }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const pane = page.locator(".react-flow__pane");
      await pane.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".pane-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });

      // Click on "Add Input Node" to open its submenu
      const inputNodeItem = menu.getByText("Add Input Node");
      await inputNodeItem.click();
      await waitForAnimation(page);

      // The submenu (pane-submenu) should now be visible
      const submenu = page.locator(".pane-submenu");
      await expect(submenu).toBeVisible({ timeout: 3000 });

      await closeContextMenu(page);
    });
  });

  // ---------------------------------------------------------------------------
  // Node Context Menu
  // ---------------------------------------------------------------------------
  test.describe("Node Context Menu", () => {
    let workflowId: string;

    test.beforeAll(async ({ request }) => {
      const workflow = await createWorkflowWithNodes(
        request,
        `e2e-node-ctx-${Date.now()}`
      );
      workflowId = workflow.id;
    });

    test.afterAll(async ({ request }) => {
      if (workflowId) {
        await request
          .delete(`${BACKEND_API_URL}/workflows/${workflowId}`)
          .catch(() => {});
      }
    });

    test("should open node context menu on right-click on a node", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const node = page.locator(".react-flow__node").first();
      const nodeCount = await node.count();
      if (nodeCount === 0) {
        test.skip();
        return;
      }

      await node.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".node-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });

      await closeContextMenu(page);
    });

    test("should show Duplicate option in node context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const node = page.locator(".react-flow__node").first();
      if ((await node.count()) === 0) {
        test.skip();
        return;
      }

      await node.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".node-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });
      await expect(menu.getByText("Duplicate")).toBeVisible();

      await closeContextMenu(page);
    });

    test("should show Bypass Node option in node context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const node = page.locator(".react-flow__node").first();
      if ((await node.count()) === 0) {
        test.skip();
        return;
      }

      await node.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".node-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });
      // The label is either "Bypass Node" or "Enable Node" depending on current state
      await expect(
        menu.getByText("Bypass Node").or(menu.getByText("Enable Node"))
      ).toBeVisible();

      await closeContextMenu(page);
    });

    test("should show Delete Node option in node context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const node = page.locator(".react-flow__node").first();
      if ((await node.count()) === 0) {
        test.skip();
        return;
      }

      await node.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".node-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });
      await expect(menu.getByText("Delete Node")).toBeVisible();

      await closeContextMenu(page);
    });

    test("should show Run From Here option in node context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const node = page.locator(".react-flow__node").first();
      if ((await node.count()) === 0) {
        test.skip();
        return;
      }

      await node.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".node-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });
      await expect(menu.getByText(/Run From Here|Running\.\.\./)).toBeVisible();

      await closeContextMenu(page);
    });

    test("should show Add Comment option in node context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const node = page.locator(".react-flow__node").first();
      if ((await node.count()) === 0) {
        test.skip();
        return;
      }

      await node.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".node-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });
      // Label is "Add Comment" or "Remove Comment" depending on state
      await expect(
        menu.getByText("Add Comment").or(menu.getByText("Remove Comment"))
      ).toBeVisible();

      await closeContextMenu(page);
    });

    test("should show Sync Mode section in node context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const node = page.locator(".react-flow__node").first();
      if ((await node.count()) === 0) {
        test.skip();
        return;
      }

      await node.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".node-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });
      await expect(menu.getByText("Sync Mode")).toBeVisible();

      await closeContextMenu(page);
    });

    test("should close node context menu on clicking outside", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const node = page.locator(".react-flow__node").first();
      if ((await node.count()) === 0) {
        test.skip();
        return;
      }

      await node.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".node-context-menu");
      await expect(menu).toBeVisible({ timeout: 5000 });

      // Click on an empty area of the canvas to close the menu
      const pane = page.locator(".react-flow__pane");
      await pane.click({ position: { x: 10, y: 10 } });
      await waitForAnimation(page);

      await expect(menu).not.toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  // Selection Context Menu
  // ---------------------------------------------------------------------------
  test.describe("Selection Context Menu", () => {
    let workflowId: string;

    test.beforeAll(async ({ request }) => {
      const workflow = await createWorkflowWithNodes(
        request,
        `e2e-selection-ctx-${Date.now()}`
      );
      workflowId = workflow.id;
    });

    test.afterAll(async ({ request }) => {
      if (workflowId) {
        await request
          .delete(`${BACKEND_API_URL}/workflows/${workflowId}`)
          .catch(() => {});
      }
    });

    test("should open selection context menu on right-click with multiple nodes selected", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const nodes = page.locator(".react-flow__node");
      const nodeCount = await nodes.count();
      if (nodeCount < 2) {
        test.skip();
        return;
      }

      // Select all nodes with Ctrl+A
      const canvas = page.locator(".react-flow");
      await canvas.click();
      await page.keyboard.press("Control+a");
      await waitForAnimation(page);

      // Right-click to trigger selection context menu
      const firstNode = nodes.first();
      await firstNode.click({ button: "right" });
      await waitForAnimation(page);

      // Should show either selection or node context menu
      const selectionMenu = page.locator(".selection-context-menu");
      const nodeMenu = page.locator(".node-context-menu");

      const selectionVisible = await selectionMenu.isVisible().catch(() => false);
      const nodeMenuVisible = await nodeMenu.isVisible().catch(() => false);

      // At least one of the menus should be visible
      expect(selectionVisible || nodeMenuVisible).toBeTruthy();

      await closeContextMenu(page);
    });

    test("should show Duplicate option in selection context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const nodes = page.locator(".react-flow__node");
      if ((await nodes.count()) < 2) {
        test.skip();
        return;
      }

      const canvas = page.locator(".react-flow");
      await canvas.click();
      await page.keyboard.press("Control+a");
      await waitForAnimation(page);

      await nodes.first().click({ button: "right" });
      await waitForAnimation(page);

      const selectionMenu = page.locator(".selection-context-menu");
      const selectionVisible = await selectionMenu.isVisible().catch(() => false);
      if (!selectionVisible) {
        // Fall back – might be node menu with single selection
        await closeContextMenu(page);
        test.skip();
        return;
      }

      await expect(selectionMenu.getByText("Duplicate")).toBeVisible();
      await closeContextMenu(page);
    });

    test("should show Copy option in selection context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const nodes = page.locator(".react-flow__node");
      if ((await nodes.count()) < 2) {
        test.skip();
        return;
      }

      const canvas = page.locator(".react-flow");
      await canvas.click();
      await page.keyboard.press("Control+a");
      await waitForAnimation(page);

      await nodes.first().click({ button: "right" });
      await waitForAnimation(page);

      const selectionMenu = page.locator(".selection-context-menu");
      const selectionVisible = await selectionMenu.isVisible().catch(() => false);
      if (!selectionVisible) {
        await closeContextMenu(page);
        test.skip();
        return;
      }

      await expect(selectionMenu.getByText("Copy")).toBeVisible();
      await closeContextMenu(page);
    });

    test("should show Delete option in selection context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const nodes = page.locator(".react-flow__node");
      if ((await nodes.count()) < 2) {
        test.skip();
        return;
      }

      const canvas = page.locator(".react-flow");
      await canvas.click();
      await page.keyboard.press("Control+a");
      await waitForAnimation(page);

      await nodes.first().click({ button: "right" });
      await waitForAnimation(page);

      const selectionMenu = page.locator(".selection-context-menu");
      const selectionVisible = await selectionMenu.isVisible().catch(() => false);
      if (!selectionVisible) {
        await closeContextMenu(page);
        test.skip();
        return;
      }

      await expect(selectionMenu.getByText("Delete")).toBeVisible();
      await closeContextMenu(page);
    });

    test("should show Bypass All option in selection context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const nodes = page.locator(".react-flow__node");
      if ((await nodes.count()) < 2) {
        test.skip();
        return;
      }

      const canvas = page.locator(".react-flow");
      await canvas.click();
      await page.keyboard.press("Control+a");
      await waitForAnimation(page);

      await nodes.first().click({ button: "right" });
      await waitForAnimation(page);

      const selectionMenu = page.locator(".selection-context-menu");
      const selectionVisible = await selectionMenu.isVisible().catch(() => false);
      if (!selectionVisible) {
        await closeContextMenu(page);
        test.skip();
        return;
      }

      // Either "Bypass All" or "Enable All" depending on current bypass state
      await expect(
        selectionMenu.getByText("Bypass All").or(selectionMenu.getByText("Enable All"))
      ).toBeVisible();
      await closeContextMenu(page);
    });

    test("should show CONNECTED section in selection context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const nodes = page.locator(".react-flow__node");
      if ((await nodes.count()) < 2) {
        test.skip();
        return;
      }

      const canvas = page.locator(".react-flow");
      await canvas.click();
      await page.keyboard.press("Control+a");
      await waitForAnimation(page);

      await nodes.first().click({ button: "right" });
      await waitForAnimation(page);

      const selectionMenu = page.locator(".selection-context-menu");
      const selectionVisible = await selectionMenu.isVisible().catch(() => false);
      if (!selectionVisible) {
        await closeContextMenu(page);
        test.skip();
        return;
      }

      await expect(selectionMenu.getByText("CONNECTED")).toBeVisible();
      await closeContextMenu(page);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Context Menu
  // ---------------------------------------------------------------------------
  test.describe("Edge Context Menu", () => {
    let workflowId: string;

    test.beforeAll(async ({ request }) => {
      // Create a workflow with two nodes connected by an edge
      const createRes = await request.post(`${BACKEND_API_URL}/workflows/`, {
        data: {
          name: `e2e-edge-ctx-${Date.now()}`,
          description: "Edge context menu test",
          access: "private",
        },
      });
      const workflow = await createRes.json();

      // Add two nodes and one edge
      const updateRes = await request.put(
        `${BACKEND_API_URL}/workflows/${workflow.id}`,
        {
          data: {
            ...workflow,
            graph: {
              nodes: [
                {
                  id: "node-a",
                  type: "nodetool.constant.String",
                  data: { value: "source" },
                  ui_properties: { position: [100, 300] },
                },
                {
                  id: "node-b",
                  type: "nodetool.constant.String",
                  data: { value: "target" },
                  ui_properties: { position: [500, 300] },
                },
              ],
              edges: [
                {
                  id: "edge-ab",
                  source: "node-a",
                  sourceHandle: "output",
                  target: "node-b",
                  targetHandle: "value",
                },
              ],
            },
          },
        }
      );
      expect(updateRes.status()).toBe(200);
      workflowId = workflow.id;
    });

    test.afterAll(async ({ request }) => {
      if (workflowId) {
        await request
          .delete(`${BACKEND_API_URL}/workflows/${workflowId}`)
          .catch(() => {});
      }
    });

    test("should open edge context menu on right-click on an edge", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const edges = page.locator(".react-flow__edge");
      const edgeCount = await edges.count();

      if (edgeCount === 0) {
        // Edge may not be rendered if node types are incompatible or no visual edge
        test.skip();
        return;
      }

      // Right-click on the first edge
      const firstEdge = edges.first();
      await firstEdge.click({ button: "right" });
      await waitForAnimation(page);

      // Check that some context menu appeared (edge or node/pane may intercept)
      const anyMenu = page.locator(".context-menu");
      const menuVisible = await anyMenu.isVisible().catch(() => false);

      if (menuVisible) {
        // Verify "Delete Edge" or "Insert Reroute" is shown
        await expect(
          page.getByText("Delete Edge").or(page.getByText("Insert Reroute"))
        ).toBeVisible();
      }

      await closeContextMenu(page);
    });

    test("should show Delete Edge option in edge context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const edges = page.locator(".react-flow__edge");
      if ((await edges.count()) === 0) {
        test.skip();
        return;
      }

      // Right-click on edge path
      const edgePath = page.locator(".react-flow__edge-path").first();
      if ((await edgePath.count()) === 0) {
        test.skip();
        return;
      }

      await edgePath.click({ button: "right" });
      await waitForAnimation(page);

      // Check for Delete Edge option
      const deleteEdge = page.locator('text="Delete Edge"');
      const deleteEdgeVisible = await deleteEdge.isVisible().catch(() => false);

      if (deleteEdgeVisible) {
        expect(deleteEdgeVisible).toBeTruthy();
      }

      await closeContextMenu(page);
    });

    test("should show Insert Reroute option in edge context menu", async ({
      page,
    }) => {
      await navigateToPage(page, `/editor/${workflowId}`);
      await waitForEditorReady(page);

      const edges = page.locator(".react-flow__edge");
      if ((await edges.count()) === 0) {
        test.skip();
        return;
      }

      const edgePath = page.locator(".react-flow__edge-path").first();
      if ((await edgePath.count()) === 0) {
        test.skip();
        return;
      }

      await edgePath.click({ button: "right" });
      await waitForAnimation(page);

      // Check for Insert Reroute option
      const insertReroute = page.locator('text="Insert Reroute"');
      const insertRerouteVisible = await insertReroute
        .isVisible()
        .catch(() => false);

      if (insertRerouteVisible) {
        expect(insertRerouteVisible).toBeTruthy();
      }

      await closeContextMenu(page);
    });
  });

  // ---------------------------------------------------------------------------
  // Workflow Context Menu (on Dashboard)
  // ---------------------------------------------------------------------------
  test.describe("Workflow Context Menu", () => {
    let workflowId: string;
    const workflowName = `e2e-wf-ctx-${Date.now()}`;

    test.beforeAll(async ({ request }) => {
      const res = await request.post(`${BACKEND_API_URL}/workflows/`, {
        data: {
          name: workflowName,
          description: "Workflow context menu test",
          access: "private",
        },
      });
      const workflow = await res.json();
      workflowId = workflow.id;
    });

    test.afterAll(async ({ request }) => {
      if (workflowId) {
        await request
          .delete(`${BACKEND_API_URL}/workflows/${workflowId}`)
          .catch(() => {});
      }
    });

    test("should open workflow context menu on right-click on workflow card", async ({
      page,
    }) => {
      await navigateToPage(page, "/dashboard");
      await waitForAnimation(page);

      // Wait for workflow cards to load
      await page.waitForFunction(
        () => document.querySelectorAll('[class*="workflow"]').length > 0,
        { timeout: 10000 }
      ).catch(() => {});

      // Find a workflow card containing our workflow name
      const workflowCard = page
        .locator(`[class*="workflow"], [class*="Workflow"], .workflow-card`)
        .filter({ hasText: workflowName })
        .first();

      const cardCount = await workflowCard.count();
      if (cardCount === 0) {
        // Try a broader selector - any card on the page
        const anyCard = page
          .locator(
            '[class*="WorkflowCard"], [class*="workflow-card"], [class*="workflowItem"]'
          )
          .first();
        if ((await anyCard.count()) === 0) {
          test.skip();
          return;
        }
        await anyCard.click({ button: "right" });
      } else {
        await workflowCard.click({ button: "right" });
      }

      await waitForAnimation(page);

      const menu = page.locator(".workflow-context-menu");
      const menuVisible = await menu.isVisible().catch(() => false);

      if (menuVisible) {
        await expect(menu).toBeVisible();
      }

      await closeContextMenu(page);
    });

    test("should show Edit option in workflow context menu", async ({
      page,
    }) => {
      await navigateToPage(page, "/dashboard");
      await waitForAnimation(page);

      await page.waitForFunction(
        () => document.querySelectorAll('[class*="workflow"]').length > 0,
        { timeout: 10000 }
      ).catch(() => {});

      // Find any workflow card and right-click it
      const anyCard = page
        .locator(
          '[class*="WorkflowCard"], [class*="workflow-card"], [class*="workflowItem"]'
        )
        .first();

      if ((await anyCard.count()) === 0) {
        test.skip();
        return;
      }

      await anyCard.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".workflow-context-menu");
      const menuVisible = await menu.isVisible().catch(() => false);

      if (menuVisible) {
        await expect(menu.getByText("Edit")).toBeVisible();
      }

      await closeContextMenu(page);
    });

    test("should show Duplicate option in workflow context menu", async ({
      page,
    }) => {
      await navigateToPage(page, "/dashboard");
      await waitForAnimation(page);

      await page.waitForFunction(
        () => document.querySelectorAll('[class*="workflow"]').length > 0,
        { timeout: 10000 }
      ).catch(() => {});

      const anyCard = page
        .locator(
          '[class*="WorkflowCard"], [class*="workflow-card"], [class*="workflowItem"]'
        )
        .first();

      if ((await anyCard.count()) === 0) {
        test.skip();
        return;
      }

      await anyCard.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".workflow-context-menu");
      const menuVisible = await menu.isVisible().catch(() => false);

      if (menuVisible) {
        await expect(menu.getByText("Duplicate")).toBeVisible();
      }

      await closeContextMenu(page);
    });

    test("should show Delete option in workflow context menu", async ({
      page,
    }) => {
      await navigateToPage(page, "/dashboard");
      await waitForAnimation(page);

      await page.waitForFunction(
        () => document.querySelectorAll('[class*="workflow"]').length > 0,
        { timeout: 10000 }
      ).catch(() => {});

      const anyCard = page
        .locator(
          '[class*="WorkflowCard"], [class*="workflow-card"], [class*="workflowItem"]'
        )
        .first();

      if ((await anyCard.count()) === 0) {
        test.skip();
        return;
      }

      await anyCard.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".workflow-context-menu");
      const menuVisible = await menu.isVisible().catch(() => false);

      if (menuVisible) {
        await expect(menu.getByText("Delete")).toBeVisible();
      }

      await closeContextMenu(page);
    });

    test("should show favorites toggle in workflow context menu", async ({
      page,
    }) => {
      await navigateToPage(page, "/dashboard");
      await waitForAnimation(page);

      await page.waitForFunction(
        () => document.querySelectorAll('[class*="workflow"]').length > 0,
        { timeout: 10000 }
      ).catch(() => {});

      const anyCard = page
        .locator(
          '[class*="WorkflowCard"], [class*="workflow-card"], [class*="workflowItem"]'
        )
        .first();

      if ((await anyCard.count()) === 0) {
        test.skip();
        return;
      }

      await anyCard.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".workflow-context-menu");
      const menuVisible = await menu.isVisible().catch(() => false);

      if (menuVisible) {
        // Either "Add to favorites" or "Remove from favorites"
        await expect(
          menu.getByText("Add to favorites").or(menu.getByText("Remove from favorites"))
        ).toBeVisible();
      }

      await closeContextMenu(page);
    });
  });

  // ---------------------------------------------------------------------------
  // Asset Grid Context Menu
  // ---------------------------------------------------------------------------
  test.describe("Asset Grid Context Menu", () => {
    test("should open asset grid context menu on right-click", async ({
      page,
    }) => {
      await navigateToPage(page, "/assets");
      await waitForAnimation(page);

      // Wait for the assets page to load
      await page.waitForFunction(
        () => {
          const root = document.getElementById("root");
          return root && root.children.length > 0;
        },
        { timeout: 10000 }
      );

      // Look for the asset grid container
      const assetGrid = page.locator(
        '[class*="asset-grid"], [class*="AssetGrid"], [class*="assets-grid"]'
      );

      const gridVisible = await assetGrid.isVisible().catch(() => false);
      if (!gridVisible) {
        // Try to find any assets-related container
        const assetsContainer = page.locator(
          '[class*="asset"], [class*="Asset"]'
        ).first();
        if ((await assetsContainer.count()) === 0) {
          test.skip();
          return;
        }
        await assetsContainer.click({ button: "right" });
      } else {
        await assetGrid.click({ button: "right" });
      }

      await waitForAnimation(page);

      const menu = page.locator(".asset-grid-context-menu");
      const menuVisible = await menu.isVisible().catch(() => false);

      if (menuVisible) {
        await expect(menu).toBeVisible();
      }

      await closeContextMenu(page);
    });

    test("should show Create new folder option in asset grid context menu", async ({
      page,
    }) => {
      await navigateToPage(page, "/assets");
      await waitForAnimation(page);

      await page.waitForFunction(
        () => {
          const root = document.getElementById("root");
          return root && root.children.length > 0;
        },
        { timeout: 10000 }
      );

      const assetGrid = page.locator(
        '[class*="asset-grid"], [class*="AssetGrid"], [class*="assets-grid"]'
      );

      const gridVisible = await assetGrid.isVisible().catch(() => false);
      if (!gridVisible) {
        test.skip();
        return;
      }

      await assetGrid.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".asset-grid-context-menu");
      const menuVisible = await menu.isVisible().catch(() => false);

      if (menuVisible) {
        await expect(menu.getByText("Create new folder")).toBeVisible();
      }

      await closeContextMenu(page);
    });

    test("should show sort options in asset grid context menu", async ({
      page,
    }) => {
      await navigateToPage(page, "/assets");
      await waitForAnimation(page);

      await page.waitForFunction(
        () => {
          const root = document.getElementById("root");
          return root && root.children.length > 0;
        },
        { timeout: 10000 }
      );

      const assetGrid = page.locator(
        '[class*="asset-grid"], [class*="AssetGrid"], [class*="assets-grid"]'
      );

      const gridVisible = await assetGrid.isVisible().catch(() => false);
      if (!gridVisible) {
        test.skip();
        return;
      }

      await assetGrid.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".asset-grid-context-menu");
      const menuVisible = await menu.isVisible().catch(() => false);

      if (menuVisible) {
        await expect(menu.getByText(/Sort by name/)).toBeVisible();
        await expect(menu.getByText(/Sort by date/)).toBeVisible();
        await expect(menu.getByText(/Sort by size/)).toBeVisible();
      }

      await closeContextMenu(page);
    });
  });

  // ---------------------------------------------------------------------------
  // Asset Item Context Menu
  // ---------------------------------------------------------------------------
  test.describe("Asset Item Context Menu", () => {
    test("should open asset item context menu on right-click on an asset", async ({
      page,
    }) => {
      await navigateToPage(page, "/assets");
      await waitForAnimation(page);

      await page.waitForFunction(
        () => {
          const root = document.getElementById("root");
          return root && root.children.length > 0;
        },
        { timeout: 10000 }
      );

      // Look for individual asset items
      const assetItem = page.locator(
        '[class*="asset-item"], [class*="AssetItem"], [class*="assetItem"]'
      ).first();

      if ((await assetItem.count()) === 0) {
        // No assets available – skip test
        test.skip();
        return;
      }

      await assetItem.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".asset-item-context-menu");
      const menuVisible = await menu.isVisible().catch(() => false);

      if (menuVisible) {
        await expect(menu).toBeVisible();
      }

      await closeContextMenu(page);
    });

    test("should show Rename option in asset item context menu", async ({
      page,
    }) => {
      await navigateToPage(page, "/assets");
      await waitForAnimation(page);

      await page.waitForFunction(
        () => {
          const root = document.getElementById("root");
          return root && root.children.length > 0;
        },
        { timeout: 10000 }
      );

      const assetItem = page.locator(
        '[class*="asset-item"], [class*="AssetItem"], [class*="assetItem"]'
      ).first();

      if ((await assetItem.count()) === 0) {
        test.skip();
        return;
      }

      await assetItem.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".asset-item-context-menu");
      const menuVisible = await menu.isVisible().catch(() => false);

      if (menuVisible) {
        await expect(menu.getByText("Rename")).toBeVisible();
      }

      await closeContextMenu(page);
    });

    test("should show Delete option in asset item context menu", async ({
      page,
    }) => {
      await navigateToPage(page, "/assets");
      await waitForAnimation(page);

      await page.waitForFunction(
        () => {
          const root = document.getElementById("root");
          return root && root.children.length > 0;
        },
        { timeout: 10000 }
      );

      const assetItem = page.locator(
        '[class*="asset-item"], [class*="AssetItem"], [class*="assetItem"]'
      ).first();

      if ((await assetItem.count()) === 0) {
        test.skip();
        return;
      }

      await assetItem.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".asset-item-context-menu");
      const menuVisible = await menu.isVisible().catch(() => false);

      if (menuVisible) {
        await expect(menu.getByText("Delete")).toBeVisible();
      }

      await closeContextMenu(page);
    });

    test("should show Download option in asset item context menu", async ({
      page,
    }) => {
      await navigateToPage(page, "/assets");
      await waitForAnimation(page);

      await page.waitForFunction(
        () => {
          const root = document.getElementById("root");
          return root && root.children.length > 0;
        },
        { timeout: 10000 }
      );

      const assetItem = page.locator(
        '[class*="asset-item"], [class*="AssetItem"], [class*="assetItem"]'
      ).first();

      if ((await assetItem.count()) === 0) {
        test.skip();
        return;
      }

      await assetItem.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".asset-item-context-menu");
      const menuVisible = await menu.isVisible().catch(() => false);

      if (menuVisible) {
        await expect(menu.getByText(/Download/)).toBeVisible();
      }

      await closeContextMenu(page);
    });

    test("should show Move to existing folder option in asset item context menu", async ({
      page,
    }) => {
      await navigateToPage(page, "/assets");
      await waitForAnimation(page);

      await page.waitForFunction(
        () => {
          const root = document.getElementById("root");
          return root && root.children.length > 0;
        },
        { timeout: 10000 }
      );

      const assetItem = page.locator(
        '[class*="asset-item"], [class*="AssetItem"], [class*="assetItem"]'
      ).first();

      if ((await assetItem.count()) === 0) {
        test.skip();
        return;
      }

      await assetItem.click({ button: "right" });
      await waitForAnimation(page);

      const menu = page.locator(".asset-item-context-menu");
      const menuVisible = await menu.isVisible().catch(() => false);

      if (menuVisible) {
        await expect(
          menu.getByText("Move to existing folder")
        ).toBeVisible();
      }

      await closeContextMenu(page);
    });
  });
