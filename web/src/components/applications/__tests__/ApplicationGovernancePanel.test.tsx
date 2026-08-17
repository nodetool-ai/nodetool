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

/** Per-test overrides for the query and mutation results the panel reads. */
interface Failure {
  message: string;
}

const overrides: {
  versionsError: Failure | null;
  budgetError: Failure | null;
  invocationsError: Failure | null;
  publishError: Failure | null;
  releaseError: Failure | null;
  setBudgetError: Failure | null;
} = {
  versionsError: null,
  budgetError: null,
  invocationsError: null,
  publishError: null,
  releaseError: null,
  setBudgetError: null
};

const resetOverrides = () => {
  overrides.versionsError = null;
  overrides.budgetError = null;
  overrides.invocationsError = null;
  overrides.publishError = null;
  overrides.releaseError = null;
  overrides.setBudgetError = null;
};

jest.mock("../../../hooks/useApplications", () => ({
  useApplicationVersions: () => ({
    data: overrides.versionsError ? undefined : state.versions,
    isLoading: false,
    isError: overrides.versionsError !== null,
    error: overrides.versionsError
  }),
  useReleasedApplicationVersion: () => ({ data: state.released }),
  usePublishApplication: () => ({
    mutate: publishMutate,
    isPending: false,
    isError: overrides.publishError !== null,
    error: overrides.publishError
  }),
  useReleaseApplicationVersion: () => ({
    mutate: releaseMutate,
    isPending: false,
    isError: overrides.releaseError !== null,
    error: overrides.releaseError
  }),
  useApplicationBudget: () => ({
    data: overrides.budgetError ? undefined : state.budget,
    isLoading: false,
    isError: overrides.budgetError !== null,
    error: overrides.budgetError
  }),
  useApplicationUsage: () => ({ data: state.usage }),
  useSetApplicationBudget: () => ({
    mutate: setBudgetMutate,
    isPending: false,
    isError: overrides.setBudgetError !== null,
    error: overrides.setBudgetError
  }),
  useApplicationInvocations: () => ({
    data: overrides.invocationsError ? undefined : state.invocations,
    isLoading: false,
    isError: overrides.invocationsError !== null,
    error: overrides.invocationsError
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
  resetOverrides();
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
      name: /Roll back to version/
    });
    expect(rollbackButtons).toHaveLength(1);

    await user.click(
      screen.getByRole("button", { name: "Roll back to version 1" })
    );

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

describe("ApplicationGovernancePanel error paths", () => {
  it("announces a failed publish", () => {
    overrides.publishError = { message: "No operations to publish" };
    renderPanel();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not publish: No operations to publish"
    );
  });

  it("announces a failed rollback", () => {
    overrides.releaseError = { message: "Application version not found" };
    renderPanel();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not change the release: Application version not found"
    );
  });

  it("announces a rejected budget instead of dropping it silently", () => {
    overrides.setBudgetError = { message: "Budget below current spend" };
    renderPanel();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not save the budget: Budget below current spend"
    );
  });

  it("refuses to save a non-numeric ceiling", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.clear(screen.getByLabelText("Max spend (USD)"));
    await user.type(screen.getByLabelText("Max spend (USD)"), "lots");

    expect(
      screen.getByText("Enter a number of 0 or more, or leave empty for no limit.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save budget" })).toBeDisabled();
    expect(setBudgetMutate).not.toHaveBeenCalled();
  });

  it("reports a versions query that failed", () => {
    overrides.versionsError = { message: "Application not found" };
    renderPanel();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load versions: Application not found"
    );
  });

  it("reports a budget query that failed", () => {
    overrides.budgetError = { message: "Unauthorized" };
    renderPanel();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load the budget: Unauthorized"
    );
  });

  it("reports an invocations query that failed", () => {
    overrides.invocationsError = { message: "Ledger unavailable" };
    renderPanel();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load invocations: Ledger unavailable"
    );
  });
});
