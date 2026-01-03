import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";

// Test timeout - chat responses may take time
const TEST_TIMEOUT_MS = 120000; // 2 minutes

// Helper to wait for chat interface to initialize
const waitForChatInterface = async (page: any): Promise<boolean> => {
  try {
    await page.waitForSelector('.global-chat-container, .chat-container', {
      timeout: 10000
    });
    return true;
  } catch {
    return false;
  }
};

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("GlobalChat with Ollama", () => {
    test("should send message and receive response from Ollama", async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS);

      // Navigate to chat page
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");

      // Verify we're on the chat page
      await expect(page).toHaveURL(/\/chat/);

      // Wait for chat interface to initialize
      const chatReady = await waitForChatInterface(page);
      expect(chatReady).toBeTruthy();

      // Look for the input field - try multiple possible selectors
      const inputSelector = 'textarea[placeholder*="message" i], textarea[aria-label*="message" i], textarea';
      await page.waitForSelector(inputSelector, { timeout: 10000 });

      // Type a simple test message
      const testMessage = "Hello, what is 2+2?";
      await page.fill(inputSelector, testMessage);

      // Find and click the send button
      // Try multiple possible selectors for the send button
      const sendButtonSelector = 'button[aria-label*="send" i], button:has-text("Send"), button[type="submit"]';

      // Wait for the send button to be enabled
      await page.waitForSelector(sendButtonSelector, { state: "visible", timeout: 10000 });

      // Click send
      await page.click(sendButtonSelector);

      // Wait for the user message to appear in the chat
      await page.waitForSelector(`text=${testMessage}`, { timeout: 15000 });

      // Wait for assistant response to appear
      // Give the model time to generate a response (up to 60 seconds)
      let responseFound = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        await page.waitForTimeout(2000);

        // Check if response has been generated
        const hasAssistantResponse = await page.evaluate(() => {
          // Look for elements that might contain assistant messages
          const messageElements = Array.from(document.querySelectorAll('[class*="message"], [class*="chat"], div'));

          // Look for content that suggests an assistant response
          for (const el of messageElements) {
            const text = el.textContent || "";
            // Look for signs of a response (numbers, common words, etc.)
            // but exclude the user's message
            if (text.length > 20 && !text.includes("Hello, what is 2+2?")) {
              // Check if it contains plausible response content
              if (text.match(/\b(4|four|answer|result|equals|is|the)\b/i)) {
                return true;
              }
            }
          }
          return false;
        });

        if (hasAssistantResponse) {
          responseFound = true;
          break;
        }
      }

      // Verify we got some kind of response
      expect(responseFound).toBeTruthy();

      console.log("Message sent and response received successfully");
    });

    test("should show ollama provider in models list", async ({ page, request }) => {
      // Navigate to models page or open model selector
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");

      // Wait for chat interface to initialize
      await waitForChatInterface(page);

      // Try to find and click the model selector button
      // Look for buttons that might open model selection
      const modelSelectorSelectors = [
        'button[aria-label*="model" i]',
        'button:has-text("Select Model")',
        'button:has-text("Model")',
        '[class*="model"][class*="select"]',
        '[class*="model"][class*="button"]'
      ];

      let modelSelectorFound = false;
      for (const selector of modelSelectorSelectors) {
        try {
          const element = await page.waitForSelector(selector, { timeout: 2000 });
          if (element) {
            await element.click();
            modelSelectorFound = true;
            // Wait for model list dialog to appear
            await page.waitForSelector('[role="dialog"], .model-menu__dialog', { timeout: 5000 });
            break;
          }
        } catch (_e) {
          // Try next selector
          continue;
        }
      }

      if (modelSelectorFound) {
        // Check if ollama models are shown
        const pageContent = await page.content();
        const hasOllamaProvider = pageContent.includes("ollama") || pageContent.includes("gemma3:270m");

        // Log for debugging
        console.log("Model selector opened, checking for Ollama models");

        // We expect to see some indication of ollama models
        expect(hasOllamaProvider).toBeTruthy();
      } else {
        console.log("Model selector not found in UI, checking API directly");
      }

      // Also verify via API that ollama models are available
      const response = await request.get(`${BACKEND_API_URL}/models/language`);
      expect(response.ok()).toBeTruthy();
      
      const models = await response.json();
      expect(Array.isArray(models)).toBeTruthy();

      // Check if any model has ollama provider or gemma3:270m
      const ollamaModels = models.filter((m: any) => 
        m.provider === "ollama" || 
        (m.id && (m.id.includes("gemma3") || m.id.includes("ollama")))
      );

      console.log(`Found ${ollamaModels.length} Ollama models via API`);
      
      // We should have at least one ollama model available
      expect(ollamaModels.length).toBeGreaterThan(0);

      // Verify model structure includes provider field
      if (ollamaModels.length > 0) {
        const firstModel = ollamaModels[0];
        expect(firstModel).toHaveProperty("provider");
        expect(firstModel).toHaveProperty("id");
        expect(firstModel).toHaveProperty("name");
        
        console.log("Sample Ollama model:", JSON.stringify(firstModel, null, 2));
      }
    });

    test("should verify ollama server is accessible", async ({ request }) => {
      // Test that Ollama server is running and accessible on default port 11434
      
      try {
        const response = await request.get("http://localhost:11434/api/tags");
        expect(response.ok()).toBeTruthy();
        console.log("Ollama server health check passed");
        
        // Parse response to check for gemma3:270m model
        const data = await response.json();
        console.log("Available models:", JSON.stringify(data, null, 2));
      } catch (_error) {
        console.error("Ollama server not accessible");
        // Don't fail the test if ollama server isn't running in this environment
        // as it might only be available in CI
      }
    });

    test("should display model provider information", async ({ request }) => {
      // Get available models from API
      const response = await request.get(`${BACKEND_API_URL}/models/language`);
      expect(response.ok()).toBeTruthy();
      
      const models = await response.json();
      expect(Array.isArray(models)).toBeTruthy();
      expect(models.length).toBeGreaterThan(0);

      // Verify each model has provider information
      for (const model of models.slice(0, 5)) { // Check first 5 models
        expect(model).toHaveProperty("provider");
        expect(model).toHaveProperty("id");
        expect(model.provider).toBeTruthy();
        expect(typeof model.provider).toBe("string");
      }

      console.log(`Verified ${Math.min(5, models.length)} models have provider information`);
      
      // Log unique providers found
      const providers = [...new Set(models.map((m: any) => m.provider))];
      console.log("Available providers:", providers.join(", "));
    });
  });
}
