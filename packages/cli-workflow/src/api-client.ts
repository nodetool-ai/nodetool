import { z } from "zod";
import { createRpcClient } from "@nodetool-ai/cli-common/rpc-client";
import * as workflows from "@nodetool-ai/protocol/api-schemas/workflows.js";
import * as jobs from "@nodetool-ai/protocol/api-schemas/jobs.js";
import * as assets from "@nodetool-ai/protocol/api-schemas/assets.js";
import * as triggers from "@nodetool-ai/protocol/api-schemas/triggers.js";
import {
  listRunsResultSchema,
  getRunResultSchema,
  getRunTraceResultSchema,
  getRunLogsResultSchema,
  runUpdatesResultSchema
} from "@nodetool-ai/protocol";

/** The command family's response contracts use the shared HTTP transport and protocol schemas. */
export function createApiClient(apiUrl: string) {
  const client = createRpcClient(apiUrl);
  const endpoint = <T extends z.ZodType>(path: string, schema: T) => ({
    query: async (
      input: unknown,
      options?: { signal?: AbortSignal }
    ): Promise<z.output<T>> =>
      schema.parse(await client.query(path, input, options))
  });
  const mutation = <T extends z.ZodType>(path: string, schema: T) => ({
    mutate: async (input: unknown): Promise<z.output<T>> =>
      schema.parse(await client.mutation(path, input))
  });
  return {
    workflows: {
      list: endpoint("workflows.list", workflows.listOutput),
      get: endpoint("workflows.get", workflows.workflowResponse)
    },
    jobs: {
      list: endpoint("jobs.list", jobs.listOutput),
      get: endpoint("jobs.get", jobs.jobResponse)
    },
    assets: {
      list: endpoint("assets.list", assets.listOutput),
      get: endpoint("assets.get", assets.assetResponse)
    },
    triggers: {
      running: endpoint("jobs.triggersRunning", triggers.runningTriggersOutput),
      listByWorkflow: endpoint(
        "triggers.listByWorkflow",
        triggers.listTriggersByWorkflowOutput
      ),
      start: mutation("jobs.triggerStart", triggers.triggerRegistrationResponse),
      stop: mutation("jobs.triggerStop", triggers.triggerRegistrationResponse),
      fire: mutation("triggers.fire", triggers.fireTriggerOutput)
    },
    runs: {
      list: endpoint("runs.list", listRunsResultSchema),
      get: endpoint("runs.get", getRunResultSchema),
      trace: endpoint("runs.trace", getRunTraceResultSchema),
      logs: endpoint("runs.logs", getRunLogsResultSchema),
      updates: endpoint("runs.updates", runUpdatesResultSchema)
    }
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
