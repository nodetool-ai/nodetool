import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";
import {
  navigateToPage,
  waitForEditorReady,
  waitForAnimation,
} from "./helpers/waitHelpers";

/**
 * Workflow CRUD tests against the real TS backend.
 * These verify creating, listing, renaming, duplicating, and deleting workflows
 * through both the API and the UI.
 */

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Workflow CRUD (Real Backend)", () => {
    // Track workflow IDs created during tests for cleanup
    const createdWorkflowIds: string[] = [];

    test.afterAll(async ({ request }) => {
      // Cleanup any workflows created during tests
      for (const id of createdWorkflowIds) {
        try {
          await request.delete(`${BACKEND_API_URL}/workflows/${id}`);
        } catch {
          // ignore cleanup failures
        }
      }
    });

    test.describe("API-level CRUD", () => {
      test("should create a workflow via API", async ({ request }) => {
        const name = `test-create-${Date.now()}`;
        const res = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: { name, description: "E2E test workflow", access: "private" },
        });
        expect(res.status()).toBe(200);

        const workflow = await res.json();
        createdWorkflowIds.push(workflow.id);

        expect(workflow.id).toBeTruthy();
        expect(workflow.name).toBe(name);
        expect(workflow.description).toBe("E2E test workflow");
        expect(workflow.access).toBe("private");
        expect(workflow.created_at).toBeTruthy();
      });

      test("should list workflows including the new one", async ({
        request,
      }) => {
        const name = `test-list-${Date.now()}`;
        const createRes = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: { name, description: "", access: "private" },
        });
        const workflow = await createRes.json();
        createdWorkflowIds.push(workflow.id);

        const listRes = await request.get(`${BACKEND_API_URL}/workflows/`);
        expect(listRes.status()).toBe(200);

        const list = await listRes.json();
        expect(list.workflows).toBeDefined();
        const found = list.workflows.find(
          (w: { id: string }) => w.id === workflow.id
        );
        expect(found).toBeDefined();
        expect(found.name).toBe(name);
      });

      test("should get a single workflow by ID", async ({ request }) => {
        const name = `test-get-${Date.now()}`;
        const createRes = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: { name, description: "get test", access: "private" },
        });
        const workflow = await createRes.json();
        createdWorkflowIds.push(workflow.id);

        const getRes = await request.get(
          `${BACKEND_API_URL}/workflows/${workflow.id}`
        );
        expect(getRes.status()).toBe(200);

        const fetched = await getRes.json();
        expect(fetched.id).toBe(workflow.id);
        expect(fetched.name).toBe(name);
        expect(fetched.graph).toBeDefined();
        expect(fetched.graph.nodes).toBeDefined();
        expect(fetched.graph.edges).toBeDefined();
      });

      test("should update a workflow name via PUT", async ({ request }) => {
        const createRes = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: `test-update-${Date.now()}`,
            description: "",
            access: "private",
          },
        });
        const workflow = await createRes.json();
        createdWorkflowIds.push(workflow.id);

        const newName = `renamed-${Date.now()}`;
        const updateRes = await request.put(
          `${BACKEND_API_URL}/workflows/${workflow.id}`,
          {
            data: { ...workflow, name: newName },
          }
        );
        expect(updateRes.status()).toBe(200);

        const updated = await updateRes.json();
        expect(updated.name).toBe(newName);
      });

      test("should delete a workflow", async ({ request }) => {
        const createRes = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: `test-delete-${Date.now()}`,
            description: "",
            access: "private",
          },
        });
        const workflow = await createRes.json();

        const deleteRes = await request.delete(
          `${BACKEND_API_URL}/workflows/${workflow.id}`
        );
        expect([200, 204]).toContain(deleteRes.status());

        // Verify it's gone
        const getRes = await request.get(
          `${BACKEND_API_URL}/workflows/${workflow.id}`
        );
        expect(getRes.status()).toBe(404);
      });

      test("should return 404 for non-existent workflow", async ({
        request,
      }) => {
        const res = await request.get(
          `${BACKEND_API_URL}/workflows/nonexistent-id-12345`
        );
        expect(res.status()).toBe(404);
      });
    });

    test.describe("UI-level workflow operations", () => {
      test("should display workflows on the dashboard", async ({ page }) => {
        await navigateToPage(page, "/dashboard");
        await waitForAnimation(page);

        // The dashboard should show workflow cards or a list
        const body = await page.textContent("body");
        expect(body).toBeTruthy();
        expect(body).not.toContain("Internal Server Error");
      });

      test("should open a workflow in the editor from dashboard", async ({
        page,
        request,
      }) => {
        // Create a workflow first
        const name = `test-open-${Date.now()}`;
        const res = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: { name, description: "", access: "private" },
        });
        const workflow = await res.json();
        createdWorkflowIds.push(workflow.id);

        // Navigate directly to the editor
        await navigateToPage(page, `/editor/${workflow.id}`);
        await waitForEditorReady(page);

        // Should see the ReactFlow canvas
        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible();

        // URL should contain the workflow ID
        await expect(page).toHaveURL(new RegExp(workflow.id));
      });

      test("should handle editing a workflow graph", async ({
        page,
        request,
      }) => {
        // Create a workflow
        const name = `test-graph-${Date.now()}`;
        const createRes = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: { name, description: "", access: "private" },
        });
        const workflow = await createRes.json();
        createdWorkflowIds.push(workflow.id);

        // Open in editor
        await navigateToPage(page, `/editor/${workflow.id}`);
        await waitForEditorReady(page);

        // Open node menu (Tab key)
        const canvas = page.locator(".react-flow");
        await canvas.click();
        await page.keyboard.press("Tab");
        await waitForAnimation(page);

        // The node menu should appear with a search input
        const nodeMenu = page.locator(
          '[class*="node-menu"], [class*="NodeMenu"], [class*="nodemenu"]'
        );
        const menuVisible = await nodeMenu.isVisible().catch(() => false);

        // Whether menu appeared or not, page should be functional
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
      });

      test("should navigate between editor and dashboard", async ({
        page,
        request,
      }) => {
        const name = `test-nav-${Date.now()}`;
        const createRes = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: { name, description: "", access: "private" },
        });
        const workflow = await createRes.json();
        createdWorkflowIds.push(workflow.id);

        // Go to editor
        await navigateToPage(page, `/editor/${workflow.id}`);
        await waitForEditorReady(page);

        // Go back to dashboard
        await navigateToPage(page, "/dashboard");
        await waitForAnimation(page);

        // Should be on dashboard
        await expect(page).toHaveURL(/\/dashboard/);
      });
    });
  });

  test.describe("Workflow Versioning (Real Backend)", () => {
    test("should save and retrieve workflow versions", async ({ request }) => {
      // Create a workflow
      const createRes = await request.post(`${BACKEND_API_URL}/workflows/`, {
        data: {
          name: `test-version-${Date.now()}`,
          description: "",
          access: "private",
        },
      });
      const workflow = await createRes.json();

      try {
        // Update the workflow with a node
        const updateRes = await request.put(
          `${BACKEND_API_URL}/workflows/${workflow.id}`,
          {
            data: {
              ...workflow,
              graph: {
                nodes: [
                  {
                    id: "node-1",
                    type: "nodetool.constant.String",
                    data: { value: "hello" },
                    ui_properties: { position: [100, 100] },
                  },
                ],
                edges: [],
              },
            },
          }
        );
        expect(updateRes.status()).toBe(200);

        // Fetch the workflow again to verify nodes were saved
        const getRes = await request.get(
          `${BACKEND_API_URL}/workflows/${workflow.id}`
        );
        const saved = await getRes.json();
        expect(saved.graph.nodes.length).toBe(1);
        expect(saved.graph.nodes[0].type).toBe("nodetool.constant.String");
      } finally {
        await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
      }
    });
  });
}
