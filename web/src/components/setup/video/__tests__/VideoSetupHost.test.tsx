/**
 * @jest-environment jsdom
 *
 * The host hands the tab to the timeline editor, which reads `timeline.get`
 * from the cache. That cache still holds the copy loaded before the flow, so
 * the host saves and writes the flow's final document there before it calls
 * `onFinish` (V1). While the clips are being sent the document reads `done`,
 * which no step answers for, so the host covers that wait (V9).
 */
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import type { VideoSetupFlowOptions } from "../useVideoSetupFlow";
import type { TimelineStoreApi } from "../../../../stores/timeline/TimelineStore";

const mockFlush = jest.fn();
const mockSetData = jest.fn();
let mockSequence: Record<string, unknown> = {};
let mockStage = "look";
let mockOptions: VideoSetupFlowOptions = {};
let mockStore: TimelineStoreApi | null = null;

jest.mock("../../../../trpc/client", () => ({
  trpc: {
    timeline: {
      get: {
        useQuery: () => ({ data: mockSequence, isError: false })
      }
    },
    useUtils: () => ({ timeline: { get: { setData: mockSetData } } })
  }
}));
jest.mock("../../../../hooks/timeline/useTimelineAutosave", () => ({
  useTimelineAutosave: () => ({ flush: mockFlush }),
  markTimelineLoadMigrated: () => undefined
}));
jest.mock("../../../../hooks/timeline/useTimelineAgentBridge", () => ({
  useTimelineAgentBridge: () => undefined
}));
jest.mock("../useVideoSetupFlow", () => {
  const { useTimelineStoreApi } = jest.requireActual(
    "../../../../stores/timeline/TimelineStore"
  );
  return {
    useVideoSetupFlow: (options: VideoSetupFlowOptions) => {
      mockOptions = options;
      mockStore = useTimelineStoreApi();
      return {
        labels: { title: "Video" },
        steps: [],
        stage: mockStage,
        onStageChange: () => undefined
      };
    }
  };
});
jest.mock("../../SetupFlow", () => ({
  SetupFlow: () => <span>flow</span>
}));

import VideoSetupHost from "../VideoSetupHost";

const SEQUENCE_ID = "seq-1";

const sequence = (setup: Record<string, unknown>) => ({
  id: SEQUENCE_ID,
  projectId: "p1",
  name: "Paper boat",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 0,
  tracks: [],
  clips: [],
  markers: [],
  setup,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z"
});

const renderHost = (onFinish: () => void | Promise<void>) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <VideoSetupHost sequenceId={SEQUENCE_ID} onFinish={onFinish} />
    </ThemeProvider>
  );

beforeEach(() => {
  mockFlush.mockReset();
  mockSetData.mockReset();
  mockStage = "look";
  mockOptions = {};
  mockStore = null;
  mockSequence = sequence({ stage: "look", brief: "a paper boat" });
});

describe("VideoSetupHost", () => {
  it("saves and caches the finished document before it opens the timeline", async () => {
    const order: string[] = [];
    let cached: Record<string, unknown> | undefined;
    mockFlush.mockImplementation(async () => {
      order.push("flush");
      return { ok: true, updatedAt: "2026-10-09T00:00:01.000Z" };
    });
    mockSetData.mockImplementation(
      (input: unknown, update: (old: unknown) => Record<string, unknown>) => {
        order.push("setData");
        expect(input).toEqual({ id: SEQUENCE_ID });
        cached = update(mockSequence);
      }
    );
    const onFinish = jest.fn(async () => {
      order.push("finish");
    });
    renderHost(onFinish);

    act(() => mockStore?.getState().setSetup({ stage: "done" }));
    await act(async () => {
      await mockOptions.onFinish?.();
    });

    expect(order).toEqual(["flush", "setData", "finish"]);
    expect(cached).toMatchObject({
      id: SEQUENCE_ID,
      setup: { stage: "done", brief: "a paper boat" },
      updatedAt: "2026-10-09T00:00:01.000Z"
    });
  });

  it("still opens the timeline when the save fails", async () => {
    mockFlush.mockRejectedValue(new Error("offline"));
    const onFinish = jest.fn();
    renderHost(onFinish);

    await act(async () => {
      await mockOptions.onFinish?.();
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("shows a wait, not a blank panel, while the clips are sent", () => {
    mockSequence = sequence({
      stage: "done",
      brief: "a paper boat",
      prepared_generation: {
        batch_id: "batch",
        fingerprint: "f",
        status: "unsubmitted",
        requests: []
      }
    });
    mockStage = "done";
    renderHost(jest.fn());

    expect(screen.getByText("Starting your clips")).toBeInTheDocument();
  });
});
