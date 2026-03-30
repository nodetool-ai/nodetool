import { test, expect } from './fixtures/electronApp';
import { BACKEND_API_URL } from "./support/backend";
import {
  navigateToPage,
  waitForAnimation,
} from "./helpers/waitHelpers";

test.describe("Models Management", () => {
  test("should load models page", async ({ page }) => {
    await navigateToPage(page, "/models");

    // Verify we're on the models page
    await expect(page).toHaveURL(/\/models/);

    // Check that the page loaded without errors
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("500");
    expect(bodyText).not.toContain("Internal Server Error");
  });

  test("should display models interface", async ({ page }) => {
    await navigateToPage(page, "/models");

    // Wait for content to load by checking body has content
    const body = await page.locator("body");
    await expect(body).not.toBeEmpty();

    const hasContent = await body.textContent();
    expect(hasContent).toBeTruthy();
    expect(hasContent!.length).toBeGreaterThan(0);
  });

  test("should be accessible from navigation", async ({ page }) => {
    // Direct navigation should work
    await navigateToPage(page, "/models");

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
    await navigateToPage(page, "/models");

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
    await navigateToPage(page, "/models");

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
    await navigateToPage(page, "/models");

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
    await navigateToPage(page, "/models");

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
    await navigateToPage(page, "/models");

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
    await navigateToPage(page, "/models");

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
    await navigateToPage(page, "/models");

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
});
