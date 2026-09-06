/**
 * WorkflowSyncer — pushes a locally stored workflow to a remote NodeTool
 * instance over `PUT /api/workflows/:id`.
 */

import type { AdminHTTPClient } from "./admin-client.js";

/** Functions the caller must supply so WorkflowSyncer can resolve local data. */
export interface WorkflowSyncerDeps {
  /** Retrieve a workflow by ID and return it as a serialisable dict. */
  getWorkflowData(workflowId: string): Promise<Record<string, unknown> | null>;
}

export class WorkflowSyncer {
  private client: AdminHTTPClient;
  private deps: WorkflowSyncerDeps;

  constructor(client: AdminHTTPClient, deps: WorkflowSyncerDeps) {
    this.client = client;
    this.deps = deps;
  }

  /**
   * Push a workflow to the remote instance.
   *
   * @returns true if sync was successful, false otherwise.
   */
  async syncWorkflow(workflowId: string): Promise<boolean> {
    try {
      const workflowData = await this.deps.getWorkflowData(workflowId);
      if (!workflowData) {
        console.error(`Workflow not found locally: ${workflowId}`);
        return false;
      }

      await this.client.updateWorkflow(workflowId, workflowData);
      return true;
    } catch (e) {
      console.error(`Failed to sync workflow: ${e}`);
      return false;
    }
  }
}
