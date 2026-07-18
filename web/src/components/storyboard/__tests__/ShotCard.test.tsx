import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot, ShotStatus } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

// Keep the card's generation hook and image ladder out of the render — this test
// only asserts the card's presentation and button gating, not generation.
jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: jest.fn(),
    generateClip: jest.fn()
  })
}));

jest.mock("../../node/ImageRefPreview", () => ({
  __esModule: true,
  default: ({ placeholder }: { placeholder?: React.ReactNode }) => (
    <div data-testid="image-preview">{placeholder}</div>
  )
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
