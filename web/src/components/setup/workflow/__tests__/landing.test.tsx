/**
 * The landing checklist (PRD § 11.4) and the six workflow categories
 * (PRD § 11.2).
 *
 * The rule under test is the one the PRD states outright: a validation error or
 * a failed run becomes the first agent message with the fix proposed, and
 * nothing is auto-applied. The checklist has no apply path, so what is asserted
 * is that pressing its one button hands the message over and changes nothing.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import type { BuildFromPlanResult } from "../../../../hooks/workflow/useBuildFromPlan";
import {
  WorkflowLandingChecklist,
  buildFailureMessage
} from "../WorkflowLandingChecklist";
import {
  WORKFLOW_CATEGORIES,
  defaultRunModeFor,
  workflowCategory
} from "../categories";

const CLEAN: BuildFromPlanResult = {
  nodeCount: 3,
  issues: [],
  validationErrors: [],
  testRun: { started: true, error: null }
};

const renderChecklist = (
  result: BuildFromPlanResult,
  runMode: "manual" | "app" | "trigger" = "app"
) => {
  const onNextStep = jest.fn();
  const onAskAgent = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <WorkflowLandingChecklist
        result={result}
        runMode={runMode}
        onNextStep={onNextStep}
        onAskAgent={onAskAgent}
      />
    </ThemeProvider>
  );
  return { onNextStep, onAskAgent };
};

describe("WorkflowLandingChecklist", () => {
  it("ticks all three lines and offers the run mode's next step", async () => {
    const { onNextStep } = renderChecklist(CLEAN);
    expect(screen.getByText("Graph built")).toBeInTheDocument();
    expect(screen.getByText("3 nodes placed")).toBeInTheDocument();
    expect(screen.getByText("No problems found")).toBeInTheDocument();
    expect(
      screen.getByText("Started with your sample inputs")
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save as app" }));
    expect(onNextStep).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["manual" as const, "Run it again"],
    ["app" as const, "Save as app"],
    ["trigger" as const, "Add a trigger"]
  ])("offers %s's own next step", async (runMode, label) => {
    renderChecklist(CLEAN, runMode);
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });

  it("hands a validation error to the agent and applies nothing", async () => {
    const { onAskAgent, onNextStep } = renderChecklist({
      ...CLEAN,
      validationErrors: ["Node step_1: required property \"text\" is not set."],
      testRun: { started: false, error: null }
    });
    await userEvent.click(screen.getByRole("button", { name: "Ask the agent" }));
    expect(onAskAgent).toHaveBeenCalledTimes(1);
    expect(onAskAgent.mock.calls[0][0]).toContain("does not validate");
    expect(onAskAgent.mock.calls[0][0]).toContain("wait for me");
    expect(onNextStep).not.toHaveBeenCalled();
  });

  // R6 on the landing: the graph validated and would produce nothing.
  it("says so when the graph validates but the plan was not fully wired", () => {
    renderChecklist({
      ...CLEAN,
      issues: ['output "post" has no step upstream, so the workflow produces nothing.'],
      testRun: { started: false, error: null }
    });
    expect(
      screen.getByText("Validates, but part of the plan is unwired")
    ).toBeInTheDocument();
  });

  it("reports a failed test run as the thing to fix", async () => {
    const { onAskAgent } = renderChecklist({
      ...CLEAN,
      testRun: { started: false, error: "no worker available" }
    });
    await userEvent.click(screen.getByRole("button", { name: "Ask the agent" }));
    expect(onAskAgent.mock.calls[0][0]).toContain("no worker available");
  });
});

describe("buildFailureMessage", () => {
  it("is null on a clean build, so the checklist shows the next step", () => {
    expect(buildFailureMessage(CLEAN)).toBeNull();
  });

  it("reports validation before unwired steps, because it blocks first", () => {
    const message = buildFailureMessage({
      ...CLEAN,
      validationErrors: ["bad"],
      issues: ["also bad"]
    });
    expect(message).toContain("does not validate");
    expect(message).not.toContain("also bad");
  });
});

describe("workflow categories", () => {
  it("ships the six the PRD names", () => {
    expect(WORKFLOW_CATEGORIES.map((category) => category.id)).toEqual([
      "content-pipeline",
      "media-batch",
      "data-extraction",
      "research-agent",
      "trigger-automation",
      "chat-app"
    ]);
  });

  it("gives every category planner bias terms and a run mode", () => {
    for (const category of WORKFLOW_CATEGORIES) {
      expect(category.plannerTerms.length).toBeGreaterThan(0);
      expect(["manual", "app", "trigger"]).toContain(category.defaultRunMode);
    }
  });

  it("defaults an unknown category to running by hand", () => {
    expect(defaultRunModeFor(undefined)).toBe("manual");
    expect(defaultRunModeFor("nope")).toBe("manual");
    expect(workflowCategory("nope")).toBeUndefined();
  });

  it("opens the trigger category on the trigger run mode", () => {
    expect(defaultRunModeFor("trigger-automation")).toBe("trigger");
  });
});
