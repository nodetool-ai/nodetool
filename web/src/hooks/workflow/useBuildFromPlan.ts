/**
 * Step 3's action: turn the reviewed plan into a running graph (PRD § 11.3).
 *
 * The build replays the plan through the same node tools an agent drives —
 * `ui_add_node`, `ui_update_node_data`, `ui_connect_nodes` — in plan order, so
 * the canvas fills the way a creator would have filled it and the headless
 * mirror (`build_workflow_from_plan`) produces the same graph. The placement
 * itself comes from `planToPlacement` in `@nodetool-ai/protocol`, shared with
 * the harness, so what the harness graded is what gets placed.
 *
 * The canvas opens as soon as the nodes are down, before validation and before
 * the test run: a creator who is about to see an error should already be
 * looking at the graph the error is about.
 *
 * R6 is why `issues` is part of the result. A plan whose steps name node types
 * that exist can still leave an output fed by nothing, and that graph validates.
 * The landing checklist reports those as the first agent message with the fix
 * proposed, and nothing is applied without a click (PRD § 11.4).
 */

import { useCallback, useRef, useState } from "react";
import { z } from "zod";
import { planNodeShape, planToPlacement } from "@nodetool-ai/protocol";
import type {
  WorkflowSetup,
  WorkflowSetupPlan
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { FrontendToolRegistry } from "../../lib/tools/frontendTools";
import { getFrontendToolRuntimeState } from "../../lib/tools/frontendToolRuntimeState";
import useMetadataStore from "../../stores/MetadataStore";
import useResultsStore from "../../stores/ResultsStore";
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";
import { useWorkflowSetupWriter } from "./useWorkflowSetup";
import { resolveSnippetSteps } from "../../utils/planSnippetSteps";

export const workflowBuildStatuses = [
  "built",
  "validated",
  "running",
  "failed",
  "completed-with-output",
  // The creator stopped the build after the graph was placed.
  "canceled",
  // Read back from the document: the build stopped reporting before a final
  // status (a reload mid-run), so nobody knows how the run ended.
  "unrecorded"
] as const;

export type WorkflowBuildStatus = (typeof workflowBuildStatuses)[number];

export interface WorkflowTestRun {
  started: boolean;
  error: string | null;
  output?: unknown;
}

/** What the landing checklist reads (PRD § 11.4). */
export interface BuildFromPlanResult {
  /** The last durable state reached by the build or its sample run. */
  status: WorkflowBuildStatus;
  /** Nodes placed on the canvas. */
  nodeCount: number;
  /** Wiring the builder could not do — the R6 signal, empty on a clean build. */
  issues: string[];
  /** Errors from the graph check. Empty means `Validated` is ticked. */
  validationErrors: string[];
  /** Why the graph check itself could not run. */
  validationError?: string;
  /** True when the graph check never reported a result. */
  validationPending?: boolean;
  /** Whether the test run was started, and what it said if it was refused. */
  testRun: WorkflowTestRun;
  /** The sample run's output when it completed with one. */
  output?: unknown;
  /** Human-readable explanation persisted with the status. */
  explanation: string;
}

/** The passthrough record kept under `settings.setup.build`. */
export const workflowBuildSchema = z.object({
  status: z.enum(workflowBuildStatuses),
  node_count: z.number(),
  issues: z.array(z.string()),
  validation_errors: z.array(z.string()),
  validation_error: z.string().optional(),
  validation_pending: z.boolean().optional(),
  run_started: z.boolean(),
  run_error: z.string().nullable(),
  output: z.unknown().optional(),
  explanation: z.string()
});
export type WorkflowBuildRecord = z.infer<typeof workflowBuildSchema>;

export const WORKFLOW_BUILD_KEY = "build";

export const workflowBuildRecord = (
  result: BuildFromPlanResult
): WorkflowBuildRecord => {
  const record: WorkflowBuildRecord = {
    status: result.status,
    node_count: result.nodeCount,
    issues: result.issues,
    validation_errors: result.validationErrors,
    run_started: result.testRun.started,
    run_error: result.testRun.error,
    explanation: result.explanation
  };
  if (result.output !== undefined) {
    record.output = result.output;
  }
  if (result.validationError !== undefined) {
    record.validation_error = result.validationError;
  }
  if (result.validationPending) {
    record.validation_pending = true;
  }
  return record;
};

export const readWorkflowBuild = (
  setup: WorkflowSetup | null
): WorkflowBuildRecord | null => {
  const parsed = workflowBuildSchema.safeParse(setup?.[WORKFLOW_BUILD_KEY]);
  return parsed.success ? parsed.data : null;
};

/** Workflows with a build running in this window, which keeps its record current. */
const liveBuilds = new Set<string>();

/** True while this window is building the workflow and updating its record. */
export const isWorkflowBuildLive = (workflowId: string): boolean =>
  liveBuilds.has(workflowId);

/** Statuses a build passes through before it writes its final one. */
const IN_PROGRESS_STATUSES: ReadonlySet<WorkflowBuildStatus> = new Set([
  "built",
  "validated",
  "running"
]);

/**
 * The checklist's reading of a saved record. Pass `live: false` when no build
 * in this window is updating it: an in-progress status then can never move on,
 * so it reads as unrecorded rather than checking or running forever.
 */
export const workflowBuildResult = (
  record: WorkflowBuildRecord,
  options: { live?: boolean } = {}
): BuildFromPlanResult => {
  if (options.live === false && IN_PROGRESS_STATUSES.has(record.status)) {
    return workflowBuildResult({
      ...record,
      status: "unrecorded",
      validation_pending:
        record.status === "built" ? true : record.validation_pending,
      explanation: "The test run's result was not recorded."
    });
  }
  const result: BuildFromPlanResult = {
    status: record.status,
    nodeCount: record.node_count,
    issues: record.issues,
    validationErrors: record.validation_errors,
    testRun: {
      started: record.run_started,
      error: record.run_error
    },
    explanation: record.explanation
  };
  if (record.output !== undefined) {
    result.output = record.output;
    result.testRun.output = record.output;
  }
  if (record.validation_error !== undefined) {
    result.validationError = record.validation_error;
  }
  if (record.validation_pending) {
    result.validationPending = true;
  }
  return result;
};

export interface BuildFromPlanInput {
  plan: WorkflowSetupPlan;
  /** The model chosen per role on the setup step, keyed by role. */
  models?: Record<string, unknown>;
  /** Sample values the test run sends, keyed by plan input name. */
  sampleInputs?: Record<string, unknown>;
}

export interface UseBuildFromPlanResult {
  buildFromPlan: (
    input: BuildFromPlanInput,
    signal?: AbortSignal
  ) => Promise<BuildFromPlanResult>;
  cancelBuild: () => Promise<void>;
  building: boolean;
  result: BuildFromPlanResult | null;
}

/** One tool call, through the registry the agent uses. */
let callSeq = 0;
const callTool = (
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal
) =>
  FrontendToolRegistry.call(name, args, `build-${++callSeq}`, {
    getState: getFrontendToolRuntimeState,
    signal
  });

/** The `validation` block `ui_get_graph` returns. */
interface GraphValidation {
  errors?: unknown;
}

interface RunResponse {
  status: "running" | "completed-with-output" | "failed";
  output?: unknown;
  error: string | null;
  jobId?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Normalize the response without assuming every runner has the same shape. */
const readRunResponse = (value: unknown): RunResponse => {
  if (!isRecord(value)) {
    return { status: "running", error: null };
  }

  const output =
    value["output"] ?? value["outputs"] ?? value["result"] ?? undefined;
  const status = value["status"];
  const jobId = typeof value["job_id"] === "string" ? value["job_id"] : undefined;
  if (status === "completed") {
    return output === undefined || output === null
      ? {
          status: "failed",
          error: "The test run completed without producing output.",
          jobId
        }
      : { status: "completed-with-output", output, error: null, jobId };
  }
  if (status === "error" || status === "failed") {
    return {
      status: "failed",
      error:
        typeof value["error"] === "string"
          ? value["error"]
          : "The test run failed.",
      jobId
    };
  }
  return { status: "running", error: null, jobId };
};

const abortError = (): Error => {
  const error = new Error("The build was canceled.");
  error.name = "AbortError";
  return error;
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw abortError();
  }
};

interface PlacementOutput {
  id: string;
  name: string;
}

const waitForRunCompletion = async (
  workflowId: string,
  jobId: string,
  outputs: PlacementOutput[],
  signal?: AbortSignal
): Promise<{
  status: "completed-with-output" | "failed" | "canceled";
  output?: unknown;
  error: string | null;
}> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const cleanups: Array<() => void> = [];
    const finish = (
      value:
        | { status: "completed-with-output"; output: unknown; error: null }
        | { status: "failed"; error: string; output?: never }
        | { status: "canceled"; error: null; output?: never }
    ) => {
      if (settled) return;
      settled = true;
      cleanups.forEach((cleanup) => cleanup());
      resolve(value);
    };
    const failOnAbort = () => {
      if (settled) return;
      settled = true;
      cleanups.forEach((cleanup) => cleanup());
      void getWorkflowRunnerStore(workflowId).getState().cancelJob(jobId);
      reject(abortError());
    };
    const check = () => {
      const run = useWorkflowRunsStore
        .getState()
        .getRuns(workflowId)
        .find((candidate) => candidate.jobId === jobId);
      if (!run || !["completed", "error", "cancelled"].includes(run.state)) {
        return;
      }
      if (run.state === "cancelled") {
        finish({ status: "canceled", error: null });
        return;
      }
      if (run.state !== "completed") {
        finish({ status: "failed", error: "The sample run failed." });
        return;
      }
      const output: Record<string, unknown> = {};
      for (const item of outputs) {
        const value = useResultsStore
          .getState()
          .getOutputResult(workflowId, jobId, item.id);
        if (value === undefined) {
          finish({
            status: "failed",
            error: "The test run completed without producing output."
          });
          return;
        }
        output[item.name] = value;
      }
      finish({ status: "completed-with-output", output, error: null });
    };

    cleanups.push(useWorkflowRunsStore.subscribe(check));
    cleanups.push(useResultsStore.subscribe(check));
    if (signal) {
      signal.addEventListener("abort", failOnAbort, { once: true });
      cleanups.push(() => signal.removeEventListener("abort", failOnAbort));
    }
    if (signal?.aborted) {
      failOnAbort();
      return;
    }
    check();
  });

const resultWith = (
  status: WorkflowBuildStatus,
  nodeCount: number,
  issues: string[],
  validationErrors: string[],
  testRun: WorkflowTestRun,
  explanation: string,
  output?: unknown
): BuildFromPlanResult => {
  const result: BuildFromPlanResult = {
    status,
    nodeCount,
    issues,
    validationErrors,
    testRun,
    explanation
  };
  if (output !== undefined) {
    result.output = output;
  }
  return result;
};

export const useBuildFromPlan = (
  workflowId: string
): UseBuildFromPlanResult => {
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<BuildFromPlanResult | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  // The build's own abort. After the graph is placed the setup shell is gone,
  // so its signal no longer reaches the build, and Cancel has to stop the
  // check and the test run from here, before the run has a job id too.
  const buildControllerRef = useRef<AbortController | null>(null);
  const { setSetup } = useWorkflowSetupWriter(workflowId);

  const cancelBuild = useCallback(async () => {
    buildControllerRef.current?.abort();
    const jobId = activeJobIdRef.current;
    if (jobId) {
      await getWorkflowRunnerStore(workflowId).getState().cancelJob(jobId);
    }
  }, [workflowId]);

  const buildFromPlan = useCallback(
    async (
      input: BuildFromPlanInput,
      outerSignal?: AbortSignal
    ): Promise<BuildFromPlanResult> => {
      const controller = new AbortController();
      buildControllerRef.current = controller;
      const forwardAbort = () => controller.abort();
      if (outerSignal?.aborted) {
        controller.abort();
      } else {
        outerSignal?.addEventListener("abort", forwardAbort, { once: true });
      }
      const signal = controller.signal;
      liveBuilds.add(workflowId);
      setBuilding(true);
      const addedNodeIds: string[] = [];
      const addedEdgeIds: string[] = [];
      // Set once stage `done` is written. Before it, any failure takes the
      // placed nodes back off, because node ids are fixed per plan and a
      // rebuild skips an id that is already on the canvas.
      let placedDone = false;
      let nodeCount = 0;
      let issues: string[] = [];
      let validationErrors: string[] = [];
      let validationChecked = false;
      let runStarted = false;
      const rollback = async () => {
        for (const edgeId of addedEdgeIds.reverse()) {
          try {
            await callTool("ui_delete_edge", {
              workflow_id: workflowId,
              edge_id: edgeId
            });
          } catch {
            // Best effort cleanup. The original failure remains the useful
            // error and the graph can still be repaired manually.
          }
        }
        for (const nodeId of addedNodeIds.reverse()) {
          try {
            await callTool("ui_delete_node", {
              workflow_id: workflowId,
              node_id: nodeId
            });
          } catch {
            // Best effort cleanup, as above.
          }
        }
        try {
          await setSetup({
            stage: "setup",
            [WORKFLOW_BUILD_KEY]: undefined
          });
        } catch {
          // The setup writer may already have observed the aborted operation.
        }
      };
      const settle = async (
        final: BuildFromPlanResult
      ): Promise<BuildFromPlanResult> => {
        await setSetup({ [WORKFLOW_BUILD_KEY]: workflowBuildRecord(final) });
        setResult(final);
        return final;
      };
      try {
        throwIfAborted(signal);
        const metadata = useMetadataStore.getState().metadata;
        const placement = planToPlacement(
          resolveSnippetSteps(input.plan),
          (nodeType) => {
            const meta = metadata[nodeType];
            return meta ? planNodeShape(meta) : null;
          },
          input.models === undefined ? {} : { models: input.models }
        );
        nodeCount = placement.nodes.length;
        issues = placement.issues;

        // The editor has to be open before a node tool can reach it.
        await callTool("ui_open_workflow", { workflow_id: workflowId }, signal);
        throwIfAborted(signal);

        for (const node of placement.nodes) {
          await callTool("ui_add_node", {
            workflow_id: workflowId,
            id: node.id,
            type: node.type,
            position: node.position,
            properties: node.properties
          }, signal);
          addedNodeIds.push(node.id);
          throwIfAborted(signal);
          // Two writes the add cannot carry: the dynamic slots an edge needs to
          // land on, and the plan step this node came from (PRD § 11.5).
          const data: Record<string, unknown> = {};
          if (node.dynamicProperties !== undefined) {
            data["dynamic_properties"] = node.dynamicProperties;
          }
          if (node.dynamicOutputs !== undefined) {
            data["dynamic_outputs"] = node.dynamicOutputs;
          }
          if (node.setupStepId !== undefined) {
            data["setupStepId"] = node.setupStepId;
          }
          if (Object.keys(data).length > 0) {
            await callTool("ui_update_node_data", {
              workflow_id: workflowId,
              node_id: node.id,
              data
            }, signal);
            throwIfAborted(signal);
          }
        }

        for (const edge of placement.edges) {
          const response = await callTool("ui_connect_nodes", {
            workflow_id: workflowId,
            source_node_id: edge.source,
            source_handle: edge.sourceHandle,
            target_node_id: edge.target,
            target_handle: edge.targetHandle
          }, signal);
          if (isRecord(response) && typeof response["edge_id"] === "string") {
            addedEdgeIds.push(response["edge_id"]);
          }
          throwIfAborted(signal);
        }

        // The graph is placed: the stage is terminal from here, so a reload
        // lands on the canvas rather than back in the flow (D3).
        const placed = resultWith(
          "built",
          placement.nodes.length,
          placement.issues,
          [],
          { started: false, error: null },
          `Built the graph with ${placement.nodes.length} node${
            placement.nodes.length === 1 ? "" : "s"
          }. Checking it now.`
        );
        throwIfAborted(signal);
        await setSetup({
          stage: "done",
          [WORKFLOW_BUILD_KEY]: workflowBuildRecord(placed)
        });
        placedDone = true;

        let graph: { validation?: GraphValidation };
        try {
          graph = (await callTool("ui_get_graph", {
            workflow_id: workflowId
          }, signal)) as { validation?: GraphValidation };
        } catch (cause) {
          if (signal.aborted) {
            throw cause;
          }
          const error = cause instanceof Error ? cause.message : String(cause);
          const failed = resultWith(
            "failed",
            placement.nodes.length,
            placement.issues,
            [],
            { started: false, error },
            `The graph was built, but validation could not run: ${error}`
          );
          failed.validationError = error;
          return await settle(failed);
        }
        throwIfAborted(signal);
        validationErrors = Array.isArray(graph.validation?.errors)
          ? graph.validation.errors.map(String)
          : [];
        validationChecked = true;

        if (validationErrors.length > 0 || placement.issues.length > 0) {
          const failed = resultWith(
            "failed",
            placement.nodes.length,
            placement.issues,
            validationErrors,
            { started: false, error: null },
            validationErrors.length > 0
              ? `The graph failed validation with ${validationErrors.length} error${
                  validationErrors.length === 1 ? "" : "s"
                }.`
              : "The graph validates, but part of the plan is unwired."
          );
          return await settle(failed);
        }

        const validated = resultWith(
          "validated",
          placement.nodes.length,
          placement.issues,
          validationErrors,
          { started: false, error: null },
          "The graph validated. Starting the sample run."
        );
        await setSetup({ [WORKFLOW_BUILD_KEY]: workflowBuildRecord(validated) });

        const running = resultWith(
          "running",
          placement.nodes.length,
          placement.issues,
          validationErrors,
          { started: true, error: null },
          "The sample run is running. Waiting for its output."
        );
        await setSetup({ [WORKFLOW_BUILD_KEY]: workflowBuildRecord(running) });

        let finalResult: BuildFromPlanResult;
        try {
          // A Cancel pressed during the check stops the paid run here.
          throwIfAborted(signal);
          runStarted = true;
          const response = await callTool("ui_run_workflow", {
            workflow_id: workflowId,
            params: input.sampleInputs ?? {}
          }, signal);
          const runResponse = readRunResponse(response);
          if (signal.aborted) {
            // The run started while Cancel was pressed: stop it too.
            if (runResponse.jobId) {
              await getWorkflowRunnerStore(workflowId)
                .getState()
                .cancelJob(runResponse.jobId);
            }
            throw abortError();
          }
          if (runResponse.status === "completed-with-output") {
            finalResult = resultWith(
              "completed-with-output",
              placement.nodes.length,
              placement.issues,
              validationErrors,
              { started: true, error: null, output: runResponse.output },
              "The sample run completed and produced output.",
              runResponse.output
            );
          } else if (runResponse.status === "failed") {
            finalResult = resultWith(
              "failed",
              placement.nodes.length,
              placement.issues,
              validationErrors,
              { started: true, error: runResponse.error },
              `The sample run failed: ${runResponse.error}`
            );
          } else if (runResponse.jobId) {
            activeJobIdRef.current = runResponse.jobId;
            const completed = await waitForRunCompletion(
              workflowId,
              runResponse.jobId,
              placement.nodes
                .filter((node) => node.type === "nodetool.output.Output")
                .map((node) => ({
                  id: node.id,
                  name:
                    typeof node.properties["name"] === "string"
                      ? node.properties["name"]
                      : node.id
                })),
              signal
            );
            activeJobIdRef.current = null;
            if (completed.status === "completed-with-output") {
              finalResult = resultWith(
                "completed-with-output",
                placement.nodes.length,
                placement.issues,
                validationErrors,
                { started: true, error: null, output: completed.output },
                "The sample run completed and produced output.",
                completed.output
              );
            } else if (completed.status === "canceled") {
              finalResult = resultWith(
                "canceled",
                placement.nodes.length,
                placement.issues,
                validationErrors,
                { started: true, error: null },
                "The test run was canceled."
              );
            } else {
              finalResult = resultWith(
                "failed",
                placement.nodes.length,
                placement.issues,
                validationErrors,
                { started: true, error: completed.error },
                `The sample run failed: ${completed.error}`
              );
            }
          } else {
            finalResult = resultWith(
              "failed",
              placement.nodes.length,
              placement.issues,
              validationErrors,
              { started: true, error: "The test run did not return a job id." },
              "The sample run could not be tracked because it did not return a job id."
            );
          }
        } catch (cause) {
          if (signal.aborted) {
            throw cause;
          }
          const error = cause instanceof Error ? cause.message : String(cause);
          finalResult = resultWith(
            "failed",
            placement.nodes.length,
            placement.issues,
            validationErrors,
            { started: false, error },
            `The sample run could not start: ${error}`
          );
        }
        return await settle(finalResult);
      } catch (cause) {
        if (!placedDone) {
          await rollback();
          throw cause;
        }
        // The graph is on the canvas and the stage is `done`, so the shell is
        // gone. The record has to end in a final status, or the checklist
        // would show this build checking or running for good.
        const final = signal.aborted
          ? resultWith(
              "canceled",
              nodeCount,
              issues,
              validationErrors,
              { started: runStarted, error: null },
              "The test run was canceled."
            )
          : resultWith(
              "failed",
              nodeCount,
              issues,
              validationErrors,
              { started: runStarted, error: null },
              `The build stopped: ${
                cause instanceof Error ? cause.message : String(cause)
              }`
            );
        if (!validationChecked) {
          final.validationPending = true;
        }
        try {
          return await settle(final);
        } catch {
          setResult(final);
          return final;
        }
      } finally {
        outerSignal?.removeEventListener("abort", forwardAbort);
        if (buildControllerRef.current === controller) {
          buildControllerRef.current = null;
        }
        activeJobIdRef.current = null;
        liveBuilds.delete(workflowId);
        setBuilding(false);
      }
    },
    [setSetup, workflowId]
  );

  return { buildFromPlan, cancelBuild, building, result };
};

export default useBuildFromPlan;
