import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot, ShotStatus } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

// Keep the card's generation hook and image ladder out of the render — this test
// only asserts the card's presentation and button gating, not generation.
const generateRevisedClipMock = jest.fn();
jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: jest.fn(),
    generateClip: jest.fn(),
    generateRevisedClip: generateRevisedClipMock
  })
}));

const moveShotMock = jest.fn();
const removeShotMock = jest.fn();
jest.mock("../../../stores/storyboard/StoryboardStore", () => {
  const actual = jest.requireActual(
    "../../../stores/storyboard/StoryboardStore"
  );
  return {
    ...actual,
    // Serve the actions the card reads via selectors; keep sameMediaRef and the
    // other real exports (the nested takes gallery uses them).
    useStoryboardStore: (selector: (s: unknown) => unknown) =>
      selector({
        toggleShotEntity: jest.fn(),
        moveShot: moveShotMock,
        removeShot: removeShotMock,
        selectKeyframeVersion: jest.fn(),
        selectClipVersion: jest.fn(),
        boards: {}
      })
  };
});

jest.mock("../../node/ImageRefPreview", () => ({
  __esModule: true,
  default: ({ placeholder }: { placeholder?: React.ReactNode }) => (
    <div data-testid="image-preview">{placeholder}</div>
  )
}));

// The entity chips resolve the library through React Query; an empty library
// keeps them out of these presentation tests.
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

import ShotCard from "../ShotCard";

const makeShot = (overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: "shot-1",
  index: 0,
  slug: "Opening",
  action: "A lighthouse at dusk",
  status: "planned",
  ...overrides
});

const renderCard = (shot: Shot, props: Partial<React.ComponentProps<typeof ShotCard>> = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotCard boardId="board-1" shot={shot} {...props} />
    </ThemeProvider>
  );

describe("ShotCard", () => {
  beforeEach(() => {
    moveShotMock.mockClear();
    removeShotMock.mockClear();
  });

  it("renders the shot action and status label", () => {
    renderCard(makeShot());
    expect(screen.getByText("A lighthouse at dusk")).toBeInTheDocument();
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.getByText("1. Opening")).toBeInTheDocument();
  });

  it("gates buttons for a planned shot with no keyframe", () => {
    renderCard(makeShot({ status: "planned" }));
    expect(
      screen.getByRole("button", { name: "Generate still" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Generate clip" })
    ).toBeDisabled();
  });

  it("enables Generate clip as soon as a still is ready", () => {
    const shot = makeShot({
      status: "keyframe_ready",
      keyframe: { type: "image", uri: "http://example.com/still.png" }
    });
    renderCard(shot);
    // With a keyframe present, the still button offers another take.
    expect(screen.getByRole("button", { name: "New still" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Generate clip" })).toBeEnabled();
  });

  it("treats the legacy approved status as a ready still", () => {
    const shot = makeShot({
      status: "approved",
      keyframe: { type: "image", uri: "http://example.com/still.png" }
    });
    renderCard(shot);
    expect(screen.getByText("Still ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate clip" })).toBeEnabled();
  });

  it("shows Revise clip only once a clip exists and collects an instruction in a dialog", async () => {
    generateRevisedClipMock.mockClear();
    // No clip yet: the revise affordance is absent.
    const { unmount } = renderCard(makeShot({ status: "keyframe_ready" }));
    expect(
      screen.queryByRole("button", { name: "Revise clip" })
    ).not.toBeInTheDocument();
    unmount();

    const shot = makeShot({
      status: "rendered",
      clip: { type: "video", uri: "http://example.com/clip.mp4" }
    });
    renderCard(shot);
    await userEvent.click(screen.getByRole("button", { name: "Revise clip" }));

    // The dialog opens; confirm is gated until an instruction is typed.
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Revise" });
    expect(confirm).toBeDisabled();

    await userEvent.type(
      within(dialog).getByRole("textbox"),
      "make it darker, add rain"
    );
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    expect(generateRevisedClipMock).toHaveBeenCalledWith(
      "board-1",
      shot,
      "make it darker, add rain"
    );
  });

  it("reorders a shot with the move controls", async () => {
    renderCard(makeShot(), { isFirst: false, isLast: false });
    await userEvent.click(screen.getByRole("button", { name: "Move shot up" }));
    expect(moveShotMock).toHaveBeenCalledWith("board-1", "shot-1", "up");
    await userEvent.click(
      screen.getByRole("button", { name: "Move shot down" })
    );
    expect(moveShotMock).toHaveBeenCalledWith("board-1", "shot-1", "down");
  });

  it("disables move-up on the first shot and move-down on the last", () => {
    renderCard(makeShot(), { isFirst: true, isLast: true });
    expect(screen.getByRole("button", { name: "Move shot up" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move shot down" })
    ).toBeDisabled();
  });

  it("deletes a shot only after confirming", async () => {
    renderCard(makeShot());
    await userEvent.click(screen.getByRole("button", { name: "Delete shot" }));
    // Nothing removed until the confirmation is accepted.
    expect(removeShotMock).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(removeShotMock).toHaveBeenCalledWith("board-1", "shot-1");
  });

  it("hides the management controls in read-only mode", () => {
    renderCard(makeShot(), { readOnly: true });
    expect(
      screen.queryByRole("button", { name: "Move shot up" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete shot" })
    ).not.toBeInTheDocument();
  });

  it("disables the still button while generating", () => {
    const statuses: ShotStatus[] = ["keyframe_generating", "clip_generating"];
    for (const status of statuses) {
      const { unmount } = renderCard(makeShot({ status }));
      expect(
        screen.getByRole("button", { name: /Generate still|New still/ })
      ).toBeDisabled();
      unmount();
    }
  });
});
