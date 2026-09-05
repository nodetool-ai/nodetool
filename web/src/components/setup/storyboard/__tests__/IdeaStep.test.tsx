/**
 * Step 1: the brief reaches the document as it is typed, the inspiration chips
 * come from the shipped boards, and the paths P5 owns are visibly off.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

jest.mock("../../../../hooks/useResolvedMediaUri");

const examples = [
  {
    slug: "first-light",
    name: "First Light",
    description: "A finished board to open and read.",
    logline: "A ten-second teaser for a desert trip.",
    tags: [],
    shotCount: 3,
    clipCount: 3,
    aspectRatio: "16:9",
    thumbnailUrl: null
  },
  {
    slug: "lighthouse-keeper",
    name: "Lighthouse Keeper",
    description: "Every shot already rendered.",
    logline: "Open a short film about the last keeper of a coastal light.",
    tags: [],
    shotCount: 4,
    clipCount: 4,
    aspectRatio: "16:9",
    thumbnailUrl: null
  },
  {
    slug: "sneaker-drop",
    name: "Sneaker Drop",
    description: "A working example the moment it installs.",
    logline: "Fifteen seconds for a running-shoe launch.",
    tags: [],
    shotCount: 3,
    clipCount: 3,
    aspectRatio: "9:16",
    thumbnailUrl: null
  },
  {
    slug: "fourth-board",
    name: "Fourth",
    description: "One more than the step offers.",
    logline: "A fourth idea nobody sees.",
    tags: [],
    shotCount: 1,
    clipCount: 0,
    aspectRatio: "16:9",
    thumbnailUrl: null
  }
];

jest.mock("../../../../hooks/storyboard/useStoryboards", () => ({
  useExampleStoryboards: () => ({ data: examples, isLoading: false })
}));

// The skill list is what `/` completion reads. Nothing in the flow may ask
// for it — see the `/` test below.
const useSkills = jest.fn(() => ({ data: [] }));
jest.mock("../../../../hooks/skills/useSkills", () => ({
  useSkills: () => useSkills()
}));

import mockTheme from "../../../../__mocks__/themeMock";
import { IdeaStep } from "../IdeaStep";
import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";

const BOARD = "board-idea";

const renderStep = () => {
  const onStartBlank = jest.fn();
  const onOpenTutorial = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <IdeaStep
        boardId={BOARD}
        onStartBlank={onStartBlank}
        onOpenTutorial={onOpenTutorial}
      />
    </ThemeProvider>
  );
  return { onStartBlank, onOpenTutorial };
};

const board = () => useStoryboardStore.getState().getBoard(BOARD);

beforeEach(() => {
  useSkills.mockClear();
  useStoryboardStore.setState({ boards: {} } as never);
  useStoryboardStore.getState().ensureBoard(BOARD);
});

describe("IdeaStep", () => {
  it("asks the question and shows the placeholder from Appendix A", () => {
    renderStep();

    expect(
      screen.getByRole("heading", { name: "What's your story?" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("We'll turn it into a screenplay and storyboard.")
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "One sentence is enough, or paste a full script."
      )
    ).toBeInTheDocument();
  });

  it("writes what is typed onto the board", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.type(screen.getByRole("textbox"), "A keeper loses the light.");

    expect(board()?.brief).toBe("A keeper loses the light.");
    expect(board()?.setupStage).toBe("done");
  });

  it("offers three example loglines and pastes the one picked", async () => {
    const user = userEvent.setup();
    renderStep();

    const chips = screen.getByRole("group", { name: "Inspiration" });
    expect(chips.textContent).toContain(
      "A ten-second teaser for a desert trip."
    );
    expect(chips.textContent).not.toContain("A fourth idea nobody sees.");

    await user.click(
      screen.getByText("Fifteen seconds for a running-shoe launch.")
    );

    expect(board()?.brief).toBe(
      "Fifteen seconds for a running-shoe launch."
    );
  });

  // `/` starts a skill on the New Project surface. Inside the flow the text is
  // a brief for the Director, so the trigger is off (PRD § 7.1).
  it("does not complete a skill on /", async () => {
    const user = userEvent.setup();
    renderStep();

    const textarea = screen.getByRole("textbox");
    await user.click(textarea);
    await user.keyboard("/");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(useSkills).not.toHaveBeenCalled();
    expect(board()?.brief).toBe("/");
  });

  it("offers blank and the tutorial, and holds upload and shotlist for P5", async () => {
    const user = userEvent.setup();
    const { onStartBlank, onOpenTutorial } = renderStep();

    const upload = screen.getByRole("button", { name: /Upload your file/ });
    expect(upload).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("button", { name: /Import your shotlist/ })
    ).toHaveAttribute("aria-disabled", "true");

    await user.click(upload);
    await user.click(
      screen.getByRole("button", { name: /Start with a blank storyboard/ })
    );
    await user.click(screen.getByRole("button", { name: /Take the tutorial/ }));

    expect(onStartBlank).toHaveBeenCalledTimes(1);
    expect(onOpenTutorial).toHaveBeenCalledTimes(1);
  });
});
