import React from "react";
import { render, screen } from "@testing-library/react";
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

const renderCard = (shot: Shot) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotCard boardId="board-1" shot={shot} />
    </ThemeProvider>
  );

describe("ShotCard", () => {
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
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Generate clip" })
    ).toBeDisabled();
  });

  it("enables Approve once the keyframe is ready", () => {
    const shot = makeShot({
      status: "keyframe_ready",
      keyframe: { type: "image", uri: "http://example.com/still.png" }
    });
    renderCard(shot);
    // With a keyframe present, the still button offers a regenerate.
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Generate clip" })
    ).toBeDisabled();
  });

  it("enables Generate clip once the shot is approved", () => {
    const shot = makeShot({
      status: "approved",
      keyframe: { type: "image", uri: "http://example.com/still.png" }
    });
    renderCard(shot);
    expect(screen.getByRole("button", { name: "Generate clip" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("shows Revise clip only once a clip exists and prompts for an instruction", async () => {
    generateRevisedClipMock.mockClear();
    // No clip yet: the revise affordance is absent.
    const { unmount } = renderCard(makeShot({ status: "approved" }));
    expect(
      screen.queryByRole("button", { name: "Revise clip" })
    ).not.toBeInTheDocument();
    unmount();

    const shot = makeShot({
      status: "rendered",
      clip: { type: "video", uri: "http://example.com/clip.mp4" }
    });
    renderCard(shot);
    const reviseButton = screen.getByRole("button", { name: "Revise clip" });
    expect(reviseButton).toBeEnabled();

    const promptSpy = jest
      .spyOn(window, "prompt")
      .mockReturnValue("make it darker, add rain");
    await userEvent.click(reviseButton);
    expect(promptSpy).toHaveBeenCalled();
    expect(generateRevisedClipMock).toHaveBeenCalledWith(
      "board-1",
      shot,
      "make it darker, add rain"
    );
    promptSpy.mockRestore();
  });

  it("disables the still button while generating", () => {
    const statuses: ShotStatus[] = ["keyframe_generating", "clip_generating"];
    for (const status of statuses) {
      const { unmount } = renderCard(makeShot({ status }));
      expect(
        screen.getByRole("button", { name: /Generate still|Regenerate/ })
      ).toBeDisabled();
      unmount();
    }
  });
});
