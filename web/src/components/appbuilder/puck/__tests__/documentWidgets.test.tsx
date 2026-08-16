/**
 * The sketch and timeline widgets: resolving a bound value into a document,
 * fetching one that arrives as a bare ref, and the states in between.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { AppInstanceState } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime } from "../../__tests__/testRuntime";

interface QueryResult {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  error: { message: string } | null;
}

const IDLE: QueryResult = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null
};

/** What each fetch resolves to, per test. */
const results = {
  sketch: IDLE,
  timeline: IDLE
} satisfies { sketch: QueryResult; timeline: QueryResult };
const sketchEnabled = jest.fn();
const timelineEnabled = jest.fn();

// A disabled query never resolves, so the mock returns the idle result when the
// widget didn't ask — that's what tells "resolved inline" apart from "fetched".
jest.mock("../../../../trpc/client", () => ({
  trpc: {
    sketch: {
      get: {
        useQuery: (_input: { id: string }, options: { enabled: boolean }) => {
          sketchEnabled(options.enabled);
          return options.enabled ? results.sketch : IDLE;
        }
      }
    },
    timeline: {
      get: {
        useQuery: (_input: { id: string }, options: { enabled: boolean }) => {
          timelineEnabled(options.enabled);
          return options.enabled ? results.timeline : IDLE;
        }
      }
    }
  }
}));

// The real renderers composite layers onto a canvas / mount the preview
// compositor — neither runs under jsdom, and neither is what these tests are
// about. Stub them down to what they were handed.
jest.mock("../../../sketch/SketchRenderer", () => ({
  __esModule: true,
  default: ({ document }: { document: { canvas: { width: number } } }) => (
    <div data-testid="sketch-renderer">sketch {document.canvas.width}</div>
  )
}));
jest.mock("../../../timeline/TimelineRenderer", () => ({
  __esModule: true,
  default: ({ sequence }: { sequence: { name: string } }) => (
    <div data-testid="timeline-renderer">timeline {sequence.name}</div>
  )
}));

import { SketchWidget, TimelineWidget } from "../DocumentWidgets";

const OUTPUT_KEY = "main:out1";

const renderWidget = (
  element: React.ReactElement,
  initial: Partial<AppInstanceState> = {}
) => {
  const { wrapper: Wrapper } = makeTestRuntime(initial);
  return render(
    <ThemeProvider theme={mockTheme}>
      <Wrapper>{element}</Wrapper>
    </ThemeProvider>
  );
};

const withOutput = (value: unknown): Partial<AppInstanceState> => ({
  outputs: {
    [OUTPUT_KEY]: { value, invocationId: "j1", status: "done", revision: 1 }
  }
});

const SKETCH_DOC = {
  version: 1,
  canvas: { width: 1024, height: 768, backgroundColor: "#ffffff" },
  layers: [
    {
      id: "l1",
      name: "Layer 1",
      type: "raster",
      visible: true,
      locked: false,
      data: null
    }
  ],
  activeLayerId: "l1",
  maskLayerId: null
};

const TIMELINE_SEQ = {
  id: "seq-1",
  projectId: "p1",
  name: "Trailer",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 12_000,
  tracks: [],
  clips: [],
  markers: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z"
};

beforeEach(() => {
  jest.clearAllMocks();
  results.sketch = IDLE;
  results.timeline = IDLE;
});

describe("SketchWidget", () => {
  it("renders an inline sketch document without fetching", () => {
    renderWidget(
      <SketchWidget id="s1" binding="result" />,
      withOutput({ type: "sketch", data: SKETCH_DOC })
    );
    expect(screen.getByTestId("sketch-renderer")).toHaveTextContent("1024");
    expect(sketchEnabled).toHaveBeenCalledWith(false);
  });

  it("fetches a ref that carries only an id", () => {
    results.sketch = { ...IDLE, data: { document: { sketch: SKETCH_DOC } } };
    renderWidget(
      <SketchWidget id="s1" binding="result" />,
      withOutput({ type: "sketch", id: "img-1" })
    );
    expect(sketchEnabled).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("sketch-renderer")).toBeInTheDocument();
  });

  it("shows the placeholder when nothing is bound yet", () => {
    renderWidget(<SketchWidget id="s1" binding="result" placeholder="Nothing" />);
    expect(screen.getByText("Nothing")).toBeInTheDocument();
    expect(sketchEnabled).toHaveBeenCalledWith(false);
  });

  it("surfaces a failed fetch instead of an empty frame", () => {
    results.sketch = { ...IDLE, isError: true, error: { message: "gone" } };
    renderWidget(
      <SketchWidget id="s1" binding="result" />,
      withOutput({ type: "sketch", id: "img-1" })
    );
    expect(screen.getByText("Could not load sketch")).toBeInTheDocument();
    expect(screen.getByText("gone")).toBeInTheDocument();
  });
});

describe("TimelineWidget", () => {
  it("renders an inline timeline sequence without fetching", async () => {
    renderWidget(
      <TimelineWidget id="t1" binding="result" />,
      withOutput({ type: "timeline", data: TIMELINE_SEQ })
    );
    expect(await screen.findByTestId("timeline-renderer")).toHaveTextContent(
      "Trailer"
    );
    expect(timelineEnabled).toHaveBeenCalledWith(false);
  });

  it("fetches a ref that carries only an id", async () => {
    results.timeline = { ...IDLE, data: TIMELINE_SEQ };
    renderWidget(
      <TimelineWidget id="t1" binding="result" />,
      withOutput({ type: "timeline", id: "seq-1" })
    );
    expect(timelineEnabled).toHaveBeenCalledWith(true);
    expect(await screen.findByTestId("timeline-renderer")).toBeInTheDocument();
  });

  it("shows the placeholder when nothing is bound yet", () => {
    renderWidget(
      <TimelineWidget id="t1" binding="result" placeholder="No cut" />
    );
    expect(screen.getByText("No cut")).toBeInTheDocument();
  });
});
