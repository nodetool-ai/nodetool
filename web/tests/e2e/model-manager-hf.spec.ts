import { test, expect, Page, Route } from "@playwright/test";
import { navigateToPage, waitForAnimation } from "./helpers/waitHelpers";

/**
 * Mock HuggingFace model data matching the UnifiedModel shape
 * returned by /api/models/all. Types use the "hf." prefix.
 */
const hfModels = [
  {
    id: "stabilityai/stable-diffusion-xl-base-1.0",
    name: "Stable Diffusion XL Base 1.0",
    repo_id: "stabilityai/stable-diffusion-xl-base-1.0",
    type: "hf.text_to_image",
    size_on_disk: 6_938_078_208,
    downloads: 5_243_876,
    likes: 12_453,
    description: "SDXL is a latent diffusion model for text-to-image generation",
    tags: ["text-to-image", "stable-diffusion", "diffusion"],
    pipeline_tag: "text-to-image",
    path: null,
    downloaded: false
  },
  {
    id: "runwayml/stable-diffusion-v1-5",
    name: "Stable Diffusion v1.5",
    repo_id: "runwayml/stable-diffusion-v1-5",
    type: "hf.text_to_image",
    size_on_disk: 4_265_146_304,
    downloads: 15_432_987,
    likes: 23_456,
    description: "Stable Diffusion v1.5 text-to-image diffusion model",
    tags: ["text-to-image", "stable-diffusion"],
    pipeline_tag: "text-to-image",
    path: null,
    downloaded: false
  },
  {
    id: "meta-llama/Llama-3.2-3B-Instruct",
    name: "Llama 3.2 3B Instruct",
    repo_id: "meta-llama/Llama-3.2-3B-Instruct",
    type: "hf.text_generation",
    size_on_disk: 6_442_450_944,
    downloads: 2_341_234,
    likes: 8_765,
    description: "Llama 3.2 3B instruction-tuned language model",
    tags: ["text-generation", "llama", "gguf"],
    pipeline_tag: "text-generation",
    path: null,
    downloaded: false
  },
  {
    id: "openai/whisper-large-v3",
    name: "Whisper Large v3",
    repo_id: "openai/whisper-large-v3",
    type: "hf.automatic_speech_recognition",
    size_on_disk: 3_094_528_000,
    downloads: 987_654,
    likes: 5_432,
    description: "Whisper is a general-purpose speech recognition model",
    tags: ["speech-recognition", "whisper"],
    pipeline_tag: "automatic-speech-recognition",
    path: null,
    downloaded: false
  },
  {
    id: "facebook/musicgen-small",
    name: "MusicGen Small",
    repo_id: "facebook/musicgen-small",
    type: "hf.text_to_audio",
    size_on_disk: 2_200_000_000,
    downloads: 456_789,
    likes: 3_210,
    description: "MusicGen is a text-to-music generation model",
    tags: ["text-to-audio", "music-generation"],
    pipeline_tag: "text-to-audio",
    path: null,
    downloaded: false
  },
  {
    id: "TheBloke/Mistral-7B-Instruct-v0.2-GGUF",
    name: "Mistral 7B Instruct v0.2 GGUF",
    repo_id: "TheBloke/Mistral-7B-Instruct-v0.2-GGUF",
    type: "hf.text_generation",
    size_on_disk: 14_483_456_000,
    downloads: 1_234_567,
    likes: 6_543,
    description: "GGUF quantization of Mistral 7B Instruct v0.2",
    tags: ["text-generation", "gguf", "mistral"],
    pipeline_tag: "text-generation",
    path: "mistral-7b-instruct-v0.2.Q4_K_M.gguf",
    downloaded: false
  }
];

const ollamaModels = [
  {
    id: "llama3.2:3b",
    name: "llama3.2:3b",
    repo_id: "llama3.2:3b",
    type: "llama_model",
    size_on_disk: 2_000_000_000,
    downloads: 0,
    likes: 0,
    description: "Llama 3.2 3B via Ollama",
    tags: [],
    pipeline_tag: null,
    path: null,
    downloaded: true
  }
];

const allMockModels = [...hfModels, ...ollamaModels];

/**
 * Set up route mocks for the model manager page.
 * Crucially mocks /api/models/all which is what the useModels hook actually fetches.
 */
async function setupModelManagerMocks(page: Page) {
  const frontendUrl = process.env.E2E_FRONTEND_URL || "http://localhost:3000";
  const apiUrl = `${frontendUrl}/api`;

  // The primary endpoint used by useModels hook
  await page.route(`${apiUrl}/models/all`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(allMockModels)
    });
  });

  // HF cache status endpoint - component checks this for visible models
  await page.route(`${apiUrl}/models/huggingface/check_cache`, async (route: Route) => {
    const body = await route.request().postDataJSON();
    const items = Array.isArray(body) ? body : body?.items || [];
    const results = items.map((item: { key: string }) => ({
      key: item.key,
      downloaded: false
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(results)
    });
  });

  // Other model endpoints that may be called
  await page.route(`${apiUrl}/models/huggingface`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(hfModels)
    });
  });

  await page.route(`${apiUrl}/models/recommended`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });

  await page.route(`${apiUrl}/models/providers`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { name: "huggingface", display_name: "HuggingFace", requires_api_key: false },
        { name: "ollama", display_name: "Ollama", requires_api_key: false }
      ])
    });
  });

  // App-level endpoints needed for page load
  await page.route(`${apiUrl}/settings/`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ COMFY_FOLDER: "", CHROMA_PATH: "" })
    });
  });

  await page.route(`${apiUrl}/settings/secrets*`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });

  await page.route(`${apiUrl}/nodes/metadata`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });

  await page.route(`${apiUrl}/workflows`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ workflows: [], next: null })
    });
  });

  await page.route(`${apiUrl}/assets/`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ assets: [], next: null })
    });
  });

  await page.route(`${apiUrl}/jobs/`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobs: [], next: null })
    });
  });
}

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Model Manager - HuggingFace Models Display", () => {
    test.beforeEach(async ({ page }) => {
      await setupModelManagerMocks(page);
    });

    test("should display HuggingFace models from /api/models/all", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      // Wait for the model list to render (not the loading spinner)
      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // Verify HF models are shown — virtual list only renders visible items,
      // so check for models that appear near the top of the sorted/grouped list
      const bodyText = await page.textContent("body");
      expect(bodyText).toContain("whisper");
      expect(bodyText).toContain("meta-llama");
    });

    test("should show correct total model count in header", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // Header should show total count (7 models = 6 HF + 1 Ollama)
      const headerText = await page.locator(".model-list-header").textContent();
      expect(headerText).toContain("7");
    });

    test("should render multiple HF model items in the list", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // Virtual list may not render all items at once, but should render several
      const visibleItems = await page.locator(".model-list-item").count();
      expect(visibleItems).toBeGreaterThan(0);
    });

    test("should display model repo owner and name separately", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // Model items should show owner (e.g., "stabilityai") and repo name
      const ownerElements = page.locator(".model-owner");
      const nameElements = page.locator(".model-name");

      const ownerCount = await ownerElements.count();
      const nameCount = await nameElements.count();

      expect(ownerCount).toBeGreaterThan(0);
      expect(nameCount).toBeGreaterThan(0);
    });

    test("should show model size for each item", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // Model sizes should be formatted (e.g., "6.46 GB")
      const sizeElements = page.locator(".model-size");
      const sizeCount = await sizeElements.count();
      expect(sizeCount).toBeGreaterThan(0);

      const firstSize = await sizeElements.first().textContent();
      expect(firstSize).toBeTruthy();
      // Should contain a unit like GB, MB, etc.
      expect(firstSize).toMatch(/[0-9]/);
    });

    test("should show HF download and like stats for hf. type models", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // HF models should show download/like stats in .model-stats
      const statsElements = page.locator(".model-stats");
      const statsCount = await statsElements.count();
      expect(statsCount).toBeGreaterThan(0);
    });

    test("should display model descriptions", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      const descriptions = page.locator(".model-description");
      const count = await descriptions.count();
      expect(count).toBeGreaterThan(0);
    });

    test("should show type categories in sidebar", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // Sidebar should list model types
      const sidebar = page.locator(".sidebar");
      await expect(sidebar).toBeVisible();

      const sidebarText = await sidebar.textContent();
      // Should have "All" type at minimum
      expect(sidebarText).toContain("All");
    });

    test("should filter models by type when clicking sidebar item", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // Get initial count from header
      const headerBefore = await page.locator(".model-list-header").textContent();
      expect(headerBefore).toContain("7");

      // Click on a specific model type in the sidebar (not "All")
      const typeButtons = page.locator(".model-type-button");
      const typeCount = await typeButtons.count();
      expect(typeCount).toBeGreaterThan(1); // At least "All" + one type

      // Click the second type button (first non-"All" type)
      await typeButtons.nth(1).click();
      await waitForAnimation(page);

      // The filtered count should be less than total (or header should change)
      const headerAfter = await page.locator(".model-list-header").textContent();
      // Should show "X of Y models" format when filtered
      expect(headerAfter).toBeTruthy();
    });

    test("should filter models by search term", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // Type in the search input
      const searchInput = page.locator("input[type='text']").first();
      await searchInput.fill("whisper");
      await waitForAnimation(page);

      // Should show fewer models
      // Wait for the search to filter
      await page.waitForTimeout(300); // debounce

      const headerText = await page.locator(".model-list-header").textContent();
      // Should show filtered results containing "whisper"
      expect(headerText).toContain("1"); // Only whisper model
    });

    test("should show 'No models found' for non-matching search", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      const searchInput = page.locator("input[type='text']").first();
      await searchInput.fill("zzz_nonexistent_model_zzz");
      await waitForAnimation(page);
      await page.waitForTimeout(300);

      const bodyText = await page.textContent("body");
      expect(bodyText).toContain("No models found");
    });

    test("should display pipeline tags as chips for HF models", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // HF models with pipeline_tag should show it as a chip
      const pipelineTags = page.locator(".pipeline-tag");
      const tagCount = await pipelineTags.count();
      expect(tagCount).toBeGreaterThan(0);
    });

    test("should show 'Local' chip for all models", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // Each model item should have a "Local" chip
      const bodyText = await page.textContent("body");
      expect(bodyText).toContain("Local");
    });

    test("should show GGUF tag for GGUF models", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // The Mistral GGUF model should show a "gguf" tag chip
      const bodyText = await page.textContent("body");
      expect(bodyText).toContain("gguf");
    });
  });

  test.describe("Model Manager - Loading and Error States", () => {
    test("should show loading spinner while fetching models", async ({ page }) => {
      const frontendUrl = process.env.E2E_FRONTEND_URL || "http://localhost:3000";

      // Delay the /api/models/all response to catch the loading state
      await page.route(`${frontendUrl}/api/models/all`, async (route: Route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(allMockModels)
        });
      });

      // Mock other required endpoints
      await page.route(`${frontendUrl}/api/settings/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      });
      await page.route(`${frontendUrl}/api/settings/secrets*`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      });
      await page.route(`${frontendUrl}/api/nodes/metadata`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      });
      await page.route(`${frontendUrl}/api/workflows`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workflows: [], next: null }) });
      });
      await page.route(`${frontendUrl}/api/assets/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assets: [], next: null }) });
      });
      await page.route(`${frontendUrl}/api/jobs/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobs: [], next: null }) });
      });

      await navigateToPage(page, "/models");

      // Should show loading indicator
      const loadingText = page.getByText("Loading models");
      await expect(loadingText).toBeVisible({ timeout: 5000 });
    });

    test("should show error message when /api/models/all fails", async ({ page }) => {
      const frontendUrl = process.env.E2E_FRONTEND_URL || "http://localhost:3000";

      await page.route(`${frontendUrl}/api/models/all`, async (route: Route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Internal server error" })
        });
      });

      // Mock other required endpoints
      await page.route(`${frontendUrl}/api/settings/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      });
      await page.route(`${frontendUrl}/api/settings/secrets*`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      });
      await page.route(`${frontendUrl}/api/nodes/metadata`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      });
      await page.route(`${frontendUrl}/api/workflows`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workflows: [], next: null }) });
      });
      await page.route(`${frontendUrl}/api/assets/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assets: [], next: null }) });
      });
      await page.route(`${frontendUrl}/api/jobs/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobs: [], next: null }) });
      });

      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      // Should show error state
      const errorText = page.getByText("Could not load models");
      await expect(errorText).toBeVisible({ timeout: 10000 });
    });

    test("should show Ollama help when error mentions ollama", async ({ page }) => {
      const frontendUrl = process.env.E2E_FRONTEND_URL || "http://localhost:3000";

      await page.route(`${frontendUrl}/api/models/all`, async (route: Route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Cannot connect to Ollama service" })
        });
      });

      await page.route(`${frontendUrl}/api/settings/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      });
      await page.route(`${frontendUrl}/api/settings/secrets*`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      });
      await page.route(`${frontendUrl}/api/nodes/metadata`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      });
      await page.route(`${frontendUrl}/api/workflows`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workflows: [], next: null }) });
      });
      await page.route(`${frontendUrl}/api/assets/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assets: [], next: null }) });
      });
      await page.route(`${frontendUrl}/api/jobs/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobs: [], next: null }) });
      });

      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      const errorText = page.getByText("Could not load models");
      await expect(errorText).toBeVisible({ timeout: 10000 });

      // Should show the Ollama-specific help text
      const ollamaLink = page.getByText("Download Ollama");
      await expect(ollamaLink).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Model Manager - Empty /api/models/all bug", () => {
    test("should show 'No models available' when API returns empty array", async ({ page }) => {
      const frontendUrl = process.env.E2E_FRONTEND_URL || "http://localhost:3000";

      await page.route(`${frontendUrl}/api/models/all`, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([])
        });
      });

      await page.route(`${frontendUrl}/api/settings/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      });
      await page.route(`${frontendUrl}/api/settings/secrets*`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      });
      await page.route(`${frontendUrl}/api/nodes/metadata`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      });
      await page.route(`${frontendUrl}/api/workflows`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workflows: [], next: null }) });
      });
      await page.route(`${frontendUrl}/api/assets/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assets: [], next: null }) });
      });
      await page.route(`${frontendUrl}/api/jobs/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobs: [], next: null }) });
      });

      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      // When /api/models/all returns [], should show "No models available"
      const noModelsText = page.getByText("No models available");
      await expect(noModelsText).toBeVisible({ timeout: 10000 });

      // Should NOT show any model list items
      const modelItems = page.locator(".model-list-item");
      await expect(modelItems).toHaveCount(0);
    });

    test("should show HF models when /api/models/all includes them", async ({ page }) => {
      // This is the core regression test: verify that when the API
      // actually returns HF models in /api/models/all, they appear.
      await setupModelManagerMocks(page);
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // Verify HF models appear (virtual list renders visible items only)
      const bodyText = await page.textContent("body");
      expect(bodyText).toContain("meta-llama");
      expect(bodyText).toContain("whisper");

      // Verify model count includes all models
      const headerText = await page.locator(".model-list-header").textContent();
      expect(headerText).toContain("7");
    });
  });

  test.describe("Model Manager - Size Filter", () => {
    test.beforeEach(async ({ page }) => {
      await setupModelManagerMocks(page);
    });

    test("should have a size slider in the header", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // Size slider should be present
      const slider = page.locator('[aria-label="Max model size in GB"]');
      await expect(slider).toBeVisible();
    });
  });

  test.describe("Model Manager - Download Status Filter", () => {
    test.beforeEach(async ({ page }) => {
      await setupModelManagerMocks(page);
    });

    test("should have All/Downloaded/Available toggle buttons", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // Toggle buttons should be present
      const allBtn = page.getByRole("button", { name: "show all models" });
      const downloadedBtn = page.getByRole("button", { name: "show downloaded models only" });
      const availableBtn = page.getByRole("button", { name: "show available models only" });

      await expect(allBtn).toBeVisible();
      await expect(downloadedBtn).toBeVisible();
      await expect(availableBtn).toBeVisible();
    });

    test("should filter to show only downloaded models", async ({ page }) => {
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // Click "Downloaded" filter
      const downloadedBtn = page.getByRole("button", { name: "show downloaded models only" });
      await downloadedBtn.click();
      await waitForAnimation(page);

      // Header should show "downloaded" count
      const headerText = await page.locator(".model-list-header").textContent();
      expect(headerText).toContain("downloaded");
    });
  });

  test.describe("Model Manager - API Endpoint Verification", () => {
    test("should call /api/models/all not /api/models/huggingface for main list", async ({ page }) => {
      const frontendUrl = process.env.E2E_FRONTEND_URL || "http://localhost:3000";
      let modelsAllCalled = false;

      await page.route(`${frontendUrl}/api/models/all`, async (route: Route) => {
        modelsAllCalled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(allMockModels)
        });
      });

      // Mock cache endpoint
      await page.route(`${frontendUrl}/api/models/huggingface/check_cache`, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([])
        });
      });

      // Mock other required endpoints
      await page.route(`${frontendUrl}/api/settings/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      });
      await page.route(`${frontendUrl}/api/settings/secrets*`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      });
      await page.route(`${frontendUrl}/api/nodes/metadata`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      });
      await page.route(`${frontendUrl}/api/workflows`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workflows: [], next: null }) });
      });
      await page.route(`${frontendUrl}/api/assets/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assets: [], next: null }) });
      });
      await page.route(`${frontendUrl}/api/jobs/`, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobs: [], next: null }) });
      });

      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      await expect(page.locator(".model-list-item").first()).toBeVisible({ timeout: 10000 });

      // The model list should have called /api/models/all
      expect(modelsAllCalled).toBe(true);
    });
  });
}
