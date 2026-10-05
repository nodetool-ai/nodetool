import { randomBytes } from "node:crypto";
import { operationTarget } from "@nodetool-ai/app-runtime";
import { createAppInstance } from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { appRunSnapshot } from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { collectExecutionSummary } from "../debug/collector.js";
import { executeAppOperation } from "../service/app-operation.js";
import { documentOperations } from "./app-spec.js";
import type { AppSimulationDeps, AppServerRunInput, AppServerRunOutcome } from "./simulate.js";
import type { JsScriptOperationRunner } from "./script-operation.js";
import type { ResolvedAppTarget } from "./types.js";

export interface AppDebugRecordingOptions {
  readonly userId: string;
  readonly target: ResolvedAppTarget;
  readonly registry: NodeRegistry;
  readonly context: ProcessingContext;
  readonly loadWorkflow: AppSimulationDeps["loadFromDb"];
  readonly loadScript?: AppSimulationDeps["loadScript"];
  readonly applicationId?: string;
  readonly onRunCreated?: (id: string) => void;
  readonly runWorkflow: (context: ProcessingContext, input: AppServerRunInput) => Promise<AppServerRunOutcome>;
  readonly runScript: (context: ProcessingContext, input: Parameters<JsScriptOperationRunner>[0]) => ReturnType<JsScriptOperationRunner>;
}

/** One debug session owns an immutable working copy without publishing its draft. */
export function createAppDebugRunRecording(options: AppDebugRecordingOptions): Pick<AppSimulationDeps, "runWorkflowOperation" | "runScriptOperation"> {
  let instancePromise: ReturnType<typeof createAppInstance> | undefined;
  const instance = (): ReturnType<typeof createAppInstance> => {
    instancePromise ??= (async () => {
      const target = options.target;
      if (!target.document) { throw new Error("A durable app debug run needs a valid app document"); }
      const workflowGraphs: Record<string, unknown> = Object.fromEntries(target.graphs);
      const scriptDocuments: Record<string, unknown> = Object.fromEntries(
        [...target.scripts ?? []].map(([id, script]) => [id, script.document])
      );
      for (const operation of documentOperations(target.document)) {
        const executable = operationTarget(operation);
        if (executable.kind === "script") {
          const key = `${executable.scriptId}@${executable.scriptVersion}`;
          if (!scriptDocuments[key] && !scriptDocuments[executable.scriptId]) {
            const script = await options.loadScript?.(executable.scriptId, executable.scriptVersion);
            if (script) { scriptDocuments[key] = script.document; }
          }
        } else {
          const key = `${executable.workflowId}@${executable.workflowVersion ?? "latest"}`;
          if (workflowGraphs[key] || workflowGraphs[executable.workflowId]) { continue; }
          const graph = !executable.workflowId || executable.workflowId === "self" || (executable.workflowVersion === undefined && executable.workflowId === target.info.workflowId && target.graphs.size === 0)
            ? target.graph
            : (await options.loadWorkflow(executable.workflowId, executable.workflowVersion))?.graph;
          if (graph) { workflowGraphs[key] = graph; }
        }
      }
      const input: Parameters<typeof createAppInstance>[0] = {
        userId: options.userId,
        sourceId: `debug:${randomBytes(16).toString("hex")}`,
        name: `Debug ${target.appName ?? "app"}`.slice(0, 200),
        snapshot: appRunSnapshot.parse({ document: target.document, workflow_graphs: workflowGraphs, script_documents: scriptDocuments }),
        secretValues: [...options.context.getResolvedSecretValues()]
      };
      if (options.applicationId) { input.applicationId = options.applicationId; }
      return createAppInstance(input);
    })();
    return instancePromise;
  };
  const base = async (operationId: string, params: Record<string, unknown>) => ({
    userId: options.userId,
    instanceId: (await instance()).id,
    operationId,
    invocationId: randomBytes(16).toString("hex"),
    origin: "debug" as const,
    registry: options.registry,
    context: options.context,
    resolvedInputs: params,
    onReserved: (run: { id: string }) => { options.onRunCreated?.(run.id); }
  });
  return {
    async runScriptOperation(operationId, params, input) {
      let result: Awaited<ReturnType<JsScriptOperationRunner>> | undefined;
      const outcome = await executeAppOperation({
        ...await base(operationId, params),
        scriptRunner: async (context, canonical) => {
          result = await options.runScript(context, { ...canonical, timeoutMs: input.timeoutMs });
          return result;
        }
      });
      return { app_run_id: outcome.run.id, result: result ?? { ok: false, error: outcome.run.error ?? "Operation did not execute", outputs: {}, logs: [], duration_ms: 0 } };
    },
    async runWorkflowOperation(operationId, input) {
      let result: AppServerRunOutcome | undefined;
      const outcome = await executeAppOperation({
        ...await base(operationId, input.params),
        inputSnapshot: input.nodePropertyOverrides && Object.keys(input.nodePropertyOverrides).length > 0
          ? { parameters: input.params, node_properties: input.nodePropertyOverrides }
          : input.params,
        workflowRunner: async (context) => {
          result = await options.runWorkflow(context, input);
          return result;
        }
      });
      if (result) { return { ...result, app_run_id: outcome.run.id }; }
      const summary = collectExecutionSummary([]);
      summary.status = outcome.run.status;
      summary.error = outcome.run.error;
      return { app_run_id: outcome.run.id, rawMessages: [], report: {
        surface: "server", ok: false, status: outcome.run.status,
        error: outcome.run.error, durationMs: 0, summary, trace: null
      } };
    }
  };
}
