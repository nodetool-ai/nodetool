import { render, screen } from "@testing-library/react";
import GameSurface from "../GameSurface";

jest.mock("../../game/GameEditor", () => ({
  __esModule: true,
  default: () => <div>Game editor</div>
}));
jest.mock("../../game/GamePlayerPage", () => ({
  SavedGamePlayer: ({ active }: { active: boolean }) => (
    <div>Game player {active ? "active" : "inactive"}</div>
  )
}));

it("shows the player in view mode and opens editing only when requested", () => {
  const view = render(<GameSurface refId="game-1" mode="view" active />);
  expect(screen.getByText("Game player active")).toBeInTheDocument();
  expect(screen.queryByText("Game editor")).not.toBeInTheDocument();
  view.rerender(<GameSurface refId="game-1" mode="view" active={false} />);
  expect(screen.getByText("Game player inactive")).toBeInTheDocument();
  view.rerender(<GameSurface refId="game-1" mode="edit" active />);
  expect(screen.getByText("Game editor")).toBeInTheDocument();
  expect(screen.queryByText(/Game player/)).not.toBeInTheDocument();
});
