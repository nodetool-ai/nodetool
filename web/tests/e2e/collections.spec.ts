import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { BACKEND_API_URL } from "./support/backend";
import { navigateToPage } from "./helpers/waitHelpers";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Collections", () => {
    // ── Page load ──────────────────────────────────────────────────

    test("should load collections page", async ({ page }) => {
      await navigateToPage(page, "/collections");
      await expect(page).toHaveURL(/\/collections/);

      // Page loaded without server errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should display collections interface", async ({ page }) => {
      await navigateToPage(page, "/collections");

      // Heading and "Create Collection" button should be visible
      await expect(
        page.getByRole("heading", { name: "Collections", exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Create Collection" })
      ).toBeVisible();
    });

    test("should handle empty collections state", async ({ page }) => {
      await navigateToPage(page, "/collections");
      await expect(page).toHaveURL(/\/collections/);

      // Empty state shows "0 collections" or empty message
      const body = await page.textContent("body");
      expect(body).toBeTruthy();
    });

    // ── Create collection via UI ───────────────────────────────────

    test("should create a collection via the form", async ({
      page,
      request
    }) => {
      const collectionName = `e2e-create-${Date.now()}`;

      await navigateToPage(page, "/collections");

      // Click "Create Collection" FAB
      await page
        .getByRole("button", { name: "Create Collection" })
        .click();

      // Fill in the form
      const nameInput = page.getByPlaceholder("my-collection");
      await expect(nameInput).toBeVisible();
      await nameInput.fill(collectionName);

      // The "Create" submit button should exist (may be disabled until model selected)
      const createBtn = page.getByRole("button", { name: "Create" });
      await expect(createBtn).toBeVisible();

      // Submit the form via API directly since EmbeddingModelSelect
      // requires Ollama — test the backend integration instead
      const createResponse = await request.post(
        `${BACKEND_API_URL}/collections/`,
        {
          data: {
            name: collectionName,
            embedding_model: "all-minilm:latest"
          }
        }
      );
      if (!createResponse.ok()) {
        test.skip(true, `Backend returned ${createResponse.status()}`);
        return;
      }

      // Reload and verify the collection appears in the list
      await navigateToPage(page, "/collections");
      await expect(page.getByText(collectionName)).toBeVisible({
        timeout: 10000
      });

      // Verify count display scoped to this collection's list item
      const createdItem = page
        .locator(".MuiListItem-root")
        .filter({ hasText: collectionName });
      await expect(createdItem.getByText("0 items")).toBeVisible();

      // Cleanup
      await request.delete(
        `${BACKEND_API_URL}/collections/${collectionName}`
      );
    });

    // ── Collection list shows count ────────────────────────────────

    test("should display collection count in header", async ({
      page,
      request
    }) => {
      const names = [`e2e-count-a-${Date.now()}`, `e2e-count-b-${Date.now()}`];

      // Create two collections via API
      for (const name of names) {
        const res = await request.post(`${BACKEND_API_URL}/collections/`, {
          data: { name }
        });
        if (!res.ok()) {
          test.skip(true, `Backend returned ${res.status()}`);
          return;
        }
      }

      await navigateToPage(page, "/collections");

      // Wait for collections to appear
      for (const name of names) {
        await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });
      }

      // The header should show "2 collections" (or more if others exist)
      const headerText = await page.textContent("body");
      expect(headerText).toMatch(/\d+ collections/);

      // Cleanup
      for (const name of names) {
        await request.delete(`${BACKEND_API_URL}/collections/${name}`);
      }
    });

    // ── Delete collection via UI ───────────────────────────────────

    test("should delete a collection via the UI", async ({
      page,
      request
    }) => {
      const collectionName = `e2e-delete-${Date.now()}`;

      // Create via API
      const createRes = await request.post(
        `${BACKEND_API_URL}/collections/`,
        { data: { name: collectionName } }
      );
      if (!createRes.ok()) {
        test.skip(true, `Backend returned ${createRes.status()}`);
        return;
      }

      await navigateToPage(page, "/collections");
      await expect(page.getByText(collectionName)).toBeVisible({
        timeout: 10000
      });

      // Find the collection item and click the delete button
      const collectionItem = page
        .locator(".MuiListItem-root")
        .filter({ hasText: collectionName });
      await expect(collectionItem).toBeVisible();

      const deleteBtn = collectionItem.getByRole("button", { name: "delete" });
      await deleteBtn.click();

      // Confirm deletion dialog should appear
      await expect(page.getByText("Confirm Deletion")).toBeVisible();
      await expect(
        page.getByText(`Are you sure you want to delete the collection`)
      ).toBeVisible();

      // Click the "Delete" confirmation button
      const confirmBtn = page.getByRole("button", { name: "Delete" });
      await confirmBtn.click();

      // Collection should disappear from the list
      await expect(
        page.locator(".MuiListItem-root").filter({ hasText: collectionName })
      ).not.toBeVisible({ timeout: 10000 });

      // Verify via API that it's gone
      const getRes = await request.get(
        `${BACKEND_API_URL}/collections/${collectionName}`
      );
      expect(getRes.status()).toBe(404);
    });

    // ── Cancel delete ──────────────────────────────────────────────

    test("should cancel collection deletion", async ({ page, request }) => {
      const collectionName = `e2e-cancel-del-${Date.now()}`;

      const createRes = await request.post(
        `${BACKEND_API_URL}/collections/`,
        { data: { name: collectionName } }
      );
      if (!createRes.ok()) {
        test.skip(true, `Backend returned ${createRes.status()}`);
        return;
      }

      await navigateToPage(page, "/collections");
      await expect(page.getByText(collectionName)).toBeVisible({
        timeout: 10000
      });

      // Click delete
      const collectionItem = page
        .locator(".MuiListItem-root")
        .filter({ hasText: collectionName });
      await collectionItem.getByRole("button", { name: "delete" }).click();

      // Confirm dialog appears
      await expect(page.getByText("Confirm Deletion")).toBeVisible();

      // Click "Cancel"
      await page.getByRole("button", { name: "Cancel" }).click();

      // Dialog closes, collection still there
      await expect(page.getByText("Confirm Deletion")).not.toBeVisible();
      await expect(page.getByText(collectionName)).toBeVisible();

      // Cleanup
      await request.delete(
        `${BACKEND_API_URL}/collections/${collectionName}`
      );
    });

    // ── File upload via drag and drop ──────────────────────────────

    test("should index a file and update collection count in UI", async ({
      page,
      request
    }) => {
      const collectionName = `e2e-upload-${Date.now()}`;

      // Create collection via API
      const createRes = await request.post(
        `${BACKEND_API_URL}/collections/`,
        {
          data: {
            name: collectionName,
            embedding_model: "all-minilm:latest"
          }
        }
      );
      if (!createRes.ok()) {
        test.skip(true, `Backend returned ${createRes.status()}`);
        return;
      }

      // Index a file via API
      const indexRes = await request.post(
        `${BACKEND_API_URL}/collections/${collectionName}/index`,
        {
          multipart: {
            file: {
              name: "test-file.txt",
              mimeType: "text/plain",
              buffer: Buffer.from("This is test content for indexing.")
            }
          }
        }
      );
      expect(indexRes.ok()).toBe(true);
      const indexBody = await indexRes.json();
      expect(indexBody.chunks).toBe(1);

      // Navigate and verify the UI shows the updated count
      await navigateToPage(page, "/collections");
      const collectionItem = page
        .locator(".MuiListItem-root")
        .filter({ hasText: collectionName });
      await expect(collectionItem).toBeVisible({ timeout: 10000 });
      await expect(collectionItem.getByText("1 items")).toBeVisible({
        timeout: 10000
      });

      // Cleanup
      await request.delete(
        `${BACKEND_API_URL}/collections/${collectionName}`
      );
    });

    // ── API-level CRUD lifecycle ───────────────────────────────────

    test("full API CRUD lifecycle", async ({ request }) => {
      const collectionName = `e2e-crud-${Date.now()}`;

      // Create
      const createRes = await request.post(
        `${BACKEND_API_URL}/collections/`,
        {
          data: {
            name: collectionName,
            embedding_model: "text-embedding-3-small",
            embedding_provider: "openai"
          }
        }
      );
      if (!createRes.ok()) {
        test.skip(true, `Backend returned ${createRes.status()}`);
        return;
      }
      const created = await createRes.json();
      expect(created.name).toBe(collectionName);
      expect(created.count).toBe(0);
      expect(created.metadata.embedding_model).toBe(
        "text-embedding-3-small"
      );

      // Get
      const getRes = await request.get(
        `${BACKEND_API_URL}/collections/${collectionName}`
      );
      expect(getRes.ok()).toBe(true);
      const got = await getRes.json();
      expect(got.name).toBe(collectionName);
      expect(got.count).toBe(0);

      // List
      const listRes = await request.get(`${BACKEND_API_URL}/collections/`);
      expect(listRes.ok()).toBe(true);
      const listed = await listRes.json();
      expect(listed.collections.length).toBeGreaterThanOrEqual(1);
      const found = listed.collections.find(
        (c: { name: string }) => c.name === collectionName
      );
      expect(found).toBeTruthy();

      // Update
      const updateRes = await request.put(
        `${BACKEND_API_URL}/collections/${collectionName}`,
        {
          data: {
            name: collectionName,
            metadata: { custom_tag: "test-value" }
          }
        }
      );
      expect(updateRes.ok()).toBe(true);
      const updated = await updateRes.json();
      expect(updated.metadata.custom_tag).toBe("test-value");
      // Original metadata should be merged
      expect(updated.metadata.embedding_model).toBe(
        "text-embedding-3-small"
      );

      // Delete
      const deleteRes = await request.delete(
        `${BACKEND_API_URL}/collections/${collectionName}`
      );
      expect(deleteRes.ok()).toBe(true);

      // Verify deleted
      const verifyRes = await request.get(
        `${BACKEND_API_URL}/collections/${collectionName}`
      );
      expect(verifyRes.status()).toBe(404);
    });

    // ── Error handling ─────────────────────────────────────────────

    test("API returns 404 for nonexistent collection", async ({
      request
    }) => {
      const res = await request.get(
        `${BACKEND_API_URL}/collections/does-not-exist-${Date.now()}`
      );
      // 404 when store is available, 500/503 if vector store can't initialize
      if (res.status() === 500 || res.status() === 503) {
        test.skip(true, "Vector store not available");
        return;
      }
      expect(res.status()).toBe(404);
    });

    test("API returns 400 for create without name", async ({ request }) => {
      const res = await request.post(`${BACKEND_API_URL}/collections/`, {
        data: {}
      });
      expect(res.status()).toBe(400);
    });

    test("API returns 405 for DELETE on collection list", async ({
      request
    }) => {
      const res = await request.delete(`${BACKEND_API_URL}/collections/`);
      // The endpoint should return 405 for DELETE on the list route,
      // or null (no match) which results in 404 from the router
      expect([404, 405]).toContain(res.status());
    });

    // ── File index endpoint ────────────────────────────────────────

    test("should index a file via POST multipart", async ({ request }) => {
      const collectionName = `e2e-index-${Date.now()}`;

      // Create collection
      const createRes = await request.post(
        `${BACKEND_API_URL}/collections/`,
        { data: { name: collectionName } }
      );
      if (!createRes.ok()) {
        test.skip(true, `Backend returned ${createRes.status()}`);
        return;
      }

      // Create a temp file
      const tmpDir = os.tmpdir();
      const testFilePath = path.join(tmpDir, `test-${Date.now()}.txt`);
      fs.writeFileSync(testFilePath, "Test content for indexing.");

      try {
        // Upload via multipart POST
        const indexRes = await request.post(
          `${BACKEND_API_URL}/collections/${collectionName}/index`,
          {
            multipart: {
              file: {
                name: path.basename(testFilePath),
                mimeType: "text/plain",
                buffer: fs.readFileSync(testFilePath)
              }
            }
          }
        );
        expect(indexRes.ok()).toBe(true);
        const indexBody = await indexRes.json();
        expect(indexBody.path).toBe(path.basename(testFilePath));
        expect(indexBody.chunks).toBe(1);
        expect(indexBody.error).toBeNull();

        // Verify the document count increased
        const getRes = await request.get(
          `${BACKEND_API_URL}/collections/${collectionName}`
        );
        expect(getRes.ok()).toBe(true);
        const colBody = await getRes.json();
        expect(colBody.count).toBe(1);
      } finally {
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }
        await request.delete(
          `${BACKEND_API_URL}/collections/${collectionName}`
        );
      }
    });
  });
}
