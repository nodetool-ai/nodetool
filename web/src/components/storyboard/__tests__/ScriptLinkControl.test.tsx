import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../trpc/client", () => ({
  trpc: {
    scripts: { get: { useQuery: jest.fn(() => ({ data: undefined })) } }
  },
  trpcClient: {}
}));

jest.mock("../../../hooks/storyboard/useExtractScriptFromBoard", () => ({
  useExtractScriptFromBoard: () => ({
    extract: jest.fn().mockResolvedValue({}),
    extracting: false,
    error: null
  })
}));

import ScriptLinkControl from "../ScriptLinkControl";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import type { Screenplay, Shot } from "@nodetool-ai/protocol";

const BOARD = "link-board";

const shot = (id: string): Shot => ({
  type: "shot",
  id,
  index: 0,
  action: "A lighthouse at dusk",
  dialogue: "We are closed.",
  status: "planned"
});

const screenplay = (scriptId?: string): Screenplay => {
  const doc: Screenplay = {
    type: "screenplay",
    id: "sp-1",
    title: "My film",
    shots: [shot("shot-1")]
  };
  if (scriptId) {
    doc.script_id = scriptId;
  }
  return doc;
};

const seedBoard = (scriptId?: string): void => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.setScreenplay(BOARD, screenplay(scriptId));
};

const renderControl = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ScriptLinkControl boardId={BOARD} />
    </ThemeProvider>
  );

describe("ScriptLinkControl", () => {
  beforeEach(() => {
    useStoryboardStore.setState({
      boards: {},
      serverRevisions: {},
      history: {}
    });
  });

  it("offers Extract script while the board links no script", () => {
    seedBoard();
    renderControl();

    expect(
      screen.getByRole("button", { name: /extract script/i })
    ).toBeEnabled();
    expect(screen.queryByRole("button", { name: /open script/i })).toBeNull();
  });

  it("offers Open script once the board links one", () => {
    seedBoard("script-7");
    renderControl();

    expect(screen.getByRole("button", { name: /open script/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /extract script/i })).toBeNull();
  });

  it("disables extraction on a board with no shots", () => {
    useStoryboardStore.getState().ensureBoard(BOARD);
    renderControl();

    expect(screen.getByRole("button", { name: /extract script/i })).toBeDisabled();
  });
});
