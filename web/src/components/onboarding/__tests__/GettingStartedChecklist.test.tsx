import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import GettingStartedChecklist from "../GettingStartedChecklist";
import useOnboardingStore from "../../../stores/OnboardingStore";

const renderChecklist = (
  props: Partial<React.ComponentProps<typeof GettingStartedChecklist>> = {}
) => {
  const handlers = {
    onConnectProvider: jest.fn(),
    onOpenTemplates: jest.fn(),
    onCreateWorkflow: jest.fn()
  };
  render(
    <ThemeProvider theme={mockTheme}>
      <GettingStartedChecklist
        hasConfiguredProvider={false}
        {...handlers}
        {...props}
      />
    </ThemeProvider>
  );
  return handlers;
};

describe("GettingStartedChecklist", () => {
  beforeEach(() => {
    useOnboardingStore.setState({ completedSteps: [], dismissed: false });
  });

  it("renders all four steps with progress", () => {
    renderChecklist();
    expect(screen.getByText(/getting started · 0\/4/i)).toBeInTheDocument();
    expect(screen.getByText("Connect an AI provider")).toBeInTheDocument();
    expect(screen.getByText("Open a starter or template")).toBeInTheDocument();
    expect(screen.getByText("Run a workflow")).toBeInTheDocument();
    expect(screen.getByText("Build your own")).toBeInTheDocument();
  });

  it("counts the provider step from live secrets state", () => {
    renderChecklist({ hasConfiguredProvider: true });
    expect(screen.getByText(/getting started · 1\/4/i)).toBeInTheDocument();
  });

  it("counts steps marked in the onboarding store", () => {
    useOnboardingStore.getState().markStep("open-template");
    useOnboardingStore.getState().markStep("run-workflow");
    renderChecklist();
    expect(screen.getByText(/getting started · 2\/4/i)).toBeInTheDocument();
  });

  it("invokes the matching action when an incomplete step is clicked", async () => {
    const user = userEvent.setup();
    const handlers = renderChecklist();
    await user.click(screen.getByText("Connect an AI provider"));
    expect(handlers.onConnectProvider).toHaveBeenCalledTimes(1);
    await user.click(screen.getByText("Build your own"));
    expect(handlers.onCreateWorkflow).toHaveBeenCalledTimes(1);
  });

  it("hides after dismissal", async () => {
    const user = userEvent.setup();
    renderChecklist();
    await user.click(
      screen.getByRole("button", { name: /dismiss getting started/i })
    );
    expect(useOnboardingStore.getState().dismissed).toBe(true);
    expect(screen.queryByText(/getting started/i)).not.toBeInTheDocument();
  });

  it("renders nothing when every step is complete", () => {
    useOnboardingStore.setState({
      completedSteps: ["open-template", "run-workflow", "create-workflow"],
      dismissed: false
    });
    renderChecklist({ hasConfiguredProvider: true });
    expect(screen.queryByText(/getting started/i)).not.toBeInTheDocument();
  });
});
