import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import {
  useScriptStore,
  type ScriptTake
} from "../../../stores/script/ScriptStore";
import { useDocumentFocusStore } from "../../../stores/DocumentFocusStore";

// The gutter's storyboard link reads the board through trpc when it is not
// open; this suite renders no query client and only reads the line rows.
jest.mock("../../../trpc/client", () => ({
  trpc: {
    storyboards: { get: { useQuery: jest.fn(() => ({ data: undefined })) } }
  },
  trpcClient: {}
}));

// The link control owns its own suite and its own trpc query.
jest.mock("../StoryboardLinkControl", () => ({
  __esModule: true,
  default: () => null
}));

import ScriptDocumentPane from "../ScriptDocumentPane";

const SCRIPT_ID = "script-1";

const take = (): ScriptTake => ({
  id: "take-a",
  assetId: "voice-a",
  durationMs: 2000,
  words: [],
  textSnapshot: "Hello",
  voiceSnapshot: null,
  createdAt: "2026-01-01T00:00:00.000Z"
});

const seed = () => {
  useScriptStore.setState({ scripts: {}, history: {}, saveStatus: {} });
  useScriptStore.getState().loadScript(SCRIPT_ID, {
    title: "My script",
    cast: [],
    sections: [
      {
        id: "s1",
        lines: [
          { id: "line-a", text: "Hello", takes: [take()], currentTakeId: "take-a" },
          { id: "line-b", text: "Goodbye", takes: [], currentTakeId: null }
        ]
      }
    ],
    timelineId: null,
    storyboardId: "board-1"
  });
};

const renderPane = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ScriptDocumentPane scriptId={SCRIPT_ID} readOnly={false} />
    </ThemeProvider>
  );

/** The row element carrying `lineId`, as the deep link's scroll finds it. */
const row = (lineId: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`[data-line-id="${lineId}"]`);
  if (!el) {
    throw new Error(`no row for line ${lineId}`);
  }
  return el;
};

// jsdom implements no layout, so scrolling is observed rather than performed.
const scrollIntoView = jest.fn();

describe("ScriptDocumentPane line focus", () => {
  beforeEach(() => {
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
    useDocumentFocusStore.setState({ pending: null });
    seed();
  });

  it("scrolls to the line a cross-document link asked for", () => {
    useDocumentFocusStore.getState().requestDocumentFocus({
      type: "script",
      ref: SCRIPT_ID,
      lineId: "line-b"
    });
    renderPane();

    expect(screen.getByDisplayValue("Goodbye")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(row("line-b"));
    // One-shot: a later render must not re-apply it.
    expect(useDocumentFocusStore.getState().pending).toBeNull();
  });

  it("leaves a request for another script alone", () => {
    const request = {
      type: "script" as const,
      ref: "script-other",
      lineId: "line-b"
    };
    useDocumentFocusStore.getState().requestDocumentFocus(request);
    renderPane();

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(useDocumentFocusStore.getState().pending).toBe(request);
  });
});
