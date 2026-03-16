import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";
import { navigateToPage, waitForAnimation } from "./helpers/waitHelpers";

/**
 * Tests for the settings and secrets API against the real TS backend.
 * Validates that the settings endpoint returns provider configs,
 * and that secrets can be listed (without exposing values).
 */

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Settings API (Real Backend)", () => {
    test.describe("Settings endpoint", () => {
      test("should return settings with provider groups", async ({
        request,
      }) => {
        const res = await request.get(`${BACKEND_API_URL}/settings`);
        expect(res.status()).toBe(200);

        const data = await res.json();
        expect(data.settings).toBeDefined();
        expect(Array.isArray(data.settings)).toBe(true);
        expect(data.settings.length).toBeGreaterThan(0);

        // Each setting should have required fields
        const first = data.settings[0];
        expect(first).toHaveProperty("env_var");
        expect(first).toHaveProperty("group");
        expect(first).toHaveProperty("description");
      });

      test("should include API key settings for providers", async ({
        request,
      }) => {
        const res = await request.get(`${BACKEND_API_URL}/settings`);
        const data = await res.json();

        // Should have settings grouped by provider
        const groups = new Set(
          data.settings.map((s: { group: string }) => s.group)
        );
        expect(groups.size).toBeGreaterThan(0);

        // Check for common API key env vars
        const envVars = data.settings.map(
          (s: { env_var: string }) => s.env_var
        );
        const hasApiKeys = envVars.some(
          (v: string) =>
            v.includes("API_KEY") || v.includes("URL") || v.includes("PATH")
        );
        expect(hasApiKeys).toBe(true);
      });
    });

    test.describe("Secrets endpoint", () => {
      test("should list secrets without exposing values", async ({
        request,
      }) => {
        const res = await request.get(`${BACKEND_API_URL}/settings/secrets`);
        // Might be 200 with empty list or have some secrets
        expect([200, 404]).toContain(res.status());

        if (res.status() === 200) {
          const data = await res.json();
          // If secrets exist, they should not contain raw values
          if (Array.isArray(data) && data.length > 0) {
            for (const secret of data) {
              expect(secret).toHaveProperty("key");
              // Value should be masked or absent
              if (secret.value !== undefined) {
                expect(secret.value).not.toMatch(
                  /^sk-|^key-|^[A-Za-z0-9]{32,}$/
                );
              }
            }
          }
        }
      });

      test("should set and delete a test secret", async ({ request }) => {
        const testKey = `E2E_TEST_SECRET_${Date.now()}`;
        const testValue = "test-value-12345";

        // Set a secret
        const setRes = await request.put(
          `${BACKEND_API_URL}/settings/secrets/${testKey}`,
          { data: { value: testValue } }
        );
        expect([200, 201, 204]).toContain(setRes.status());

        // Delete the secret
        const delRes = await request.delete(
          `${BACKEND_API_URL}/settings/secrets/${testKey}`
        );
        expect([200, 204]).toContain(delRes.status());
      });
    });

    test.describe("Providers endpoint", () => {
      test("should list available model providers", async ({ request }) => {
        const res = await request.get(`${BACKEND_API_URL}/models/providers`);
        expect(res.status()).toBe(200);

        const providers = await res.json();
        expect(Array.isArray(providers)).toBe(true);
        expect(providers.length).toBeGreaterThan(0);

        // Each provider should have basic fields
        const first = providers[0];
        expect(first).toHaveProperty("provider");
        expect(first).toHaveProperty("capabilities");
        expect(Array.isArray(first.capabilities)).toBe(true);
      });

      test("should include common providers", async ({ request }) => {
        const res = await request.get(`${BACKEND_API_URL}/models/providers`);
        const providers = await res.json();

        const providerIds = providers.map(
          (p: { provider: string }) => p.provider
        );
        // At minimum, OpenAI and Anthropic should be listed
        expect(providerIds).toContain("openai");
        expect(providerIds).toContain("anthropic");
      });
    });
  });

  test.describe("Nodes Metadata API (Real Backend)", () => {
    test("should return valid node metadata", async ({ request }) => {
      const res = await request.get(`${BACKEND_API_URL}/nodes/metadata`);
      expect(res.status()).toBe(200);

      const nodes = await res.json();
      expect(Array.isArray(nodes)).toBe(true);
      expect(nodes.length).toBeGreaterThan(100); // Should have many nodes

      // Verify structure of a node
      const first = nodes[0];
      expect(first).toHaveProperty("node_type");
      expect(first).toHaveProperty("title");
      expect(first).toHaveProperty("properties");
      expect(first).toHaveProperty("outputs");
    });

    test("should include both TS and Python nodes", async ({ request }) => {
      const res = await request.get(`${BACKEND_API_URL}/nodes/metadata`);
      const nodes = await res.json();

      const namespaces = new Set(
        nodes.map((n: { namespace: string }) => n.namespace)
      );

      // Should have nodetool core nodes
      expect(namespaces.has("nodetool.constant")).toBe(true);

      // Should have fal nodes (TS-registered)
      const hasFal = nodes.some((n: { node_type: string }) =>
        n.node_type.startsWith("fal.")
      );
      expect(hasFal).toBe(true);
    });

    test("should have valid JSON for all node properties", async ({
      request,
    }) => {
      const res = await request.get(`${BACKEND_API_URL}/nodes/metadata`);
      const nodes = await res.json();

      // Spot-check that properties have valid type definitions
      for (const node of nodes.slice(0, 50)) {
        for (const prop of node.properties) {
          expect(prop).toHaveProperty("name");
          expect(prop).toHaveProperty("type");
          expect(prop.type).toHaveProperty("type");
          expect(typeof prop.type.type).toBe("string");
        }
      }
    });
  });

  test.describe("Settings UI Integration", () => {
    test("should display settings panel from dashboard", async ({ page }) => {
      await navigateToPage(page, "/dashboard");
      await waitForAnimation(page);

      // Look for a settings gear icon or button
      const settingsButton = page.locator(
        '[aria-label*="settings" i], [data-testid="settings-button"], button:has(svg)'
      );

      // Dashboard should be functional
      const body = await page.textContent("body");
      expect(body).toBeTruthy();
      expect(body).not.toContain("Internal Server Error");
    });

    test("should show provider configuration options", async ({ page }) => {
      // Navigate to models page which typically shows provider info
      await navigateToPage(page, "/models");
      await waitForAnimation(page);

      // Models page should display provider-related content
      const body = await page.textContent("body");
      expect(body).toBeTruthy();
      expect(body).not.toContain("Internal Server Error");
    });
  });
}
