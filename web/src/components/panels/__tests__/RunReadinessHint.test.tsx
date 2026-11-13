import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const mockReadiness = jest.fn();
jest.mock("../../../hooks/useWorkflowRunReadiness", () => ({
  useWorkflowRunReadiness: () => mockReadiness()
}));

const mockOpenSettingsTab = jest.fn();
jest.mock("../../workspace/openPageTab", () => ({
  openSettingsTab: (...args: unknown[]) => mockOpenSettingsTab(...args)
}));

import RunReadinessHint from "../RunReadinessHint";

const estimate = (total: number, unknown_count = 0) => ({
  total,
  unknown_count,
  items: []
});

const renderHint = (compact = false) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <RunReadinessHint workflowId="wf-1" compact={compact} />
    </ThemeProvider>
  );

describe("RunReadinessHint", () => {
  it("asks for a missing key before the run, and opens provider settings", async () => {
    mockReadiness.mockReturnValue({
      missingSettings: ["FAL_API_KEY"],
      costEstimate: estimate(0.4)
    });
    renderHint();

    expect(screen.queryByText(/per run/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add API key" }));
    expect(mockOpenSettingsTab).toHaveBeenCalledWith("providers");
  });

  it("shows the estimated cost of a run when every key is set", () => {
    mockReadiness.mockReturnValue({
      missingSettings: [],
      costEstimate: estimate(0.4)
    });
    renderHint();
    expect(screen.getByText(/per run/)).toBeInTheDocument();
  });

  it("shows nothing for a graph with no priced nodes, or on a phone", () => {
    mockReadiness.mockReturnValue({ missingSettings: [], costEstimate: estimate(0) });
    const { container } = renderHint();
    expect(container).toBeEmptyDOMElement();

    mockReadiness.mockReturnValue({ missingSettings: [], costEstimate: estimate(0.4) });
    const phone = renderHint(true);
    expect(phone.container).toBeEmptyDOMElement();
  });
});
