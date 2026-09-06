/**
 * The plan step's two choices: the category, and the model that writes the
 * plan. The picker is the way past a provider whose first model refuses — the
 * default is whichever model the provider list returns first, which can be out
 * of quota or retired.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { WorkflowCategoryStep } from "../CategoryStep";

// The category cards carry stills, and the real resolver needs a QueryClient.
jest.mock("../../../../hooks/useResolvedMediaUri");

// The picker's dialog, reduced to one selectable model.
jest.mock("../../../model_menu/LanguageModelMenuDialog", () => ({
  __esModule: true,
  default: ({
    open,
    onModelChange
  }: {
    open: boolean;
    onModelChange?: (model: unknown) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onModelChange?.({
            id: "gemini-3.6-flash",
            provider: "gemini",
            name: "Gemini 3.6 Flash"
          })
        }
      >
        pick gemini
      </button>
    ) : null
}));

jest.mock("../../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useLanguageModelsByProvider: () => ({ models: [], isLoading: false })
}));

const renderStep = (
  props: Partial<React.ComponentProps<typeof WorkflowCategoryStep>> = {}
) => {
  const onPlannerModelChange = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <WorkflowCategoryStep
        selectedId={null}
        onSelect={jest.fn()}
        plannerModel={{ provider: "openai", id: "gpt-4o-mini" }}
        onPlannerModelChange={onPlannerModelChange}
        {...props}
      />
    </ThemeProvider>
  );
  return { onPlannerModelChange };
};

describe("WorkflowCategoryStep", () => {
  it("names the model the plan will be written with", () => {
    renderStep();
    expect(screen.getByText("Plan with")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /gpt-4o-mini/ })
    ).toBeInTheDocument();
  });

  it("reports the model the creator picks", async () => {
    const user = userEvent.setup();
    const { onPlannerModelChange } = renderStep();

    await user.click(screen.getByRole("button", { name: /gpt-4o-mini/ }));
    await user.click(screen.getByRole("button", { name: "pick gemini" }));

    expect(onPlannerModelChange).toHaveBeenCalledWith({
      provider: "gemini",
      id: "gemini-3.6-flash"
    });
  });

  it("prompts for one when no provider offers a model", () => {
    renderStep({ plannerModel: null });
    expect(
      screen.getByRole("button", { name: /select planner model/i })
    ).toBeInTheDocument();
  });
});
