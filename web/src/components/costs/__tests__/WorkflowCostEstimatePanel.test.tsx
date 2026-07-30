import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../hooks/useWorkflowCostEstimate", () => ({
  useWorkflowCostEstimate: jest.fn()
}));

import WorkflowCostEstimatePanel from "../WorkflowCostEstimatePanel";
import { useWorkflowCostEstimate } from "../../../hooks/useWorkflowCostEstimate";
import { genspendPricingCatalog } from "@nodetool-ai/model-pricing/genspend-catalog";

const mockHook = useWorkflowCostEstimate as jest.MockedFunction<
  typeof useWorkflowCostEstimate
>;

const estimate = {
  currency: "USD",
  total: 0.12,
  unknown_count: 0,
  items: [
    {
      node_id: "1",
      node_type: "nodetool.image.TextToImage",
      provider: "fal_ai",
      model: "fal-ai/flux/schnell",
      quantity: 4,
      estimated_cost: 0.12,
      confidence: "estimate" as const
    }
  ]
};

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <WorkflowCostEstimatePanel workflowId="wf_1" />
    </ThemeProvider>
  );

describe("WorkflowCostEstimatePanel", () => {
  it("credits the price sources with the date the prices last moved", () => {
    mockHook.mockReturnValue(estimate as never);
    renderPanel();

    const credit = screen.getByRole("link", { name: /genspend\.io/i });
    expect(credit).toHaveAttribute("href", "https://genspend.io");
    expect(
      screen.getByText(
        new RegExp(`last updated ${genspendPricingCatalog.updatedAt.slice(0, 10)}`)
      )
    ).toBeInTheDocument();
  });

  it("shows no credit before a workflow has priceable nodes", () => {
    mockHook.mockReturnValue({ ...estimate, items: [] } as never);
    renderPanel();

    expect(screen.queryByRole("link", { name: /genspend\.io/i })).toBeNull();
    expect(
      screen.getByText(/Add a node that uses an AI model/)
    ).toBeInTheDocument();
  });
});
