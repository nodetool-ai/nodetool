/**
 * PRD § 8.7 criterion 6 and D14: the landing strip offers `Retry N failed`
 * while clips failed, the next steps once the cut is whole, and a remaining
 * time **only** where one was measured.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useDirectGenPendingStore } from "../../../../hooks/timeline/directGenPending";
import { VideoLandingStrip, remainingMs } from "../VideoLandingStrip";

const start = jest.fn(async (clipId: string) => clipId);
jest.mock("../../../../hooks/timeline/useTimelineDirectGenJob", () => ({
  useTimelineDirectGenJob: () => ({ start, cancel: jest.fn() })
}));

const clip = (over: Record<string, unknown>) => ({
  id: "c1",
  trackId: "t1",
  name: "Beat 1",
  startMs: 0,
  durationMs: 4000,
  mediaType: "video" as const,
  sourceType: "generated" as const,
  bindingKind: "text-to-video" as const,
  model: "nodetool/kling-turbo",
  status: "generated" as const,
  locked: false,
  versions: [],
  ...over
});

const renderStrip = (onExport = jest.fn()) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <VideoLandingStrip onExport={onExport} />
    </ThemeProvider>
  );

beforeEach(() => {
  start.mockClear();
  useTimelineStore.getState().reset();
  useDirectGenPendingStore.setState({ pending: {}, durationSamples: {} });
});

describe("VideoLandingStrip", () => {
  it("renders nothing on a sequence that never went through the flow", () => {
    const { container } = renderStrip();
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Retry N failed while clips have failed", async () => {
    useTimelineStore.getState().setSetup({ stage: "done" });
    useTimelineStore
      .getState()
      .addClips([
        clip({ id: "c1", status: "failed" }),
        clip({ id: "c2", status: "failed" })
      ]);
    renderStrip();

    const button = screen.getByRole("button", { name: "Retry 2 failed" });
    await userEvent.click(button);
    expect(start.mock.calls.map(([id]) => id).sort()).toEqual(["c1", "c2"]);
  });

  it("shows how many clips are rendering", () => {
    useTimelineStore.getState().setSetup({ stage: "done" });
    useTimelineStore
      .getState()
      .addClips([clip({ id: "c1", status: "generating" })]);
    renderStrip();
    expect(screen.getByText(/Rendering 1 clip/)).toBeInTheDocument();
  });

  it("says nothing about remaining time when nothing was measured (D14)", () => {
    useTimelineStore.getState().setSetup({ stage: "done" });
    useTimelineStore
      .getState()
      .addClips([clip({ id: "c1", status: "generating" })]);
    renderStrip();
    expect(screen.queryByText(/left/)).toBeNull();
  });

  it("shows a remaining time once the bucket has a sample", () => {
    useTimelineStore.getState().setSetup({ stage: "done" });
    useTimelineStore
      .getState()
      .addClips([clip({ id: "c1", status: "generating" })]);
    useDirectGenPendingStore.setState({
      pending: {},
      durationSamples: { "text-to-video:nodetool/kling-turbo": [30_000] }
    });
    renderStrip();
    expect(screen.getByText(/about 30s left/)).toBeInTheDocument();
  });

  it("offers the next steps once the cut is whole", async () => {
    const onExport = jest.fn();
    useTimelineStore.getState().setSetup({ stage: "done" });
    useTimelineStore.getState().addClips([clip({ id: "c1" })]);
    renderStrip(onExport);

    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onExport).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Add captions" }));
    expect(useTimelineStore.getState().scriptEnabled).toBe(true);
  });

  it("holds the next steps back while anything is still rendering", () => {
    useTimelineStore.getState().setSetup({ stage: "done" });
    useTimelineStore
      .getState()
      .addClips([clip({ id: "c1", status: "generating" })]);
    renderStrip();
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });
});

describe("remainingMs (D14)", () => {
  it("is null when no bucket was measured", () => {
    expect(remainingMs(["video:m"], {})).toBeNull();
  });

  it("is the longest measured bucket still running", () => {
    expect(
      remainingMs(["a", "b"], { a: [10_000], b: [40_000, 20_000, 30_000] })
    ).toBe(30_000);
  });

  it("ignores a bucket nothing measured", () => {
    expect(remainingMs(["a", "b"], { a: [10_000] })).toBe(10_000);
  });
});
