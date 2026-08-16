import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import {
  useScriptStore,
  type ScriptTake
} from "../../../stores/script/ScriptStore";

// The gutter's storyboard link reads the board through trpc when it is not
// open; this suite renders no query client and only reads the header button.
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

const seed = (links: { timelineId: string | null; storyboardId: string | null }) => {
  useScriptStore.setState({ scripts: {}, history: {}, saveStatus: {} });
  useScriptStore.getState().loadScript(SCRIPT_ID, {
    title: "My script",
    cast: [],
    sections: [
      {
        id: "s1",
        lines: [
          { id: "line-a", text: "Hello", takes: [take()], currentTakeId: "take-a" }
        ]
      }
    ],
    ...links
  });
};

const renderPane = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ScriptDocumentPane scriptId={SCRIPT_ID} readOnly={false} />
    </ThemeProvider>
  );

describe("ScriptDocumentPane assemble button", () => {
  it('reads "Send to timeline" for an unlinked, never-assembled script', () => {
    seed({ timelineId: null, storyboardId: null });
    renderPane();
    expect(screen.getByRole("button", { name: "Send to timeline" })).toBeInTheDocument();
  });

  it('reads "Update timeline" once assembled, while unlinked', () => {
    seed({ timelineId: "tl-1", storyboardId: null });
    renderPane();
    expect(screen.getByRole("button", { name: "Update timeline" })).toBeInTheDocument();
  });

  it('reads "Assemble video" when a storyboard is linked', () => {
    seed({ timelineId: null, storyboardId: "board-1" });
    renderPane();
    expect(screen.getByRole("button", { name: "Assemble video" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to timeline" })).toBeNull();
  });

  it('stays "Assemble video" on a re-assemble of a linked script', () => {
    seed({ timelineId: "tl-1", storyboardId: "board-1" });
    renderPane();
    expect(screen.getByRole("button", { name: "Assemble video" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update timeline" })).toBeNull();
  });
});
