/**
 * The plan review's two markers (PRD § 11.2, D23).
 *
 * A step whose node type the live registry does not have shows a red marker and
 * a search field that picks a real one. A step whose model role no configured
 * provider covers shows an amber marker and a `Connect` button that opens
 * provider onboarding. Both are what `Continue to setup` reads (criterion 4);
 * the flow's own suite pins the button.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import mockTheme from "../../../../__mocks__/themeMock";

const openProviderOnboarding = jest.fn();
jest.mock("../../../../stores/ProviderOnboardingStore", () => ({
  openProviderOnboarding: (...args: unknown[]) =>
    openProviderOnboarding(...args)
}));

const str = { type: "str", type_args: [] };
const metadata = {
  "nodetool.text.Template": {
    node_type: "nodetool.text.Template",
    properties: [{ name: "string", type: str }],
    outputs: [{ name: "output", type: str }]
  },
  "nodetool.text.Concat": {
    node_type: "nodetool.text.Concat",
    properties: [{ name: "a", type: str }],
    outputs: [{ name: "output", type: str }]
  },
  "nodetool.code.Code": {
    node_type: "nodetool.code.Code",
    properties: [{ name: "code", type: str }],
    outputs: [],
    supports_dynamic_inputs: true,
    supports_dynamic_outputs: true
  }
};
jest.mock("../../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) => selector({ metadata })
}));

import { WorkflowReviewStep } from "../ReviewStep";

const PLAN: WorkflowSetupPlan = {
  inputs: [{ name: "text", type: "string", sample: "hi" }],
  steps: [
    {
      id: "s1",
      title: "Compose",
      summary: "lay it out",
      node_type: "nodetool.text.Template"
    }
  ],
  outputs: [{ name: "post", type: "string" }]
};

const renderStep = (
  plan: WorkflowSetupPlan,
  providerConfigured: (role: string) => boolean = () => true
) => {
  const onPlanChange = jest.fn();
  const onReplan = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <WorkflowReviewStep
        plan={plan}
        onPlanChange={onPlanChange}
        onReplan={onReplan}
        providerConfigured={providerConfigured}
      />
    </ThemeProvider>
  );
  return { onPlanChange, onReplan };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("WorkflowReviewStep", () => {
  it("lists the steps in plan order with their node types", () => {
    renderStep({
      ...PLAN,
      steps: [
        ...PLAN.steps,
        {
          id: "s2",
          title: "Join",
          summary: "stick them together",
          node_type: "nodetool.text.Concat"
        }
      ]
    });
    // The title is the field that edits it — a heading above it said the same
    // words twice.
    expect(screen.getByLabelText("Step 1 title")).toHaveValue("Compose");
    expect(screen.getByLabelText("Step 2 title")).toHaveValue("Join");
    expect(screen.getByText("nodetool.text.Template")).toBeInTheDocument();
  });

  it("shows a red marker and a search field for a type the registry lacks", () => {
    renderStep({
      ...PLAN,
      steps: [{ ...PLAN.steps[0], node_type: "nodetool.made.Up" }]
    });
    expect(screen.getByText("No node for this step")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Node type for step 1" })
    ).toBeInTheDocument();
  });

  it("shows the same marker for a step the planner could not name", () => {
    renderStep({
      ...PLAN,
      steps: [{ ...PLAN.steps[0], node_type: null }]
    });
    expect(
      screen.getByText("The plan could not name a node for this step. Pick one.")
    ).toBeInTheDocument();
  });

  it("writes the picked type back onto the step", async () => {
    const { onPlanChange } = renderStep({
      ...PLAN,
      steps: [{ ...PLAN.steps[0], node_type: null }]
    });
    const search = screen.getByRole("combobox", {
      name: "Node type for step 1"
    });
    await userEvent.click(search);
    await userEvent.click(await screen.findByText("nodetool.text.Concat"));
    expect(onPlanChange).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [expect.objectContaining({ node_type: "nodetool.text.Concat" })]
      })
    );
  });

  // A step the planner left unnamed is matched against the registry before it
  // gets here, so a green chip is not always the node the step meant.
  it("lets a named step's node type be changed", async () => {
    const { onPlanChange } = renderStep(PLAN);
    expect(
      screen.queryByRole("combobox", { name: "Node type for step 1" })
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Change node/ }));
    const search = screen.getByRole("combobox", {
      name: "Node type for step 1"
    });
    await userEvent.click(search);
    await userEvent.click(await screen.findByText("nodetool.text.Concat"));
    expect(onPlanChange).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [expect.objectContaining({ node_type: "nodetool.text.Concat" })]
      })
    );
  });

  it("shows an amber marker with Connect for a role no provider covers", async () => {
    renderStep(
      {
        ...PLAN,
        steps: [{ ...PLAN.steps[0], model_role: "language" }]
      },
      () => false
    );
    expect(
      screen.getByText("No language provider connected")
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(openProviderOnboarding).toHaveBeenCalledWith({
      capability: "generate_message",
      reason: "Step 1 needs a language model."
    });
  });

  // The model list is still being read on a first visit. That is a wait,
  // not a missing provider, so it says so instead of asking to connect one.
  it("says the models are being read instead of asking to connect a provider", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <WorkflowReviewStep
          plan={{
            ...PLAN,
            steps: [{ ...PLAN.steps[0], model_role: "language" }]
          }}
          onPlanChange={jest.fn()}
          onReplan={jest.fn()}
          providerConfigured={() => false}
          roleLoading={(role) => role === "language"}
        />
      </ThemeProvider>
    );
    expect(
      screen.getByText("Reading the language models your providers offer…")
    ).toBeInTheDocument();
    expect(screen.queryByText("No language provider connected")).toBeNull();
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(screen.queryByText(/No connected provider offers/)).toBeNull();
  });

  it("shows no marker when the role is covered", () => {
    renderStep({
      ...PLAN,
      steps: [{ ...PLAN.steps[0], model_role: "language" }]
    });
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
  });

  it("reorders and removes steps through the plan, not through local state", async () => {
    const { onPlanChange } = renderStep({
      ...PLAN,
      steps: [
        ...PLAN.steps,
        {
          id: "s2",
          title: "Join",
          summary: "",
          node_type: "nodetool.text.Concat"
        }
      ]
    });
    await userEvent.click(screen.getByRole("button", { name: "Move step 2 up" }));
    expect(onPlanChange.mock.calls[0][0].steps.map((s: { id: string }) => s.id)).toEqual([
      "s2",
      "s1"
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Remove step 1" }));
    expect(onPlanChange.mock.calls[1][0].steps.map((s: { id: string }) => s.id)).toEqual([
      "s2"
    ]);
  });

  it("adds a step with no node type, which the red marker then blocks on", async () => {
    const { onPlanChange } = renderStep(PLAN);
    await userEvent.click(screen.getByRole("button", { name: "Add a step" }));
    const added = onPlanChange.mock.calls[0][0].steps[1];
    expect(added.node_type).toBeNull();
  });

  it("says how many steps hold the gate", () => {
    // The primary button lives in the shell, and a marker can sit a screen of
    // scroll above it — the count is what tells the creator why it is off.
    renderStep({
      ...PLAN,
      steps: [
        ...PLAN.steps,
        { id: "s2", title: "Send", summary: "", node_type: null },
        { id: "s3", title: "Log", summary: "", node_type: "nope.Missing" }
      ]
    });
    expect(
      screen.getByText(
        "2 steps name no node this install has. Pick one for each below to continue."
      )
    ).toBeInTheDocument();
  });

  // F30: an unknown node type is fixed here, a missing provider by connecting
  // one. The summary cannot call both "missing nodes".
  it("counts a missing provider apart from a missing node", () => {
    renderStep(
      {
        ...PLAN,
        steps: [{ ...PLAN.steps[0], model_role: "language" }]
      },
      () => false
    );
    expect(
      screen.getByText(
        "No connected provider offers a language model. Connect one below to continue."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/name no node/)).toBeNull();
  });

  it("says nothing about the gate when every step maps to a node", () => {
    renderStep(PLAN);
    expect(screen.queryByText(/name no node/)).toBeNull();
    expect(screen.queryByText(/No connected provider/)).toBeNull();
  });

  // F32: inputs before steps, and the sample values are edited on the setup
  // step (PRD § 11.3), so the review shows them read-only.
  it("shows the inputs above the steps, with their samples read-only", () => {
    renderStep(PLAN);
    const inputs = screen.getByRole("heading", { name: "Inputs" });
    const outputs = screen.getByRole("heading", { name: "Outputs" });
    expect(
      inputs.compareDocumentPosition(screen.getByLabelText("Step 1 title")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      outputs.compareDocumentPosition(screen.getByLabelText("Step 1 title")) &
        Node.DOCUMENT_POSITION_PRECEDING
    ).toBeTruthy();
    expect(screen.getByLabelText("text (string)")).toHaveAttribute("readonly");
  });

  it("warns, before anything runs, about a Code step that would fail", () => {
    renderStep({
      ...PLAN,
      steps: [
        {
          id: "s1",
          title: "Prompts",
          summary: "one per row",
          node_type: "nodetool.code.Code",
          code: 'for (const row of inputs.input) { await output("output", row); }'
        }
      ]
    });
    expect(
      screen.getByText("This plan would fail when it runs")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/output\(\) can be set only once per run/)
    ).toBeInTheDocument();
  });

  it("shows no run-time warning for a plan that builds", () => {
    renderStep(PLAN);
    expect(
      screen.queryByText("This plan would fail when it runs")
    ).not.toBeInTheDocument();
  });

  it("runs the planner again from Re-plan", async () => {
    const { onReplan } = renderStep(PLAN);
    await userEvent.click(screen.getByRole("button", { name: "Re-plan" }));
    expect(onReplan).toHaveBeenCalledTimes(1);
  });

  // A re-plan's answer replaces the whole plan, so nothing typed meanwhile
  // may be written only to be overwritten.
  it("holds every edit while a re-plan runs", async () => {
    const onPlanChange = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <WorkflowReviewStep
          plan={PLAN}
          onPlanChange={onPlanChange}
          onReplan={jest.fn()}
          replanPending
          providerConfigured={() => true}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("textbox", { name: "Step 1 title" })).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "Step 1 description" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove step 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add a step" })).toBeDisabled();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Output 1" }),
      "x"
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Change node: nodetool.text.Template" })
    );
    expect(
      screen.queryByRole("combobox", { name: "Node type for step 1" })
    ).toBeNull();
    expect(onPlanChange).not.toHaveBeenCalled();
  });
});
