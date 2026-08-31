import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import {
  useScriptStore,
  type ScriptTake
} from "../../../stores/script/ScriptStore";
import { StudioProvider } from "../../../studio/StudioContext";

jest.mock("../../../trpc/client", () => ({
  trpc: {
    storyboards: { get: { useQuery: jest.fn(() => ({ data: undefined })) } }
  },
  trpcClient: {}
}));

jest.mock("../StoryboardLinkControl", () => ({
  __esModule: true,
  default: () => null
}));

import ScriptDocumentPane from "../ScriptDocumentPane";

const SCRIPT_ID = "script-toolbar";

const take = (): ScriptTake => ({
  id: "take-a",
  assetId: "voice-a",
  durationMs: 2000,
  words: [],
  textSnapshot: "Hello",
  voiceSnapshot: null,
  createdAt: "2026-01-01T00:00:00.000Z"
});

const seed = (voiced: boolean) => {
  useScriptStore.setState({ scripts: {}, history: {}, saveStatus: {} });
  useScriptStore.getState().loadScript(SCRIPT_ID, {
    title: "My script",
    cast: [],
    sections: [
      {
        id: "s1",
        lines: [
          voiced
            ? {
                id: "line-a",
                text: "Hello",
                takes: [take()],
                currentTakeId: "take-a"
              }
            : { id: "line-a", text: "Hello", takes: [] }
        ]
      }
    ],
    timelineId: null,
    storyboardId: null
  });
};

const renderPane = (studio = false) => {
  const pane = (
    <ThemeProvider theme={mockTheme}>
      <ScriptDocumentPane scriptId={SCRIPT_ID} readOnly={false} />
    </ThemeProvider>
  );
  return render(studio ? <StudioProvider>{pane}</StudioProvider> : pane);
};

describe("ScriptDocumentPane toolbar", () => {
  it("shows voiced duration next to the line count", () => {
    seed(true);
    renderPane();
    expect(screen.getByText(/1 line · 1 word · 2s/)).toBeInTheDocument();
  });

  it("disables play-through until a line is voiced", () => {
    seed(false);
    renderPane();
    expect(screen.getByRole("button", { name: "Play through" })).toBeDisabled();
  });

  it("hides Send to timeline inside Studio, where Create video owns that action", () => {
    seed(true);
    renderPane(true);
    expect(
      screen.queryByRole("button", { name: "Send to timeline" })
    ).toBeNull();
  });

  it("keeps Export SRT in the overflow menu", async () => {
    seed(true);
    const user = userEvent.setup();
    renderPane();

    expect(screen.queryByRole("button", { name: "Export SRT" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "Export SRT" })
    ).toBeEnabled();
  });
});
