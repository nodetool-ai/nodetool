import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import WorkersPanel from "../WorkersPanel";
import { useWorkers } from "../../../hooks/useWorkers";
import type {
  WorkerInstance,
  WorkerProfile
} from "../../../hooks/useWorkers";

jest.mock("../../../hooks/useWorkers", () => ({
  useWorkers: jest.fn()
}));

const mockUseWorkers = useWorkers as jest.MockedFunction<typeof useWorkers>;

const makeProfile = (overrides: Partial<WorkerProfile> = {}): WorkerProfile => ({
  id: "p-1",
  name: "hf-a40",
  target: "runpod",
  image: "ghcr.io/nodetool/worker:0.7.3",
  spec: {},
  token_policy: "generate",
  idle_timeout_minutes: 15,
  max_lifetime_minutes: null,
  created_at: "2026-06-08T00:00:00Z",
  updated_at: "2026-06-08T00:00:00Z",
  ...overrides
});

const makeInstance = (
  overrides: Partial<WorkerInstance> = {}
): WorkerInstance => ({
  id: "i-1",
  profile_name: "hf-a40",
  target: "runpod",
  provider_ref: "pod-abc",
  ws_url: "wss://pod-abc-7777.proxy.runpod.net",
  token: "tok",
  status: "running",
  attached_to: null,
  created_at: "2026-06-08T00:00:00Z",
  last_activity_at: "2026-06-08T00:00:00Z",
  estimated_cost_usd: 0.5,
  ...overrides
});

const makeHookValue = (
  overrides: Partial<ReturnType<typeof useWorkers>> = {}
): ReturnType<typeof useWorkers> => ({
  profiles: [makeProfile()],
  instances: [makeInstance()],
  activeWorker: null,
  // The panel only consumes loading flags off the query objects.
  profilesQuery: { isLoading: false } as ReturnType<
    typeof useWorkers
  >["profilesQuery"],
  instancesQuery: { isLoading: false } as ReturnType<
    typeof useWorkers
  >["instancesQuery"],
  createProfile: jest.fn(async () => makeProfile()),
  deleteProfile: jest.fn(async () => undefined),
  provision: jest.fn(async () => makeInstance()),
  stop: jest.fn(async () => makeInstance({ status: "stopped" })),
  stopAll: jest.fn(async () => undefined),
  attach: jest.fn(async () => ({ wsUrl: "wss://x", token: "t" })),
  detach: jest.fn(async () => undefined),
  reconcile: jest.fn(async () => ({
    orphans: [],
    liveCount: 0,
    estimatedCostUsd: 0
  })),
  ...overrides
});

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <WorkersPanel />
    </ThemeProvider>
  );

describe("WorkersPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders an instance row with status, cost, and a Stop button", () => {
    mockUseWorkers.mockReturnValue(makeHookValue());
    renderPanel();

    expect(screen.getByText("hf-a40")).toBeInTheDocument();
    expect(screen.getByText(/running/i)).toBeInTheDocument();
    // The row shows the per-instance cost; the header shows the live rate.
    expect(screen.getByText(/Cost: \$0\.50/)).toBeInTheDocument();
    expect(screen.getByText("$0.50/hr")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /stop worker i-1/i })
    ).toBeInTheDocument();
  });

  it("Stop button calls stop with the instance id", async () => {
    const value = makeHookValue();
    mockUseWorkers.mockReturnValue(value);
    renderPanel();

    await userEvent.click(
      screen.getByRole("button", { name: /stop worker i-1/i })
    );

    expect(value.stop).toHaveBeenCalledWith("i-1");
  });

  it("provision dialog calls provision with the chosen profile", async () => {
    const value = makeHookValue({ instances: [] });
    mockUseWorkers.mockReturnValue(value);
    renderPanel();

    await userEvent.click(
      screen.getByRole("button", { name: /start worker/i })
    );

    // Dialog opens; the profile select defaults to the only profile.
    await userEvent.click(
      screen.getByRole("button", { name: /^provision$/i })
    );

    await waitFor(() => {
      expect(value.provision).toHaveBeenCalledWith("hf-a40");
    });
  });

  it("shows an empty hint when no workers are live", () => {
    mockUseWorkers.mockReturnValue(makeHookValue({ instances: [] }));
    renderPanel();

    expect(screen.getByText(/no workers running/i)).toBeInTheDocument();
  });

  it("Attach button calls attach with the instance id", async () => {
    const value = makeHookValue();
    mockUseWorkers.mockReturnValue(value);
    renderPanel();

    await userEvent.click(
      screen.getByRole("button", { name: /attach worker i-1/i })
    );

    expect(value.attach).toHaveBeenCalledWith("i-1");
  });

  it("shows a Detach button for the attached worker and calls detach", async () => {
    const value = makeHookValue({
      instances: [makeInstance({ status: "attached", attached_to: "local" })],
      activeWorker: makeInstance({ status: "attached", attached_to: "local" })
    });
    mockUseWorkers.mockReturnValue(value);
    renderPanel();

    // The attached worker exposes Detach, not Attach.
    expect(
      screen.queryByRole("button", { name: /attach worker i-1/i })
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /detach worker i-1/i })
    );

    expect(value.detach).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error banner when an action rejects, then clears it", async () => {
    const failingStop = jest.fn(async () => {
      throw new Error("boom: pod already gone");
    });
    const value = makeHookValue({ stop: failingStop });
    mockUseWorkers.mockReturnValue(value);
    renderPanel();

    await userEvent.click(
      screen.getByRole("button", { name: /stop worker i-1/i })
    );

    await waitFor(() => {
      expect(screen.getByText(/boom: pod already gone/i)).toBeInTheDocument();
    });

    // Dismiss clears the banner.
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => {
      expect(
        screen.queryByText(/boom: pod already gone/i)
      ).not.toBeInTheDocument();
    });
  });

  it("shows total estimated live cost in the header", () => {
    mockUseWorkers.mockReturnValue(
      makeHookValue({
        instances: [
          makeInstance({ id: "i-1", estimated_cost_usd: 0.5 }),
          makeInstance({ id: "i-2", estimated_cost_usd: 0.25 })
        ]
      })
    );
    renderPanel();

    expect(screen.getByText(/\$0\.75\/hr/)).toBeInTheDocument();
  });

  it("Reconcile button calls reconcile and warns about orphans", async () => {
    const reconcile = jest.fn(async () => ({
      orphans: [{ providerRef: "pod-x", target: "runpod" as const }],
      liveCount: 2,
      estimatedCostUsd: 1.23
    }));
    const value = makeHookValue({ reconcile });
    mockUseWorkers.mockReturnValue(value);
    renderPanel();

    await userEvent.click(
      screen.getByRole("button", { name: /reconcile/i })
    );

    expect(reconcile).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByText(/1 orphaned worker/i)).toBeInTheDocument();
    });
  });

  it("opens the Manage Profiles dialog from the header", async () => {
    mockUseWorkers.mockReturnValue(makeHookValue());
    renderPanel();

    await userEvent.click(
      screen.getByRole("button", { name: /manage profiles/i })
    );

    expect(
      screen.getByRole("button", { name: /^create profile$/i })
    ).toBeInTheDocument();
  });
});
