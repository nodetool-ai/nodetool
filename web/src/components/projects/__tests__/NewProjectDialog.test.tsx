/**
 * The new-project dialog: "Open folder" appears only on the desktop app
 * talking to a server that allows host folders, and opens the folder the
 * picker returns as a project.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";

let electron = true;
let canManage = true;
const openFolder = jest.fn();
const createProject = jest.fn();
const openProject = jest.fn(() => Promise.resolve(true));
const openNewProjectTab = jest.fn();
const pickFolder = jest.fn();

jest.mock("../../../lib/env", () => ({
  get isElectron() {
    return electron;
  }
}));

jest.mock("../../../hooks/useProjects", () => ({
  useCreateProject: () => ({ mutateAsync: createProject, isPending: false }),
  useOpenProjectFolder: () => ({ mutateAsync: openFolder, isPending: false }),
  useOpenProject: () => openProject,
  useOpenNewProjectTab: () => openNewProjectTab
}));

jest.mock("../../../hooks/useWorkspaces", () => ({
  useWorkspaces: () => ({ canManage })
}));

jest.mock("../../workspaces/useFolderPicker", () => ({
  useFolderPicker: () => ({ pickFolder, dialog: null })
}));

import NewProjectDialog from "../NewProjectDialog";

const onClose = jest.fn();

const renderDialog = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <NewProjectDialog open onClose={onClose} />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  electron = true;
  canManage = true;
});

describe("NewProjectDialog", () => {
  it("opens the picked folder as a project and opens it", async () => {
    const user = userEvent.setup();
    pickFolder.mockResolvedValue("/Users/me/Film");
    openFolder.mockResolvedValue({ id: "p1", name: "Film" });
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Open folder…" }));

    await waitFor(() => {
      expect(openFolder).toHaveBeenCalledWith({ path: "/Users/me/Film" });
    });
    expect(onClose).toHaveBeenCalled();
    expect(openProject).toHaveBeenCalledWith({ id: "p1", name: "Film" });
    expect(createProject).not.toHaveBeenCalled();
  });

  it("names the opened project after what was typed", async () => {
    const user = userEvent.setup();
    pickFolder.mockResolvedValue("/Users/me/raw");
    openFolder.mockResolvedValue({ id: "p1", name: "My Film" });
    renderDialog();

    await user.type(screen.getByLabelText("Project name"), "My Film");
    await user.click(screen.getByRole("button", { name: "Open folder…" }));

    await waitFor(() => {
      expect(openFolder).toHaveBeenCalledWith({
        path: "/Users/me/raw",
        name: "My Film"
      });
    });
  });

  it("does nothing when the picker is cancelled", async () => {
    const user = userEvent.setup();
    pickFolder.mockResolvedValue(null);
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Open folder…" }));

    await waitFor(() => expect(pickFolder).toHaveBeenCalled());
    expect(openFolder).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows why the server refused the folder", async () => {
    const user = userEvent.setup();
    pickFolder.mockResolvedValue("/Users/me/NodeTool/Aurora/renders");
    openFolder.mockRejectedValue(
      new Error('This folder is inside the folder of project "Aurora"')
    );
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Open folder…" }));

    expect(
      await screen.findByText(
        'Could not open the folder: This folder is inside the folder of project "Aurora"'
      )
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("states what a folder from another machine brings and what does not travel with it", () => {
    renderDialog();

    const note = screen.getByText(/do not travel with the folder/);
    expect(note).toHaveTextContent(
      "A folder copied from another machine opens with its workflows, timelines and assets."
    );
    for (const kind of [
      "Chats",
      "storyboards",
      "scripts",
      "sketches",
      "apps",
      "JS scripts"
    ]) {
      expect(note).toHaveTextContent(kind);
    }
  });

  it("has no Open folder entry on a production server", () => {
    canManage = false;
    renderDialog();

    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open folder…" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/do not travel with the folder/)
    ).not.toBeInTheDocument();
  });

  it("has no Open folder entry in a browser", () => {
    electron = false;
    renderDialog();

    expect(
      screen.queryByRole("button", { name: "Open folder…" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Choose…" })
    ).not.toBeInTheDocument();
  });

  it("creates the project in the projects folder by default", async () => {
    const user = userEvent.setup();
    createProject.mockResolvedValue({ id: "p1", name: "Film" });
    renderDialog();

    expect(screen.getByText("Projects folder")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Project name"), "Film");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({ name: "Film" });
    });
  });

  it("creates the project's folder in the location the user chose", async () => {
    const user = userEvent.setup();
    pickFolder.mockResolvedValue("/Volumes/Media/Clients");
    createProject.mockResolvedValue({ id: "p1", name: "Film" });
    renderDialog();

    await user.type(screen.getByLabelText("Project name"), "Film");
    await user.click(screen.getByRole("button", { name: "Choose…" }));
    expect(await screen.findByText("/Volumes/Media/Clients")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({
        name: "Film",
        location: "/Volumes/Media/Clients"
      });
    });
    expect(openFolder).not.toHaveBeenCalled();
  });

  it("goes back to the projects folder when the user resets the location", async () => {
    const user = userEvent.setup();
    pickFolder.mockResolvedValue("/Volumes/Media/Clients");
    createProject.mockResolvedValue({ id: "p1", name: "Film" });
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Choose…" }));
    await user.click(
      await screen.findByRole("button", { name: "Use projects folder" })
    );
    expect(screen.getByText("Projects folder")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Project name"), "Film");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({ name: "Film" });
    });
  });

  it("has no location choice on a production server", () => {
    canManage = false;
    renderDialog();

    expect(
      screen.queryByRole("button", { name: "Choose…" })
    ).not.toBeInTheDocument();
  });
});
