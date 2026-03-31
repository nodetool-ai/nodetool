import { test, Page } from "@playwright/test";

if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test("diagnose editor crash - direct nav", async ({ page }) => {
    const errors: string[] = [];
    
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text().substring(0, 500));
      }
    });
    
    page.on("pageerror", (err) => {
      errors.push(`PAGE ERROR: ${err.message.substring(0, 500)}`);
    });
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Navigate DIRECTLY to editor (same as the failing test)
    await page.goto("/editor/wf-story-generator");
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3000);
    
    console.log(`Errors: ${errors.length}`);
    errors.forEach((e, i) => console.log(`  Error ${i}: ${e}`));
    
    const errorEl = page.locator('[class*="errorBoundary"]').first();
    const hasError = (await errorEl.count()) > 0;
    if (hasError) {
      const errorText = await errorEl.innerText().catch(() => "(could not read)");
      console.log(`ERROR BOUNDARY: ${errorText.substring(0, 1000)}`);
      await page.locator('button', { hasText: /show details/i }).first().click().catch(() => {});
      await page.waitForTimeout(300);
      const detailText = await page.locator('.details-section').innerText().catch(() => "");
      console.log(`DETAILS: ${detailText.substring(0, 1000)}`);
    } else {
      console.log("No error boundary - page loaded OK");
    }
  });
}
