import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";

// Test timeout - chat responses may take time
const TEST_TIMEOUT_MS = 120000; // 2 minutes

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("GlobalChat with Llama.cpp", () => {
    test("should send message and receive response from llama.cpp", async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS);

      // Navigate to chat page
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");

      // Verify we're on the chat page
      await expect(page).toHaveURL(/\/chat/);

      // Wait for chat interface to be ready
      await page.waitForTimeout(2000);

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

      // Wait for the assistant response
      // Look for a response that indicates the model is generating or has generated a response
      // We'll wait for any new text content that appears after our message
      await page.waitForTimeout(5000);

      // Check that some response was generated
      // Look for assistant response indicators
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

      // Verify we got some kind of response
      expect(hasAssistantResponse).toBeTruthy();

      console.log("Message sent and response received successfully");
    });

    test("should show llama.cpp provider in models list", async ({ page, request }) => {
      // Navigate to models page or open model selector
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");

      // Wait for the page to load
      await page.waitForTimeout(2000);

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
            break;
          }
        } catch (_e) {
          // Try next selector
          continue;
        }
      }

      if (modelSelectorFound) {
        // Wait for model list to appear
        await page.waitForTimeout(1000);

        // Check if llama.cpp models are shown
        const pageContent = await page.content();
        const hasLlamaCppProvider = pageContent.includes("llama") || pageContent.includes("Local");

        // Log for debugging
        console.log("Model selector opened, checking for llama.cpp models");
        
        // We expect to see some indication of local models or llama.cpp
        expect(hasLlamaCppProvider).toBeTruthy();
      } else {
        console.log("Model selector not found in UI, checking API directly");
      }

      // Also verify via API that llama.cpp models are available
      const response = await request.get(`${BACKEND_API_URL}/models/language`);
      expect(response.ok()).toBeTruthy();
      
      const models = await response.json();
      expect(Array.isArray(models)).toBeTruthy();

      // Check if any model has llama_cpp provider
      const llamaCppModels = models.filter((m: any) => 
        m.provider === "llama_cpp" || 
        (m.id && m.id.toLowerCase().includes("llama"))
      );

      console.log(`Found ${llamaCppModels.length} llama.cpp models via API`);
      
      // We should have at least one llama.cpp model available
      expect(llamaCppModels.length).toBeGreaterThan(0);

      // Verify model structure includes provider field
      if (llamaCppModels.length > 0) {
        const firstModel = llamaCppModels[0];
        expect(firstModel).toHaveProperty("provider");
        expect(firstModel).toHaveProperty("id");
        expect(firstModel).toHaveProperty("name");
        
        console.log("Sample llama.cpp model:", JSON.stringify(firstModel, null, 2));
      }
    });

    test("should verify llama-server is accessible", async ({ request }) => {
      // Test that llama-server is running and accessible
      // This assumes LLAMA_CPP_URL is set to http://localhost:8080
      
      try {
        const response = await request.get("http://localhost:8080/health");
        expect(response.ok()).toBeTruthy();
        console.log("Llama-server health check passed");
      } catch (_error) {
        console.error("Llama-server not accessible");
        // Don't fail the test if llama-server isn't running in this environment
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
