import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const mockNodeState = {
  workflow: { id: "wf-1" },
  nodes: [] as Array<{ id: string; type: string }>
};

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: typeof mockNodeState) => unknown) =>
    selector(mockNodeState)
}));

const mockUseWorkflowTriggers = jest.fn();
const mockSetTriggerEnabledMutate = jest.fn();
const mockFireTriggerMutate = jest.fn();

jest.mock("../../../serverState/useTriggers", () => {
  const actual = jest.requireActual("../../../serverState/useTriggers");
  return {
    ...actual,
    useWorkflowTriggers: (...args: unknown[]) =>
      mockUseWorkflowTriggers(...args),
    useSetTriggerEnabled: () => ({
      mutate: mockSetTriggerEnabledMutate,
      isPending: false
    }),
    useFireTrigger: () => ({
      mutate: mockFireTriggerMutate,
      isPending: false
    })
  };
});

import TriggerActivationButton from "../TriggerActivationButton";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockNodeState.nodes = [];
  mockUseWorkflowTriggers.mockReturnValue({ data: [] });
});

describe("TriggerActivationButton", () => {
  it("renders nothing when the graph has no trigger nodes", () => {
    mockNodeState.nodes = [{ id: "n1", type: "nodetool.text.Concat" }];
    const { container } = renderWithTheme(<TriggerActivationButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it("gates the triggers query on the graph having trigger nodes", () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.WebhookTrigger" }
    ];
    renderWithTheme(<TriggerActivationButton />);
    expect(mockUseWorkflowTriggers).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({ enabled: true })
    );
  });

  it("shows an inactive status and a disabled switch before the workflow has ever been saved", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.WebhookTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue({ data: [] });

    renderWithTheme(<TriggerActivationButton />);
    await userEvent.click(screen.getByRole("button", { name: /trigger status/i }));

    const region = await screen.findByRole("region", { name: /trigger status/i });
    expect(within(region).getAllByText("Inactive").length).toBeGreaterThan(0);
    const toggle = within(region).getByRole("switch", {
      name: "Workflow active"
    });
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeDisabled();
  });

  it("arms a cold (never-enabled) registration when the toggle is switched on", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.ManualTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue({
      data: [
        {
          id: "reg-1",
          workflow_id: "wf-1",
          node_id: "n1",
          kind: "manual",
          enabled: false,
          last_fired_at: null,
          last_error: null,
          webhook_token: null,
          webhook_secret: null
        }
      ]
    });

    renderWithTheme(<TriggerActivationButton />);
    await userEvent.click(screen.getByRole("button", { name: /trigger status/i }));

    const region = await screen.findByRole("region", { name: /trigger status/i });
    const toggle = within(region).getByRole("switch", {
      name: "Workflow active"
    });
    // Disabled but discoverable — a registration row exists even though it
    // has never been enabled, so the toggle is interactive.
    expect(toggle).not.toBeChecked();
    expect(toggle).not.toBeDisabled();

    await userEvent.click(toggle);
    expect(mockSetTriggerEnabledMutate).toHaveBeenCalledWith({
      id: "reg-1",
      enabled: true
    });
  });

  it("shows an active status and lets the user deactivate an armed trigger", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.WebhookTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue({
      data: [
        {
          id: "reg-1",
          workflow_id: "wf-1",
          node_id: "n1",
          kind: "webhook",
          enabled: true,
          last_fired_at: "2026-07-20T00:00:00.000Z",
          last_error: null,
          webhook_token: "tok-1",
          webhook_secret: "sec-1"
        }
      ]
    });

    renderWithTheme(<TriggerActivationButton />);
    await userEvent.click(screen.getByRole("button", { name: /trigger status/i }));

    const region = await screen.findByRole("region", { name: /trigger status/i });
    const toggle = within(region).getByRole("switch", {
      name: "Workflow active"
    });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);
    expect(mockSetTriggerEnabledMutate).toHaveBeenCalledWith({
      id: "reg-1",
      enabled: false
    });
  });

  it("fires an armed trigger via the Fire now button", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.ManualTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue({
      data: [
        {
          id: "reg-1",
          workflow_id: "wf-1",
          node_id: "n1",
          kind: "manual",
          enabled: true,
          last_fired_at: null,
          last_error: null,
          webhook_token: null,
          webhook_secret: null
        }
      ]
    });

    renderWithTheme(<TriggerActivationButton />);
    await userEvent.click(screen.getByRole("button", { name: /trigger status/i }));

    const region = await screen.findByRole("region", { name: /trigger status/i });
    await userEvent.click(within(region).getByRole("button", { name: /fire now/i }));
    expect(mockFireTriggerMutate).toHaveBeenCalledWith({
      registrationId: "reg-1"
    });
  });

  it("disables Fire now for a registration that isn't enabled", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.ManualTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue({
      data: [
        {
          id: "reg-1",
          workflow_id: "wf-1",
          node_id: "n1",
          kind: "manual",
          enabled: false,
          last_fired_at: null,
          last_error: null,
          webhook_token: null,
          webhook_secret: null
        }
      ]
    });

    renderWithTheme(<TriggerActivationButton />);
    await userEvent.click(screen.getByRole("button", { name: /trigger status/i }));

    const region = await screen.findByRole("region", { name: /trigger status/i });
    expect(
      within(region).getByRole("button", { name: /fire now/i })
    ).toBeDisabled();
  });

  it("surfaces the last error for a failing trigger", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.IntervalTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue({
      data: [
        {
          id: "reg-1",
          workflow_id: "wf-1",
          node_id: "n1",
          kind: "schedule",
          enabled: true,
          last_fired_at: null,
          last_error: "connection refused",
          webhook_token: null,
          webhook_secret: null
        }
      ]
    });

    renderWithTheme(<TriggerActivationButton />);
    await userEvent.click(screen.getByRole("button", { name: /trigger status/i }));

    expect(await screen.findByText(/connection refused/i)).toBeInTheDocument();
  });

  it("shows the webhook delivery URL, masks the secret, and reveals it on demand", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.WebhookTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue({
      data: [
        {
          id: "reg-1",
          workflow_id: "wf-1",
          node_id: "n1",
          kind: "webhook",
          enabled: true,
          last_fired_at: null,
          last_error: null,
          webhook_token: "tok-1",
          webhook_secret: "sec-1"
        }
      ]
    });

    renderWithTheme(<TriggerActivationButton />);
    await userEvent.click(screen.getByRole("button", { name: /trigger status/i }));

    const region = await screen.findByRole("region", { name: /trigger status/i });
    const urlInput = within(region).getByDisplayValue(
      `${window.location.origin}/api/webhooks/tok-1`
    ) as HTMLInputElement;
    expect(urlInput).toBeInTheDocument();

    const secretInput = within(region).getByDisplayValue(
      "sec-1"
    ) as HTMLInputElement;
    expect(secretInput.type).toBe("password");

    await userEvent.click(
      within(region).getByRole("button", { name: /show webhook secret/i })
    );
    expect(secretInput.type).toBe("text");
  });
});
