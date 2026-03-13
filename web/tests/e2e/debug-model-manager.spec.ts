import { test, expect } from "@playwright/test";

if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test("debug: capture model manager state against real backend", async ({ page }) => {
    const apiCalls: { url: string; method: string; status?: number; error?: string }[] = [];
    let modelsAllData: any = null;

    // Log ALL network requests/responses to the API
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/")) {
        apiCalls.push({ url, method: request.method() });
      }
    });

    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/api/models/all")) {
        try {
          modelsAllData = await response.json();
        } catch {}
      }
      if (url.includes("/api/")) {
        const call = apiCalls.find(c => c.url === url && !c.status);
        if (call) call.status = response.status();
      }
    });

    page.on("requestfailed", (request) => {
      const url = request.url();
      if (url.includes("/api/")) {
        const call = apiCalls.find(c => c.url === url && !c.error);
        if (call) call.error = request.failure()?.errorText || "unknown";
      }
    });

    // Capture console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/models", { timeout: 30000 });
    await page.waitForLoadState("domcontentloaded");

    // Wait for virtual list to render and fire onItemsRendered
    await page.waitForTimeout(8000);

    // Take screenshot
    await page.screenshot({ path: "test-results/model-manager-debug.png", fullPage: true });

    // Log API calls
    console.log("\n=== API calls made ===");
    for (const call of apiCalls) {
      const status = call.status || "pending";
      const err = call.error ? ` ERROR: ${call.error}` : "";
      console.log(`  ${call.method} ${call.url} → ${status}${err}`);
    }

    // Models received
    if (modelsAllData) {
      const downloaded = modelsAllData.filter((m: any) => m.downloaded === true);
      const hfModels = modelsAllData.filter((m: any) => (m.type || "").startsWith("hf."));
      console.log(`\n=== Models data ===`);
      console.log(`Total: ${modelsAllData.length}, HF: ${hfModels.length}, Downloaded: ${downloaded.length}`);
      console.log(`Downloaded models:`);
      for (const m of downloaded) {
        console.log(`  ✓ ${m.id} (type=${m.type}, cache_path=${m.cache_path || "none"})`);
      }
    }

    // UI state
    const modelItems = await page.locator(".model-list-item").count();
    const headerText = await page.locator(".model-list-header").textContent().catch(() => null);
    const downloadedChips = await page.locator(".model-list-item.downloaded").count();

    console.log(`\n=== UI State ===`);
    console.log(`Model items rendered: ${modelItems}`);
    console.log(`Items with 'downloaded' class: ${downloadedChips}`);
    console.log(`Header: ${headerText}`);

    // Check what the visible model items actually contain
    const items = page.locator(".model-list-item");
    const count = await items.count();
    for (let i = 0; i < Math.min(count, 8); i++) {
      const text = await items.nth(i).textContent();
      const hasDownloaded = await items.nth(i).evaluate(
        (el) => el.classList.contains("downloaded")
      );
      console.log(`  [${i}] downloaded=${hasDownloaded} | ${text?.substring(0, 120)}`);
    }

    // Console errors
    if (consoleErrors.length > 0) {
      console.log(`\n=== Console errors ===`);
      for (const e of consoleErrors) {
        console.log(`  ${e.substring(0, 200)}`);
      }
    }

    // Check if "Downloaded" filter shows your models
    console.log(`\n=== Testing Downloaded filter ===`);
    const downloadedBtn = page.getByRole("button", { name: "show downloaded models only" });
    await downloadedBtn.click();
    await page.waitForTimeout(3000);

    const filteredItems = await page.locator(".model-list-item").count();
    const filteredHeader = await page.locator(".model-list-header").textContent().catch(() => null);
    console.log(`After clicking 'Downloaded': ${filteredItems} items visible`);
    console.log(`Header: ${filteredHeader}`);

    await page.screenshot({ path: "test-results/model-manager-downloaded.png", fullPage: true });

    expect(true).toBe(true);
  });
}
