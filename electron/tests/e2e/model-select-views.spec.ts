/**
 * E2E tests for model select view components using a fake provider.
 *
 * These tests exercise the LanguageModelMenuDialog, ImageModelMenuDialog, and
 * related model selector components that power node-property and chat-toolbar
 * model pickers. A "fake" provider is wired up entirely through page.route()
 * interception so no real backend is required.
 *
 * API routes mocked per test:
 *   GET /api/models/providers          → fake provider list
 *   GET /api/models/llm/fake           → fake language models
 *   GET /api/models/image/fake         → fake image models
 *   …plus all core routes from setupMockApiRoutes()
 */
import { test, expect, Page } from "./fixtures/electronApp";
import {
  setupMockApiRoutes,
  getBackendApiUrl,
} from "./fixtures/mockData";
import { navigateToPage, waitForAnimation } from "./helpers/waitHelpers";

// ---------------------------------------------------------------------------
// Fake-provider data
// ---------------------------------------------------------------------------

const FAKE_PROVIDER = "fake";

const fakeProviders = [
  {
    provider: FAKE_PROVIDER,
    capabilities: ["generate_message", "text_to_image"],
  },
];

const fakeLanguageModels = [
  {
    type: "language_model",
    provider: FAKE_PROVIDER,
    id: "fake/alpha",
    name: "Fake Alpha",
  },
  {
    type: "language_model",
    provider: FAKE_PROVIDER,
    id: "fake/beta",
    name: "Fake Beta",
  },
  {
    type: "language_model",
    provider: FAKE_PROVIDER,
    id: "fake/gamma-coder",
    name: "Fake Gamma Coder",
  },
];

const fakeImageModels = [
  {
    type: "image_model",
    provider: FAKE_PROVIDER,
    id: "fake/img-v1",
    name: "Fake Image v1",
    path: "",
  },
  {
    type: "image_model",
    provider: FAKE_PROVIDER,
    id: "fake/img-v2",
    name: "Fake Image v2",
    path: "",
  },
];

// ---------------------------------------------------------------------------
// Helper: wire up all routes needed for a model-select test
// ---------------------------------------------------------------------------

/**
 * Register page.route() handlers for the fake-provider API endpoints.
 * Must be called AFTER setupMockApiRoutes() so these handlers take LIFO
 * precedence and override the generic providers mock.
 */
async function setupFakeProviderRoutes(page: Page): Promise<void> {
  const apiUrl = getBackendApiUrl();

  // Override the generic providers endpoint with properly shaped ProviderInfo[]
  await page.route(`${apiUrl}/models/providers`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fakeProviders),
    });
  });

  // Language-model endpoint for the fake provider
  await page.route(`${apiUrl}/models/llm/${FAKE_PROVIDER}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fakeLanguageModels),
    });
  });

  // Image-model endpoint for the fake provider
  await page.route(
    `${apiUrl}/models/image/${FAKE_PROVIDER}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fakeImageModels),
      });
    }
  );
}

// ---------------------------------------------------------------------------
// Skip guard – Playwright tests must not run inside Jest
// ---------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Language-model select dialog tests
  // -------------------------------------------------------------------------

  test.describe("Language model select – fake provider", () => {
    test.beforeEach(async ({ page }) => {
      // Core app routes first, then fake-provider overrides (LIFO wins)
      await setupMockApiRoutes(page);
      await setupFakeProviderRoutes(page);
      await navigateToPage(page, "/chat");
    });

    test("select-model button is visible in chat toolbar", async ({ page }) => {
      const button = page.locator(".select-model-button").first();
      await expect(button).toBeVisible({ timeout: 10_000 });
    });

    test("clicking select-model button opens the language model dialog", async ({
      page,
    }) => {
      const button = page.locator(".select-model-button").first();
      await button.click();

      // The popover/dialog should materialise
      const popover = page.locator('[role="presentation"]').first();
      await expect(popover).toBeVisible({ timeout: 8_000 });

      // Search input is present inside the dialog
      const searchInput = page.locator(
        '[placeholder="Search language models..."]'
      );
      await expect(searchInput).toBeVisible({ timeout: 5_000 });
    });

    test("dialog lists models from the fake provider", async ({ page }) => {
      await page.locator(".select-model-button").first().click();

      // Wait for dialog
      await page
        .locator('[placeholder="Search language models..."]')
        .waitFor({ state: "visible", timeout: 8_000 });

      // All fake models should be visible
      for (const model of fakeLanguageModels) {
        await expect(page.getByText(model.name)).toBeVisible({
          timeout: 8_000,
        });
      }
    });

    test("search narrows the model list", async ({ page }) => {
      await page.locator(".select-model-button").first().click();

      const searchInput = page.locator(
        '[placeholder="Search language models..."]'
      );
      await searchInput.waitFor({ state: "visible", timeout: 8_000 });

      // Type a search term that matches only one model
      await searchInput.fill("Coder");
      await waitForAnimation(page);

      // Only the coder model should remain
      await expect(page.getByText("Fake Gamma Coder")).toBeVisible({
        timeout: 5_000,
      });
      // Others should be gone
      await expect(page.getByText("Fake Alpha")).not.toBeVisible();
      await expect(page.getByText("Fake Beta")).not.toBeVisible();
    });

    test("clearing search restores the full model list", async ({ page }) => {
      await page.locator(".select-model-button").first().click();

      const searchInput = page.locator(
        '[placeholder="Search language models..."]'
      );
      await searchInput.waitFor({ state: "visible", timeout: 8_000 });

      await searchInput.fill("Alpha");
      await waitForAnimation(page);

      // Only Alpha visible
      await expect(page.getByText("Fake Alpha")).toBeVisible({
        timeout: 5_000,
      });

      // Clear search
      await searchInput.clear();
      await waitForAnimation(page);

      // All models back
      for (const model of fakeLanguageModels) {
        await expect(page.getByText(model.name)).toBeVisible({
          timeout: 5_000,
        });
      }
    });

    test("selecting a model closes the dialog and updates the button", async ({
      page,
    }) => {
      await page.locator(".select-model-button").first().click();

      await page
        .locator('[placeholder="Search language models..."]')
        .waitFor({ state: "visible", timeout: 8_000 });

      // Click the first fake model
      await page.getByText("Fake Alpha").click();

      await waitForAnimation(page);

      // Dialog should close
      await expect(
        page.locator('[placeholder="Search language models..."]')
      ).not.toBeVisible({ timeout: 5_000 });

      // Button label should now show the selected model name
      const button = page.locator(".select-model-button").first();
      await expect(button).toContainText("Fake Alpha", { timeout: 5_000 });
    });

    test("dialog can be closed with the Escape key", async ({ page }) => {
      await page.locator(".select-model-button").first().click();

      await page
        .locator('[placeholder="Search language models..."]')
        .waitFor({ state: "visible", timeout: 8_000 });

      await page.keyboard.press("Escape");
      await waitForAnimation(page);

      await expect(
        page.locator('[placeholder="Search language models..."]')
      ).not.toBeVisible({ timeout: 5_000 });
    });

    test("favorites and recent navigation buttons are present", async ({
      page,
    }) => {
      await page.locator(".select-model-button").first().click();

      // Wait for dialog to open
      await page
        .locator('[placeholder="Search language models..."]')
        .waitFor({ state: "visible", timeout: 8_000 });

      // Star/favorites tooltip button should exist
      await expect(
        page.locator('[title="Favorites"]')
      ).toBeVisible({ timeout: 5_000 });

      // Recent tooltip button should exist
      await expect(
        page.locator('[title="Recent"]')
      ).toBeVisible({ timeout: 5_000 });
    });

    test("refresh button is present in the dialog", async ({ page }) => {
      await page.locator(".select-model-button").first().click();

      await page
        .locator('[placeholder="Search language models..."]')
        .waitFor({ state: "visible", timeout: 8_000 });

      const refreshBtn = page.locator('[aria-label="refresh models"]');
      await expect(refreshBtn).toBeVisible({ timeout: 5_000 });
    });
  });

  // -------------------------------------------------------------------------
  // Fake-provider route interception tests (no full UI load needed)
  // -------------------------------------------------------------------------

  test.describe("Fake provider mock routes", () => {
    test.beforeEach(async ({ page }) => {
      await setupMockApiRoutes(page);
      await setupFakeProviderRoutes(page);
    });

    test("GET /api/models/providers returns ProviderInfo with capabilities", async ({
      page,
    }) => {
      // Navigate first so cookies/session are set
      await navigateToPage(page, "/chat");

      // The route interception works at the browser level; use page.evaluate
      // to make a fetch call that goes through the intercepted routes.
      const result = await page.evaluate(async () => {
        const res = await fetch("/api/models/providers");
        return res.json();
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const fakeProvider = result.find((p: { provider: string }) => p.provider === "fake");
      expect(fakeProvider).toBeDefined();
      expect(Array.isArray(fakeProvider.capabilities)).toBe(true);
      expect(fakeProvider.capabilities).toContain("generate_message");
      expect(fakeProvider.capabilities).toContain("text_to_image");
    });

    test("GET /api/models/llm/fake returns fake language models", async ({
      page,
    }) => {
      await navigateToPage(page, "/chat");

      const result = await page.evaluate(async () => {
        const res = await fetch("/api/models/llm/fake");
        return res.json();
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);

      const names = result.map((model: { name: string }) => model.name);
      expect(names).toContain("Fake Alpha");
      expect(names).toContain("Fake Beta");
      expect(names).toContain("Fake Gamma Coder");
    });

    test("GET /api/models/image/fake returns fake image models", async ({
      page,
    }) => {
      await navigateToPage(page, "/chat");

      const result = await page.evaluate(async () => {
        const res = await fetch("/api/models/image/fake");
        return res.json();
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);

      const names = result.map((model: { name: string }) => model.name);
      expect(names).toContain("Fake Image v1");
      expect(names).toContain("Fake Image v2");
    });

    test("fake provider models have the expected structure", async ({
      page,
    }) => {
      await navigateToPage(page, "/chat");

      const langModels = await page.evaluate(async () => {
        const res = await fetch("/api/models/llm/fake");
        return res.json();
      });

      for (const model of langModels) {
        expect(model).toHaveProperty("id");
        expect(model).toHaveProperty("name");
        expect(model).toHaveProperty("provider");
        expect(model.type).toBe("language_model");
        expect(model.provider).toBe("fake");
      }

      const imgModels = await page.evaluate(async () => {
        const res = await fetch("/api/models/image/fake");
        return res.json();
      });

      for (const model of imgModels) {
        expect(model).toHaveProperty("id");
        expect(model).toHaveProperty("name");
        expect(model).toHaveProperty("provider");
        expect(model.type).toBe("image_model");
        expect(model.provider).toBe("fake");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Provider-list sidebar tests
  // -------------------------------------------------------------------------

  test.describe("Language model dialog – provider sidebar", () => {
    test.beforeEach(async ({ page }) => {
      await setupMockApiRoutes(page);
      await setupFakeProviderRoutes(page);
      await navigateToPage(page, "/chat");
    });

    test("provider sidebar renders with fake provider icon/entry", async ({
      page,
    }) => {
      await page.locator(".select-model-button").first().click();

      await page
        .locator('[placeholder="Search language models..."]')
        .waitFor({ state: "visible", timeout: 8_000 });

      // The ProviderList sidebar renders a tooltip for each provider.
      // The fake provider entry should appear with at least a tooltip.
      const providerTooltip = page.locator('[title="fake"]');
      await expect(providerTooltip).toBeVisible({ timeout: 8_000 });
    });

    test("clicking provider filter shows only that provider's models", async ({
      page,
    }) => {
      // Add a second provider with different models to verify filtering
      const apiUrl = getBackendApiUrl();
      await page.route(`${apiUrl}/models/providers`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              provider: FAKE_PROVIDER,
              capabilities: ["generate_message"],
            },
            {
              provider: "ollama",
              capabilities: ["generate_message"],
            },
          ]),
        });
      });
      await page.route(`${apiUrl}/models/llm/ollama`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              type: "language_model",
              provider: "ollama",
              id: "ollama/llama3",
              name: "Llama 3 (Ollama)",
            },
          ]),
        });
      });

      await navigateToPage(page, "/chat");
      await page.locator(".select-model-button").first().click();

      await page
        .locator('[placeholder="Search language models..."]')
        .waitFor({ state: "visible", timeout: 8_000 });

      // All models visible initially
      await expect(page.getByText("Fake Alpha")).toBeVisible({
        timeout: 8_000,
      });
      await expect(page.getByText("Llama 3 (Ollama)")).toBeVisible({
        timeout: 8_000,
      });

      // Click the "fake" provider in the sidebar to filter
      await page.locator('[title="fake"]').click();
      await waitForAnimation(page);

      // Only fake-provider models should be visible
      await expect(page.getByText("Fake Alpha")).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText("Llama 3 (Ollama)")).not.toBeVisible();
    });
  });

  // -------------------------------------------------------------------------
  // Error / edge-case tests
  // -------------------------------------------------------------------------

  test.describe("Language model select – error handling", () => {
    test("dialog opens even when provider model endpoint returns an error", async ({
      page,
    }) => {
      await setupMockApiRoutes(page);
      // Providers returns fake provider
      const apiUrl = getBackendApiUrl();
      await page.route(`${apiUrl}/models/providers`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { provider: FAKE_PROVIDER, capabilities: ["generate_message"] },
          ]),
        });
      });
      // But the model endpoint fails
      await page.route(`${apiUrl}/models/llm/${FAKE_PROVIDER}`, async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Internal Server Error" }),
        });
      });

      await navigateToPage(page, "/chat");
      await page.locator(".select-model-button").first().click();

      // The dialog itself should still open (graceful degradation)
      const popover = page.locator('[role="presentation"]').first();
      await expect(popover).toBeVisible({ timeout: 8_000 });
    });

    test("dialog opens when providers endpoint returns empty array", async ({
      page,
    }) => {
      await setupMockApiRoutes(page);
      const apiUrl = getBackendApiUrl();
      await page.route(`${apiUrl}/models/providers`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      });

      await navigateToPage(page, "/chat");
      await page.locator(".select-model-button").first().click();

      const popover = page.locator('[role="presentation"]').first();
      await expect(popover).toBeVisible({ timeout: 8_000 });
    });
  });
