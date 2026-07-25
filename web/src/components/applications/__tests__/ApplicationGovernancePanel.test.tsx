import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const publishMutate = jest.fn();
const releaseMutate = jest.fn();
const setBudgetMutate = jest.fn();

const versionOne = {
  id: "ver-1",
  applicationId: "app-1",
  version: 1,
  document: { schemaVersion: 1, ui: { root: {}, content: [] } },
  capabilities: {
    workflows: [{ workflowId: "wf-1" }],
    resources: [{ kind: "asset", operations: ["read", "create"] }]
  },
  released: false,
  createdAt: "2026-07-01T10:00:00.000Z"
};

const versionTwo = {
  ...versionOne,
  id: "ver-2",
  version: 2,
  released: true,
  createdAt: "2026-07-10T10:00:00.000Z"
};

const state = {
  versions: [versionOne, versionTwo],
  released: versionTwo,
  budget: {
    applicationId: "app-1",
    period: "month",
    maxUsd: 12.5,
    maxInvocations: null,
    updatedAt: "2026-07-10T10:00:00.000Z"
  },
  usage: {
    period: "month",
    since: "2026-07-01T00:00:00.000Z",
    spentUsd: 1.25,
    invocations: 3
  },
  invocations: [
    {
      id: "inv-1",
      applicationId: "app-1",
      version: 2,
      invocationId: "run-1",
      operationId: "main",
      estimatedUsd: 0.02,
      actualUsd: 0.015,
      status: "settled",
      createdAt: "2026-07-11T10:00:00.000Z",
      settledAt: "2026-07-11T10:00:05.000Z"
    }
  ]
};

jest.mock("../../../hooks/useApplications", () => ({
  useApplicationVersions: () => ({ data: state.versions, isLoading: false }),
  useReleasedApplicationVersion: () => ({ data: state.released }),
  usePublishApplication: () => ({
    mutate: publishMutate,
    isPending: false,
    isError: false,
    error: null
  }),
  useReleaseApplicationVersion: () => ({
    mutate: releaseMutate,
    isPending: false,
    isError: false,
    error: null
  }),
  useApplicationBudget: () => ({ data: state.budget, isLoading: false }),
  useApplicationUsage: () => ({ data: state.usage }),
  useSetApplicationBudget: () => ({
    mutate: setBudgetMutate,
    isPending: false,
    isError: false,
    error: null
  }),
  useApplicationInvocations: () => ({
    data: state.invocations,
    isLoading: false
  })
}));

import ApplicationGovernancePanel from "../ApplicationGovernancePanel";

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ApplicationGovernancePanel applicationId="app-1" />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ApplicationGovernancePanel", () => {
  it("summarizes what the released version may touch", () => {
    renderPanel();

    expect(
      screen.getByText(
        "Serving version 2 — 1 workflow · asset (read, create)"
      )
    ).toBeInTheDocument();
  });

  it("publishes a new version", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Publish new version" })
    );

    expect(publishMutate).toHaveBeenCalledWith({ id: "app-1" });
  });

  it("offers rollback only for versions that are not released", async () => {
    const user = userEvent.setup();
    renderPanel();

    const rollbackButtons = screen.getAllByRole("button", {
      name: "Roll back to this"
    });
    expect(rollbackButtons).toHaveLength(1);

    await user.click(rollbackButtons[0]);

    expect(releaseMutate).toHaveBeenCalledWith({ id: "app-1", version: 1 });
  });

  it("lists versions newest first and marks the released one", () => {
    renderPanel();

    expect(screen.getByText("Version 2")).toBeInTheDocument();
    expect(screen.getByText("Released")).toBeInTheDocument();
  });

  it("seeds the budget form from the stored budget", () => {
    renderPanel();

    expect(screen.getByLabelText("Max spend (USD)")).toHaveValue("12.5");
    expect(screen.getByLabelText("Max invocations")).toHaveValue("");
  });

  it("saves an empty ceiling as no limit", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.clear(screen.getByLabelText("Max spend (USD)"));
    await user.type(screen.getByLabelText("Max invocations"), "50");
    await user.click(screen.getByRole("button", { name: "Save budget" }));

    expect(setBudgetMutate).toHaveBeenCalledWith({
      id: "app-1",
      period: "month",
      maxUsd: null,
      maxInvocations: 50
    });
  });

  it("shows usage inside the budget window", () => {
    renderPanel();

    expect(screen.getByText(/Used \$1\.2500 across 3 runs/)).toBeInTheDocument();
  });

  it("lists recent invocations with their settled cost", () => {
    renderPanel();

    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("$0.0150")).toBeInTheDocument();
  });
});
