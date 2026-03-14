import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";
import { navigateToPage, waitForAnimation } from "./helpers/waitHelpers";

/**
 * Asset CRUD tests against the real TS backend.
 * These verify creating, listing, reading, updating, and deleting assets
 * through the API, covering the asset consumer hooks:
 *   - useJobAssets (GET /api/assets/?job_id=...)
 *   - useNodeAssets (GET /api/assets/?node_id=...)
 *   - AssetStore (POST/PUT/DELETE /api/assets/)
 */

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Assets API (Real Backend)", () => {
    // Track asset IDs created during tests for cleanup
    const createdAssetIds: string[] = [];

    test.afterAll(async ({ request }) => {
      for (const id of createdAssetIds) {
        try {
          await request.delete(`${BACKEND_API_URL}/assets/${id}`);
        } catch {
          // ignore cleanup failures
        }
      }
    });

    test.describe("Asset CRUD lifecycle", () => {
      test("should create a folder asset via API", async ({ request }) => {
        const name = `e2e-folder-${Date.now()}`;
        const res = await request.post(`${BACKEND_API_URL}/assets/`, {
          data: {
            name,
            content_type: "folder",
            parent_id: ""
          }
        });
        expect(res.status()).toBe(200);

        const asset = await res.json();
        createdAssetIds.push(asset.id);

        expect(asset.id).toBeTruthy();
        expect(asset.name).toBe(name);
        expect(asset.content_type).toBe("folder");
        expect(asset.created_at).toBeTruthy();
      });

      test("should create a text asset via API", async ({ request }) => {
        const name = `e2e-text-${Date.now()}.txt`;
        const res = await request.post(`${BACKEND_API_URL}/assets/`, {
          data: {
            name,
            content_type: "text/plain",
            parent_id: ""
          }
        });
        expect(res.status()).toBe(200);

        const asset = await res.json();
        createdAssetIds.push(asset.id);

        expect(asset.id).toBeTruthy();
        expect(asset.name).toBe(name);
        expect(asset.content_type).toBe("text/plain");
      });

      test("should list assets via API", async ({ request }) => {
        // Create an asset first
        const name = `e2e-list-${Date.now()}`;
        const createRes = await request.post(`${BACKEND_API_URL}/assets/`, {
          data: {
            name,
            content_type: "text/plain",
            parent_id: ""
          }
        });
        const asset = await createRes.json();
        createdAssetIds.push(asset.id);

        // List all assets
        const listRes = await request.get(`${BACKEND_API_URL}/assets/`);
        expect(listRes.status()).toBe(200);

        const list = await listRes.json();
        expect(list.assets).toBeDefined();
        expect(Array.isArray(list.assets)).toBe(true);

        // Our asset should be in the list
        const found = list.assets.find(
          (a: { id: string }) => a.id === asset.id
        );
        expect(found).toBeDefined();
        expect(found.name).toBe(name);
      });

      test("should get a single asset by ID", async ({ request }) => {
        const name = `e2e-get-${Date.now()}`;
        const createRes = await request.post(`${BACKEND_API_URL}/assets/`, {
          data: {
            name,
            content_type: "text/plain",
            parent_id: ""
          }
        });
        const asset = await createRes.json();
        createdAssetIds.push(asset.id);

        const getRes = await request.get(
          `${BACKEND_API_URL}/assets/${asset.id}`
        );
        expect(getRes.status()).toBe(200);

        const fetched = await getRes.json();
        expect(fetched.id).toBe(asset.id);
        expect(fetched.name).toBe(name);
        expect(fetched.content_type).toBe("text/plain");
      });

      test("should update an asset name via PUT", async ({ request }) => {
        const createRes = await request.post(`${BACKEND_API_URL}/assets/`, {
          data: {
            name: `e2e-update-${Date.now()}`,
            content_type: "text/plain",
            parent_id: ""
          }
        });
        const asset = await createRes.json();
        createdAssetIds.push(asset.id);

        const newName = `e2e-renamed-${Date.now()}.txt`;
        const updateRes = await request.put(
          `${BACKEND_API_URL}/assets/${asset.id}`,
          { data: { name: newName } }
        );
        expect(updateRes.status()).toBe(200);

        const updated = await updateRes.json();
        expect(updated.name).toBe(newName);
      });

      test("should delete an asset", async ({ request }) => {
        const createRes = await request.post(`${BACKEND_API_URL}/assets/`, {
          data: {
            name: `e2e-delete-${Date.now()}`,
            content_type: "text/plain",
            parent_id: ""
          }
        });
        const asset = await createRes.json();

        const deleteRes = await request.delete(
          `${BACKEND_API_URL}/assets/${asset.id}`
        );
        expect([200, 204]).toContain(deleteRes.status());

        // Verify it's gone
        const getRes = await request.get(
          `${BACKEND_API_URL}/assets/${asset.id}`
        );
        expect(getRes.status()).toBe(404);
      });
    });

    test.describe("Asset hierarchy", () => {
      test("should create a child asset inside a folder", async ({
        request
      }) => {
        // Create parent folder
        const folderRes = await request.post(`${BACKEND_API_URL}/assets/`, {
          data: {
            name: `e2e-parent-${Date.now()}`,
            content_type: "folder",
            parent_id: ""
          }
        });
        const folder = await folderRes.json();
        createdAssetIds.push(folder.id);

        // Create child asset
        const childRes = await request.post(`${BACKEND_API_URL}/assets/`, {
          data: {
            name: `e2e-child-${Date.now()}.txt`,
            content_type: "text/plain",
            parent_id: folder.id
          }
        });
        expect(childRes.status()).toBe(200);
        const child = await childRes.json();
        createdAssetIds.push(child.id);

        expect(child.parent_id).toBe(folder.id);
      });

      test("should list assets filtered by parent_id", async ({ request }) => {
        // Create folder
        const folderRes = await request.post(`${BACKEND_API_URL}/assets/`, {
          data: {
            name: `e2e-filter-parent-${Date.now()}`,
            content_type: "folder",
            parent_id: ""
          }
        });
        const folder = await folderRes.json();
        createdAssetIds.push(folder.id);

        // Create child
        const childRes = await request.post(`${BACKEND_API_URL}/assets/`, {
          data: {
            name: `e2e-filter-child-${Date.now()}.txt`,
            content_type: "text/plain",
            parent_id: folder.id
          }
        });
        const child = await childRes.json();
        createdAssetIds.push(child.id);

        // List by parent_id
        const listRes = await request.get(
          `${BACKEND_API_URL}/assets/?parent_id=${folder.id}`
        );
        expect(listRes.status()).toBe(200);

        const list = await listRes.json();
        expect(list.assets).toBeDefined();
        const found = list.assets.find(
          (a: { id: string }) => a.id === child.id
        );
        expect(found).toBeDefined();
      });
    });

    test.describe("Asset error handling", () => {
      test("should return 404 for non-existent asset", async ({ request }) => {
        const res = await request.get(
          `${BACKEND_API_URL}/assets/nonexistent-id-12345`
        );
        expect(res.status()).toBe(404);
      });
    });

    test.describe("Assets UI integration", () => {
      test("should display assets page", async ({ page }) => {
        await navigateToPage(page, "/assets");
        await waitForAnimation(page);

        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        expect(body).not.toContain("Internal Server Error");
      });
    });
  });
}
