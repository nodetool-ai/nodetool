import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";

/**
 * Thread and Message CRUD tests against the real TS backend.
 * These verify creating, listing, reading, updating, and deleting threads
 * and messages through the API, covering the consumer hooks:
 *   - useGlobalChatStore (threads/messages CRUD)
 *   - GlobalChatStore (POST/PUT/DELETE threads, POST messages)
 */

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Threads API (Real Backend)", () => {
    // Track thread IDs created during tests for cleanup
    const createdThreadIds: string[] = [];

    test.afterAll(async ({ request }) => {
      for (const id of createdThreadIds) {
        try {
          await request.delete(`${BACKEND_API_URL}/threads/${id}`);
        } catch {
          // Cleanup failures are expected when threads were already deleted by tests
        }
      }
    });

    test.describe("Thread CRUD lifecycle", () => {
      test("should create a thread via API", async ({ request }) => {
        const title = `e2e-thread-${Date.now()}`;
        const res = await request.post(`${BACKEND_API_URL}/threads/`, {
          data: { title }
        });
        expect(res.status()).toBe(200);

        const thread = await res.json();
        createdThreadIds.push(thread.id);

        expect(thread.id).toBeTruthy();
        expect(thread.title).toBe(title);
        expect(thread.created_at).toBeTruthy();
        expect(thread.updated_at).toBeTruthy();
      });

      test("should create a thread without a title", async ({ request }) => {
        const res = await request.post(`${BACKEND_API_URL}/threads/`, {
          data: {}
        });
        expect(res.status()).toBe(200);

        const thread = await res.json();
        createdThreadIds.push(thread.id);

        expect(thread.id).toBeTruthy();
      });

      test("should list threads via API", async ({ request }) => {
        // Create a thread first
        const title = `e2e-list-thread-${Date.now()}`;
        const createRes = await request.post(`${BACKEND_API_URL}/threads/`, {
          data: { title }
        });
        const thread = await createRes.json();
        createdThreadIds.push(thread.id);

        // List all threads
        const listRes = await request.get(`${BACKEND_API_URL}/threads/`);
        expect(listRes.status()).toBe(200);

        const list = await listRes.json();
        expect(list.threads).toBeDefined();
        expect(Array.isArray(list.threads)).toBe(true);

        // Our thread should be in the list
        const found = list.threads.find(
          (t: { id: string }) => t.id === thread.id
        );
        expect(found).toBeDefined();
        expect(found.title).toBe(title);
      });

      test("should get a single thread by ID", async ({ request }) => {
        const title = `e2e-get-thread-${Date.now()}`;
        const createRes = await request.post(`${BACKEND_API_URL}/threads/`, {
          data: { title }
        });
        const thread = await createRes.json();
        createdThreadIds.push(thread.id);

        const getRes = await request.get(
          `${BACKEND_API_URL}/threads/${thread.id}`
        );
        expect(getRes.status()).toBe(200);

        const fetched = await getRes.json();
        expect(fetched.id).toBe(thread.id);
        expect(fetched.title).toBe(title);
      });

      test("should update a thread title via PUT", async ({ request }) => {
        const createRes = await request.post(`${BACKEND_API_URL}/threads/`, {
          data: { title: `e2e-update-${Date.now()}` }
        });
        const thread = await createRes.json();
        createdThreadIds.push(thread.id);

        const newTitle = `e2e-renamed-${Date.now()}`;
        const updateRes = await request.put(
          `${BACKEND_API_URL}/threads/${thread.id}`,
          { data: { title: newTitle } }
        );
        expect(updateRes.status()).toBe(200);

        const updated = await updateRes.json();
        expect(updated.title).toBe(newTitle);
      });

      test("should delete a thread", async ({ request }) => {
        const createRes = await request.post(`${BACKEND_API_URL}/threads/`, {
          data: { title: `e2e-delete-${Date.now()}` }
        });
        const thread = await createRes.json();

        const deleteRes = await request.delete(
          `${BACKEND_API_URL}/threads/${thread.id}`
        );
        expect([200, 204]).toContain(deleteRes.status());

        // Verify it's gone
        const getRes = await request.get(
          `${BACKEND_API_URL}/threads/${thread.id}`
        );
        expect(getRes.status()).toBe(404);
      });
    });

    test.describe("Thread pagination", () => {
      test("should support limit parameter on thread list", async ({
        request
      }) => {
        // Create a few threads
        const ids: string[] = [];
        for (let i = 0; i < 3; i++) {
          const res = await request.post(`${BACKEND_API_URL}/threads/`, {
            data: { title: `e2e-paginate-${Date.now()}-${i}` }
          });
          const thread = await res.json();
          ids.push(thread.id);
          createdThreadIds.push(thread.id);
        }

        // Fetch with limit=1
        const listRes = await request.get(
          `${BACKEND_API_URL}/threads/?limit=1`
        );
        expect(listRes.status()).toBe(200);

        const list = await listRes.json();
        expect(list.threads.length).toBeLessThanOrEqual(1);
      });
    });

    test.describe("Thread error handling", () => {
      test("should return 404 for non-existent thread", async ({
        request
      }) => {
        const res = await request.get(
          `${BACKEND_API_URL}/threads/nonexistent-id-12345`
        );
        expect(res.status()).toBe(404);
      });
    });
  });

  test.describe("Messages API (Real Backend)", () => {
    // We'll create a single thread for all message tests
    let threadId: string;
    const createdThreadIds: string[] = [];

    test.beforeAll(async ({ request }) => {
      const res = await request.post(`${BACKEND_API_URL}/threads/`, {
        data: { title: `e2e-messages-thread-${Date.now()}` }
      });
      const thread = await res.json();
      threadId = thread.id;
      createdThreadIds.push(thread.id);
    });

    test.afterAll(async ({ request }) => {
      for (const id of createdThreadIds) {
        try {
          await request.delete(`${BACKEND_API_URL}/threads/${id}`);
        } catch {
          // Cleanup failures are expected when threads were already deleted by tests
        }
      }
    });

    test.describe("Message CRUD", () => {
      test("should create a user message", async ({ request }) => {
        const res = await request.post(`${BACKEND_API_URL}/messages/`, {
          data: {
            thread_id: threadId,
            role: "user",
            content: "Hello from e2e test"
          }
        });
        expect(res.status()).toBe(200);

        const message = await res.json();
        expect(message.id).toBeTruthy();
        expect(message.thread_id).toBe(threadId);
        expect(message.role).toBe("user");
        expect(message.content).toBe("Hello from e2e test");
        expect(message.created_at).toBeTruthy();
      });

      test("should create an assistant message", async ({ request }) => {
        const res = await request.post(`${BACKEND_API_URL}/messages/`, {
          data: {
            thread_id: threadId,
            role: "assistant",
            content: "Hi! I'm an assistant response from e2e test."
          }
        });
        expect(res.status()).toBe(200);

        const message = await res.json();
        expect(message.role).toBe("assistant");
        expect(message.content).toBe(
          "Hi! I'm an assistant response from e2e test."
        );
      });

      test("should list messages for a thread", async ({ request }) => {
        const listRes = await request.get(
          `${BACKEND_API_URL}/messages/?thread_id=${threadId}`
        );
        expect(listRes.status()).toBe(200);

        const list = await listRes.json();
        expect(list.messages).toBeDefined();
        expect(Array.isArray(list.messages)).toBe(true);
        // We created at least 2 messages in previous tests
        expect(list.messages.length).toBeGreaterThanOrEqual(2);

        // Verify message structure
        const first = list.messages[0];
        expect(first).toHaveProperty("id");
        expect(first).toHaveProperty("thread_id");
        expect(first).toHaveProperty("role");
        expect(first).toHaveProperty("content");
        expect(first).toHaveProperty("created_at");
      });

      test("should support message pagination with limit", async ({
        request
      }) => {
        const listRes = await request.get(
          `${BACKEND_API_URL}/messages/?thread_id=${threadId}&limit=1`
        );
        expect(listRes.status()).toBe(200);

        const list = await listRes.json();
        expect(list.messages.length).toBeLessThanOrEqual(1);
      });
    });

    test.describe("Message with structured content", () => {
      test("should create a message with array content", async ({
        request
      }) => {
        const content = [
          { type: "text", text: "Here is some text" },
          {
            type: "image_url",
            image_url: { url: "https://example.com/image.png" }
          }
        ];

        const res = await request.post(`${BACKEND_API_URL}/messages/`, {
          data: {
            thread_id: threadId,
            role: "user",
            content
          }
        });
        expect(res.status()).toBe(200);

        const message = await res.json();
        expect(message.id).toBeTruthy();
        expect(Array.isArray(message.content)).toBe(true);
      });
    });

    test.describe("Message error handling", () => {
      test("should handle missing thread_id gracefully", async ({
        request
      }) => {
        const res = await request.get(`${BACKEND_API_URL}/messages/`);
        // Without thread_id, should return empty or error
        expect([200, 400]).toContain(res.status());
      });
    });
  });
}
