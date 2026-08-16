import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Screenplay, Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

// The panel reads the script from the server only when its editor tab is
// closed; every case here seeds the store draft instead.
jest.mock("../../../trpc/client", () => ({
  trpc: {
    scripts: { get: { useQuery: jest.fn(() => ({ data: undefined })) } }
  },
  trpcClient: {}
}));

const reprojectMock = jest.fn().mockResolvedValue({
  scriptId: "script-1",
  reprojectedShotIds: ["shot-1"],
  driftedShotIds: ["shot-1"]
});
jest.mock("../../../hooks/storyboard/useReprojectShots", () => ({
  useReprojectShots: () => ({
    reproject: reprojectMock,
    reprojecting: false,
    error: null
  })
}));

import ShotScriptPanel from "../ShotScriptPanel";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useScriptStore } from "../../../stores/script/ScriptStore";

const BOARD = "board-1";
const SCRIPT = "script-1";

const shot = (overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: "shot-1",
  index: 0,
  action: "A lighthouse at dusk",
  status: "planned",
  dialogue: "We are closed.",
  script_line_ids: ["l1"],
  script_text_snapshot: "We are closed.",
  ...overrides
});

const seedBoard = (target: Shot, scriptId: string | null = SCRIPT): void => {
  const screenplay: Screenplay = {
    type: "screenplay",
    id: "sp-1",
    title: "My film",
    shots: [target],
    ...(scriptId ? { script_id: scriptId } : {})
  };
  useStoryboardStore.setState({ boards: {}, serverRevisions: {}, history: {} });
  useStoryboardStore.getState().ensureBoard(BOARD);
  useStoryboardStore.getState().loadBoard(BOARD, {
    screenplay,
    shots: [target],
    title: "My film",
    brief: "",
    style: "",
    entityIds: [],
    aspectRatio: "16:9",
    directorModel: null,
    imageModel: null,
    videoModel: null,
    activeShotId: null,
    timelineId: null
  });
};

const seedScript = (text: string): void => {
  useScriptStore.setState({ scripts: {}, serverRevisions: {} });
  useScriptStore.getState().ensureScript(SCRIPT);
  useScriptStore.getState().loadScript(SCRIPT, {
    title: "My film",
    cast: [{ id: "speaker_kim", name: "Kim", voice: null }],
    sections: [
      {
        id: "sec-1",
        lines: [{ id: "l1", speakerId: "speaker_kim", text, takes: [] }]
      }
    ],
    timelineId: null,
    storyboardId: BOARD
  });
};

const renderPanel = (target: Shot = shot()) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotScriptPanel boardId={BOARD} shot={target} />
    </ThemeProvider>
  );

beforeEach(() => {
  reprojectMock.mockClear();
});

describe("ShotScriptPanel", () => {
  it("lists the linked line with its speaker and voice status", () => {
    seedBoard(shot());
    seedScript("We are closed.");
    renderPanel();

    expect(screen.getByText("Script")).toBeInTheDocument();
    expect(screen.getByText("Kim")).toBeInTheDocument();
    expect(screen.getByText("We are closed.")).toBeInTheDocument();
    expect(screen.getByText("Not voiced")).toBeInTheDocument();
  });

  it("badges drift and re-projects just this shot", async () => {
    seedBoard(shot());
    seedScript("We are open.");
    renderPanel();

    expect(screen.getByText("Script changed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /re-project/i }));

    expect(reprojectMock).toHaveBeenCalledWith(BOARD, { shotIds: ["shot-1"] });
  });

  it("shows no drift badge while the script matches the shot", () => {
    seedBoard(shot());
    seedScript("We are closed.");
    renderPanel();

    expect(screen.queryByText("Script changed")).toBeNull();
    expect(screen.queryByRole("button", { name: /re-project/i })).toBeNull();
  });

  it("renders nothing on a board that links no script", () => {
    seedBoard(shot(), null);
    seedScript("We are closed.");
    const { container } = renderPanel();

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a shot that covers no line", () => {
    const bare = shot({ script_line_ids: undefined });
    seedBoard(bare);
    seedScript("We are closed.");
    const { container } = renderPanel(bare);

    expect(container).toBeEmptyDOMElement();
  });

  it("reports a linked line the script no longer has", () => {
    const target = shot({ script_line_ids: ["l1", "gone"] });
    seedBoard(target);
    seedScript("We are closed.");
    renderPanel(target);

    expect(
      screen.getByText(/1 linked line\(s\) are no longer in the script/i)
    ).toBeInTheDocument();
  });
});
