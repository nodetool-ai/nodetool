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
  reconcile: jest.fn(async () => ({})),
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
    expect(screen.getByText(/\$0\.50/)).toBeInTheDocument();
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
});
