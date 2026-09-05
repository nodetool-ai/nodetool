import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
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

const renderFlow = (config: Partial<SetupFlowConfig<Stage>> = {}) => {
  const onStageChange = jest.fn();
  const result = render(
    <ThemeProvider theme={mockTheme}>
      <SetupFlow<Stage>
        config={{
          labels: { title: "What's your story?", subline: "We'll turn it in." },
          steps,
          stage: "idea",
          onStageChange,
          ...config
        }}
      />
    </ThemeProvider>
  );
  return { ...result, onStageChange };
};

describe("SetupFlow", () => {
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

  it("keeps the stage and shows the message when the step's action fails", async () => {
    const user = userEvent.setup();
    const failing = steps.map((entry) =>
      entry.stage === "genre"
        ? {
            ...entry,
            onAdvance: () => Promise.reject(new Error("Director unavailable"))
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
    expect(onStageChange).not.toHaveBeenCalled();
  });

  it("rewinds to a completed step from the stepper", async () => {
    const user = userEvent.setup();
    const { onStageChange } = renderFlow({ stage: "look" });

    await user.click(screen.getByRole("button", { name: "2. Story" }));
    expect(onStageChange).toHaveBeenCalledWith("genre");
  });

  it("disables the primary button while the step cannot advance", () => {
    const blocked = steps.map((entry) =>
      entry.stage === "idea" ? { ...entry, canAdvance: false } : entry
    );
    renderFlow({ steps: blocked });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
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
