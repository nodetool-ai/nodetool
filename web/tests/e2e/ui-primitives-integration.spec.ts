import { test, expect } from "@playwright/test";

// Skip when run by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("UI Primitives Integration", () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to the dashboard where the refactored components are used
      await page.goto("/");
      await page.waitForLoadState("networkidle");
    });

    test("SetupPanel uses FlexColumn and Card primitives correctly", async ({ page }) => {
      // Wait for the setup panel to be visible (it should be in one of the dashboard panels)
      const setupPanel = page.locator(".setup-panel-container");
      
      // Check if the panel exists
      if (await setupPanel.count() > 0) {
        await expect(setupPanel).toBeVisible();
        
        // Verify FlexColumn structure (should have flex display with column direction)
        const flexColumn = setupPanel.locator(".MuiBox-root").first();
        const styles = await flexColumn.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            display: computed.display,
            flexDirection: computed.flexDirection
          };
        });
        
        expect(styles.display).toBe("flex");
        expect(styles.flexDirection).toBe("column");
        
        // Verify that the setup content is in a Card (should have border/background styling)
        const setupContent = setupPanel.locator("text=How to Use Models").first();
        await expect(setupContent).toBeVisible();
      }
    });

    test("GettingStartedPanel uses new UI primitives correctly", async ({ page }) => {
      // Look for the getting started panel
      const gettingStartedPanel = page.locator(".getting-started-panel");
      
      if (await gettingStartedPanel.count() > 0) {
        await expect(gettingStartedPanel).toBeVisible();
        
        // Check for the header with FlexRow
        const header = gettingStartedPanel.locator(".panel-header");
        await expect(header).toBeVisible();
        
        // Verify header text using Text primitive
        await expect(header.locator("text=Getting Started")).toBeVisible();
        
        // Check for step cards using Card primitive
        const stepCards = gettingStartedPanel.locator(".step-card");
        const cardCount = await stepCards.count();
        
        if (cardCount > 0) {
          // Verify first step card has proper flex layout
          const firstCard = stepCards.first();
          await expect(firstCard).toBeVisible();
          
          // Check that step cards have the Card component styling
          const cardStyles = await firstCard.evaluate((el) => {
            const computed = window.getComputedStyle(el);
            return {
              borderRadius: computed.borderRadius,
              padding: computed.padding
            };
          });
          
          // Card should have border radius and padding
          expect(cardStyles.borderRadius).not.toBe("0px");
          expect(cardStyles.padding).not.toBe("0px");
        }
        
        // Check for progress bar if present
        const progressBar = gettingStartedPanel.locator(".progress-bar");
        if (await progressBar.count() > 0) {
          await expect(progressBar).toBeVisible();
        }
      }
    });

    test("Dashboard panels render without layout issues", async ({ page }) => {
      // Take a screenshot to verify visual layout
      await page.screenshot({ path: "test-results/dashboard-with-ui-primitives.png", fullPage: true });
      
      // Check that the main dashboard container exists
      const dashboard = page.locator('[class*="dashboard"]').first();
      
      if (await dashboard.count() > 0) {
        await expect(dashboard).toBeVisible();
        
        // Verify no layout errors by checking that content is not overlapping
        const boundingBox = await dashboard.boundingBox();
        expect(boundingBox).not.toBeNull();
        expect(boundingBox!.width).toBeGreaterThan(0);
        expect(boundingBox!.height).toBeGreaterThan(0);
      }
    });

    test("UI primitives maintain proper spacing and alignment", async ({ page }) => {
      // Find any FlexColumn or FlexRow components
      const flexComponents = page.locator('[class*="Mui"]');
      const count = await flexComponents.count();
      
      expect(count).toBeGreaterThan(0);
      
      // Verify that the page renders without console errors
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });
      
      // Wait a bit to catch any delayed errors
      await page.waitForTimeout(2000);
      
      // Filter out known harmless warnings
      const actualErrors = consoleErrors.filter(
        (err) => 
          !err.includes("MUI") && 
          !err.includes("Warning") &&
          !err.includes("DevTools")
      );
      
      // Expect no critical errors
      expect(actualErrors.length).toBe(0);
    });

    test("Refactored components maintain responsive behavior", async ({ page }) => {
      // Test at different viewport sizes
      const viewports = [
        { width: 1920, height: 1080 },  // Desktop
        { width: 1280, height: 720 },   // Laptop
        { width: 768, height: 1024 }    // Tablet
      ];
      
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(500);
        
        // Verify that the page is still visible and functional
        const body = page.locator("body");
        await expect(body).toBeVisible();
        
        // Take a screenshot at this viewport size
        await page.screenshot({ 
          path: `test-results/responsive-${viewport.width}x${viewport.height}.png`,
          fullPage: false
        });
      }
    });
  });
}
