import { test, expect } from "@playwright/test";

// Backend API URL - matches the nodetool server URL used in e2e tests
const BACKEND_URL = "http://localhost:7777";
const BACKEND_WS_URL = "ws://localhost:7777";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Model Download", () => {
    // Use a very small test model from HuggingFace (< 1MB)
    // hf-internal-testing/tiny-random-gpt2 is a tiny model specifically for testing
    const TEST_MODEL_REPO_ID = "hf-internal-testing/tiny-random-gpt2";
    
    test("should download a small HuggingFace model successfully", async ({ page }) => {
      // Increase timeout for download operation
      test.setTimeout(180000); // 3 minutes max for the download

      // Navigate to models page
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Start the download and wait for completion using WebSocket inside the page context
      const downloadResult = await page.evaluate(async ({ repoId, wsUrl }: { repoId: string; wsUrl: string }) => {
        return new Promise<{ success: boolean; error?: string; data?: unknown }>((resolve) => {
          const ws = new WebSocket(`${wsUrl}/ws/download`);
          
          // Timeout after 120 seconds
          const timeout = setTimeout(() => {
            ws.close();
            resolve({ success: false, error: "Download timeout - model download took too long" });
          }, 120000);
          
          ws.onopen = () => {
            console.log("WebSocket connected, starting download...");
            ws.send(JSON.stringify({
              command: "start_download",
              repo_id: repoId,
              path: null,
              allow_patterns: null,
              ignore_patterns: null,
              model_type: "hf.model"
            }));
          };
          
          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data as string);
              console.log("Download progress:", data);
              
              if (data.status === "completed" && data.repo_id === repoId) {
                clearTimeout(timeout);
                ws.close();
                resolve({ success: true, data });
              } else if (data.status === "error") {
                clearTimeout(timeout);
                ws.close();
                resolve({ 
                  success: false, 
                  error: data.error || data.message || "Unknown download error" 
                });
              }
            } catch {
              // Ignore non-JSON frames
            }
          };
          
          ws.onerror = (error) => {
            clearTimeout(timeout);
            resolve({ success: false, error: `WebSocket error: ${error}` });
          };
          
          ws.onclose = (event) => {
            if (event.code !== 1000) {
              // Abnormal closure
              clearTimeout(timeout);
              resolve({ success: false, error: `WebSocket closed unexpectedly: ${event.code}` });
            }
          };
        });
      }, { repoId: TEST_MODEL_REPO_ID, wsUrl: BACKEND_WS_URL });

      // Assert download was successful
      expect(downloadResult.success).toBe(true);
      if (!downloadResult.success) {
        console.error("Download failed:", downloadResult.error);
      }

      // Verify the model appears in the downloaded models list
      // Make API request to check the model is now available
      const response = await page.request.get(`${BACKEND_URL}/api/models/huggingface`);
      expect(response.ok()).toBeTruthy();
      
      const models = await response.json();
      // Check that our downloaded model appears in the list
      const downloadedModel = models.find((m: { repo_id?: string; id?: string }) => 
        m.repo_id === TEST_MODEL_REPO_ID || m.id === TEST_MODEL_REPO_ID
      );
      expect(downloadedModel).toBeDefined();
    });

    test("should connect to download WebSocket endpoint", async ({ page }) => {
      // Navigate to models page
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Test that we can connect to the WebSocket endpoint
      const canConnect = await page.evaluate(async (wsUrl: string) => {
        return new Promise<boolean>((resolve) => {
          const ws = new WebSocket(`${wsUrl}/ws/download`);
          
          const timeout = setTimeout(() => {
            ws.close();
            resolve(false);
          }, 5000);
          
          ws.onopen = () => {
            clearTimeout(timeout);
            ws.close();
            resolve(true);
          };
          
          ws.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
          };
        });
      }, BACKEND_WS_URL);

      expect(canConnect).toBe(true);
    });

    test("should have network access to HuggingFace", async ({ request }) => {
      // Test that we can reach HuggingFace Hub API (validates no network restrictions)
      // Using the Hub API directly to check connectivity
      const response = await request.get(
        "https://huggingface.co/api/models/hf-internal-testing/tiny-random-gpt2"
      );
      
      expect(response.ok()).toBeTruthy();
      
      const modelInfo = await response.json();
      expect(modelInfo.id).toBe("hf-internal-testing/tiny-random-gpt2");
    });
  });
}
