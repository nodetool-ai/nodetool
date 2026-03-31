/**
 * Diagnostic: captures console output when navigating to /editor/wf-story-generator
 */
import { test, Page } from "@playwright/test";

if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test("diagnose editor crash", async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() === "error") {
        errors.push(text.substring(0, 500));
      } else if (msg.type() === "warning" && text.includes("Maximum")) {
        warnings.push(text.substring(0, 500));
      }
    });
    
    page.on("pageerror", (err) => {
      errors.push(`PAGE ERROR: ${err.message.substring(0, 500)}`);
    });
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // First, navigate to dashboard to load the app
    await page.goto("/");
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2000);
    
    console.log("=== Dashboard loaded. Now navigating to editor ===");
    console.log(`Dashboard errors: ${errors.length}`);
    errors.forEach((e, i) => console.log(`  Error ${i}: ${e}`));
    errors.length = 0;
    
    // Now navigate to editor
    await page.goto("/editor/wf-story-generator");
    await page.waitForTimeout(5000);
    
    console.log("=== Editor navigation complete ===");
    console.log(`Editor errors: ${errors.length}`);
    errors.forEach((e, i) => console.log(`  Error ${i}: ${e}`));
    console.log(`Warnings: ${warnings.length}`);
    warnings.forEach((w, i) => console.log(`  Warning ${i}: ${w}`));
    
    // Check for error boundary
    const errorEl = page.locator('[class*="errorBoundary"]').first();
    const hasError = (await errorEl.count()) > 0;
    if (hasError) {
      const errorText = await errorEl.innerText().catch(() => "(could not read)");
      console.log(`ERROR BOUNDARY TEXT: ${errorText.substring(0, 1000)}`);
      
      // Try to get more details
      await page.locator('button', { hasText: /show details/i }).first().click().catch(() => {});
      await page.waitForTimeout(300);
      const detailText = await page.locator('.details-section').innerText().catch(() => "");
      console.log(`DETAILS: ${detailText.substring(0, 1000)}`);
    } else {
      console.log("No error boundary found - page loaded successfully!");
    }
  });
}
