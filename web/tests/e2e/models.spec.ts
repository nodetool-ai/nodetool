import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Models Management", () => {
    test("should load models page", async ({ page }) => {
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Verify we're on the models page
      await expect(page).toHaveURL(/\/models/);

      // Check that the page loaded without errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should display models interface", async ({ page }) => {
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Wait for content to load by checking body has content
      const body = await page.locator("body");
      await expect(body).not.toBeEmpty();
      
      const hasContent = await body.textContent();
      expect(hasContent).toBeTruthy();
      expect(hasContent!.length).toBeGreaterThan(0);
    });

    test("should be accessible from navigation", async ({ page }) => {
      // Direct navigation should work
      await page.goto("/models");
      await page.waitForLoadState("networkidle");
      
      // Verify we're on the models page
      await expect(page).toHaveURL(/\/models/);
      
      // Check that the page loaded without errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });
  });

  test.describe("Models API Integration", () => {
    test("should fetch Hugging Face models from API", async ({ page, request }) => {
      // Navigate to models page to ensure app is loaded
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Make API request for Hugging Face models
      const response = await request.get(`${BACKEND_API_URL}/models/huggingface`);
      
      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);
      
      // Parse and verify response data
      const models = await response.json();
      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBeTruthy();
    });

    test("should fetch recommended models from API", async ({ page, request }) => {
      // Navigate to models page
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Make API request for recommended models
      const response = await request.get(`${BACKEND_API_URL}/models/recommended`);
      
      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);
      
      // Parse and verify response data
      const models = await response.json();
      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBeTruthy();
    });

    test("should fetch model providers from API", async ({ page, request }) => {
      // Navigate to models page
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Make API request for providers
      const response = await request.get(`${BACKEND_API_URL}/models/providers`);
      
      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);
      
      // Parse and verify response data
      const providers = await response.json();
      expect(providers).toBeDefined();
      expect(Array.isArray(providers)).toBeTruthy();
    });

    test("should fetch recommended language models from API", async ({ page, request }) => {
      // Navigate to models page
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Make API request for recommended language models
      const response = await request.get(`${BACKEND_API_URL}/models/recommended/language`);
      
      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);
      
      // Parse and verify response data
      const models = await response.json();
      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBeTruthy();
    });

    test("should fetch recommended image models from API", async ({ page, request }) => {
      // Navigate to models page
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Make API request for recommended image models
      const response = await request.get(`${BACKEND_API_URL}/models/recommended/image`);
      
      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);
      
      // Parse and verify response data
      const models = await response.json();
      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBeTruthy();
    });

    test("should handle API errors gracefully", async ({ page, request }) => {
      // Navigate to models page
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Try to fetch from a non-existent endpoint
      const response = await request.get(`${BACKEND_API_URL}/models/nonexistent`);
      
      // Verify error response
      expect(response.status()).toBeGreaterThanOrEqual(400);
      
      // Page should still be functional
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should validate API response structure for Hugging Face models", async ({ page, request }) => {
      // Navigate to models page
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Fetch Hugging Face models
      const response = await request.get(`${BACKEND_API_URL}/models/huggingface`);
      expect(response.ok()).toBeTruthy();
      
      const models = await response.json();
      
      // Validate structure if models exist
      if (models.length > 0) {
        const firstModel = models[0];
        
        // Check for common model properties
        // Note: actual structure depends on backend implementation
        expect(firstModel).toBeDefined();
        expect(typeof firstModel).toBe("object");
      }
    });

    test("should verify models page makes API calls on load", async ({ page }) => {
      // Set up request interceptor to track API calls
      const apiCalls: string[] = [];
      
      page.on("response", (response) => {
        const url = response.url();
        if (url.includes("/api/models/")) {
          apiCalls.push(url);
        }
      });

      // Navigate to models page
      await page.goto("/models");
      await page.waitForLoadState("networkidle");
      
      // Give it time for API calls
      await page.waitForTimeout(2000);
      
      // Verify that at least some models API calls were made
      expect(apiCalls.length).toBeGreaterThan(0);
      
      // Log the API calls for debugging
      console.log("Models API calls made:", apiCalls);
    });
  });
}
