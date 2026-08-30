import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("names the catalog snapshot the prices came from", async () => {
    mockHook.mockReturnValue(estimate as never);
    renderPanel();

    await userEvent.hover(screen.getByText(/List prices from provider/));
    const snapshot = genspendPricingCatalog.catalogGeneratedAt?.slice(0, 10);
    await waitFor(() => {
      expect(
        screen.getByRole("tooltip").textContent
      ).toMatch(snapshot ? new RegExp(snapshot) : /nightly sync/);
    });
  });

  it("reads fan-out, clip length and rung as one units phrase from the structured fields", () => {
    mockHook.mockReturnValue({
      ...estimate,
      items: [
        {
          ...estimate.items[0],
          quantity: 2,
          seconds: 5,
          resolution: "720p",
          breakdown: "5 s × $0.205/s at 720p"
        }
      ]
    } as never);
    renderPanel();

    expect(screen.getByText("2 × 5 s @ 720p")).toBeInTheDocument();
  });

  it("counts a fan-out in the unit the model bills in", () => {
    mockHook.mockReturnValue({
      ...estimate,
      items: [{ ...estimate.items[0], quantity: 4, billing_unit: "image" }]
    } as never);
    renderPanel();

    expect(screen.getByText("4 images")).toBeInTheDocument();
  });

  it("labels a cost that leaves out a known charge as a lower bound", () => {
    mockHook.mockReturnValue({
      ...estimate,
      items: [
        {
          ...estimate.items[0],
          warnings: ["reference images are not priced for this model"]
        }
      ]
    } as never);
    renderPanel();

    // Both the row and the total say "at least", never a false exact.
    expect(screen.getAllByText(/≥/)).toHaveLength(2);
  });

  it("labels a cost priced off an assumption as approximate, not a lower bound", () => {
    mockHook.mockReturnValue({
      ...estimate,
      items: [
        {
          ...estimate.items[0],
          warnings: undefined,
          assumptions: ["duration not set on the node — priced at 1 s"]
        }
      ]
    } as never);
    renderPanel();

    // An assumed default is not a floor — the real run can cost less (a
    // per-minute model on a 5-second job) — so the row and the total read
    // "about", never "at least".
    expect(screen.getAllByText(/~/)).toHaveLength(2);
    expect(screen.queryByText(/≥/)).toBeNull();
  });

  it("shows an honest total instead of $0.00 when every node is unpriced", () => {
    mockHook.mockReturnValue({
      currency: "USD",
      total: 0,
      unknown_count: 1,
      items: [
        {
          node_id: "1",
          node_type: "nodetool.video.TextToVideo",
          provider: "atlascloud",
          model: "some/video",
          quantity: 1,
          estimated_cost: 0,
          confidence: "unknown" as const
        }
      ]
    } as never);
    renderPanel();

    const totalRow = screen.getByText("Total (USD)").closest(".cost-total");
    expect(totalRow).not.toBeNull();
    expect(within(totalRow as HTMLElement).getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("$0")).toBeNull();
  });

  it("says why a declined price could not be quoted", async () => {
    mockHook.mockReturnValue({
      ...estimate,
      total: 0,
      unknown_count: 1,
      items: [
        {
          node_id: "1",
          node_type: "nodetool.video.TextToVideo",
          provider: "atlascloud",
          model: "some/video",
          quantity: 1,
          estimated_cost: 0,
          confidence: "unknown",
          assumptions: ["no published price at 1080p"]
        }
      ]
    } as never);
    renderPanel();

    await userEvent.hover(screen.getByLabelText("Price unknown"));
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "no published price at 1080p"
      );
    });
  });

  it("shows what the estimate filled in as a sub-line under the row", () => {
    mockHook.mockReturnValue({
      ...estimate,
      items: [
        {
          ...estimate.items[0],
          assumptions: ["resolution not set on the node — priced at 720p"]
        }
      ]
    } as never);
    renderPanel();

    expect(
      screen.getByText("resolution not set on the node — priced at 720p")
    ).toBeInTheDocument();
  });
});
