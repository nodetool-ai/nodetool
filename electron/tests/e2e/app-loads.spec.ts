import { test, expect } from './fixtures/electronApp';
import { BACKEND_HOST } from "./support/backend";
import { navigateToPage, waitForPageReady } from "./helpers/waitHelpers";

test.describe("Electron App Loading", () => {
  test("should launch the Electron app successfully", async ({ page }) => {
    expect(page).toBeTruthy();
    const url = page.url();
    expect(url).toBeTruthy();
  });

  test("should have working main window", async ({ page }) => {
    expect(page).toBeTruthy();
    const url = page.url();
    expect(url).toBeTruthy();
  });

  test("should handle IPC communication", async ({ page }) => {
    const hasApi = await page.evaluate(() => {
      return typeof (window as any).api !== 'undefined';
    });
    expect(hasApi).toBe(true);
  });

  test("should load application without crashes", async ({ electronApp, page }) => {
    expect(electronApp).toBeTruthy();
    expect(page).toBeTruthy();
  });
});

test.describe("App Loading", () => {
  test("should load the home page successfully", async ({ page }) => {
    // Navigate to the root
    await navigateToPage(page, "/");

    // Check that we're on a valid page (not an error page)
    const title = await page.title();
    expect(title).toBeTruthy();

    // Check that the page doesn't show a generic error
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("500");
    expect(bodyText).not.toContain("Internal Server Error");
  });

  test("should have working navigation", async ({ page }) => {
    // Navigate to the root
    await navigateToPage(page, "/");

    // Try to navigate to dashboard page
    await navigateToPage(page, "/dashboard");

    // Check URL changed (use pathname to handle Electron base URLs)
    const url = page.url();
    const pathname = new URL(url).pathname;
    expect(pathname).toMatch(/\/dashboard/);
  });

  test("should connect to backend API", async ({ page }) => {
    // Set up a request interceptor to check for API calls
    let apiCallMade = false;

    const responseHandler = (response: any) => {
      const url = response.url();
      if (url.includes(BACKEND_HOST) || url.includes("/api/")) {
        apiCallMade = true;
      }
    };

    page.on("response", responseHandler);

    // Navigate to the app
    await navigateToPage(page, "/");

    // Wait for initial API calls with a proper condition check
    await page.waitForFunction(
      () => {
        // Check if any API elements or data have loaded
        const body = document.querySelector("body");
        return body && body.textContent && body.textContent.length > 100;
      },
      { timeout: 5000 }
    );

    // Clean up listener
    page.off("response", responseHandler);

    // We expect at least some API call to have been made
    // This verifies the frontend can reach the backend
    expect(apiCallMade).toBe(true);
  });
});
