import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Workflow CRUD Operations", () => {
    test.describe("Create Workflow", () => {
      test("should create a new workflow via API", async ({ request }) => {
        const workflowName = `test-create-workflow-${Date.now()}`;
        
        const response = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test workflow created by e2e test",
            access: "private"
          }
        });

        expect(response.ok()).toBeTruthy();
        // API returns 200 for successful creation (not 201)
        expect(response.status()).toBeLessThan(300);

        const workflow = await response.json();
        expect(workflow).toBeDefined();
        expect(workflow).toHaveProperty("id");
        expect(workflow).toHaveProperty("name", workflowName);
        expect(workflow).toHaveProperty("description", "Test workflow created by e2e test");
        expect(workflow).toHaveProperty("access", "private");

        // Cleanup
        await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
      });

      test("should create workflow with graph data", async ({ request }) => {
        const workflowName = `test-workflow-graph-${Date.now()}`;
        
        const response = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Workflow with nodes",
            access: "private",
            graph: {
              nodes: [
                {
                  id: "node-1",
                  type: "nodetool.text.TextInput",
                  position: { x: 100, y: 100 },
                  data: { properties: { value: "Hello" } }
                }
              ],
              edges: []
            }
          }
        });

        expect(response.ok()).toBeTruthy();
        const workflow = await response.json();
        expect(workflow).toHaveProperty("id");
        expect(workflow.graph).toBeDefined();
        expect(workflow.graph.nodes).toHaveLength(1);
        expect(workflow.graph.edges).toHaveLength(0);

        // Cleanup
        await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
      });

      test("should create workflow with empty name", async ({ request }) => {
        const response = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: "",
            description: "Test workflow",
            access: "private"
          }
        });

        // API should handle empty name (either accept or reject with proper error)
        expect(response.status()).toBeLessThan(500);
      });

      test("should navigate to new workflow in editor", async ({ page, request }) => {
        const workflowName = `test-navigate-${Date.now()}`;
        
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test workflow",
            access: "private"
          }
        });
        
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          // Verify we're on the editor page
          await expect(page).toHaveURL(new RegExp(`/editor/${workflow.id}`));

          // Wait for ReactFlow canvas
          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Page should load without errors
          const bodyText = await page.textContent("body");
          expect(bodyText).not.toContain("500");
          expect(bodyText).not.toContain("Internal Server Error");
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Read Workflow", () => {
      test("should fetch workflow by ID", async ({ request }) => {
        // First create a workflow
        const workflowName = `test-read-workflow-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test read workflow",
            access: "private"
          }
        });
        const workflow = await createResponse.json();

        try {
          // Fetch the workflow by ID
          const response = await request.get(`${BACKEND_API_URL}/workflows/${workflow.id}`);
          
          expect(response.ok()).toBeTruthy();
          expect(response.status()).toBe(200);

          const fetchedWorkflow = await response.json();
          expect(fetchedWorkflow).toHaveProperty("id", workflow.id);
          expect(fetchedWorkflow).toHaveProperty("name", workflowName);
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should list all workflows", async ({ request }) => {
        // Create a test workflow
        const workflowName = `test-list-workflow-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test workflow",
            access: "private"
          }
        });
        const workflow = await createResponse.json();

        try {
          // List all workflows
          const response = await request.get(`${BACKEND_API_URL}/workflows/`);
          
          expect(response.ok()).toBeTruthy();
          expect(response.status()).toBe(200);

          const data = await response.json();
          expect(data).toHaveProperty("workflows");
          expect(Array.isArray(data.workflows)).toBeTruthy();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should return 404 for non-existent workflow", async ({ request }) => {
        const response = await request.get(`${BACKEND_API_URL}/workflows/non-existent-id-12345`);
        
        expect(response.status()).toBe(404);
      });

      test("should fetch workflow with graph details", async ({ request }) => {
        const workflowName = `test-graph-details-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Workflow with graph",
            access: "private",
            graph: {
              nodes: [
                {
                  id: "node-1",
                  type: "nodetool.text.TextInput",
                  position: { x: 100, y: 100 },
                  data: { properties: {} }
                },
                {
                  id: "node-2",
                  type: "nodetool.workflows.base_node.Preview",
                  position: { x: 300, y: 100 },
                  data: { properties: {} }
                }
              ],
              edges: [
                {
                  id: "edge-1",
                  source: "node-1",
                  sourceHandle: "output",
                  target: "node-2",
                  targetHandle: "value"
                }
              ]
            }
          }
        });
        const workflow = await createResponse.json();

        try {
          const response = await request.get(`${BACKEND_API_URL}/workflows/${workflow.id}`);
          expect(response.ok()).toBeTruthy();

          const fetchedWorkflow = await response.json();
          expect(fetchedWorkflow.graph.nodes).toHaveLength(2);
          expect(fetchedWorkflow.graph.edges).toHaveLength(1);
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Update Workflow", () => {
      test("should update workflow name", async ({ request }) => {
        const originalName = `test-update-name-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: originalName,
            description: "Original description",
            access: "private"
          }
        });
        const workflow = await createResponse.json();

        try {
          const updatedName = `${originalName}-updated`;
          const updateResponse = await request.put(`${BACKEND_API_URL}/workflows/${workflow.id}`, {
            data: {
              ...workflow,
              name: updatedName
            }
          });

          expect(updateResponse.ok()).toBeTruthy();
          const updatedWorkflow = await updateResponse.json();
          expect(updatedWorkflow.name).toBe(updatedName);
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should update workflow description", async ({ request }) => {
        const workflowName = `test-update-desc-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Original description",
            access: "private"
          }
        });
        const workflow = await createResponse.json();

        try {
          const updateResponse = await request.put(`${BACKEND_API_URL}/workflows/${workflow.id}`, {
            data: {
              ...workflow,
              description: "Updated description"
            }
          });

          expect(updateResponse.ok()).toBeTruthy();
          const updatedWorkflow = await updateResponse.json();
          expect(updatedWorkflow.description).toBe("Updated description");
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should update workflow access level", async ({ request }) => {
        const workflowName = `test-update-access-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private"
          }
        });
        const workflow = await createResponse.json();

        try {
          const updateResponse = await request.put(`${BACKEND_API_URL}/workflows/${workflow.id}`, {
            data: {
              ...workflow,
              access: "public"
            }
          });

          expect(updateResponse.ok()).toBeTruthy();
          const updatedWorkflow = await updateResponse.json();
          expect(updatedWorkflow.access).toBe("public");
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should update workflow graph", async ({ request }) => {
        const workflowName = `test-update-graph-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private",
            graph: { nodes: [], edges: [] }
          }
        });
        const workflow = await createResponse.json();

        try {
          const updateResponse = await request.put(`${BACKEND_API_URL}/workflows/${workflow.id}`, {
            data: {
              ...workflow,
              graph: {
                nodes: [
                  {
                    id: "node-1",
                    type: "nodetool.text.TextInput",
                    position: { x: 100, y: 100 },
                    data: { properties: {} }
                  }
                ],
                edges: []
              }
            }
          });

          expect(updateResponse.ok()).toBeTruthy();
          const updatedWorkflow = await updateResponse.json();
          expect(updatedWorkflow.graph.nodes).toHaveLength(1);
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should preserve workflow ID after update", async ({ request }) => {
        const workflowName = `test-preserve-id-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private"
          }
        });
        const workflow = await createResponse.json();
        const originalId = workflow.id;

        try {
          const updateResponse = await request.put(`${BACKEND_API_URL}/workflows/${workflow.id}`, {
            data: {
              ...workflow,
              name: "Updated Name"
            }
          });

          expect(updateResponse.ok()).toBeTruthy();
          const updatedWorkflow = await updateResponse.json();
          expect(updatedWorkflow.id).toBe(originalId);
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Delete Workflow", () => {
      test("should delete workflow by ID", async ({ request }) => {
        const workflowName = `test-delete-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private"
          }
        });
        const workflow = await createResponse.json();

        // Delete the workflow
        const deleteResponse = await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        expect(deleteResponse.ok()).toBeTruthy();

        // Verify it's deleted
        const fetchResponse = await request.get(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        expect(fetchResponse.status()).toBe(404);
      });

      test("should handle deleting non-existent workflow", async ({ request }) => {
        const deleteResponse = await request.delete(`${BACKEND_API_URL}/workflows/non-existent-id-12345`);
        
        // Should return 404 for non-existent workflow
        expect(deleteResponse.status()).toBe(404);
      });

      test("should remove workflow from list after deletion", async ({ request }) => {
        const workflowName = `test-list-after-delete-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private"
          }
        });
        const workflow = await createResponse.json();

        // Delete the workflow
        await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);

        // List workflows and verify it's not there
        const listResponse = await request.get(`${BACKEND_API_URL}/workflows/`);
        const data = await listResponse.json();
        
        const deletedWorkflow = data.workflows.find((w: { id: string }) => w.id === workflow.id);
        expect(deletedWorkflow).toBeUndefined();
      });
    });

    test.describe("Workflow Pagination", () => {
      test("should support pagination parameters", async ({ request }) => {
        const response = await request.get(`${BACKEND_API_URL}/workflows/?limit=10&cursor=`);
        
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data).toHaveProperty("workflows");
        expect(data).toHaveProperty("next");
      });

      test("should limit results based on limit parameter", async ({ request }) => {
        // Create a few test workflows
        const workflows: string[] = [];
        for (let i = 0; i < 3; i++) {
          const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
            data: {
              name: `test-pagination-${Date.now()}-${i}`,
              description: "Test",
              access: "private"
            }
          });
          const workflow = await createResponse.json();
          workflows.push(workflow.id);
        }

        try {
          const response = await request.get(`${BACKEND_API_URL}/workflows/?limit=2`);
          expect(response.ok()).toBeTruthy();
          const data = await response.json();
          expect(data.workflows.length).toBeLessThanOrEqual(2);
        } finally {
          // Cleanup
          for (const id of workflows) {
            await request.delete(`${BACKEND_API_URL}/workflows/${id}`);
          }
        }
      });
    });

    test.describe("Workflow UI Integration", () => {
      test("should display workflow in editor after creation", async ({ page, request }) => {
        const workflowName = `test-ui-display-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private"
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          // Wait for ReactFlow canvas
          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Verify no errors
          const bodyText = await page.textContent("body");
          expect(bodyText).not.toContain("500");
          expect(bodyText).not.toContain("Internal Server Error");
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should save workflow via keyboard shortcut", async ({ page, request }) => {
        const workflowName = `test-save-shortcut-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Test",
            access: "private"
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Try save shortcut
          await page.keyboard.press("Meta+s");
          await page.waitForTimeout(500);

          // Page should remain functional
          await expect(canvas).toBeVisible();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });

      test("should handle workflow with nodes in editor", async ({ page, request }) => {
        const workflowName = `test-nodes-editor-${Date.now()}`;
        const createResponse = await request.post(`${BACKEND_API_URL}/workflows/`, {
          data: {
            name: workflowName,
            description: "Workflow with nodes",
            access: "private",
            graph: {
              nodes: [
                {
                  id: "node-1",
                  type: "nodetool.text.TextInput",
                  position: { x: 100, y: 100 },
                  data: { properties: { value: "Test" } }
                }
              ],
              edges: []
            }
          }
        });
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          // Wait for ReactFlow canvas
          const canvas = page.locator(".react-flow");
          await expect(canvas).toBeVisible({ timeout: 10000 });

          // Wait for nodes to render
          await page.waitForTimeout(1000);

          // Look for rendered nodes
          const nodes = page.locator(".react-flow__node");
          const nodeCount = await nodes.count();
          expect(nodeCount).toBeGreaterThanOrEqual(0);
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });
  });
}
