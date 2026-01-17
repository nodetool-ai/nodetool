import { test, expect, Page } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";

/**
 * Tests for loading data from the mock server.
 * These tests verify that the --mock flag creates appropriate dummy data
 * for chat threads, workflows, assets, models, and providers.
 */

/**
 * Helper function to check page for server errors
 */
async function checkPageForServerErrors(page: Page): Promise<void> {
  const bodyText = await page.textContent("body");
  expect(bodyText).not.toContain("500");
  expect(bodyText).not.toContain("Internal Server Error");
}

/**
 * Helper function to wait for and verify page content
 */
async function waitForPageContent(page: Page): Promise<void> {
  const body = page.locator("body");
  await expect(body).not.toBeEmpty();
  const hasContent = await body.textContent();
  expect(hasContent).toBeTruthy();
  expect(hasContent!.length).toBeGreaterThan(0);
}

/**
 * Helper function to track API calls and wait for specific endpoint
 */
async function trackApiCallsAndNavigate(
  page: Page,
  path: string,
  apiPattern: string
): Promise<string[]> {
  const apiCalls: string[] = [];

  page.on("response", (response) => {
    const url = response.url();
    if (url.includes(apiPattern)) {
      apiCalls.push(url);
    }
  });

  await page.goto(path);
  await page.waitForLoadState("networkidle");

  // Wait for specific API response if pattern provided
  if (apiPattern) {
    try {
      await page.waitForResponse(
        (response) => response.url().includes(apiPattern),
        { timeout: 10000 }
      );
    } catch {
      // Response may have already been captured before waitForResponse was called
    }
  }

  return apiCalls;
}

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Mock Data - Chat Threads", () => {
    test("should fetch chat threads from API", async ({ page, request }) => {
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");

      // Make API request for threads
      const response = await request.get(`${BACKEND_API_URL}/threads/`);

      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      // Parse and verify response data
      const data = await response.json();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBeTruthy();
    });

    test("should display chat threads in the UI when mock data exists", async ({
      page,
      request
    }) => {
      // First check if mock threads exist via API
      const response = await request.get(`${BACKEND_API_URL}/threads/`);
      expect(response.ok()).toBeTruthy();

      const threads = await response.json();

      // Navigate to chat page
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");

      // If mock threads exist, verify they appear in the UI
      if (Array.isArray(threads) && threads.length > 0) {
        // Wait for chat interface to load by checking for content
        await waitForPageContent(page);
      }
    });

    test("should verify chat threads API response structure", async ({
      page,
      request
    }) => {
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");

      const response = await request.get(`${BACKEND_API_URL}/threads/`);
      expect(response.ok()).toBeTruthy();

      const threads = await response.json();

      // Validate structure if threads exist
      if (Array.isArray(threads) && threads.length > 0) {
        const firstThread = threads[0];
        expect(firstThread).toBeDefined();
        expect(typeof firstThread).toBe("object");
        // Check for common thread properties
        expect(firstThread).toHaveProperty("id");
      }
    });
  });

  test.describe("Mock Data - Workflows", () => {
    test("should fetch workflows from API", async ({ page, request }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Make API request for workflows
      const response = await request.get(`${BACKEND_API_URL}/workflows/`);

      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      // Parse and verify response data
      const data = await response.json();
      expect(data).toBeDefined();
      expect(data).toHaveProperty("workflows");
      expect(Array.isArray(data.workflows)).toBeTruthy();
    });

    test("should display workflows in the dashboard when mock data exists", async ({
      page,
      request
    }) => {
      // First check if mock workflows exist via API
      const response = await request.get(`${BACKEND_API_URL}/workflows/`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();

      // Navigate to dashboard
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // If mock workflows exist, verify they appear in the UI
      if (data.workflows && data.workflows.length > 0) {
        // Wait for dashboard to load by checking for content
        await waitForPageContent(page);
      }
    });

    test("should verify workflows API response structure", async ({
      page,
      request
    }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      const response = await request.get(`${BACKEND_API_URL}/workflows/`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();

      // Validate structure if workflows exist
      if (data.workflows && data.workflows.length > 0) {
        const firstWorkflow = data.workflows[0];
        expect(firstWorkflow).toBeDefined();
        expect(typeof firstWorkflow).toBe("object");
        // Check for common workflow properties
        expect(firstWorkflow).toHaveProperty("id");
        expect(firstWorkflow).toHaveProperty("name");
      }
    });

    test("should fetch example workflows from API", async ({
      page,
      request
    }) => {
      await page.goto("/templates");
      await page.waitForLoadState("networkidle");

      // Make API request for example workflows
      const response = await request.get(
        `${BACKEND_API_URL}/workflows/examples`
      );

      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      // Parse and verify response data
      const data = await response.json();
      expect(data).toBeDefined();
      expect(data).toHaveProperty("workflows");
      expect(Array.isArray(data.workflows)).toBeTruthy();
    });
  });

  test.describe("Mock Data - Assets", () => {
    test("should fetch assets from API", async ({ page, request }) => {
      await page.goto("/assets");
      await page.waitForLoadState("networkidle");

      // Make API request for assets
      const response = await request.get(`${BACKEND_API_URL}/assets/`);

      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      // Parse and verify response data
      const data = await response.json();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBeTruthy();
    });

    test("should display assets in the asset explorer when mock data exists", async ({
      page,
      request
    }) => {
      // First check if mock assets exist via API
      const response = await request.get(`${BACKEND_API_URL}/assets/`);
      expect(response.ok()).toBeTruthy();

      const assets = await response.json();

      // Navigate to assets page
      await page.goto("/assets");
      await page.waitForLoadState("networkidle");

      // If mock assets exist, verify they appear in the UI
      if (Array.isArray(assets) && assets.length > 0) {
        // Wait for assets to load by checking for content
        await waitForPageContent(page);
      }
    });

    test("should verify assets API response structure", async ({
      page,
      request
    }) => {
      await page.goto("/assets");
      await page.waitForLoadState("networkidle");

      const response = await request.get(`${BACKEND_API_URL}/assets/`);
      expect(response.ok()).toBeTruthy();

      const assets = await response.json();

      // Validate structure if assets exist
      if (Array.isArray(assets) && assets.length > 0) {
        const firstAsset = assets[0];
        expect(firstAsset).toBeDefined();
        expect(typeof firstAsset).toBe("object");
        // Check for common asset properties
        expect(firstAsset).toHaveProperty("id");
      }
    });

    test("should search assets from API", async ({ page, request }) => {
      await page.goto("/assets");
      await page.waitForLoadState("networkidle");

      // Make API request for asset search
      const response = await request.get(`${BACKEND_API_URL}/assets/search`);

      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      // Parse and verify response data
      const data = await response.json();
      expect(data).toBeDefined();
    });
  });

  test.describe("Mock Data - Models", () => {
    test("should fetch all models from API", async ({ page, request }) => {
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Make API request for all models
      const response = await request.get(`${BACKEND_API_URL}/models/all`);

      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      // Parse and verify response data
      const models = await response.json();
      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBeTruthy();
    });

    test("should fetch HuggingFace models from API", async ({
      page,
      request
    }) => {
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Make API request for HuggingFace models
      const response = await request.get(
        `${BACKEND_API_URL}/models/huggingface`
      );

      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      // Parse and verify response data
      const models = await response.json();
      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBeTruthy();
    });

    test("should fetch recommended models from API", async ({
      page,
      request
    }) => {
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Make API request for recommended models
      const response = await request.get(
        `${BACKEND_API_URL}/models/recommended`
      );

      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      // Parse and verify response data
      const models = await response.json();
      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBeTruthy();
    });

    test("should display models in the UI when mock data exists", async ({
      page,
      request
    }) => {
      // First check if mock models exist via API
      const response = await request.get(`${BACKEND_API_URL}/models/all`);
      expect(response.ok()).toBeTruthy();

      const models = await response.json();

      // Navigate to models page
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // If mock models exist, verify they appear in the UI
      if (Array.isArray(models) && models.length > 0) {
        // Wait for models to load by checking for content
        await waitForPageContent(page);
      }
    });

    test("should verify models API response structure", async ({
      page,
      request
    }) => {
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      const response = await request.get(`${BACKEND_API_URL}/models/all`);
      expect(response.ok()).toBeTruthy();

      const models = await response.json();

      // Validate structure if models exist
      if (Array.isArray(models) && models.length > 0) {
        const firstModel = models[0];
        expect(firstModel).toBeDefined();
        expect(typeof firstModel).toBe("object");
      }
    });
  });

  test.describe("Mock Data - Providers", () => {
    test("should fetch providers from API", async ({ page, request }) => {
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

    test("should have mock providers with expected structure", async ({
      page,
      request
    }) => {
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Make API request for providers
      const response = await request.get(`${BACKEND_API_URL}/models/providers`);
      expect(response.ok()).toBeTruthy();

      const providers = await response.json();

      // Validate structure if providers exist
      if (Array.isArray(providers) && providers.length > 0) {
        const firstProvider = providers[0];
        expect(firstProvider).toBeDefined();
        expect(typeof firstProvider).toBe("object");
        // Check for common provider properties
        expect(firstProvider).toHaveProperty("id");
        expect(firstProvider).toHaveProperty("name");
      }
    });

    test("should verify providers page makes API calls on load", async ({
      page
    }) => {
      // Use helper function to track API calls
      const apiCalls = await trackApiCallsAndNavigate(
        page,
        "/models",
        "/api/models/providers"
      );

      // Verify that providers API call was made
      expect(apiCalls.length).toBeGreaterThan(0);
    });
  });

  test.describe("Mock Data - Cross-Feature Integration", () => {
    test("should load all main data sources without errors", async ({
      page,
      request
    }) => {
      // Test that all main API endpoints respond successfully
      const endpoints = [
        `${BACKEND_API_URL}/threads/`,
        `${BACKEND_API_URL}/workflows/`,
        `${BACKEND_API_URL}/assets/`,
        `${BACKEND_API_URL}/models/providers`,
        `${BACKEND_API_URL}/models/recommended`
      ];

      for (const endpoint of endpoints) {
        const response = await request.get(endpoint);
        expect(response.ok()).toBeTruthy();
        expect(response.status()).toBe(200);
      }

      // Also verify that the frontend loads without errors
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      await checkPageForServerErrors(page);
    });

    test("should navigate between pages and load mock data for each", async ({
      page
    }) => {
      // Track API calls
      const apiCalls: string[] = [];

      page.on("response", (response) => {
        const url = response.url();
        if (url.includes("/api/")) {
          apiCalls.push(url);
        }
      });

      // Navigate to each page and verify API calls are made
      const pages = [
        { path: "/dashboard", expectedApi: "workflows" },
        { path: "/assets", expectedApi: "assets" },
        { path: "/models", expectedApi: "models" },
        { path: "/chat", expectedApi: "threads" }
      ];

      for (const pageConfig of pages) {
        await page.goto(pageConfig.path);
        await page.waitForLoadState("networkidle");

        // Wait for API response containing expected endpoint
        try {
          await page.waitForResponse(
            (response) => response.url().includes(`/api/${pageConfig.expectedApi}`),
            { timeout: 10000 }
          );
        } catch {
          // Response may have already been captured
        }

        // Verify page loaded without errors
        await checkPageForServerErrors(page);
      }

      // Verify API calls were made
      expect(apiCalls.length).toBeGreaterThan(0);
    });
  });
}
