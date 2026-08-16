import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import {
  useScriptStore,
  type ScriptSection
} from "../../../stores/script/ScriptStore";

/**
 * Line ids in the order their row bodies rendered. The wrapper repeats the
 * `memo` the real row is exported with, so an entry here means the row would
 * genuinely have re-rendered — not just that the parent passed through.
 */
const rowRenders: string[] = [];

// The gutter's storyboard link reads the board through trpc when it is not
// open; this suite renders no query client and counts row renders.
jest.mock("../../../trpc/client", () => ({
  trpc: {
    storyboards: { get: { useQuery: jest.fn(() => ({ data: undefined })) } }
  },
  trpcClient: {}
}));

// The link control owns its own suite and its own trpc query; this one counts
// row renders.
jest.mock("../StoryboardLinkControl", () => ({
  __esModule: true,
  default: () => null
}));

jest.mock("../ScriptLineRow", () => {
  const actual = jest.requireActual("../ScriptLineRow");
  const react: typeof React = jest.requireActual("react");
  const Row = actual.default;
  const Counting = react.memo(function CountingScriptLineRow(props: {
    line: { id: string };
  }) {
    rowRenders.push(props.line.id);
    return react.createElement(Row, props);
  });
  return { ...actual, __esModule: true, default: Counting };
});

import ScriptDocumentPane from "../ScriptDocumentPane";

const SCRIPT_ID = "script-perf";

const makeSection = (sectionId: string, lineCount: number): ScriptSection => ({
  id: sectionId,
  title: sectionId,
  lines: Array.from({ length: lineCount }, (_, i) => ({
    id: `${sectionId}-line-${i}`,
    text: `Line ${i}`,
    takes: []
  }))
});

const renderPane = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ScriptDocumentPane scriptId={SCRIPT_ID} readOnly={false} />
    </ThemeProvider>
  );

beforeEach(() => {
  useScriptStore.setState({ scripts: {}, history: {}, saveStatus: {} });
  useScriptStore.getState().loadScript(SCRIPT_ID, {
    title: "Perf",
    cast: [],
    sections: [makeSection("a", 6), makeSection("b", 6)],
    timelineId: null,
    storyboardId: null
  });
  rowRenders.length = 0;
});

describe("ScriptDocumentPane rendering", () => {
  it("re-renders only the edited line while typing", async () => {
    const user = userEvent.setup();
    renderPane();
    rowRenders.length = 0;

    await user.type(screen.getAllByLabelText("Line text")[0], "!");

    expect(rowRenders).toEqual(["a-line-0"]);
  });

  it("leaves existing lines alone when a line is inserted", () => {
    renderPane();
    rowRenders.length = 0;

    // Inserting shifts every following line's index, but nothing a row renders
    // depends on it — only the new row should render.
    React.act(() => {
      useScriptStore.getState().insertLine(SCRIPT_ID, "a", 0);
    });

    expect(rowRenders).toHaveLength(1);
    expect(rowRenders[0]).not.toMatch(/^a-line-/);
  });

  it("leaves every line alone when a section title changes", async () => {
    const user = userEvent.setup();
    renderPane();
    rowRenders.length = 0;

    await user.type(screen.getAllByLabelText("Section title")[0], "X");

    expect(rowRenders).toEqual([]);
  });
});
