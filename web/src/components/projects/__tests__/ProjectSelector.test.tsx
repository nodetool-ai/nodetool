/**
 * The selector is the top-level project boundary. These checks use the real
 * tab store so keyboard selection proves the selected scope changes before a
 * caller starts loading the project's saved session.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

const projects = {
  data: [
    { id: "a", name: "Aurora" },
    { id: "b", name: "Beacon" }
  ],
  isPending: false,
  error: null
};

const documentsQuery = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpc: {
    projects: {
      list: { useQuery: () => ({ ...projects }) }
    }
  },
  trpcClient: {
    projects: {
      documents: { query: (...args: unknown[]) => documentsQuery(...args) }
    }
  }
}));

jest.mock("../../timeline/ActivityIndicator", () => ({
  ActivityIndicator: () => null
}));

import ProjectSelector from "../ProjectSelector";

const renderSelector = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectSelector />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  documentsQuery.mockResolvedValue([
    { type: "script", ref: "a-script", name: "Aurora script" }
  ]);
  useWorkspaceTabsStore.setState({
    tabs: [],
    activeTabId: null,
    activeProjectId: null,
    projectSessions: {}
  });
});

describe("ProjectSelector", () => {
  it("opens and selects a project with the keyboard", async () => {
    const user = userEvent.setup();
    renderSelector();

    const trigger = screen.getByRole("button", {
      name: "Selected project: Personal"
    });
    trigger.focus();
    await user.keyboard("{Enter}");

    const aurora = await screen.findByRole("menuitem", { name: "Aurora" });
    aurora.focus();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Selected project: Aurora" })
      ).toBeInTheDocument()
    );
    expect(documentsQuery).toHaveBeenCalledWith({ id: "a" });
    expect(screen.queryByRole("textbox", { name: "Find a project" })).not.toBeInTheDocument();
  });

  it("keeps the selected project named above the tabs", () => {
    useWorkspaceTabsStore.getState().setActiveProjectId("b");
    renderSelector();

    expect(
      screen.getByRole("button", { name: "Selected project: Beacon" })
    ).toBeInTheDocument();
  });
});
