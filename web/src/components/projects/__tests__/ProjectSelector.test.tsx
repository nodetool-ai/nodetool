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
const menuDocuments = {
  data: [
    {
      type: "timeline",
      ref: "t1",
      name: "Beacon cut",
      updatedAt: "2026-10-02T00:00:00Z"
    },
    {
      type: "script",
      ref: "s1",
      name: "Beacon voiceover",
      updatedAt: "2026-10-03T00:00:00Z"
    }
  ],
  isPending: false,
  error: null
};
const createProject = jest.fn();
const updateProject = jest.fn();
jest.mock("../../../trpc/client", () => {
  const invalidate = { invalidate: jest.fn() };
  return {
  trpc: {
    useUtils: () => ({
      projects: {
        list: { ...invalidate, setData: jest.fn() },
        archived: invalidate,
        summaries: invalidate,
        unassigned: invalidate,
        get: invalidate
      }
    }),
    projects: {
      list: { useQuery: () => ({ ...projects }) },
      documents: { useQuery: () => ({ ...menuDocuments }) },
      create: {
        useMutation: () => ({ mutateAsync: createProject, isPending: false })
      }
    }
  },
  trpcClient: {
    projects: {
      documents: { query: (...args: unknown[]) => documentsQuery(...args) },
      update: { mutate: (...args: unknown[]) => updateProject(...args) },
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

beforeAll(() => {
  // jsdom has no layout, so it leaves out the scroll methods.
  Element.prototype.scrollIntoView = jest.fn();
  Element.prototype.scrollTo = jest.fn();
});

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

  it("names the project in the app bar and opens its home on click", async () => {
    const user = userEvent.setup();
    useWorkspaceTabsStore.getState().setActiveProjectId("b");
    renderSelector();

    const home = screen.getByRole("button", {
      name: "Open project home: Beacon"
    });
    expect(home).toHaveTextContent("Beacon");
    await user.click(home);

    expect(useWorkspaceTabsStore.getState().activeTabId).toBe(
      "project-new:new"
    );
    expect(
      screen.getByRole("button", { name: "Open project home: Beacon" })
    ).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("names the app bar control Personal when no project is open", () => {
    renderSelector();

    expect(
      screen.getByRole("button", { name: "Open project home: Personal" })
    ).toBeInTheDocument();
  });

  it("renames the project on a double-click of its name", async () => {
    const user = userEvent.setup();
    updateProject.mockResolvedValue({
      id: "b",
      name: "Lighthouse",
      isPersonal: false
    });
    useWorkspaceTabsStore.getState().setActiveProjectId("b");
    renderSelector();

    await user.dblClick(
      screen.getByRole("button", { name: "Open project home: Beacon" })
    );
    const input = screen.getByRole("textbox", { name: "Project name" });
    await user.clear(input);
    await user.type(input, "Lighthouse{Enter}");

    expect(updateProject).toHaveBeenCalledWith({ id: "b", name: "Lighthouse" });
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

  it("lists the active project's documents in the menu and opens one", async () => {
    const user = userEvent.setup();
    useWorkspaceTabsStore.getState().setActiveProjectId("b");
    renderSelector();
    await user.click(screen.getByRole("button", { name: "Select project" }));

    const items = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent ?? "");
    const voiceover = items.findIndex((text) => text.includes("Beacon voiceover"));
    const cut = items.findIndex((text) => text.includes("Beacon cut"));
    expect(voiceover).toBeGreaterThanOrEqual(0);
    expect(voiceover).toBeLessThan(cut);

    const search = screen.getByRole("textbox", {
      name: "Search projects and documents"
    });
    // "b" starts "Beacon": the menu type-ahead must not move focus there.
    await user.type(search, "beacon cut");
    expect(search).toHaveFocus();
    expect(search).toHaveValue("beacon cut");
    expect(screen.getByRole("menu", { name: "Documents" })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Beacon voiceover/ })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /Beacon cut/ }));

    const state = useWorkspaceTabsStore.getState();
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    expect(active).toMatchObject({ type: "timeline", ref: "t1", projectId: "b" });
  });
});
