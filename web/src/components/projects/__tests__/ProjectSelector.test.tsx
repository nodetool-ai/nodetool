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
    { id: "personal:u1", name: "Personal", isPersonal: true },
    { id: "a", name: "Aurora", isPersonal: false },
    { id: "b", name: "Beacon", isPersonal: false }
  ],
  isPending: false,
  error: null
};

const documentsQuery = jest.fn();
const createProject = jest.fn();
jest.mock("../../../trpc/client", () => {
  const invalidate = { invalidate: jest.fn() };
  return {
  trpc: {
    useUtils: () => ({
      projects: {
        list: invalidate,
        archived: invalidate,
        summaries: invalidate,
        unassigned: invalidate,
        get: invalidate
      }
    }),
    projects: {
      list: { useQuery: () => ({ ...projects }) },
      create: {
        useMutation: () => ({ mutateAsync: createProject, isPending: false })
      }
    }
  },
  trpcClient: {
    projects: {
      documents: { query: (...args: unknown[]) => documentsQuery(...args) },
      restoreTabs: { query: async () => [] }
    }
  }
  };
});

import ProjectSelector from "../ProjectSelector";

const renderSelector = (inline = false, mobile = false) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectSelector inline={inline} mobile={mobile} />
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
    personalProjectId: null,
    projectSessions: {}
  });
});

describe("ProjectSelector", () => {
  it("switches projects while keeping the home surface open in inline mode", async () => {
    const user = userEvent.setup();
    renderSelector(true);
    await user.click(screen.getByRole("button", { name: "Selected project: Personal" }));
    await user.click(screen.getByRole("menuitem", { name: "Aurora" }));

    await waitFor(() => {
      expect(useWorkspaceTabsStore.getState().activeProjectId).toBe("a");
      expect(useWorkspaceTabsStore.getState().activeTabId).toBe("project-new:new");
    });
    expect(screen.getByRole("button", { name: "Selected project: Aurora" })).toBeInTheDocument();
  });

  it("opens and selects a project with the keyboard", async () => {
    const user = userEvent.setup();
    renderSelector();

    const trigger = screen.getByRole("button", {
      name: "Select project"
    });
    trigger.focus();
    await user.keyboard("{Enter}");

    const aurora = await screen.findByRole("menuitem", { name: "Aurora" });
    aurora.focus();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Select project" })
      ).toBeInTheDocument()
    );
    expect(documentsQuery).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: "Search projects" })
    ).not.toBeInTheDocument();
  });

  it("renders Personal once and selects its real project id", async () => {
    const user = userEvent.setup();
    renderSelector();
    await user.click(
      screen.getByRole("button", { name: "Select project" })
    );
    expect(screen.getAllByRole("menuitem", { name: /Personal/ })).toHaveLength(
      1
    );
    await user.click(screen.getByRole("menuitem", { name: /Personal/ }));
    expect(useWorkspaceTabsStore.getState().activeProjectId).toBe(
      "personal:u1"
    );
    expect(useWorkspaceTabsStore.getState().personalProjectId).toBe(
      "personal:u1"
    );
    expect(useWorkspaceTabsStore.getState().activeTabId).toBeNull();
  });

  it("names the project and offers its home in the mobile header", async () => {
    const user = userEvent.setup();
    useWorkspaceTabsStore.getState().setActiveProjectId("b");
    renderSelector(false, true);

    await user.click(
      screen.getByRole("button", { name: "Selected project: Beacon" })
    );
    await user.click(screen.getByRole("menuitem", { name: "Project home" }));

    expect(useWorkspaceTabsStore.getState().activeTabId).toBe(
      "project-new:new"
    );
  });

  it("labels the tab bar selector Project", () => {
    useWorkspaceTabsStore.getState().setActiveProjectId("b");
    renderSelector();

    expect(
      screen.getByRole("button", { name: "Select project" })
    ).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.queryByText("Beacon")).not.toBeInTheDocument();
  });

  it("names and creates a project from the selector menu, then opens its home", async () => {
    const user = userEvent.setup();
    createProject.mockResolvedValue({ id: "c", name: "Comet" });
    renderSelector();
    await user.click(
      screen.getByRole("button", { name: "Select project" })
    );
    await user.click(screen.getByRole("menuitem", { name: "New project" }));
    expect(
      screen.getByRole("button", { name: "Create project" })
    ).toBeDisabled();

    await user.type(screen.getByLabelText("Project name"), "  Comet {Enter}");

    expect(createProject).toHaveBeenCalledWith({ name: "Comet" });
    await waitFor(() => {
      expect(useWorkspaceTabsStore.getState().activeProjectId).toBe("c");
      expect(useWorkspaceTabsStore.getState().activeTabId).toBe("project-new:new");
    });
  });

  it("keeps the dialog open with the error when creating fails", async () => {
    const user = userEvent.setup();
    createProject.mockRejectedValue(new Error("offline"));
    renderSelector();
    await user.click(
      screen.getByRole("button", { name: "Select project" })
    );
    await user.click(screen.getByRole("menuitem", { name: "New project" }));
    await user.type(screen.getByLabelText("Project name"), "Comet");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(
      await screen.findByText("Could not create the project: offline")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toHaveValue("Comet");
    expect(useWorkspaceTabsStore.getState().activeTabId).toBeNull();
  });

  it("puts the compact new-project action above the project list", async () => {
    const user = userEvent.setup();
    renderSelector();
    await user.click(
      screen.getByRole("button", { name: "Select project" })
    );
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    const start = items.findIndex((text) => text?.includes("New project"));
    const personal = items.findIndex((text) => text?.includes("Personal"));
    expect(start).toBe(0);
    expect(personal).toBeGreaterThan(start);
    expect(screen.queryByText("Manage projects")).toBeNull();
  });
});
