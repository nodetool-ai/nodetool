import { render, screen } from "@testing-library/react";
import GameSurface from "../GameSurface";
import type { DocumentBarRender } from "../../ui_primitives";

jest.mock("../WorkspaceDocumentBar", () => ({
  __esModule: true,
  default: ({ tab }: { tab: { title: string } }) => (
    <div role="toolbar" aria-label={`${tab.title} document`} />
  )
}));
jest.mock("../../game/GameEditor", () => ({
  __esModule: true,
  default: ({ documentBar }: { documentBar?: DocumentBarRender }) => (
    <div>
      {documentBar?.({})}
      Game editor
    </div>
  )
}));
jest.mock("../../game/GamePlayerPage", () => ({
  SavedGamePlayer: ({ active }: { active: boolean }) => (
    <div>Game player {active ? "active" : "inactive"}</div>
  )
}));

const tab = {
  id: "game:game-1",
  type: "game" as const,
  ref: "game-1",
  mode: "view" as const,
  title: "Platformer"
};

it("shows the player in view mode and opens editing only when requested", () => {
  const view = render(<GameSurface refId="game-1" mode="view" active tab={tab} />);
  expect(screen.getByText("Game player active")).toBeInTheDocument();
  expect(screen.queryByText("Game editor")).not.toBeInTheDocument();
  view.rerender(<GameSurface refId="game-1" mode="view" active={false} tab={tab} />);
  expect(screen.getByText("Game player inactive")).toBeInTheDocument();
  view.rerender(<GameSurface refId="game-1" mode="edit" active tab={tab} />);
  expect(screen.getByText("Game editor")).toBeInTheDocument();
  expect(screen.queryByText(/Game player/)).not.toBeInTheDocument();
});

it("tops both modes with the game's document bar", () => {
  const view = render(<GameSurface refId="game-1" mode="view" active tab={tab} />);
  expect(screen.getByRole("toolbar", { name: "Platformer document" })).toBeInTheDocument();
  view.rerender(<GameSurface refId="game-1" mode="edit" active tab={tab} />);
  expect(screen.getByRole("toolbar", { name: "Platformer document" })).toBeInTheDocument();
});
