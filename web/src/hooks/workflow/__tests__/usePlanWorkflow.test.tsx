/**
 * The planner (PRD § 11.2, criterion 3).
 *
 * What is asserted here is what the plan step is allowed to do: write text.
 * It calls one model, stores what came back, and places nothing — no
 * `ui_add_node`, no run. A step the model could not name is matched against the
 * live registry before the plan is stored, and only a step the registry ranks
 * nothing for reaches the review step as `null`, where D23's red marker waits.
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
  },
  "nodetool.mail.SendEmail": {
    node_type: "nodetool.mail.SendEmail",
    title: "Send Email",
    description: "Send an email message",
    namespace: "nodetool.mail",
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

import {
  readWorkflowSetup,
  writeWorkflowSetup
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { WORKFLOW_INSPIRATION_CHIPS } from "@nodetool-ai/protocol";
import {
  usePlanWorkflow,
  pinnedChipPlan,
  planCandidates,
  resolvePlanNodeTypes
} from "../usePlanWorkflow";

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
      ).toBeNull();
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
  it("matches a step the model could not name against the registry", async () => {
    rpcRequest.mockResolvedValueOnce(ANSWER);
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    await act(async () => {
      await result.current.planWorkflow({ brief: "do a thing", model: MODEL });
    });
    const steps = readWorkflowSetup(settings)?.plan?.steps ?? [];
    expect(steps.map((step) => step.node_type)).toEqual([
      "nodetool.text.Template",
      "nodetool.mail.SendEmail"
    ]);
    // Every step still carries an id, so the review step can address it.
    expect(steps.every((step) => step.id.length > 0)).toBe(true);
  });

  it("leaves a step the registry ranks nothing for as null", async () => {
    rpcRequest.mockResolvedValueOnce({
      data: {
        inputs: [],
        steps: [
          {
            title: "Zzzqqx",
            summary: "Zzzqqx wqxjv",
            node_type: "nodetool.zzzqqx.Wqxjv"
          }
        ],
        outputs: [{ name: "out", type: "string" }]
      }
    });
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    await act(async () => {
      await result.current.planWorkflow({ brief: "do a thing", model: MODEL });
    });
    expect(readWorkflowSetup(settings)?.plan?.steps[0].node_type).toBeNull();
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
      expect(
        await result.current.planWorkflow({ brief: "  ", model: MODEL })
      ).toContain("Describe the task");
    });
    expect(rpcRequest).not.toHaveBeenCalled();
    expect(result.current.error).toContain("Describe the task");
  });

  it("reports a refused provider call rather than storing half a plan", async () => {
    rpcRequest.mockRejectedValueOnce(new Error("provider is down"));
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    await act(async () => {
      // The provider's own words come back from the call, so the flow shell
      // can report them in the same tick — `error` is a render behind.
      expect(
        await result.current.planWorkflow({ brief: "do a thing", model: MODEL })
      ).toBe("provider is down");
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
      ).toBeNull();
    });
    expect(rpcRequest).not.toHaveBeenCalled();
    expect(readWorkflowSetup(settings)?.plan?.steps).toHaveLength(
      chip.plan.steps.length
    );
  });

  // F9: a planner call outlives the stage that asked for it. The creator who
  // went back to the idea step keeps that step, and their brief keeps whatever
  // they are typing into it.
  it("drops an answer that arrives after the creator left the stage", async () => {
    settings = writeWorkflowSetup({}, { stage: "category", brief: "b" });
    let release: (value: unknown) => void = () => undefined;
    rpcRequest.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    let pending: Promise<string | null> = Promise.resolve(null);
    await act(async () => {
      pending = result.current.planWorkflow({ brief: "b", model: MODEL });
    });

    // The creator steps back while the planner is still out.
    settings = writeWorkflowSetup(settings, { stage: "idea" });

    await act(async () => {
      release(ANSWER);
      expect(await pending).toBeNull();
    });
    const setup = readWorkflowSetup(settings);
    expect(setup?.stage).toBe("idea");
    expect(setup?.plan).toBeUndefined();
  });

  it("records what the stored plan answers, so an unchanged brief is not re-planned", async () => {
    rpcRequest.mockResolvedValueOnce(ANSWER);
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    await act(async () => {
      await result.current.planWorkflow({
        brief: " do a thing ",
        category: "content-pipeline",
        model: MODEL
      });
    });
    expect(readWorkflowSetup(settings)?.["plan_source"]).toEqual({
      brief: "do a thing",
      category: "content-pipeline"
    });
  });

  it("says what is missing when there is neither a model nor a pinned plan", async () => {
    const { result } = renderHook(() => usePlanWorkflow("w1"));
    await act(async () => {
      expect(
        await result.current.planWorkflow({ brief: "something new", model: null })
      ).toContain("Connect a provider");
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

describe("planCandidates", () => {
  // A catalog where one job of the brief can flood the whole prompt.
  const crowded: Record<string, unknown> = {
    "nodetool.mail.SendEmail": metadata["nodetool.mail.SendEmail"]
  };
  for (let index = 0; index < 60; index += 1) {
    const nodeType = `nodetool.text.Format${index}`;
    crowded[nodeType] = {
      node_type: nodeType,
      title: `Format Text ${index}`,
      description: "Format a text string",
      namespace: "nodetool.text",
      properties: [],
      outputs: []
    };
  }

  const typesOf = (lines: string[]) =>
    lines.map((line) => line.slice(2).split(":")[0]);

  // One blended query spent every slot on the first job, so the second step had
  // no candidate to name and came back null.
  it("offers each clause of the brief its own candidates", () => {
    const types = typesOf(
      planCandidates(
        "format the text and email it",
        undefined,
        crowded as never
      )
    );
    expect(types).toContain("nodetool.mail.SendEmail");
    expect(types.some((type) => type.startsWith("nodetool.text.Format"))).toBe(
      true
    );
  });

  it("names only types the registry has", () => {
    const lines = planCandidates("format text", "content-pipeline", metadata as never);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(Object.keys(metadata)).toContain(line.slice(2).split(":")[0]);
    }
  });
});

describe("resolvePlanNodeTypes", () => {
  it("leaves a step the registry already has alone", () => {
    const plan = {
      inputs: [],
      steps: [
        {
          id: "s1",
          title: "Compose",
          summary: "lay it out",
          node_type: "nodetool.text.Template"
        }
      ],
      outputs: []
    };
    expect(resolvePlanNodeTypes(plan, metadata as never).steps[0].node_type).toBe(
      "nodetool.text.Template"
    );
  });

  it("resolves a type this install does not have to one it does", () => {
    const plan = {
      inputs: [],
      steps: [
        {
          id: "s1",
          title: "Send Email",
          summary: "mail the summary out",
          node_type: "nodetool.gmail.SendEmail"
        }
      ],
      outputs: []
    };
    expect(resolvePlanNodeTypes(plan, metadata as never).steps[0].node_type).toBe(
      "nodetool.mail.SendEmail"
    );
  });
});
