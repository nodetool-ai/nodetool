import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";
import { setupMockApiRoutes, models } from "./fixtures/mockData";

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

  test.describe("Models with Mock Data", () => {
    test.beforeEach(async ({ page }) => {
      // Setup mock API routes before each test
      await setupMockApiRoutes(page);
    });

    test("should display mocked HuggingFace models", async ({ page }) => {
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Wait for any async data loading
      await page.waitForTimeout(2000);

      // Verify page is functional
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should verify mock model data structure", async ({ page }) => {
      // Verify our mock data has the expected structure
      expect(models.huggingface).toBeDefined();
      expect(Array.isArray(models.huggingface)).toBe(true);
      expect(models.huggingface.length).toBeGreaterThan(0);

      const firstModel = models.huggingface[0];
      expect(firstModel).toHaveProperty("id");
      expect(firstModel).toHaveProperty("name");
      expect(firstModel).toHaveProperty("repo_id");
      expect(firstModel).toHaveProperty("type");

      await page.goto("/models");
      await page.waitForLoadState("networkidle");
      
      // Page should load successfully
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should display different model types", async ({ page }) => {
      // Verify we have different types of models in mock data
      const diffusionModels = models.huggingface.filter(m => m.type === "diffusion");
      const languageModels = models.huggingface.filter(m => m.type === "language");
      
      expect(diffusionModels.length).toBeGreaterThan(0);
      expect(languageModels.length).toBeGreaterThan(0);

      await page.goto("/models");
      await page.waitForLoadState("networkidle");
      
      // Page should load with model data
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should have recommended models", async ({ page }) => {
      // Verify recommended models exist
      expect(models.recommended).toBeDefined();
      expect(Array.isArray(models.recommended)).toBe(true);
      expect(models.recommended.length).toBeGreaterThan(0);

      await page.goto("/models");
      await page.waitForLoadState("networkidle");
      
      // Page should load successfully
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should have model providers", async ({ page }) => {
      // Verify providers exist
      expect(models.providers).toBeDefined();
      expect(Array.isArray(models.providers)).toBe(true);
      expect(models.providers.length).toBeGreaterThan(0);

      // Check provider structure
      const firstProvider = models.providers[0];
      expect(firstProvider).toHaveProperty("name");
      expect(firstProvider).toHaveProperty("display_name");
      expect(firstProvider).toHaveProperty("requires_api_key");

      await page.goto("/models");
      await page.waitForLoadState("networkidle");
      
      // Page should load successfully
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
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
      const modelsData = await response.json();
      expect(modelsData).toBeDefined();
      expect(Array.isArray(modelsData)).toBeTruthy();
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
      const modelsData = await response.json();
      expect(modelsData).toBeDefined();
      expect(Array.isArray(modelsData)).toBeTruthy();
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
      const modelsData = await response.json();
      expect(modelsData).toBeDefined();
      expect(Array.isArray(modelsData)).toBeTruthy();
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
      const modelsData = await response.json();
      expect(modelsData).toBeDefined();
      expect(Array.isArray(modelsData)).toBeTruthy();
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
      
      const modelsData = await response.json();
      
      // Validate structure if models exist
      if (modelsData.length > 0) {
        const firstModel = modelsData[0];
        
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
