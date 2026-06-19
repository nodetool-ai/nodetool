import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import WorkerStatusIndicator from "../WorkerStatusIndicator";
import { useWorkers } from "../../../hooks/useWorkers";
import type { WorkerInstance } from "../../../hooks/useWorkers";

jest.mock("../../../hooks/useWorkers", () => ({
  useWorkers: jest.fn()
}));

const mockUseWorkers = useWorkers as jest.MockedFunction<typeof useWorkers>;

const makeInstance = (
  overrides: Partial<WorkerInstance> = {}
): WorkerInstance => ({
  id: "i-1",
  profile_name: "hf-a40",
  target: "runpod",
  provider_ref: "pod-abc",
  ws_url: "wss://pod-abc-7777.proxy.runpod.net",
  token: "tok",
  status: "attached",
  attached_to: "local",
  created_at: "2026-06-08T00:00:00Z",
  last_activity_at: "2026-06-08T00:00:00Z",
  estimated_cost_usd: 0.5,
  ...overrides
});

const baseValue = (
  activeWorker: WorkerInstance | null
): ReturnType<typeof useWorkers> =>
  ({
    profiles: [],
    instances: activeWorker ? [activeWorker] : [],
    activeWorker,
    profilesQuery: { isLoading: false } as ReturnType<
      typeof useWorkers
    >["profilesQuery"],
    instancesQuery: { isLoading: false } as ReturnType<
      typeof useWorkers
    >["instancesQuery"],
    createProfile: jest.fn(),
    deleteProfile: jest.fn(),
    provision: jest.fn(),
    stop: jest.fn(async () => makeInstance({ status: "stopped" })),
    stopAll: jest.fn(),
    attach: jest.fn(),
    detach: jest.fn(),
    reconcile: jest.fn()
  }) as unknown as ReturnType<typeof useWorkers>;

const renderIndicator = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <WorkerStatusIndicator />
    </ThemeProvider>
  );

describe("WorkerStatusIndicator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when no worker is attached", () => {
    mockUseWorkers.mockReturnValue(baseValue(null));
    const { container } = renderIndicator();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the attached worker and a quick-stop button when attached", () => {
    mockUseWorkers.mockReturnValue(baseValue(makeInstance()));
    renderIndicator();

    expect(screen.getByText(/hf-a40/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /stop attached worker/i })
    ).toBeInTheDocument();
  });

  it("quick-stop calls stop with the attached instance id", async () => {
    const value = baseValue(makeInstance());
    mockUseWorkers.mockReturnValue(value);
    renderIndicator();

    await userEvent.click(
      screen.getByRole("button", { name: /stop attached worker/i })
    );

    expect(value.stop).toHaveBeenCalledWith("i-1");
  });
});
