/**
 * Workflow helpers for E2E tests.
 *
 * The TS backend requires a `graph` field with `nodes` and `edges` arrays
 * when creating workflows. These helpers ensure the correct shape is always sent.
 */

import { APIRequestContext, expect } from "@playwright/test";
import { BACKEND_API_URL } from "../support/backend";

interface WorkflowGraph {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

interface CreateWorkflowOptions {
  name: string;
  description?: string;
  access?: string;
  graph?: WorkflowGraph;
}

interface WorkflowResponse {
  id: string;
  name: string;
  [key: string]: unknown;
}

/**
 * Create a workflow via the backend API.
 * Defaults to an empty graph (`{ nodes: [], edges: [] }`) when none is provided.
 */
export async function createWorkflow(
  request: APIRequestContext,
  options: CreateWorkflowOptions,
): Promise<WorkflowResponse> {
  const { name, description = "", access = "private", graph } = options;

  const res = await request.post(`${BACKEND_API_URL}/workflows/`, {
    data: {
      name,
      description,
      access,
      graph: graph ?? { nodes: [], edges: [] },
    },
  });

  expect(res.status()).toBe(200);
  return (await res.json()) as WorkflowResponse;
}

/**
 * Delete a workflow, ignoring errors (useful in afterAll cleanup).
 */
export async function deleteWorkflow(
  request: APIRequestContext,
  workflowId: string,
): Promise<void> {
  await request
    .delete(`${BACKEND_API_URL}/workflows/${workflowId}`)
    .catch(() => {
      // Ignore cleanup failures
    });
}
