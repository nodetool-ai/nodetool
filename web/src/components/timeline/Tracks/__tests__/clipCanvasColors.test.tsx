/**
 * The midi note bars and the audio waveform paint on a canvas, and canvas 2D
 * silently ignores a `var(--…)` fillStyle — under nodetool's `cssVariables`
 * theme `theme.vars.palette.X` is exactly that, so the bars came out black.
 * The theme here mirrors that: `vars` carries CSS-variable strings and
 * `colorSchemes` the plain values, and the recorded fillStyles must be plain.
 */

import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";

jest.mock("../useClipThumbnails", () => ({
  useClipThumbnails: () => null
}));
jest.mock("../useAudioPeaks", () => ({
  useAudioPeaks: () => ({
    peaks: new Float32Array([0.2, 0.8, 0.5, 0.9]),
    durationMs: 4000
  })
}));
jest.mock("../useAssetUrl", () => ({
  useAssetUrl: (id: string | undefined) => (id ? `blob:${id}` : undefined)
}));

import { ClipBody, CLIP_STATUS_MAP } from "../ClipBody";
import { MidiNotesCanvas } from "../MidiNotesCanvas";

const PRIMARY = "#77b4e6";
const SUCCESS = "#4caf50";

const cssVarTheme = ((): Theme => {
  const base = mockTheme as unknown as Record<string, unknown> & {
    vars: { palette: Record<string, unknown> };
  };
  const palette = {
    primary: { main: PRIMARY },
    success: { main: SUCCESS }
  };
  return {
    ...base,
    vars: {
      ...base.vars,
      palette: {
        ...base.vars.palette,
        primary: {
          ...(base.vars.palette.primary as object),
          main: "var(--palette-primary-main)"
        },
        success: {
          ...(base.vars.palette.success as object),
          main: "var(--palette-success-main)"
        }
      }
    },
    colorSchemes: { dark: { palette }, light: { palette } }
  } as unknown as Theme;
})();

let fillStyles: string[] = [];
let getContextSpy: jest.SpyInstance;

beforeEach(() => {
  fillStyles = [];
  const ctx = {
    scale: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    globalAlpha: 1,
    set fillStyle(value: string) {
      fillStyles.push(value);
    },
    get fillStyle(): string {
      return fillStyles[fillStyles.length - 1] ?? "";
    }
  };
  getContextSpy = jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation((() => ctx) as unknown as HTMLCanvasElement["getContext"]);
  jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
});

afterEach(() => {
  getContextSpy.mockRestore();
  jest.restoreAllMocks();
});

const makeClip = (overrides: Partial<TimelineClip>): TimelineClip => ({
  id: "c1",
  trackId: "t1",
  name: "Clip",
  startMs: 0,
  durationMs: 4000,
  mediaType: "audio",
  sourceType: "imported",
  status: "draft",
  locked: false,
  versions: [],
  ...overrides
});

describe("clip canvases resolve theme colours to plain values", () => {
  it("draws midi notes in the primary colour, not a CSS variable", () => {
    render(
      <ThemeProvider theme={cssVarTheme}>
        <MidiNotesCanvas
          notes={[
            { id: "n1", pitch: 60, startTick: 0, durationTick: 960, velocity: 100 },
            { id: "n2", pitch: 64, startTick: 960, durationTick: 960, velocity: 100 }
          ]}
          inPointMs={0}
          durationMs={4000}
          bpm={120}
          widthPx={400}
        />
      </ThemeProvider>
    );
    expect(fillStyles).toEqual([PRIMARY]);
  });

  it("draws the audio waveform in the success colour, not a CSS variable", () => {
    render(
      <ThemeProvider theme={cssVarTheme}>
        <ClipBody
          clip={makeClip({ currentAssetId: "a1" })}
          leftPx={0}
          widthPx={400}
          msPerPx={10}
          isSelected={false}
          derivedStatus="draft"
          statusInfo={CLIP_STATUS_MAP.draft}
          handleDragPointerDown={jest.fn()}
          handleClick={jest.fn()}
          handleDoubleClick={jest.fn()}
          handleKeyDown={jest.fn()}
          handleContextMenu={jest.fn()}
          handleTrimStartPointerDown={jest.fn()}
          handleTrimStartPointerMove={jest.fn()}
          handleTrimEndPointerDown={jest.fn()}
          handleTrimEndPointerMove={jest.fn()}
          handleTrimPointerEnd={jest.fn()}
          cutMode={false}
          selectedEdge={null}
          handleTransitionPointerDown={jest.fn()}
          handleTransitionPointerMove={jest.fn()}
          handleTransitionPointerEnd={jest.fn()}
          keyframeTimesMs={[]}
          onKeyframeClick={jest.fn()}
          interactionLocked={false}
        />
      </ThemeProvider>
    );
    expect(fillStyles).toContain(SUCCESS);
    expect(fillStyles.some((s) => s.startsWith("var("))).toBe(false);
  });
});
