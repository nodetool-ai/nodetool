import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import mockTheme from "../../../__mocks__/themeMock";
import DashboardExampleStoryboards from "../DashboardExampleStoryboards";

const openTab = jest.fn();
const openForegroundTab = jest.fn();
const navigate = jest.fn();
const mutate = jest.fn();

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => navigate
}));
jest.mock("../../../hooks/storyboard/useStoryboards", () => ({
  useExampleStoryboards: () => ({
    data: [
      {
        slug: "bowl-time",
        name: "Bowl Time",
        description: "A dog hears the kibble hit the bowl.",
        shotCount: 5,
        thumbnailUrl: null,
        stillUrls: []
      }
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn()
  }),
  useInstallExampleStoryboard: () => ({ mutate, isPending: false })
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "personal:user-1",
  useWorkspaceTabsStore: <T,>(
    selector: (state: {
      openTab: typeof openTab;
      openForegroundTab: typeof openForegroundTab;
    }) => T
  ) => selector({ openTab, openForegroundTab })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(selector: (state: { addNotification: typeof jest.fn }) => T) =>
    selector({ addNotification: jest.fn() })
}));

it("opens an installed storyboard as a foreground tab in its own project", async () => {
  mutate.mockImplementation((_input, callbacks) =>
    callbacks.onSuccess({
      id: "board-1",
      name: "Bowl Time",
      projectId: "personal:user-1"
    })
  );
  render(
    <MemoryRouter>
      <ThemeProvider theme={mockTheme}>
        <DashboardExampleStoryboards />
      </ThemeProvider>
    </MemoryRouter>
  );
  await userEvent.click(screen.getByRole("button", { name: /Bowl Time/ }));
  await waitFor(() =>
    expect(openForegroundTab).toHaveBeenCalledWith({
      type: "storyboard",
      ref: "board-1",
      mode: "edit",
      title: "Bowl Time",
      projectId: "personal:user-1"
    })
  );
  expect(openTab).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith("/workspace");
});
