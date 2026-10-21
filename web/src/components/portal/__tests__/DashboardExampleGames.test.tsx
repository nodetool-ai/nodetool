import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import mockTheme from "../../../__mocks__/themeMock";
import DashboardExampleGames from "../DashboardExampleGames";
import useOnboardingStore from "../../../stores/OnboardingStore";

const openTab = jest.fn();
const navigate = jest.fn();
const mutate = jest.fn();

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => navigate
}));
jest.mock("../../ui_primitives/ResponsiveImage", () => ({
  ResponsiveImage: ({ alt, showSkeleton }: { alt: string; showSkeleton?: boolean }) => (
    <img alt={alt} data-skeleton={showSkeleton ? "true" : "false"} />
  )
}));
jest.mock("../../../hooks/useExampleGames", () => ({
  useExampleGames: () => ({ data: [{
    slug: "kindle",
    name: "Kindle",
    description: "A jump-and-run through a drowned temple.",
    controls: "Arrows to run · Space to jump",
    sceneCount: 2,
    assetCount: 31,
    posterUri: "package://nodetool-base/games/kindle/poster.jpg"
  }], isLoading: false, isError: false }),
  useInstallExampleGame: () => ({ mutate, isPending: false })
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "project-1",
  useWorkspaceTabsStore: <T,>(selector: (state: { openTab: typeof openTab }) => T) => selector({ openTab })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(selector: (state: { addNotification: typeof jest.fn }) => T) => selector({ addNotification: jest.fn() })
}));

it("shows the game and opens an installed copy in play mode", async () => {
  mutate.mockImplementation((_input, callbacks) => callbacks.onSuccess({
    game: { id: "game-1", name: "Kindle", projectId: "project-1" }
  }));
  render(<MemoryRouter><ThemeProvider theme={mockTheme}><DashboardExampleGames /></ThemeProvider></MemoryRouter>);
  expect(screen.getByAltText("Kindle gameplay")).toBeInTheDocument();
  expect(screen.getByText("Arrows to run · Space to jump")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Install game" }));
  await waitFor(() => expect(openTab).toHaveBeenCalledWith({
    type: "game", ref: "game-1", mode: "view", title: "Kindle", projectId: "project-1"
  }));
  expect(mutate).toHaveBeenCalledWith({ slug: "kindle", projectId: "project-1" }, expect.any(Object));
  expect(navigate).toHaveBeenCalledWith("/workspace");
});

it("shows a loading skeleton while a poster loads, not a black card", () => {
  render(<MemoryRouter><ThemeProvider theme={mockTheme}><DashboardExampleGames /></ThemeProvider></MemoryRouter>);
  expect(screen.getByAltText("Kindle gameplay")).toHaveAttribute("data-skeleton", "true");
});

it("opens a shipped game full page in a new tab without installing it", async () => {
  mutate.mockClear();
  useOnboardingStore.setState({ completedSteps: [] });
  const open = jest.spyOn(window, "open").mockReturnValue(null);
  render(<MemoryRouter><ThemeProvider theme={mockTheme}><DashboardExampleGames /></ThemeProvider></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Play" }));
  expect(open).toHaveBeenCalledWith("/game/example/kindle", "_blank", "noopener,noreferrer");
  open.mockRestore();
  // The cards stay on the page; nothing is embedded in place of them.
  expect(screen.getByText("Kindle")).toBeInTheDocument();
  expect(mutate).not.toHaveBeenCalled();
  // Playing an example ticks the checklist's examples step.
  expect(useOnboardingStore.getState().completedSteps).toContain(
    "keep-creating"
  );
});

it("offers Make a game only where the host passes the game flow", async () => {
  const onMakeGame = jest.fn();
  const { unmount } = render(<MemoryRouter><ThemeProvider theme={mockTheme}><DashboardExampleGames /></ThemeProvider></MemoryRouter>);
  expect(screen.queryByRole("button", { name: "Make a game" })).not.toBeInTheDocument();
  unmount();
  render(<MemoryRouter><ThemeProvider theme={mockTheme}><DashboardExampleGames onMakeGame={onMakeGame} /></ThemeProvider></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Make a game" }));
  expect(onMakeGame).toHaveBeenCalledTimes(1);
});
