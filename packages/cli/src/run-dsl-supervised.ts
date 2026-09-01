/**
 * `nodetool run --supervise` — the DSL file path, executed under supervision.
 *
 * `@nodetool-ai/dsl`'s own `run()` constructs a `WorkflowRunner` directly: one
 * of the grandfathered direct-construction sites that must not gain
 * supervision ad hoc (docs/workflow-supervisor-implementation-plan.md, PR 4).
 * So a supervised DSL run goes through `ExecutionSession` instead, and an
 * unsupervised one keeps taking the untouched `runDslFile` path.
 *
 * Lives in its own module because it pulls the session facade, the node
 * registries, and a provider — none of which an unsupervised `nodetool run`
 * should load.
 */
import { getDefaultAssetsPath } from "@nodetool-ai/config";
import { ExecutionSession } from "@nodetool-ai/execution";
import { resolveLocalSecret } from "./local-secrets.js";
import type { Intervention } from "@nodetool-ai/protocol";
import { createGraphNodeTypeResolver } from "@nodetool-ai/node-sdk";
import { ProcessingContext, FileStorageAdapter } from "@nodetool-ai/runtime";
import { buildFullRegistry } from "./node-registry.js";
import { dslWorkflowToGraph, loadDslWorkflows } from "./run-dsl.js";
import {
  createSupervisorHandle,
  printSupervisedSummary,
  recordSupervisorCost,
  streamInterventionLines,
  type SupervisorRunConfig
} from "./supervisor.js";

interface SupervisedDslRun {
  /** Workflow outputs, keyed by export name — the unsupervised path's shape. */
  results: Record<string, Record<string, unknown>>;
  /** Every decision the supervisor made, across the file's workflows. */
  interventions: Intervention[];
}

export async function runDslFileSupervised(
  filePath: string,
  config: SupervisorRunConfig,
  jsonMode: boolean
): Promise<SupervisedDslRun> {
  const workflows = await loadDslWorkflows(filePath);
  const registry = buildFullRegistry();
  const results: Record<string, Record<string, unknown>> = {};
  const allInterventions: Intervention[] = [];

  for (const [name, workflow] of Object.entries(workflows)) {
    const jobId = `dsl-${Date.now()}-${name}`;
    const context = new ProcessingContext({
      jobId,
      workflowId: null,
      userId: "1",
      secretResolver: resolveLocalSecret,
      storage: new FileStorageAdapter(getDefaultAssetsPath())
    });

    const supervisor = await createSupervisorHandle({ config, context });
    console.error(
      `Running ${name} supervised by ${supervisor.providerId}/${supervisor.model}...`
    );

    const session = await ExecutionSession.create({
      graph: dslWorkflowToGraph(workflow),
      registry,
      resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
      jobId,
      params: {},
      context,
      supervisor: supervisor.handle,
      captureMessages: true
    });

    const lines = streamInterventionLines(session.messages);
    const result = await session.result;
    await lines;
    supervisor.handle.close();

    const interventions = result.interventions ?? [];
    allInterventions.push(...interventions);
    if (interventions.length > 0) {
      await recordSupervisorCost({
        interventions,
        jobId,
        workflowId: null,
        userId: "1",
        providerId: supervisor.providerId,
        model: supervisor.model
      });
      if (!jsonMode) printSupervisedSummary(interventions, console.error);
    }

    // A node error the supervisor resolved is not a run failure — unlike the
    // unsupervised DSL path, which rethrows the first node error it finds.
    // Only the run's own terminal status decides.
    if (result.status === "failed") {
      throw new Error(result.error ?? `Workflow ${name} failed`);
    }

    const outputs: Record<string, unknown> = {};
    for (const [outputName, values] of Object.entries(result.outputs)) {
      if (values.length > 0) outputs[outputName] = values[values.length - 1];
    }
    results[name] = outputs;
  }

  return { results, interventions: allInterventions };
}
