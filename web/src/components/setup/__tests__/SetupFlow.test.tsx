import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { useBugReportStore } from "../../../stores/BugReportStore";
import { SetupFlow } from "../SetupFlow";
import type { SetupFlowConfig, SetupStep } from "../types";

type Stage = "idea" | "genre" | "review" | "look";

const step = (overrides: Partial<SetupStep<Stage>> & { stage: Stage }) =>
  ({
    label: "Idea",
    primaryLabel: "Continue",
    render: () => <div>{`${overrides.stage} body`}</div>,
    ...overrides
  }) as SetupStep<Stage>;

// Two stages share the "Story" label: a flow's step 2 is a picker followed by
// the plan it produces, and the creator sees one stepper entry for both.
const steps: SetupStep<Stage>[] = [
  step({ stage: "idea", label: "Idea", primaryLabel: "Continue" }),
  step({
    stage: "genre",
    label: "Story",
    primaryLabel: "Review your screenplay"
  }),
  step({
    stage: "review",
    label: "Story",
    primaryLabel: "Continue to storyboard"
  }),
  step({
    stage: "look",
    label: "Storyboard",
    primaryLabel: "Generate your storyboard"
  })
];

const flow = (
  config: SetupFlowConfig<Stage>,
  onChangeFlow?: () => void | Promise<void>
) => (
  <ThemeProvider theme={mockTheme}>
    <SetupFlow<Stage> config={config} onChangeFlow={onChangeFlow} />
  </ThemeProvider>
);

const renderFlow = (
  config: Partial<SetupFlowConfig<Stage>> = {},
  onChangeFlow?: () => void | Promise<void>
) => {
  const onStageChange = jest.fn();
  const result = render(
    flow(
      {
        labels: { title: "Storyboard", subline: "We'll turn it in." },
        steps,
        stage: "idea",
        onStageChange,
        ...config
      },
      onChangeFlow
    )
  );
  return { ...result, onStageChange };
};

describe("SetupFlow", () => {
  it("advances on Cmd+Enter from inside the step body", async () => {
    const user = userEvent.setup();
    const onAdvance = jest.fn();
    const { onStageChange } = renderFlow({
      stage: "genre",
      steps: steps.map((entry) =>
        entry.stage === "genre"
          ? {
              ...entry,
              onAdvance,
              render: () => <input aria-label="Genre" />
            }
          : entry
      )
    });

    await user.click(screen.getByRole("textbox", { name: "Genre" }));
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    await waitFor(() => expect(onAdvance).toHaveBeenCalledTimes(1));
    expect(onStageChange).toHaveBeenCalledWith("review");
  });

  it("ignores Cmd+Enter while the step blocks the primary action", async () => {
    const user = userEvent.setup();
    const onAdvance = jest.fn();
    const { onStageChange } = renderFlow({
      stage: "genre",
      steps: steps.map((entry) =>
        entry.stage === "genre"
          ? {
              ...entry,
              onAdvance,
              canAdvance: false,
              blockedReason: "Pick a genre",
              render: () => <input aria-label="Genre" />
            }
          : entry
      )
    });

    await user.click(screen.getByRole("textbox", { name: "Genre" }));
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onAdvance).not.toHaveBeenCalled();
    expect(onStageChange).not.toHaveBeenCalled();
  });

  it("describes the disabled primary button with the reason it is off", () => {
    renderFlow({
      stage: "genre",
      steps: steps.map((entry) =>
        entry.stage === "genre"
          ? { ...entry, canAdvance: false, blockedReason: "Pick a genre" }
          : entry
      )
    });

    expect(
      screen.getByRole("button", { name: "Review your screenplay" })
    ).toHaveAccessibleDescription("Pick a genre");
  });

  it("takes its stepper labels from the config, one entry per label", () => {
    renderFlow();

    const stepper = screen.getByRole("navigation", { name: "Setup steps" });
    expect(stepper).toHaveTextContent("1. Idea");
    expect(stepper).toHaveTextContent("2. Story");
    expect(stepper).toHaveTextContent("3. Storyboard");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("disables Back on step 1 and enables it after", () => {
    const { rerender, onStageChange } = renderFlow();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <SetupFlow<Stage>
          config={{
            labels: { title: "What's your story?" },
            steps,
            stage: "genre",
            onStageChange
          }}
        />
      </ThemeProvider>
    );
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
  });

  it("labels the primary button with the current step's label", () => {
    const { rerender, onStageChange } = renderFlow();
    expect(
      screen.getByRole("button", { name: "Continue" })
    ).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <SetupFlow<Stage>
          config={{
            labels: { title: "What's your story?" },
            steps,
            stage: "look",
            onStageChange
          }}
        />
      </ThemeProvider>
    );
    expect(
      screen.getByRole("button", { name: "Generate your storyboard" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("renders the current step's body and moves to the next stage", async () => {
    const user = userEvent.setup();
    const { onStageChange } = renderFlow({ stage: "genre" });

    expect(screen.getByText("genre body")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Review your screenplay" })
    );
    expect(onStageChange).toHaveBeenCalledWith("review");
  });

  it("keeps the stage and shows a reportable failure screen when the action fails", async () => {
    const user = userEvent.setup();
    const failingAction = jest
      .fn()
      .mockRejectedValue(new Error("Director unavailable"));
    const failing = steps.map((entry) =>
      entry.stage === "genre"
        ? {
            ...entry,
            onAdvance: failingAction
          }
        : entry
    );
    const { onStageChange } = renderFlow({ stage: "genre", steps: failing });

    await user.click(
      screen.getByRole("button", { name: "Review your screenplay" })
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Director unavailable"
      )
    );
    expect(
      screen.getByRole("heading", {
        name: "We couldn't complete this step"
      })
    ).toBeInTheDocument();
    expect(screen.queryByText("genre body")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: "Report this failure" })
    );
    expect(useBugReportStore.getState().context).toMatchObject({
      source: "manual",
      summary: "Storyboard setup failed at Story",
      errorText: "Director unavailable"
    });
    expect(onStageChange).not.toHaveBeenCalled();
  });

  // A merged entry is one dot for a picker and the plan review it produces
  // (PRD § 6.2). The dot does not multiply when the plan arrives, so the entry
  // says which half the creator is on instead.
  it("names the review substep on the current entry", () => {
    renderFlow({ stage: "review" });

    const stepper = screen.getByRole("navigation", { name: "Setup steps" });
    expect(stepper).toHaveTextContent("2. Story · Review");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("names only the entry label on the picker half", () => {
    renderFlow({ stage: "genre" });

    const stepper = screen.getByRole("navigation", { name: "Setup steps" });
    expect(stepper).toHaveTextContent("2. Story");
    expect(stepper).not.toHaveTextContent("· Review");
  });

  // A merged entry stands for a picker and the plan review it produced. The
  // review is the stage the creator left, so the entry returns them to it —
  // returning to the picker would leave the plan they came back for behind.
  it("rewinds a merged entry to its review, not to its picker", async () => {
    const user = userEvent.setup();
    const { onStageChange } = renderFlow({ stage: "look" });

    await user.click(screen.getByRole("button", { name: "2. Story" }));
    expect(onStageChange).toHaveBeenCalledWith("review");
  });

  it("rewinds a single-stage entry to that stage", async () => {
    const user = userEvent.setup();
    const { onStageChange } = renderFlow({ stage: "look" });

    await user.click(screen.getByRole("button", { name: "1. Idea" }));
    expect(onStageChange).toHaveBeenCalledWith("idea");
  });

  // A model call can outlive the stage that asked for it. The creator has
  // moved on, so its answer must not move them again.
  it("ignores an action that resolves after the stage has changed", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    const running = new Promise<void>((resolve) => {
      finish = () => resolve();
    });
    const slow = steps.map((entry) =>
      entry.stage === "genre" ? { ...entry, onAdvance: () => running } : entry
    );
    const onStageChange = jest.fn();
    const labels = { title: "What's your story?" };
    const { rerender } = render(
      flow({ labels, steps: slow, stage: "genre", onStageChange })
    );

    await user.click(
      screen.getByRole("button", { name: "Review your screenplay" })
    );
    // The document moves elsewhere — an agent tool, a second host — while the
    // Director is still working.
    rerender(flow({ labels, steps: slow, stage: "idea", onStageChange }));
    finish();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled()
    );
    expect(onStageChange).not.toHaveBeenCalled();
    expect(screen.getByText("idea body")).toBeInTheDocument();
  });

  it("drops the message of an action that failed for a stage left behind", async () => {
    const user = userEvent.setup();
    let fail: () => void = () => undefined;
    const running = new Promise<void>((_resolve, reject) => {
      fail = () => reject(new Error("Director unavailable"));
    });
    const slow = steps.map((entry) =>
      entry.stage === "genre" ? { ...entry, onAdvance: () => running } : entry
    );
    const onStageChange = jest.fn();
    const labels = { title: "What's your story?" };
    const { rerender } = render(
      flow({ labels, steps: slow, stage: "genre", onStageChange })
    );

    await user.click(
      screen.getByRole("button", { name: "Review your screenplay" })
    );
    rerender(flow({ labels, steps: slow, stage: "idea", onStageChange }));
    fail();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled()
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Navigation while a replacement is unresolved is what lets a late answer
  // land on the wrong screen, so the shell closes both routes out of the step.
  it("disables Back and the stepper links while the step is pending", () => {
    const waiting = steps.map((entry) =>
      entry.stage === "review"
        ? { ...entry, pending: true, pendingLabel: "Re-planning the beats" }
        : entry
    );
    renderFlow({ stage: "review", steps: waiting });

    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1. Idea" })).toBeDisabled();
  });

  it("disables the primary button while the step cannot advance", () => {
    const blocked = steps.map((entry) =>
      entry.stage === "idea" ? { ...entry, canAdvance: false } : entry
    );
    renderFlow({ steps: blocked });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  // A wait on a model is the longest thing this shell does. It says what is
  // running rather than only dimming the button, and it replaces the cost
  // detail: during the wait, what is happening beats what it will cost.
  it("shows the wait, with its label, in place of the detail", () => {
    const waiting = steps.map((entry) =>
      entry.stage === "idea"
        ? {
            ...entry,
            pending: true,
            pendingLabel: "Writing 6 shots",
            primaryDetail: "6 stills · about $0.02"
          }
        : entry
    );
    renderFlow({ steps: waiting });

    expect(screen.getByRole("status")).toHaveTextContent("Writing 6 shots");
    expect(screen.getByTestId("thinking-mark")).toBeInTheDocument();
    expect(
      screen.queryByText("6 stills · about $0.02")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("names the wait generically when a step gives no label", () => {
    const waiting = steps.map((entry) =>
      entry.stage === "idea" ? { ...entry, pending: true } : entry
    );
    renderFlow({ steps: waiting });

    expect(screen.getByRole("status")).toHaveTextContent("Working");
  });

  // Entering a step is new content: it starts at its own top, and the keyboard
  // lands on its heading rather than on the footer button that left the last
  // step.
  it("focuses the new step's heading on a stage change", () => {
    const withHeading = steps.map((entry) =>
      entry.stage === "review"
        ? { ...entry, render: () => <h2>Review your screenplay</h2> }
        : entry
    );
    const onStageChange = jest.fn();
    const labels = { title: "What's your story?" };
    const { rerender } = render(
      flow({ labels, steps: withHeading, stage: "genre", onStageChange })
    );

    rerender(
      flow({ labels, steps: withHeading, stage: "review", onStageChange })
    );

    expect(
      screen.getByRole("heading", { name: "Review your screenplay" })
    ).toHaveFocus();
  });

  // The first step's own field takes focus, so the shell leaves it alone.
  it("leaves focus alone on the step it opens on", () => {
    const withHeading = steps.map((entry) =>
      entry.stage === "idea"
        ? { ...entry, render: () => <h2>Describe your idea</h2> }
        : entry
    );
    renderFlow({ steps: withHeading });

    expect(
      screen.getByRole("heading", { name: "Describe your idea" })
    ).not.toHaveFocus();
  });

  // Picking the wrong entry card must not mean leaving the guided surface.
  // The way back stands where `Back` is dead, and only when a host can act on
  // it — an enabled control that does nothing is the defect it would replace.
  it("offers Change flow on the first step when a host can perform it", () => {
    renderFlow({}, jest.fn());
    expect(
      screen.getByRole("button", { name: "Change flow" })
    ).toBeInTheDocument();
  });

  it("offers no Change flow without a handler", () => {
    renderFlow();
    expect(screen.queryByRole("button", { name: "Change flow" })).toBeNull();
  });

  it("offers no Change flow once Back has somewhere to go", () => {
    renderFlow({ stage: "genre" }, jest.fn());
    expect(screen.queryByRole("button", { name: "Change flow" })).toBeNull();
  });

  it("asks what happens to the draft before it changes flow", async () => {
    const user = userEvent.setup();
    const onChangeFlow = jest.fn();
    renderFlow({}, onChangeFlow);

    await user.click(screen.getByRole("button", { name: "Change flow" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "comes with you to the flow you pick next"
    );
    expect(dialog).toHaveTextContent("storyboard draft is discarded");
    expect(onChangeFlow).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Discard and choose" })
    );
    expect(onChangeFlow).toHaveBeenCalledTimes(1);
  });

  it("keeps the draft when the question is declined", async () => {
    const user = userEvent.setup();
    const onChangeFlow = jest.fn();
    renderFlow({}, onChangeFlow);

    await user.click(screen.getByRole("button", { name: "Change flow" }));
    await user.click(screen.getByRole("button", { name: "Keep this draft" }));

    expect(onChangeFlow).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("renders nothing for a stage outside the flow", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <SetupFlow<Stage>
          config={{
            labels: { title: "What's your story?" },
            steps,
            stage: "done" as Stage,
            onStageChange: jest.fn()
          }}
        />
      </ThemeProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
