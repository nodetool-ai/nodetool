/**
 * ClipBody rendering: fade ramps, the incoming-transition wedge, the
 * trim-aware filmstrip's beyond-source stripes, and trim-handle visibility.
 * Mounts the body directly with a plain clip and jest.fn() handlers.
 */

import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import type { ClipThumbnail } from "../clipThumbnails";

let mockThumbnails: ClipThumbnail[] | null = null;
jest.mock("../useClipThumbnails", () => ({
  useClipThumbnails: () => mockThumbnails
}));
jest.mock("../useAudioPeaks", () => ({
  useAudioPeaks: () => ({ peaks: null, durationMs: null })
}));
jest.mock("../useAssetUrl", () => ({
  useAssetUrl: (id: string | undefined) => (id ? `blob:${id}` : undefined)
}));

import { ClipBody, CLIP_STATUS_MAP } from "../ClipBody";

const makeClip = (overrides: Partial<TimelineClip> = {}): TimelineClip => ({
  id: "c1",
  trackId: "t1",
  name: "Shot",
  startMs: 0,
  durationMs: 4000,
  mediaType: "video",
  sourceType: "imported",
  status: "draft",
  locked: false,
  versions: [],
  ...overrides
});

const renderBody = (
  clip: TimelineClip,
  props: { widthPx?: number; isSelected?: boolean } = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ClipBody
        clip={clip}
        leftPx={0}
        widthPx={props.widthPx ?? 400}
        msPerPx={10}
        isSelected={props.isSelected ?? false}
        derivedStatus="draft"
        statusInfo={CLIP_STATUS_MAP.draft}
        handleDragPointerDown={jest.fn()}
        handleClick={jest.fn()}
        handleKeyDown={jest.fn()}
        handleContextMenu={jest.fn()}
        handleTrimStartPointerDown={jest.fn()}
        handleTrimStartPointerMove={jest.fn()}
        handleTrimEndPointerDown={jest.fn()}
        handleTrimEndPointerMove={jest.fn()}
        handleTrimPointerEnd={jest.fn()}
        cutMode={false}
        selectedEdge={null}
        interactionLocked={false}
      />
    </ThemeProvider>
  );

beforeEach(() => {
  mockThumbnails = null;
});

describe("ClipBody fades and transitions", () => {
  it("draws fade ramps sized to the fade durations", () => {
    renderBody(makeClip({ fadeInMs: 500, fadeOutMs: 1000 }));
    expect(screen.getByTestId("clip-fade-in-c1")).toHaveStyle({
      width: "50px"
    });
    expect(screen.getByTestId("clip-fade-out-c1")).toHaveStyle({
      width: "100px"
    });
  });

  it("draws nothing when the clip has no fades or transition", () => {
    renderBody(makeClip());
    expect(screen.queryByTestId("clip-fade-in-c1")).toBeNull();
    expect(screen.queryByTestId("clip-fade-out-c1")).toBeNull();
    expect(screen.queryByTestId("clip-transition-in-c1")).toBeNull();
  });

  it("skips fades on media that cannot fade", () => {
    renderBody(makeClip({ mediaType: "text", fadeInMs: 500 }));
    expect(screen.queryByTestId("clip-fade-in-c1")).toBeNull();
  });

  it("draws the incoming transition with its type when wide enough", () => {
    renderBody(
      makeClip({ transitionIn: { type: "crossfade", durationMs: 800 } })
    );
    const wedge = screen.getByTestId("clip-transition-in-c1");
    expect(wedge).toHaveStyle({ width: "80px" });
    expect(wedge).toHaveTextContent("crossfade");
  });

  it("drops the transition label on a narrow wedge", () => {
    renderBody(makeClip({ transitionIn: { type: "wipe", durationMs: 300 } }));
    const wedge = screen.getByTestId("clip-transition-in-c1");
    expect(wedge).toHaveStyle({ width: "30px" });
    expect(wedge).toHaveTextContent("");
  });
});

describe("ClipBody filmstrip", () => {
  const thumbnails: ClipThumbnail[] = Array.from({ length: 24 }, (_, k) => ({
    time: k,
    dataUrl: `frame-${k}`
  }));

  it("starts the strip at the trimmed in-point", () => {
    mockThumbnails = thumbnails;
    // 2 cells over source [10 s, 12 s].
    renderBody(
      makeClip({ currentAssetId: "a", inPointMs: 10_000, durationMs: 2000 }),
      { widthPx: 120 }
    );
    const strip = screen.getByTestId("clip-c1").querySelector(
      "div[style*='background-image']"
    );
    expect(strip).not.toBeNull();
    expect(strip).toHaveStyle({ backgroundImage: "url(frame-10)" });
  });

  it("stripes the part of the clip that runs past the source", () => {
    mockThumbnails = thumbnails;
    // Source ends at ~24 s; the clip shows [20 s, 28 s], half of it past the end.
    renderBody(
      makeClip({ currentAssetId: "a", inPointMs: 20_000, durationMs: 8000 }),
      { widthPx: 400 }
    );
    expect(screen.getByTestId("clip-beyond-source-c1")).toHaveStyle({
      width: "50%"
    });
  });

  it("leaves a clip inside its source unstriped", () => {
    mockThumbnails = thumbnails;
    renderBody(makeClip({ currentAssetId: "a", durationMs: 8000 }), {
      widthPx: 400
    });
    expect(screen.queryByTestId("clip-beyond-source-c1")).toBeNull();
  });
});

describe("ClipBody trim handles", () => {
  it("keeps both grips on a wide clip", () => {
    renderBody(makeClip(), { widthPx: 120 });
    expect(screen.getByTestId("clip-trim-start-c1")).not.toHaveStyle({
      display: "none"
    });
    expect(screen.getByTestId("clip-trim-end-c1")).not.toHaveStyle({
      display: "none"
    });
  });

  it("removes both grips from a clip too narrow to host them", () => {
    renderBody(makeClip(), { widthPx: 12 });
    const start = screen.getByTestId("clip-trim-start-c1");
    const end = screen.getByTestId("clip-trim-end-c1");
    expect(start).toHaveStyle({ display: "none", pointerEvents: "none" });
    expect(end).toHaveStyle({ display: "none", pointerEvents: "none" });
  });

  it("shows the grips on a selected clip and hides them otherwise", () => {
    const { unmount } = renderBody(makeClip(), { isSelected: true });
    expect(screen.getByTestId("clip-trim-start-c1")).toHaveStyle({
      opacity: "1"
    });
    unmount();
    renderBody(makeClip(), { isSelected: false });
    expect(screen.getByTestId("clip-trim-start-c1")).toHaveStyle({
      opacity: "0"
    });
  });
});
