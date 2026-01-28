/**
 * Advanced Performance Profiling for ReactFlowWrapper
 * 
 * This script uses Chrome DevTools Protocol to:
 * - Capture CPU profiles
 * - Measure render times
 * - Track memory usage
 * - Analyze component re-renders
 * 
 * Note: This test is skipped in CI due to resource constraints.
 */

import { test, expect, chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { playwrightDescribe } from "./testUtils";

// Skip entire describe block in CI environment
if (process.env.CI === "true") {
  playwrightDescribe.skip("ReactFlowWrapper Advanced Profiling", () => {
    test("skipped in CI", () => {
      test.skip();
    });
  });
} else {
  playwrightDescribe("ReactFlowWrapper Advanced Profiling", () => {
    test.setTimeout(300000); // 5 minutes

  test("should profile CPU and memory with 100 nodes", async () => {
    // Launch browser with profiling enabled
    const browser = await chromium.launch({
      args: [
        "--enable-precise-memory-info",
        "--enable-begin-frame-control",
        "--disable-gpu"
      ]
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // Start profiling
    const client = await context.newCDPSession(page);
    await client.send("Performance.enable");
    await client.send("Profiler.enable");
    await client.send("HeapProfiler.enable");

    console.log("Loading editor...");
    await page.goto("/editor", { waitUntil: "networkidle" });

    // Wait for ReactFlow to be ready
    await page.waitForSelector(".react-flow__pane", { timeout: 30000 });

    // Take baseline memory measurement
    const baselineMemory = await client.send("Performance.getMetrics");
    console.log(
      "Baseline Memory:",
      baselineMemory.metrics.find((m) => m.name === "JSHeapUsedSize")?.value
    );

    // Start CPU profiling
    await client.send("Profiler.start");

    // Get pane location
    const reactFlowPane = page.locator(".react-flow__pane");
    const paneBox = await reactFlowPane.boundingBox();

    if (!paneBox) {
      throw new Error("Could not find ReactFlow pane");
    }

    console.log("Creating 100 nodes...");
    const nodeCreationStart = Date.now();

    // Open node menu and create nodes via API or UI
    // For performance testing, we'll use the UI
    for (let i = 0; i < 100; i++) {
      // Calculate position in a grid layout
      const row = Math.floor(i / 10);
      const col = i % 10;
      const x = paneBox.x + 300 + col * 150;
      const y = paneBox.y + 200 + row * 150;

      // Double-click to open menu
      await page.mouse.dblclick(x, y);
      await page.waitForTimeout(50);

      // Try to find and click a node type
      const nodeMenu = page.locator('[data-testid="node-menu"]');
      if (await nodeMenu.isVisible({ timeout: 500 })) {
        const firstNode = nodeMenu.locator('[role="menuitem"]').first();
        if (await firstNode.isVisible({ timeout: 300 })) {
          await firstNode.click();
          await page.waitForTimeout(30);
        }
      }

      // Log progress
      if (i % 20 === 0 && i > 0) {
        console.log(`  Created ${i} nodes...`);

        // Take periodic memory snapshot
        const currentMemory = await client.send("Performance.getMetrics");
        const heapSize = currentMemory.metrics.find(
          (m) => m.name === "JSHeapUsedSize"
        )?.value;
        console.log(`  Memory at ${i} nodes: ${heapSize}`);
      }
    }

    const nodeCreationTime = Date.now() - nodeCreationStart;
    console.log(`Node creation completed in ${nodeCreationTime}ms`);

    // Wait for all rendering to complete
    await page.waitForTimeout(2000);

    // Stop CPU profiling and get results
    const profile = await client.send("Profiler.stop");

    // Get final memory metrics
    const finalMemory = await client.send("Performance.getMetrics");

    // Count rendered nodes
    const nodes = page.locator(".react-flow__node");
    const nodeCount = await nodes.count();
    console.log(`Total nodes rendered: ${nodeCount}`);

    // Test interaction performance
    console.log("Testing pan interaction...");
    const panStart = Date.now();
    await page.mouse.move(paneBox.x + 400, paneBox.y + 300);
    await page.mouse.down();
    await page.mouse.move(paneBox.x + 200, paneBox.y + 150, { steps: 20 });
    await page.mouse.up();
    const panTime = Date.now() - panStart;
    console.log(`Pan completed in ${panTime}ms`);

    // Test zoom performance
    console.log("Testing zoom interaction...");
    const zoomStart = Date.now();
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(100);
    }
    const zoomTime = Date.now() - zoomStart;
    console.log(`Zoom operations completed in ${zoomTime}ms`);

    // Test selection performance
    console.log("Testing box selection...");
    const selectStart = Date.now();
    await page.mouse.move(paneBox.x + 250, paneBox.y + 150);
    await page.mouse.down();
    await page.mouse.move(paneBox.x + 600, paneBox.y + 400, { steps: 15 });
    await page.mouse.up();
    const selectTime = Date.now() - selectStart;
    console.log(`Selection completed in ${selectTime}ms`);

    // Calculate memory delta
    const baselineHeap = baselineMemory.metrics.find(
      (m) => m.name === "JSHeapUsedSize"
    )?.value;
    const finalHeap = finalMemory.metrics.find(
      (m) => m.name === "JSHeapUsedSize"
    )?.value;
    const memoryDelta = finalHeap
      ? (finalHeap - (baselineHeap || 0)) / 1024 / 1024
      : 0;

    // Save profile to file
    const profilesDir = path.join(__dirname, "../../profiles");
    if (!fs.existsSync(profilesDir)) {
      fs.mkdirSync(profilesDir, { recursive: true });
    }
    const profilePath = path.join(
      profilesDir,
      `reactflow-profile-${Date.now()}.json`
    );
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    console.log(`CPU profile saved to: ${profilePath}`);

    // Print summary
    console.log("\n=== Performance Summary ===");
    console.log(`Nodes created: ${nodeCount}`);
    console.log(`Creation time: ${nodeCreationTime}ms`);
    console.log(
      `Average per node: ${(nodeCreationTime / 100).toFixed(2)}ms`
    );
    console.log(`Memory delta: ${memoryDelta.toFixed(2)} MB`);
    console.log(`Pan latency: ${panTime}ms`);
    console.log(`Zoom latency: ${zoomTime}ms`);
    console.log(`Selection latency: ${selectTime}ms`);

    // Performance assertions
    expect(nodeCount).toBeGreaterThanOrEqual(50); // Should create at least 50 nodes
    expect(panTime).toBeLessThan(1000); // Pan should be responsive
    expect(zoomTime).toBeLessThan(2000); // Zoom should be smooth
    expect(selectTime).toBeLessThan(1000); // Selection should be fast

    await browser.close();
  });

  test("should measure initial load performance", async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const client = await context.newCDPSession(page);
    await client.send("Performance.enable");

    console.log("Measuring initial load performance...");

    const navigationStart = Date.now();
    await page.goto("/editor", { waitUntil: "networkidle" });

    await page.waitForSelector(".react-flow__pane", { timeout: 30000 });

    const loadTime = Date.now() - navigationStart;
    console.log(`Editor loaded in ${loadTime}ms`);

    // Get performance metrics
    const metrics = await client.send("Performance.getMetrics");

    console.log("\n=== Load Metrics ===");
    metrics.metrics.forEach((metric) => {
      if (
        [
          "JSHeapUsedSize",
          "JSHeapTotalSize",
          "Nodes",
          "Documents",
          "ScriptDuration",
          "LayoutDuration"
        ].includes(metric.name)
      ) {
        console.log(`${metric.name}: ${metric.value}`);
      }
    });

    expect(loadTime).toBeLessThan(10000); // Should load within 10 seconds

    await browser.close();
  });
  });
}
