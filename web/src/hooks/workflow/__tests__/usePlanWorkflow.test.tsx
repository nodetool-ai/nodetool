/**
 * The planner (PRD § 11.2, criterion 3).
 *
 * What is asserted here is what the plan step is allowed to do: write text.
 * It calls one model, stores what came back, and places nothing — no
 * `ui_add_node`, no run. A step the model could not name comes back `null` and
 * survives to the review step, where D23's red marker is waiting for it.
 */
import { act, renderHook } from "@testing-library/react";

const rpcRequest = jest.fn();
jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...args)
}));

let settings: Record<string, unknown> = {};
const saveWorkflow = jest.fn(async () => {});
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: () => undefined,
  updateWorkflow: jest.fn((workflow: { settings: unknown }) => {
    settings = workflow.settings as Record<string, unknown>;
  }),
  saveWorkflow
};
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector(managerState),
  useWorkflowManagerStore: () => ({ getState: () => managerState })
}));

const metadata = {
  "nodetool.text.Template": {
    node_type: "nodetool.text.Template",
    title: "Template",
    description: "Format a string",
    namespace: "nodetool.text",
    properties: [],
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
import { WORKFLOW_INSPIRATION_CHIPS } from "@nodetool-ai/protocol";
import { usePlanWorkflow, pinnedChipPlan } from "../usePlanWorkflow";

const MODEL = { provider: "openai", id: "gpt-x" };

const ANSWER = {
  data: {
    inputs: [{ name: "text", type: "string", sample: "hi" }],
    steps: [
      {
        title: "Compose",
        summary: "lay it out",
        node_type: "nodetool.text.Template"
      },
      { title: "Email it", summary: "send it on", node_type: null }
    ],
    outputs: [{ name: "post", type: "string" }]
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  settings = {};
});

describe("planWorkflow", () => {
  it("stores the plan and moves the stage to review", async () => {
    rpcRequest.mockResolvedValueOnce(ANSWER);
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    await act(async () => {
      expect(
        await result.current.planWorkflow({ brief: "do a thing", model: MODEL })
      ).toBe(true);
    });
    const setup = readWorkflowSetup(settings);
    expect(setup?.stage).toBe("review");
    expect(setup?.plan?.steps).toHaveLength(2);
  });

  // Criterion 3, first half: nothing is placed.
  it("places no node and starts no run", async () => {
    rpcRequest.mockResolvedValueOnce(ANSWER);
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    await act(async () => {
      await result.current.planWorkflow({ brief: "do a thing", model: MODEL });
    });
    // The one call it makes is the planner's; a node placement or a run would
    // be a second rpc, and `ui_*` tools go through the tool registry, not here.
    expect(rpcRequest).toHaveBeenCalledTimes(1);
    expect(rpcRequest.mock.calls[0][0]).toBe("generate_text");
    const setup = readWorkflowSetup(settings);
    expect(setup?.plan).toBeDefined();
    expect(managerState.getWorkflow().graph).toBeNull();
  });

  // Criterion 3, second half: a step names a registry type or nothing.
  it("keeps a step the model could not name as null rather than guessing", async () => {
    rpcRequest.mockResolvedValueOnce(ANSWER);
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    await act(async () => {
      await result.current.planWorkflow({ brief: "do a thing", model: MODEL });
    });
    const steps = readWorkflowSetup(settings)?.plan?.steps ?? [];
    expect(steps.map((step) => step.node_type)).toEqual([
      "nodetool.text.Template",
      null
    ]);
    // Every step still carries an id, so the review step can address it.
    expect(steps.every((step) => step.id.length > 0)).toBe(true);
  });

  it("offers the planner only node types the registry has", async () => {
    rpcRequest.mockResolvedValueOnce(ANSWER);
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    await act(async () => {
      await result.current.planWorkflow({
        brief: "format some text",
        category: "content-pipeline",
        model: MODEL
      });
    });
    const prompt = String(rpcRequest.mock.calls[0][1].prompt);
    expect(prompt).toContain("nodetool.text.Template");
    for (const line of prompt.split("\n").filter((l) => l.startsWith("- "))) {
      expect(Object.keys(metadata)).toContain(line.slice(2).split(":")[0]);
    }
  });

  it("refuses an empty brief without calling a model", async () => {
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    await act(async () => {
      expect(await result.current.planWorkflow({ brief: "  ", model: MODEL })).toBe(
        false
      );
    });
    expect(rpcRequest).not.toHaveBeenCalled();
    expect(result.current.error).toContain("Describe the task");
  });

  it("reports a refused provider call rather than storing half a plan", async () => {
    rpcRequest.mockRejectedValueOnce(new Error("provider is down"));
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    await act(async () => {
      expect(
        await result.current.planWorkflow({ brief: "do a thing", model: MODEL })
      ).toBe(false);
    });
    expect(result.current.error).toBe("provider is down");
    expect(readWorkflowSetup(settings)?.plan).toBeUndefined();
  });

  it("falls back to a shipped chip's pinned plan when no model is configured", async () => {
    const chip = WORKFLOW_INSPIRATION_CHIPS[0];
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    await act(async () => {
      expect(
        await result.current.planWorkflow({ brief: chip.brief, model: null })
      ).toBe(true);
    });
    expect(rpcRequest).not.toHaveBeenCalled();
    expect(readWorkflowSetup(settings)?.plan?.steps).toHaveLength(
      chip.plan.steps.length
    );
  });

  it("says what is missing when there is neither a model nor a pinned plan", async () => {
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    await act(async () => {
      expect(
        await result.current.planWorkflow({ brief: "something new", model: null })
      ).toBe(false);
    });
    expect(result.current.error).toContain("Connect a provider");
  });
});

describe("pinnedChipPlan", () => {
  it("matches a chip's brief regardless of case and padding", () => {
    const chip = WORKFLOW_INSPIRATION_CHIPS[1];
    expect(pinnedChipPlan(`  ${chip.brief.toUpperCase()} `)).toEqual(chip.plan);
  });

  it("returns null for a brief no chip ships", () => {
    expect(pinnedChipPlan("write me a haiku")).toBeNull();
  });
});
