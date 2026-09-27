import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import mockTheme from "../../../__mocks__/themeMock";
import DashboardExampleGames from "../DashboardExampleGames";

const openTab = jest.fn();
const navigate = jest.fn();
const mutate = jest.fn();

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => navigate
}));
jest.mock("../../ui_primitives/ResponsiveImage", () => ({
  ResponsiveImage: ({ alt }: { alt: string }) => <img alt={alt} />
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

it("shows the game and opens an installed editable copy", async () => {
  mutate.mockImplementation((_input, callbacks) => callbacks.onSuccess({
    game: { id: "game-1", name: "Kindle", projectId: "project-1" }
  }));
  render(<MemoryRouter><ThemeProvider theme={mockTheme}><DashboardExampleGames /></ThemeProvider></MemoryRouter>);
  expect(screen.getByAltText("Kindle gameplay")).toBeInTheDocument();
  expect(screen.getByText("Arrows to run · Space to jump")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Play and edit" }));
  await waitFor(() => expect(openTab).toHaveBeenCalledWith({
    type: "game", ref: "game-1", title: "Kindle", projectId: "project-1"
  }));
  expect(mutate).toHaveBeenCalledWith({ slug: "kindle", projectId: "project-1" }, expect.any(Object));
  expect(navigate).toHaveBeenCalledWith("/workspace");
});
