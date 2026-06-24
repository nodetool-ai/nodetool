import { renderHook, act } from "@testing-library/react";

// ---- controllable mock state -------------------------------------------------
let instantUpdate = true;
let browserEligible = true;
const mockUpdateNodeProperties = jest.fn();
const mockOnPropertyChange = jest.fn();
const mockOnPropertyChangeComplete = jest.fn();
const mockRunBrowserGraphJob = jest.fn();
const mockNotifyScrubActivity = jest.fn();

const storeState = {
  nodes: [],
  edges: [],
  workflow: { id: "wf-1" },
  findNode: () => undefined
};

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (selector: (s: unknown) => unknown) =>
    selector({
      updateNodeProperties: mockUpdateNodeProperties,
      edges: storeState.edges
    }),
  useNodeStoreRef: () => ({ getState: () => storeState })
}));

jest.mock("../../../stores/SettingsStore", () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ settings: { instantUpdate } })
}));

jest.mock("../useInputNodeAutoRun", () => ({
  useNodeAutoRun: () => ({
    onPropertyChange: mockOnPropertyChange,
    onPropertyChangeComplete: mockOnPropertyChangeComplete
  })
}));

jest.mock("../buildDownstreamRunGraph", () => ({
  buildDownstreamRunGraph: () => ({
    nodes: [{ id: "n1", type: "lib.image.color.Exposure" }],
    edges: [],
    nodesWithOverrides: 0,
    totalPropertiesInjected: 0
  }),
  // `browserEligible` stands in for a non-empty browser-runnable prefix.
  browserRunnablePrefix: (graph: { nodes: unknown[]; edges: unknown[] }) =>
    browserEligible ? graph : { nodes: [], edges: [] }
}));

jest.mock("../../../stores/reactFlowNodeToGraphNode", () => ({
  reactFlowNodeToGraphNode: (n: unknown) => n
}));
jest.mock("../../../stores/reactFlowEdgeToGraphEdge", () => ({
  reactFlowEdgeToGraphEdge: (e: unknown) => e
}));

jest.mock("../../../lib/workflow/browserWorkflowRunner", () => ({
  browserSupportsSync: () => true,
  runBrowserGraphJob: (opts: unknown) => mockRunBrowserGraphJob(opts),
  preloadBrowserRunner: jest.fn()
}));

// useLiveSliderWriter generates preview job ids via crypto.randomUUID(); stub
// it for stable assertions (jsdom may not provide a native randomUUID).
if (typeof globalThis.crypto === "undefined") {
  (globalThis as { crypto: Crypto }).crypto = {} as Crypto;
}
(globalThis.crypto as { randomUUID: () => string }).randomUUID = () =>
  "preview-job-1";

jest.mock("../../../stores/LiveRunStore", () => ({
  useLiveRunStore: (selector: (s: unknown) => unknown) =>
    selector({ isScrubbing: false, notifyScrubActivity: mockNotifyScrubActivity })
}));

import { useLiveSliderWriter } from "../useLiveSliderWriter";

describe("useLiveSliderWriter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    instantUpdate = true;
    browserEligible = true;
    mockRunBrowserGraphJob.mockResolvedValue({ success: true, outputs: {} });
  });

  const render = () =>
    renderHook(() =>
      useLiveSliderWriter({ nodeId: "n1", nodeType: "lib.image.color.Exposure" })
    );

  it("writes the property and runs the browser preview when eligible", () => {
    const { result } = render();
    act(() => result.current.setProperty("stops", 0.5));

    expect(mockUpdateNodeProperties).toHaveBeenCalledWith("n1", { stops: 0.5 });
    expect(mockRunBrowserGraphJob).toHaveBeenCalledTimes(1);
    expect(mockRunBrowserGraphJob).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: "wf-1", jobId: "preview-job-1" })
    );
    // Browser path handled it — no server fallback.
    expect(mockOnPropertyChange).not.toHaveBeenCalled();
    // Animations are frozen while scrubbing.
    expect(mockNotifyScrubActivity).toHaveBeenCalled();
  });

  it("falls back to the server auto-run when not browser-eligible", () => {
    browserEligible = false;
    const { result } = render();
    act(() => result.current.setProperty("stops", 0.5));

    expect(mockUpdateNodeProperties).toHaveBeenCalledWith("n1", { stops: 0.5 });
    expect(mockRunBrowserGraphJob).not.toHaveBeenCalled();
    expect(mockOnPropertyChange).toHaveBeenCalledTimes(1);
    // Animations are frozen on the server path too — it would otherwise flash
    // the running ring/outline on each scrub.
    expect(mockNotifyScrubActivity).toHaveBeenCalled();
  });

  it("runs the browser preview even when instant-update is off", () => {
    // Live preview is unconditional for these sliders — only the server
    // fallback (non-browser graphs) respects the instantUpdate setting.
    instantUpdate = false;
    const { result } = render();
    act(() => result.current.setProperty("stops", 0.5));

    expect(mockRunBrowserGraphJob).toHaveBeenCalledTimes(1);
    expect(mockOnPropertyChange).not.toHaveBeenCalled();
  });

  it("coalesces rapid scrubs: one run in flight, latest re-runs on completion", async () => {
    let resolveFirst!: () => void;
    mockRunBrowserGraphJob
      .mockImplementationOnce(
        () => new Promise<void>((res) => (resolveFirst = res))
      )
      .mockResolvedValue(undefined);

    const { result } = render();

    act(() => result.current.setProperty("stops", 0.1)); // launches run #1
    act(() => result.current.setProperty("stops", 0.2)); // in flight → pending
    act(() => result.current.setProperty("stops", 0.3)); // still pending (coalesced)

    expect(mockRunBrowserGraphJob).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst();
      await Promise.resolve();
    });

    // The single pending request fires exactly one follow-up run.
    expect(mockRunBrowserGraphJob).toHaveBeenCalledTimes(2);
  });

  it("commit renders the final value in the browser when eligible", () => {
    const { result } = render();
    act(() => result.current.setPropertyComplete());

    expect(mockRunBrowserGraphJob).toHaveBeenCalledTimes(1);
    expect(mockOnPropertyChangeComplete).not.toHaveBeenCalled();
  });

  it("commit falls back to the authoritative server run when not eligible", () => {
    browserEligible = false;
    const { result } = render();
    act(() => result.current.setPropertyComplete());

    expect(mockRunBrowserGraphJob).not.toHaveBeenCalled();
    expect(mockOnPropertyChangeComplete).toHaveBeenCalledTimes(1);
  });

  it("reuses one job id across scrubs (one live generation)", async () => {
    const { result } = render();
    await act(async () => {
      result.current.setProperty("stops", 0.1);
      await Promise.resolve();
    });
    await act(async () => {
      result.current.setProperty("stops", 0.2);
      await Promise.resolve();
    });

    const jobIds = mockRunBrowserGraphJob.mock.calls.map(
      (c) => (c[0] as { jobId: string }).jobId
    );
    expect(new Set(jobIds)).toEqual(new Set(["preview-job-1"]));
  });
});
