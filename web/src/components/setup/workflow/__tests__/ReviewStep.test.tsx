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

const metadata = {
  "nodetool.text.Template": { node_type: "nodetool.text.Template" },
  "nodetool.text.Concat": { node_type: "nodetool.text.Concat" }
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
    expect(screen.getByRole("heading", { name: "1. Compose" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2. Join" })).toBeInTheDocument();
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

  it("runs the planner again from Re-plan", async () => {
    const { onReplan } = renderStep(PLAN);
    await userEvent.click(screen.getByRole("button", { name: "Re-plan" }));
    expect(onReplan).toHaveBeenCalledTimes(1);
  });
});
