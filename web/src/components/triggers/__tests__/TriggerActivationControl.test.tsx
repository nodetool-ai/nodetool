import React from "react";
import { render, screen, waitFor, RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import type { TriggerRegistrationSummary } from "../../../serverState/useTriggers";

// MUI v7 Switch reads theme.vars.palette.Switch.defaultColor; the shared
// themeMock only defines vars.Switch. Backfill the missing slot for LabeledSwitch.
const themeVars = (mockTheme as unknown as {
  vars: { palette: Record<string, unknown> };
}).vars;
themeVars.palette.Switch = themeVars.palette.Switch ?? {
  defaultColor: "#9e9e9e"
};

const renderControl = (): RenderResult =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TriggerActivationControl />
    </ThemeProvider>
  );

// ── Node graph mock ───────────────────────────────────────────────
interface MockNodeState {
  workflow: { id: string } | null;
  nodes: { type?: string }[];
}
let nodeState: MockNodeState = { workflow: { id: "wf-1" }, nodes: [] };

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (selector: (s: MockNodeState) => unknown) => selector(nodeState)
}));

// ── Notification mock ─────────────────────────────────────────────
const addNotification = jest.fn();
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (selector: (s: unknown) => unknown) =>
    selector({ addNotification })
}));

// ── Trigger server-state mock ─────────────────────────────────────
const fireMutate = jest.fn();
const setActiveMutate = jest.fn();
let statusData: TriggerRegistrationSummary[] = [];
let setActivePending = false;

jest.mock("../../../serverState/useTriggers", () => ({
  useTriggerStatus: () => ({ data: statusData }),
  useSetTriggersActive: () => ({
    mutate: setActiveMutate,
    isPending: setActivePending
  }),
  useFireTrigger: () => ({ mutate: fireMutate, isPending: false })
}));

import TriggerActivationControl from "../TriggerActivationControl";

const webhookReg: TriggerRegistrationSummary = {
  id: "reg-1",
  workflow_id: "wf-1",
  node_id: "node-1",
  kind: "webhook",
  enabled: true,
  last_fired_at: null,
  last_error: "boom: bad payload",
  token: "tok-123"
};

const triggerNode = { type: "nodetool.triggers.WebhookTrigger" };

beforeEach(() => {
  jest.clearAllMocks();
  nodeState = { workflow: { id: "wf-1" }, nodes: [] };
  statusData = [];
  setActivePending = false;
});

describe("TriggerActivationControl", () => {
  it("renders nothing when the graph has no trigger nodes", () => {
    nodeState = { workflow: { id: "wf-1" }, nodes: [{ type: "nodetool.text.Concat" }] };
    renderControl();
    expect(
      screen.queryByLabelText("Trigger activation")
    ).not.toBeInTheDocument();
  });

  it("treats the Wait node as a non-trigger", () => {
    nodeState = {
      workflow: { id: "wf-1" },
      nodes: [{ type: "nodetool.triggers.Wait" }]
    };
    renderControl();
    expect(
      screen.queryByLabelText("Trigger activation")
    ).not.toBeInTheDocument();
  });

  it("shows the toggle when the graph has a trigger node", () => {
    nodeState = { workflow: { id: "wf-1" }, nodes: [triggerNode] };
    renderControl();
    expect(screen.getByLabelText("Trigger activation")).toBeInTheDocument();
  });

  it("lists registration kind and error in the status popover", async () => {
    nodeState = { workflow: { id: "wf-1" }, nodes: [triggerNode] };
    statusData = [webhookReg];
    renderControl();

    await userEvent.click(screen.getByLabelText("Trigger activation"));

    expect(await screen.findByText("Webhook")).toBeInTheDocument();
    expect(screen.getByText("boom: bad payload")).toBeInTheDocument();
    expect(
      screen.getByText(`${window.location.origin}/api/webhooks/tok-123`)
    ).toBeInTheDocument();
  });

  it("fires a trigger when Fire now is clicked", async () => {
    nodeState = { workflow: { id: "wf-1" }, nodes: [triggerNode] };
    statusData = [webhookReg];
    renderControl();

    await userEvent.click(screen.getByLabelText("Trigger activation"));
    const fireButton = await screen.findByRole("button", {
      name: /fire webhook trigger now/i
    });
    await userEvent.click(fireButton);

    expect(fireMutate).toHaveBeenCalledWith("reg-1", expect.any(Object));
  });

  it("toggles activation via the switch", async () => {
    nodeState = { workflow: { id: "wf-1" }, nodes: [triggerNode] };
    statusData = [];
    renderControl();

    await userEvent.click(screen.getByLabelText("Trigger activation"));
    const toggle = await screen.findByRole("switch");
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(setActiveMutate).toHaveBeenCalledWith(true, expect.any(Object))
    );
  });
});
