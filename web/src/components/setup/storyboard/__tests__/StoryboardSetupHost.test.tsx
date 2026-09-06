/**
 * "Change flow" hands back the brief the store holds (F3).
 *
 * Step 1's field writes locally and persists on a debounce, so the host has to
 * read the mounted document. Reading the server copy instead returned the
 * previous text — and the caller then deletes the only draft holding the new
 * one.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("../../../../hooks/storyboard/useStoryboardServerSync", () => ({
  useStoryboardServerSync: () => "ready"
}));
jest.mock("../../../../hooks/storyboard/useStoryboardAgentBridge", () => ({
  useStoryboardAgentBridge: () => {}
}));
jest.mock("../useStoryboardSetupFlow", () => ({
  useStoryboardSetupFlow: () => ({
    labels: { title: "Storyboard" },
    steps: [],
    stage: "idea",
    onStageChange: () => {}
  })
}));
jest.mock("../../SetupFlow", () => ({
  SetupFlow: ({ onChangeFlow }: { onChangeFlow?: () => void }) =>
    onChangeFlow ? (
      <button type="button" onClick={onChangeFlow}>
        Change flow
      </button>
    ) : (
      <span>no change control</span>
    )
}));

import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import StoryboardSetupHost from "../StoryboardSetupHost";

const BOARD_ID = "b1";

beforeEach(() => {
  useStoryboardStore.setState({ boards: {} });
  useStoryboardStore.getState().ensureBoard(BOARD_ID);
});

describe("StoryboardSetupHost", () => {
  it("hands the store's brief to onChangeFlow, not the server's", async () => {
    const onChangeFlow = jest.fn();
    const user = userEvent.setup();
    render(
      <StoryboardSetupHost
        boardId={BOARD_ID}
        onFinish={jest.fn()}
        onChangeFlow={onChangeFlow}
      />
    );

    // Typed after the last save landed — exactly the window the bug lived in.
    useStoryboardStore.getState().setBrief(BOARD_ID, "a lamp at night");
    await user.click(screen.getByRole("button", { name: "Change flow" }));

    expect(onChangeFlow).toHaveBeenCalledWith("a lamp at night");
  });

  it("shows no change control when the host offers none", () => {
    render(<StoryboardSetupHost boardId={BOARD_ID} onFinish={jest.fn()} />);

    expect(screen.getByText("no change control")).toBeInTheDocument();
  });
});
