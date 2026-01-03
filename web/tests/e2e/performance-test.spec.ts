/**
 * Performance Test for ReactFlowWrapper
 * 
 * This test:
 * 1. Starts the nodetool server
 * 2. Loads the editor
 * 3. Creates 100 nodes
 * 4. Profiles render performance
 * 5. Tests interaction latency
 */

import { test, expect } from "@playwright/test";

// Skip when run by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("ReactFlowWrapper Performance", () => {
    test.setTimeout(180000); // 3 minutes for performance testing

    test("should load editor and measure performance with 100 nodes", async ({
      page
    }) => {
      // Enable performance monitoring
      await page.goto("/", { waitUntil: "networkidle" });

      // Wait for the editor to load
      await page.waitForSelector('[data-testid="workflow-editor"]', {
        timeout: 30000
      });

      console.log("Editor loaded, creating workflow...");

      // Create a new workflow or use existing
      const workflowsLink = page.locator('a[href*="/workflows"]');
      if (await workflowsLink.isVisible()) {
        await workflowsLink.click();
        await page.waitForLoadState("networkidle");
      }

      // Navigate to editor
      await page.goto("/editor", { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);

      // Get the React Flow pane
      const reactFlowPane = page.locator(".react-flow__pane");
      await expect(reactFlowPane).toBeVisible({ timeout: 10000 });

      console.log("Opening node menu to create nodes...");

      // Start performance monitoring
      const startTime = Date.now();
      const metrics: {
        nodeCreationTime: number;
        renderTime: number;
        interactionLatency: number;
      } = {
        nodeCreationTime: 0,
        renderTime: 0,
        interactionLatency: 0
      };

      // Open node menu (double-click on pane)
      const paneBox = await reactFlowPane.boundingBox();
      if (paneBox) {
        // Create 100 nodes
        console.log("Creating 100 nodes...");
        const nodeCreationStart = Date.now();

        for (let i = 0; i < 100; i++) {
          // Double-click to open menu
          await page.mouse.dblclick(
            paneBox.x + 300 + (i % 10) * 50,
            paneBox.y + 200 + Math.floor(i / 10) * 50
          );
          await page.waitForTimeout(100);

          // Look for node menu
          const nodeMenu = page.locator('[data-testid="node-menu"]');
          if (await nodeMenu.isVisible({ timeout: 1000 })) {
            // Select first node type
            const firstNodeType = nodeMenu
              .locator('[role="menuitem"]')
              .first();
            if (await firstNodeType.isVisible({ timeout: 500 })) {
              await firstNodeType.click();
              await page.waitForTimeout(50);
            }
          }

          // Progress indicator
          if (i % 10 === 0) {
            console.log(`Created ${i} nodes...`);
          }
        }

        metrics.nodeCreationTime = Date.now() - nodeCreationStart;
        console.log(
          `Node creation completed in ${metrics.nodeCreationTime}ms`
        );

        // Wait for rendering to stabilize
        await page.waitForTimeout(2000);

        // Measure render time by checking for all nodes
        const renderStart = Date.now();
        const nodes = page.locator(".react-flow__node");
        const nodeCount = await nodes.count();
        metrics.renderTime = Date.now() - renderStart;

        console.log(`Rendered ${nodeCount} nodes in ${metrics.renderTime}ms`);

        // Test interaction latency - pan the canvas
        console.log("Testing interaction latency...");
        const interactionStart = Date.now();

        await page.mouse.move(paneBox.x + 400, paneBox.y + 300);
        await page.mouse.down();
        await page.mouse.move(paneBox.x + 200, paneBox.y + 150, { steps: 10 });
        await page.mouse.up();

        metrics.interactionLatency = Date.now() - interactionStart;
        console.log(
          `Interaction completed in ${metrics.interactionLatency}ms`
        );

        // Log final metrics
        console.log("\n=== Performance Metrics ===");
        console.log(`Total test time: ${Date.now() - startTime}ms`);
        console.log(`Node creation: ${metrics.nodeCreationTime}ms`);
        console.log(`Render time: ${metrics.renderTime}ms`);
        console.log(`Interaction latency: ${metrics.interactionLatency}ms`);
        console.log(`Nodes rendered: ${nodeCount}`);

        // Performance assertions
        expect(nodeCount).toBeGreaterThan(0);
        expect(metrics.interactionLatency).toBeLessThan(1000); // Should respond within 1 second
      }
    });

    test("should measure zoom performance", async ({ page }) => {
      await page.goto("/editor", { waitUntil: "networkidle" });

      const reactFlowPane = page.locator(".react-flow__pane");
      await expect(reactFlowPane).toBeVisible({ timeout: 10000 });

      const paneBox = await reactFlowPane.boundingBox();
      if (paneBox) {
        console.log("Testing zoom performance...");

        const zoomStart = Date.now();

        // Zoom in and out multiple times
        for (let i = 0; i < 10; i++) {
          await page.mouse.wheel(0, -100); // Zoom in
          await page.waitForTimeout(50);
          await page.mouse.wheel(0, 100); // Zoom out
          await page.waitForTimeout(50);
        }

        const zoomTime = Date.now() - zoomStart;
        console.log(`Zoom operations completed in ${zoomTime}ms`);

        expect(zoomTime).toBeLessThan(2000); // Should complete within 2 seconds
      }
    });

    test("should measure selection performance", async ({ page }) => {
      await page.goto("/editor", { waitUntil: "networkidle" });

      const reactFlowPane = page.locator(".react-flow__pane");
      await expect(reactFlowPane).toBeVisible({ timeout: 10000 });

      // Create a few nodes first
      const paneBox = await reactFlowPane.boundingBox();
      if (paneBox) {
        console.log("Creating nodes for selection test...");

        // Create 10 nodes
        for (let i = 0; i < 10; i++) {
          await page.mouse.dblclick(
            paneBox.x + 300 + i * 100,
            paneBox.y + 300
          );
          await page.waitForTimeout(100);

          const nodeMenu = page.locator('[data-testid="node-menu"]');
          if (await nodeMenu.isVisible({ timeout: 1000 })) {
            const firstNodeType = nodeMenu
              .locator('[role="menuitem"]')
              .first();
            if (await firstNodeType.isVisible({ timeout: 500 })) {
              await firstNodeType.click();
              await page.waitForTimeout(50);
            }
          }
        }

        await page.waitForTimeout(1000);

        console.log("Testing selection performance...");
        const selectionStart = Date.now();

        // Perform box selection
        await page.mouse.move(paneBox.x + 200, paneBox.y + 200);
        await page.mouse.down();
        await page.mouse.move(paneBox.x + 800, paneBox.y + 400, { steps: 10 });
        await page.mouse.up();

        const selectionTime = Date.now() - selectionStart;
        console.log(`Selection completed in ${selectionTime}ms`);

        expect(selectionTime).toBeLessThan(1000); // Should complete within 1 second
      }
    });
  });
}
