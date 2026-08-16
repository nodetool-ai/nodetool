import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const mockNodeState = {
  workflow: { id: "wf-1" },
  nodes: [] as Array<{ id: string; type: string }>
};

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: <T,>(selector: (state: typeof mockNodeState) => T) =>
    selector(mockNodeState)
}));

const mockUseWorkflowTriggers = jest.fn();
const mockSetTriggerEnabledMutate = jest.fn();
const mockSetTriggerEnabledMutateAsync = jest.fn();
const mockFireTriggerMutate = jest.fn();

jest.mock("../../../serverState/useTriggers", () => {
  const actual = jest.requireActual("../../../serverState/useTriggers");
  return {
    ...actual,
    useWorkflowTriggers: (...args: unknown[]) =>
      mockUseWorkflowTriggers(...args),
    useSetTriggerEnabled: () => ({
      mutate: mockSetTriggerEnabledMutate,
      mutateAsync: mockSetTriggerEnabledMutateAsync,
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

interface RegistrationOverrides {
  id?: string;
  node_id?: string;
  kind?: string;
  enabled?: boolean;
  last_fired_at?: string | null;
  last_error?: string | null;
  webhook_token?: string | null;
  webhook_secret?: string | null;
  next_fire_at?: string | null;
  interval_seconds?: number | null;
  disabled_reason?: string | null;
  consecutive_failures?: number;
}

const registration = (overrides: RegistrationOverrides = {}) => ({
  id: "reg-1",
  workflow_id: "wf-1",
  node_id: "n1",
  kind: "manual",
  enabled: false,
  last_fired_at: null,
  last_error: null,
  webhook_token: null,
  webhook_secret: null,
  ...overrides
});

const withData = (data: unknown[]) => ({
  data,
  isLoading: false,
  isError: false
});

const openPopover = async () => {
  await userEvent.click(screen.getByRole("button", { name: /^triggers:/i }));
  return screen.findByRole("region", { name: /trigger status/i });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNodeState.nodes = [];
  mockSetTriggerEnabledMutateAsync.mockResolvedValue(undefined);
  mockUseWorkflowTriggers.mockReturnValue(withData([]));
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

  describe("loading, error, and empty are told apart", () => {
    beforeEach(() => {
      mockNodeState.nodes = [
        { id: "n1", type: "nodetool.triggers.WebhookTrigger" }
      ];
    });

    it("says it is still checking while the query is in flight", async () => {
      mockUseWorkflowTriggers.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false
      });
      renderWithTheme(<TriggerActivationButton />);
      const region = await openPopover();
      expect(
        within(region).getByText(/checking trigger status/i)
      ).toBeInTheDocument();
      expect(
        within(region).getByRole("switch", { name: "Workflow active" })
      ).toBeDisabled();
      expect(within(region).queryByText(/save the workflow first/i)).toBeNull();
    });

    it("does not blame an unsaved workflow for a failed request", async () => {
      mockUseWorkflowTriggers.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true
      });
      renderWithTheme(<TriggerActivationButton />);
      const region = await openPopover();
      expect(
        within(region).getAllByText(/could not load trigger status/i).length
      ).toBeGreaterThan(0);
      expect(within(region).queryByText(/save the workflow first/i)).toBeNull();
      expect(within(region).getByText("Unavailable")).toBeInTheDocument();
    });

    it("shows an unregistered status and a disabled switch when the workflow has no registrations", async () => {
      mockUseWorkflowTriggers.mockReturnValue(withData([]));
      renderWithTheme(<TriggerActivationButton />);
      const region = await openPopover();
      expect(
        within(region).getByText(/save the workflow first/i)
      ).toBeInTheDocument();
      const toggle = within(region).getByRole("switch", {
        name: "Workflow active"
      });
      expect(toggle).not.toBeChecked();
      expect(toggle).toBeDisabled();
    });
  });

  it("arms a cold (never-enabled) registration when the toggle is switched on", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.ManualTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue(withData([registration()]));

    renderWithTheme(<TriggerActivationButton />);
    const region = await openPopover();
    const toggle = within(region).getByRole("switch", {
      name: "Workflow active"
    });
    expect(toggle).not.toBeChecked();
    expect(toggle).not.toBeDisabled();

    await userEvent.click(toggle);
    await waitFor(() =>
      expect(mockSetTriggerEnabledMutateAsync).toHaveBeenCalledWith({
        id: "reg-1",
        enabled: true
      })
    );
  });

  it("shows an active status and lets the user deactivate an armed trigger", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.WebhookTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue(
      withData([
        registration({
          kind: "webhook",
          enabled: true,
          last_fired_at: "2026-07-20T00:00:00.000Z",
          webhook_token: "tok-1",
          webhook_secret: "sec-1"
        })
      ])
    );

    renderWithTheme(<TriggerActivationButton />);
    const region = await openPopover();
    const toggle = within(region).getByRole("switch", {
      name: "Workflow active"
    });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);
    await waitFor(() =>
      expect(mockSetTriggerEnabledMutateAsync).toHaveBeenCalledWith({
        id: "reg-1",
        enabled: false
      })
    );
  });

  describe("aggregate state across several registrations", () => {
    beforeEach(() => {
      mockNodeState.nodes = [
        { id: "n1", type: "nodetool.triggers.WebhookTrigger" },
        { id: "n2", type: "nodetool.triggers.IntervalTrigger" }
      ];
      mockUseWorkflowTriggers.mockReturnValue(
        withData([
          registration({
            id: "reg-1",
            node_id: "n1",
            kind: "webhook",
            enabled: true
          }),
          registration({
            id: "reg-2",
            node_id: "n2",
            kind: "schedule",
            enabled: false
          })
        ])
      );
    });

    it("does not claim 'Active' when only some registrations are armed", async () => {
      renderWithTheme(<TriggerActivationButton />);
      const region = await openPopover();
      expect(within(region).getByText("Partly active")).toBeInTheDocument();
      expect(
        within(region).getByRole("switch", { name: "Workflow active" })
      ).not.toBeChecked();
    });

    it("puts the mixed state in the toolbar button's accessible name", () => {
      renderWithTheme(<TriggerActivationButton />);
      expect(
        screen.getByRole("button", { name: "Triggers: partly active" })
      ).toBeInTheDocument();
    });

    it("arms only the registrations that are still off", async () => {
      renderWithTheme(<TriggerActivationButton />);
      const region = await openPopover();
      await userEvent.click(
        within(region).getByRole("switch", { name: "Workflow active" })
      );
      await waitFor(() =>
        expect(mockSetTriggerEnabledMutateAsync).toHaveBeenCalledTimes(1)
      );
      expect(mockSetTriggerEnabledMutateAsync).toHaveBeenCalledWith({
        id: "reg-2",
        enabled: true
      });
    });

    it("toggles one registration without touching the other", async () => {
      renderWithTheme(<TriggerActivationButton />);
      const region = await openPopover();
      const scheduleRow = within(region).getByRole("group", {
        name: "Schedule trigger n2"
      });
      await userEvent.click(
        within(scheduleRow).getByRole("switch", { name: "Enabled" })
      );
      expect(mockSetTriggerEnabledMutate).toHaveBeenCalledTimes(1);
      expect(mockSetTriggerEnabledMutate).toHaveBeenCalledWith({
        id: "reg-2",
        enabled: true
      });
    });
  });

  it("names the toolbar button after the armed state", () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.ManualTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue(
      withData([registration({ enabled: true })])
    );
    renderWithTheme(<TriggerActivationButton />);
    expect(
      screen.getByRole("button", { name: "Triggers: active" })
    ).toBeInTheDocument();
  });

  it("fires an armed trigger via the Fire now button", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.ManualTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue(
      withData([registration({ enabled: true })])
    );

    renderWithTheme(<TriggerActivationButton />);
    const region = await openPopover();
    await userEvent.click(
      within(region).getByRole("button", { name: /fire now/i })
    );
    expect(mockFireTriggerMutate).toHaveBeenCalledWith({
      registrationId: "reg-1"
    });
  });

  it("disables Fire now and the row switch when there is no registration yet", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.ManualTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue(withData([]));

    renderWithTheme(<TriggerActivationButton />);
    const region = await openPopover();
    expect(
      within(region).getByRole("button", { name: /fire now/i })
    ).toBeDisabled();
    expect(
      within(region).getByRole("switch", { name: "Enabled" })
    ).toBeDisabled();
  });

  it("surfaces the last error for a failing trigger", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.IntervalTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue(
      withData([
        registration({
          kind: "schedule",
          enabled: true,
          last_error: "connection refused"
        })
      ])
    );

    renderWithTheme(<TriggerActivationButton />);
    // Checked before opening: the popover is a modal, so it hides the rest of
    // the tree from the accessibility API.
    expect(
      screen.getByRole("button", { name: "Triggers: active, last run failed" })
    ).toBeInTheDocument();
    const region = await openPopover();
    expect(within(region).getByText(/connection refused/i)).toBeInTheDocument();
  });

  it("explains a trigger the dispatcher gave up on", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.IntervalTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue(
      withData([
        registration({
          kind: "schedule",
          enabled: false,
          disabled_reason: "failures",
          consecutive_failures: 5,
          last_error: "connection refused"
        })
      ])
    );

    renderWithTheme(<TriggerActivationButton />);
    // An auto-disabled trigger reads as plain "Inactive" without this — the
    // same state as one the user switched off.
    expect(
      screen.getByRole("button", {
        name: "Triggers: inactive, disabled automatically"
      })
    ).toBeInTheDocument();

    const region = await openPopover();
    expect(
      within(region).getByText(/disabled after 5 consecutive failures/i)
    ).toBeInTheDocument();
    expect(within(region).getByText("Stopped")).toBeInTheDocument();
  });

  it("does not explain a stop the user made themselves", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.IntervalTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue(
      withData([
        registration({ kind: "schedule", enabled: false, disabled_reason: null })
      ])
    );

    renderWithTheme(<TriggerActivationButton />);
    const region = await openPopover();
    const row = within(region).getByRole("group", {
      name: "Schedule trigger n1"
    });
    expect(within(row).getByText("Inactive")).toBeInTheDocument();
    expect(within(row).queryByText(/disabled after/i)).toBeNull();
  });

  describe("schedule cadence", () => {
    beforeEach(() => {
      mockNodeState.nodes = [
        { id: "n1", type: "nodetool.triggers.IntervalTrigger" }
      ];
      jest.useFakeTimers().setSystemTime(Date.parse("2026-07-26T12:00:00.000Z"));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("shows the interval and the countdown to the next fire", async () => {
      mockUseWorkflowTriggers.mockReturnValue(
        withData([
          registration({
            kind: "schedule",
            enabled: true,
            interval_seconds: 300,
            next_fire_at: "2026-07-26T12:04:00.000Z"
          })
        ])
      );
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderWithTheme(<TriggerActivationButton />);
      await user.click(screen.getByRole("button", { name: /^triggers:/i }));
      const region = await screen.findByRole("region", {
        name: /trigger status/i
      });
      expect(
        within(region).getByText("Runs every 5m — next in 4m")
      ).toBeInTheDocument();
    });

    it("shows nothing rather than 'Invalid Date' when the server omits the fields", async () => {
      mockUseWorkflowTriggers.mockReturnValue(
        withData([registration({ kind: "schedule", enabled: true })])
      );
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderWithTheme(<TriggerActivationButton />);
      await user.click(screen.getByRole("button", { name: /^triggers:/i }));
      const region = await screen.findByRole("region", {
        name: /trigger status/i
      });
      expect(within(region).queryByText(/runs every/i)).toBeNull();
      expect(within(region).queryByText(/invalid date/i)).toBeNull();
      expect(within(region).getByText("Last fired: Never")).toBeInTheDocument();
    });
  });

  it("shows the webhook delivery URL, masks the secret, and reveals it on demand", async () => {
    mockNodeState.nodes = [
      { id: "n1", type: "nodetool.triggers.WebhookTrigger" }
    ];
    mockUseWorkflowTriggers.mockReturnValue(
      withData([
        registration({
          kind: "webhook",
          enabled: true,
          webhook_token: "tok-1",
          webhook_secret: "sec-1"
        })
      ])
    );

    renderWithTheme(<TriggerActivationButton />);
    const region = await openPopover();
    expect(
      within(region).getByDisplayValue(/\/api\/webhooks\/tok-1$/)
    ).toBeInTheDocument();

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
