import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import mockTheme from "../../../__mocks__/themeMock";
import DashboardExampleTimelines from "../DashboardExampleTimelines";

const openTab = jest.fn();
const navigate = jest.fn();
const mutate = jest.fn();

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => navigate
}));
jest.mock("../../../hooks/useResolvedMediaUri", () => ({
  useResolvedMediaUri: () => ""
}));
jest.mock("../../../hooks/useTimelineSequence", () => ({
  useExampleTimelines: () => ({ data: [{
    slug: "serein",
    name: "Serein — The inbox that sorts itself",
    description: "A product launch film",
    durationMs: 26000,
    fps: 30,
    clipCount: 678,
    videoUri: "package://nodetool-base/timelines/serein/launch.mp4",
    posterUri: "package://nodetool-base/timelines/serein/poster.jpg"
  }], isLoading: false, isError: false }),
  useInstallExampleTimeline: () => ({ mutate, isPending: false })
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "project-1",
  useWorkspaceTabsStore: <T,>(selector: (state: { openTab: typeof openTab }) => T) => selector({ openTab })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(selector: (state: { addNotification: typeof jest.fn }) => T) => selector({ addNotification: jest.fn() })
}));

it("shows the film and opens an installed editable timeline", async () => {
  mutate.mockImplementation((_input, callbacks) => callbacks.onSuccess({
    id: "timeline-1", name: "Serein — The inbox that sorts itself", projectId: "project-1"
  }));
  render(<MemoryRouter><ThemeProvider theme={mockTheme}><DashboardExampleTimelines /></ThemeProvider></MemoryRouter>);
  expect(screen.getByLabelText("Serein — The inbox that sorts itself preview")).toBeInTheDocument();
  expect(screen.getByText("26 seconds · 678 editable clips · 30 fps")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Open editable timeline" }));
  await waitFor(() => expect(openTab).toHaveBeenCalledWith({
    type: "timeline", ref: "timeline-1", mode: "edit", title: "Serein — The inbox that sorts itself", projectId: "project-1"
  }));
  expect(mutate).toHaveBeenCalledWith({ slug: "serein", projectId: "project-1" }, expect.any(Object));
  expect(navigate).toHaveBeenCalledWith("/workspace");
});
