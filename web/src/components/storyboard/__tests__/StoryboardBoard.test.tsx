import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

let mockShots: Shot[] = [];
jest.mock("../../../stores/storyboard/StoryboardStore", () => ({
  useBoard: () => ({
    title: "My film",
    brief: "A brief",
    style: "",
    entityIds: [],
    aspectRatio: "16:9",
    directorModel: { id: "model-1" },
    imageModel: null,
    videoModel: null,
    shots: mockShots
  }),
  useStoryboardStore: (selector: (s: unknown) => unknown) =>
    selector({
      setTitle: jest.fn(),
      setBrief: jest.fn(),
      setStyle: jest.fn(),
      setAspectRatio: jest.fn(),
      setDirectorModel: jest.fn(),
      setImageModel: jest.fn(),
      setVideoModel: jest.fn(),
      undo: jest.fn(),
      redo: jest.fn()
    }),
  useStoryboardCanUndo: () => false,
  useStoryboardCanRedo: () => false
}));

jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: jest.fn(),
    generateClip: jest.fn()
  })
}));

jest.mock("../../../hooks/useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({ models: [] })
}));

const stub = (name: string) => ({
  __esModule: true,
  default: () => <div data-testid={name} />
});
jest.mock("../../properties/LanguageModelSelect", () => stub("lang-model"));
jest.mock("../../properties/ImageModelSelect", () => stub("image-model"));
jest.mock("../../properties/VideoModelSelect", () => stub("video-model"));
jest.mock("../ShotCard", () => stub("shot-card"));
jest.mock("../StoryboardEntitiesField", () => stub("entities"));

import StoryboardBoard from "../StoryboardBoard";
import { StudioProvider } from "../../../studio/StudioContext";

const makeShot = (id: string): Shot => ({
  type: "shot",
  id,
  index: 0,
  slug: "Shot",
  action: "",
  status: "planned"
});

const renderBoard = (onDirect: (n: number) => void) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StoryboardBoard boardId="board-1" onDirect={onDirect} />
    </ThemeProvider>
  );

const renderBoardInStudio = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StudioProvider>
        <StoryboardBoard boardId="board-1" onDirect={jest.fn()} />
      </StudioProvider>
    </ThemeProvider>
  );

describe("StoryboardBoard direct guard", () => {
  it("directs immediately when the board has no shots", async () => {
    mockShots = [];
    const onDirect = jest.fn();
    const user = userEvent.setup();
    renderBoard(onDirect);

    await user.click(screen.getByRole("button", { name: "Direct" }));

    expect(onDirect).toHaveBeenCalledTimes(1);
  });

  it("confirms before re-directing over existing shots", async () => {
    mockShots = [makeShot("s1"), makeShot("s2")];
    const onDirect = jest.fn();
    const user = userEvent.setup();
    renderBoard(onDirect);

    // The button relabels once shots exist.
    await user.click(screen.getByRole("button", { name: "Re-direct" }));

    // The run is held until the confirmation is accepted.
    expect(onDirect).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Re-direct this storyboard?")
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Re-direct" }));

    expect(onDirect).toHaveBeenCalledTimes(1);
  });
});

describe("StoryboardBoard model fields", () => {
  it("offers still and clip models but no screenplay model in Studio", () => {
    mockShots = [];
    renderBoardInStudio();

    expect(screen.getByTestId("image-model")).toBeInTheDocument();
    expect(screen.getByTestId("video-model")).toBeInTheDocument();
    expect(screen.queryByTestId("lang-model")).not.toBeInTheDocument();
  });

  it("keeps the screenplay model in the workspace editor", () => {
    mockShots = [];
    renderBoard(jest.fn());

    expect(screen.getByTestId("lang-model")).toBeInTheDocument();
  });
});
