/**
 * The build (PRD § 11.3, criterion 5; R6).
 *
 * What is asserted: the plan is replayed through the node tools in plan order,
 * each step's node carries its step id, the terminal stage is written as soon
 * as the nodes are down, and the test run only starts on a graph that both
 * validates *and* has nothing left unwired — because a graph with an output
 * fed by nothing validates and produces nothing, which is R6.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";

const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
let graphValidation: { errors: string[] } = { errors: [] };
let runThrows: Error | null = null;
let runResponse: unknown = { ok: true, job_id: "job-1" };
let deferredToolName: string | null = null;
let releaseDeferredTool: () => void = () => undefined;
let failingToolName: string | null = null;
let runFinalState: "completed" | "cancelled" | "error" = "completed";
/** A node error the run reports before it fails. */
let runNodeError: { nodeId: string; message: string } | null = null;
/** The error the job's own failure frame carries. */
let runJobError: string | undefined;
/** A pre-flight property issue the failure frame records after the state. */
let runPropertyIssue: { node_id: string; property: string; message: string } | null =
  null;
jest.mock("../../../lib/tools/frontendTools", () => ({
  FrontendToolRegistry: {
    call: jest.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === deferredToolName) {
        deferredToolName = null;
        await new Promise<void>((resolve) => {
          releaseDeferredTool = resolve;
        });
      }
      if (name === failingToolName) {
        throw new Error(`${name} failed`);
      }
      if (name === "ui_get_graph") {
        return { validation: graphValidation };
      }
      if (name === "ui_run_workflow" && runThrows) {
        throw runThrows;
      }
      if (name === "ui_run_workflow") {
        if (runResponse && (runResponse as Record<string, unknown>)["job_id"]) {
          const runs = jest.requireActual<
            typeof import("../../../stores/WorkflowRunsStore")
          >("../../../stores/WorkflowRunsStore").default;
          const results = jest.requireActual<
            typeof import("../../../stores/ResultsStore")
          >("../../../stores/ResultsStore").default;
          runs.getState().recordRun({
            jobId: "job-1",
            workflowId: "w1",
            state: "running",
            startedAt: Date.now()
          });
          results
            .getState()
            .setOutputResult("w1", "job-1", "output_1", "hello");
          if (runNodeError) {
            jest
              .requireActual<typeof import("../../../stores/ErrorStore")>(
                "../../../stores/ErrorStore"
              )
              .default.getState()
              .setError("w1", "job-1", runNodeError.nodeId, runNodeError.message);
          }
          if (runPropertyIssue) {
            // The job's failure frame, once the build is waiting on it: the
            // run state changes first, then the issues are recorded.
            const issue = runPropertyIssue;
            setTimeout(() => {
              runs.getState().updateRunState("w1", "job-1", runFinalState);
              jest
                .requireActual<
                  typeof import("../../../stores/PropertyValidationStore")
                >("../../../stores/PropertyValidationStore")
                .default.getState()
                .setIssues("w1", [issue]);
            }, 0);
          } else {
            runs
              .getState()
              .updateRunState("w1", "job-1", runFinalState, runJobError);
          }
        }
        return runResponse;
      }
      return { ok: true };
    })
  }
}));
jest.mock("../../../lib/tools/frontendToolRuntimeState", () => ({
  getFrontendToolRuntimeState: () => ({})
}));

let settings: Record<string, unknown> = {};
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: () => undefined,
  updateWorkflow: jest.fn((workflow: { settings: unknown }) => {
    settings = workflow.settings as Record<string, unknown>;
  }),
  saveWorkflow: jest.fn(async () => {})
};
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector(managerState),
  useWorkflowManagerStore: () => ({ getState: () => managerState })
}));

const metadata = {
  "nodetool.input.StringInput": {
    node_type: "nodetool.input.StringInput",
    properties: [{ name: "name", type: { type: "str" } }],
    outputs: [{ name: "output", type: { type: "str" } }]
  },
  "nodetool.text.Template": {
    node_type: "nodetool.text.Template",
    inline_fields: ["string"],
    properties: [{ name: "string", type: { type: "str" } }],
    outputs: [{ name: "output", type: { type: "str" } }]
  },
  "nodetool.output.Output": {
    node_type: "nodetool.output.Output",
    properties: [{ name: "value", type: { type: "any" } }],
    outputs: []
  }
};
jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: Object.assign(
    (selector: (state: unknown) => unknown) => selector({ metadata }),
    { getState: () => ({ metadata }) }
  )
}));

import { readWorkflowSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import useErrorStore from "../../../stores/ErrorStore";
import usePropertyValidationStore from "../../../stores/PropertyValidationStore";
import {
  useBuildFromPlan,
  workflowBuildRecord,
  workflowBuildResult
} from "../useBuildFromPlan";
import type { BuildFromPlanResult } from "../useBuildFromPlan";

const PLAN: WorkflowSetupPlan = {
  inputs: [{ name: "text", type: "string", sample: "hello" }],
  steps: [
    {
      id: "compose",
      title: "Compose",
      summary: "lay it into the template",
      node_type: "nodetool.text.Template"
    }
  ],
  outputs: [{ name: "post", type: "string" }]
};

const build = async (
  plan: WorkflowSetupPlan = PLAN
): Promise<BuildFromPlanResult> => {
  const { result } = renderHook(() => useBuildFromPlan("w1"));
  // Named off the hook rather than inferred from the variable: TypeScript
  // narrows a `let` assigned only inside a callback to its initializer, which
  // made `NonNullable<typeof built>` resolve to `never`.
  let built: BuildFromPlanResult | undefined;
  await act(async () => {
    built = await result.current.buildFromPlan({
      plan,
      sampleInputs: { text: "hello" }
    });
  });
  if (!built) {
    throw new Error("buildFromPlan did not resolve");
  }
  return built;
};

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  settings = {};
  graphValidation = { errors: [] };
  runThrows = null;
  runResponse = { ok: true, job_id: "job-1" };
  deferredToolName = null;
  releaseDeferredTool = () => undefined;
  failingToolName = null;
  runFinalState = "completed";
  runNodeError = null;
  runPropertyIssue = null;
  runJobError = undefined;
  useErrorStore.setState({ errors: {} });
  usePropertyValidationStore.setState({ errors: {} });
});

describe("buildFromPlan", () => {
  it("places the nodes and then the edges, through the node tools", async () => {
    await build();
    expect(calls.map((call) => call.name)).toEqual([
      "ui_open_workflow",
      "ui_add_node",
      "ui_add_node",
      "ui_update_node_data",
      "ui_add_node",
      "ui_connect_nodes",
      "ui_connect_nodes",
      "ui_get_graph",
      "ui_run_workflow"
    ]);
  });

  it("carries the plan step id onto the node it placed (PRD § 11.5)", async () => {
    await build();
    const update = calls.find((call) => call.name === "ui_update_node_data");
    expect(update?.args).toMatchObject({
      node_id: "step_1",
      data: { setupStepId: "compose" }
    });
  });

  it("puts the input's sample on the node so a run has a value", async () => {
    await build();
    const input = calls.find(
      (call) =>
        call.name === "ui_add_node" &&
        call.args["type"] === "nodetool.input.StringInput"
    );
    expect(input?.args["properties"]).toEqual({
      name: "text",
      value: "hello"
    });
  });

  it("writes the terminal stage once the nodes are placed", async () => {
    await build();
    expect(readWorkflowSetup(settings)?.stage).toBe("done");
  });

  it("runs once with the sample inputs when the graph is clean", async () => {
    const result = await build();
    expect(result.status).toBe("completed-with-output");
    expect(result.testRun).toEqual({
      started: true,
      error: null,
      output: { post: "hello" }
    });
    const run = calls.find((call) => call.name === "ui_run_workflow");
    expect(run?.args["params"]).toEqual({ text: "hello" });
  });

  it("does not run a graph that failed validation, and reports the errors", async () => {
    graphValidation = { errors: ["Node x: required property missing"] };
    const result = await build();
    expect(result.validationErrors).toEqual([
      "Node x: required property missing"
    ]);
    expect(calls.some((call) => call.name === "ui_run_workflow")).toBe(false);
    expect(result.testRun.started).toBe(false);
  });

  // R6: the graph validates and would produce nothing. The build says so, and
  // does not report a green test run on it.
  it("does not run a graph that validates but left the output unwired", async () => {
    const result = await build({ ...PLAN, steps: [] });
    expect(result.validationErrors).toEqual([]);
    expect(result.issues.join(" ")).toContain("produces nothing");
    expect(calls.some((call) => call.name === "ui_run_workflow")).toBe(false);
    expect(result.testRun.started).toBe(false);
  });

  it("reports a refused run instead of throwing out of the build", async () => {
    runThrows = new Error("no worker available");
    const result = await build();
    expect(result.testRun).toEqual({
      started: false,
      error: "no worker available"
    });
    expect(result.status).toBe("failed");
    // The graph is still built and the stage still terminal — the creator lands
    // on the canvas with the reason, not back in the flow.
    expect(readWorkflowSetup(settings)?.stage).toBe("done");
  });

  it("records a completed run when the runner returns output", async () => {
    runResponse = { status: "completed", output: { post: "hello" } };
    const result = await build();

    expect(result).toMatchObject({
      status: "completed-with-output",
      output: { post: "hello" },
      explanation: "The sample run completed and produced output."
    });
    expect(readWorkflowSetup(settings)?.build).toMatchObject({
      status: "completed-with-output",
      output: { post: "hello" },
      explanation: "The sample run completed and produced output."
    });
  });

  it("does not leave the build running when the runner omits its job id", async () => {
    runResponse = { ok: true, workflow_id: "w1" };

    const result = await build();

    expect(result.status).toBe("failed");
    expect(result.testRun).toEqual({
      started: true,
      error: "The test run did not return a job id."
    });
  });

  it("keeps the failed outcome explanation in setup state", async () => {
    graphValidation = { errors: ["Node x: required property missing"] };
    const result = await build();

    expect(result.status).toBe("failed");
    expect(readWorkflowSetup(settings)?.build).toMatchObject({
      status: "failed",
      validation_errors: ["Node x: required property missing"],
      explanation: expect.stringContaining("failed validation")
    });
  });

  it("rolls back placed nodes and the setup stage when explicitly aborted", async () => {
    deferredToolName = "ui_update_node_data";
    const controller = new AbortController();
    const { result } = renderHook(() => useBuildFromPlan("w1"));
    let buildPromise: Promise<BuildFromPlanResult> | null = null;

    act(() => {
      buildPromise = result.current.buildFromPlan(
        { plan: PLAN, sampleInputs: { text: "hello" } },
        controller.signal
      );
    });
    await waitFor(() =>
      expect(calls.some((call) => call.name === "ui_update_node_data")).toBe(true)
    );

    controller.abort();
    releaseDeferredTool();
    await act(async () => {
      await expect(buildPromise).rejects.toMatchObject({ name: "AbortError" });
    });

    expect(
      calls
        .filter((call) => call.name === "ui_delete_node")
        .map((call) => call.args["node_id"])
    ).toEqual(["step_1", "input_1"]);
    expect(readWorkflowSetup(settings)?.stage).toBe("setup");
    expect(calls.some((call) => call.name === "ui_run_workflow")).toBe(false);
  });

  it("rolls back placed nodes when wiring fails, so a rebuild starts clean", async () => {
    failingToolName = "ui_connect_nodes";
    const { result } = renderHook(() => useBuildFromPlan("w1"));
    await act(async () => {
      await expect(
        result.current.buildFromPlan({ plan: PLAN })
      ).rejects.toThrow("ui_connect_nodes failed");
    });

    expect(
      calls
        .filter((call) => call.name === "ui_delete_node")
        .map((call) => call.args["node_id"])
    ).toEqual(["output_1", "step_1", "input_1"]);
    expect(readWorkflowSetup(settings)?.stage).toBe("setup");
  });

  it("cancels before the test run has a job id, and never starts the run", async () => {
    deferredToolName = "ui_get_graph";
    const { result } = renderHook(() => useBuildFromPlan("w1"));
    let buildPromise: Promise<BuildFromPlanResult> | null = null;
    act(() => {
      buildPromise = result.current.buildFromPlan({ plan: PLAN });
    });
    await waitFor(() =>
      expect(calls.some((call) => call.name === "ui_get_graph")).toBe(true)
    );

    let built: BuildFromPlanResult | undefined;
    await act(async () => {
      await result.current.cancelBuild();
      releaseDeferredTool();
      built = await buildPromise!;
    });

    expect(calls.some((call) => call.name === "ui_run_workflow")).toBe(false);
    expect(built?.status).toBe("canceled");
    expect(built?.testRun).toEqual({ started: false, error: null });
    // The graph stays on the canvas: the stage was already `done`.
    expect(calls.some((call) => call.name === "ui_delete_node")).toBe(false);
    const setup = readWorkflowSetup(settings);
    expect(setup?.stage).toBe("done");
    expect(setup?.["build"]).toMatchObject({ status: "canceled" });
  });

  it("adds one version row per build", async () => {
    await build();

    const saves = managerState.saveWorkflow.mock.calls as unknown as Array<
      [unknown, { snapshot?: boolean } | undefined]
    >;
    expect(saves.length).toBeGreaterThan(1);
    expect(
      saves.filter(([, options]) => options?.snapshot !== false)
    ).toHaveLength(1);
  });

  it("says which step failed the sample run and why", async () => {
    runFinalState = "error";
    runNodeError = { nodeId: "step_1", message: "API key missing" };
    const built = await build();

    expect(built.status).toBe("failed");
    expect(built.testRun.error).toBe("Compose: API key missing");
    expect(built.explanation).toBe(
      "The sample run failed: Compose: API key missing"
    );
  });

  it("names the job's own error when no node reported one", async () => {
    runFinalState = "error";
    runJobError = "Worker ran out of memory";
    const built = await build();

    expect(built.testRun.error).toBe("Worker ran out of memory");
  });

  it("names the field a run refused before it started", async () => {
    runFinalState = "error";
    runPropertyIssue = {
      node_id: "step_1",
      property: "string",
      message: "is required"
    };
    const built = await build();

    expect(built.testRun.error).toBe("Compose, string: is required");
  });

  it("records a canceled job as canceled, not as a failed run", async () => {
    runFinalState = "cancelled";
    const built = await build();
    expect(built.status).toBe("canceled");
    expect(built.testRun.error).toBeNull();
  });

  it("reads an in-progress record with no live build as unrecorded", () => {
    const record = workflowBuildRecord({
      status: "running",
      nodeCount: 3,
      issues: [],
      validationErrors: [],
      testRun: { started: true, error: null },
      explanation: "The sample run is running."
    });
    expect(workflowBuildResult(record).status).toBe("running");
    expect(workflowBuildResult(record, { live: false }).status).toBe(
      "unrecorded"
    );
  });
});
