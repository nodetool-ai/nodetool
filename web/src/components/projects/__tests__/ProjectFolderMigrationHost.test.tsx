/**
 * The question asked once after the upgrade to project folders, and the one
 * progress surface that follows it (docs/project-folders/migration-ux.md).
 * The server decides every transition. These tests check what each state
 * shows and which request each control sends.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import type {
  ProjectFolderMigrationPlan,
  ProjectFolderMigrationStatus
} from "../../../hooks/useProjectFolderMigration";

let status: ProjectFolderMigrationStatus | undefined;
let planData: ProjectFolderMigrationPlan | undefined;
const readPlan = jest.fn();
const confirm = jest.fn();
const pause = jest.fn();
const resume = jest.fn();
const retry = jest.fn();
const dismiss = jest.fn();
const pickFolder = jest.fn();

const mutation = (mutate: jest.Mock) => ({ mutate, isPending: false, error: null });

jest.mock("../../../hooks/useProjectFolderMigration", () => ({
  useProjectFolderMigrationStatus: () => ({ data: status }),
  useProjectFolderMigrationPlan: () => ({
    mutate: readPlan,
    data: planData,
    isPending: false,
    error: null
  }),
  useConfirmProjectFolderMigration: () => mutation(confirm),
  usePauseProjectFolderMigration: () => mutation(pause),
  useResumeProjectFolderMigration: () => mutation(resume),
  useRetryProjectFolderMigration: () => mutation(retry),
  useDismissProjectFolderMigration: () => mutation(dismiss)
}));

jest.mock("../../workspaces/useFolderPicker", () => ({
  useFolderPicker: () => ({ pickFolder, dialog: null })
}));

import ProjectFolderMigrationHost from "../ProjectFolderMigrationHost";

const baseStatus = (
  fields: Partial<ProjectFolderMigrationStatus>
): ProjectFolderMigrationStatus => ({
  applies: true,
  state: "not_started",
  location: null,
  progress: { done: 0, total: 0, phase: null, current_project: null },
  failures: [],
  failure_count: 0,
  dismissed: false,
  ...fields
});

const basePlan = (
  fields: Partial<ProjectFolderMigrationPlan> = {}
): ProjectFolderMigrationPlan => ({
  projects: 3,
  assets: 120,
  workflows: 4,
  timelines: 0,
  extra_workspaces: [
    {
      project_id: "p1",
      project_name: "Aurora",
      kept: { id: "w1", name: "Footage", path: "/Users/me/Footage" },
      hidden: [{ id: "w2", name: "Cuts", path: "/Users/me/Cuts" }]
    }
  ],
  location: {
    path: "/Users/me/NodeTool",
    is_default: true,
    permission_prompt: false,
    error: null
  },
  ...fields
});

const renderHost = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectFolderMigrationHost />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  status = undefined;
  planData = undefined;
  delete (window as { api?: unknown }).api;
});

describe("ProjectFolderMigrationHost", () => {
  it("shows nothing where the server migrates without asking", () => {
    status = baseStatus({ applies: false, state: "done" });
    const { container } = renderHost();

    expect(container).toBeEmptyDOMElement();
    expect(readPlan).not.toHaveBeenCalled();
  });

  it("reads the plan, names the hidden workspaces, and starts only on confirm", async () => {
    status = baseStatus({ state: "not_started" });
    planData = basePlan();
    renderHost();

    expect(screen.getByRole("dialog", { name: /Move your projects into folders/ })).toBeInTheDocument();
    expect(readPlan).toHaveBeenCalledWith(undefined);
    expect(screen.getByText("Files to move")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    // A count of zero is left out.
    expect(screen.queryByText("Timelines saved as files")).not.toBeInTheDocument();
    expect(screen.getByText("Aurora keeps Footage")).toBeInTheDocument();
    expect(screen.getByText("No longer shown: Cuts (/Users/me/Cuts)")).toBeInTheDocument();
    expect(screen.getByText("/Users/me/NodeTool")).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Move files" }));

    expect(confirm).toHaveBeenCalledWith(undefined);
  });

  it("closes on Not now without confirming", async () => {
    status = baseStatus({ state: "plan_shown" });
    planData = basePlan();
    renderHost();

    await userEvent.click(screen.getByRole("button", { name: "Not now" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(confirm).not.toHaveBeenCalled();
  });

  it("checks a changed location, warns about macOS permission, and blocks a bad one", async () => {
    status = baseStatus({ state: "plan_shown" });
    planData = basePlan();
    pickFolder.mockResolvedValue("/Users/me/Documents/NodeTool");
    const { rerender } = renderHost();

    await userEvent.click(screen.getByRole("button", { name: "Change location" }));

    await waitFor(() =>
      expect(readPlan).toHaveBeenLastCalledWith({ location: "/Users/me/Documents/NodeTool" })
    );

    planData = basePlan({
      location: {
        path: "/Users/me/Documents/NodeTool",
        is_default: false,
        permission_prompt: true,
        error: null
      }
    });
    rerender(
      <ThemeProvider theme={mockTheme}>
        <ProjectFolderMigrationHost />
      </ThemeProvider>
    );
    expect(screen.getByText(/macOS will ask whether NodeTool may use this folder/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Move files" }));
    expect(confirm).toHaveBeenCalledWith({ location: "/Users/me/Documents/NodeTool" });

    planData = basePlan({
      location: {
        path: "/Users/me/Documents/NodeTool",
        is_default: false,
        permission_prompt: false,
        error: "The projects folder is not writable"
      }
    });
    rerender(
      <ThemeProvider theme={mockTheme}>
        <ProjectFolderMigrationHost />
      </ThemeProvider>
    );
    expect(
      screen.getByText("This location cannot be used: The projects folder is not writable")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move files" })).toBeDisabled();
  });

  it("shows progress and the current project, and pauses", async () => {
    status = baseStatus({
      state: "running",
      progress: { done: 30, total: 120, phase: "assets", current_project: "Aurora" }
    });
    renderHost();

    const region = screen.getByRole("region", { name: "Moving files into project folders" });
    expect(region).toHaveTextContent("30 of 120 files moved");
    expect(region).toHaveTextContent("Now moving the files of Aurora");

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(pause).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
  });

  it("resumes a paused move", async () => {
    status = baseStatus({
      state: "paused",
      progress: { done: 30, total: 120, phase: null, current_project: null }
    });
    renderHost();

    expect(screen.getByText("Moving files is paused")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));

    expect(resume).toHaveBeenCalled();
  });

  it("lists failures with a retry, says where the files are, reveals and closes", async () => {
    const showItemInFolder = jest.fn().mockResolvedValue(undefined);
    (window as { api?: unknown }).api = { showItemInFolder };
    status = baseStatus({
      state: "done",
      location: "/Users/me/NodeTool",
      progress: { done: 119, total: 120, phase: null, current_project: null },
      failure_count: 1,
      failures: [
        {
          kind: "asset",
          id: "a1",
          name: "fox.png",
          project_id: "p1",
          project_name: "Aurora",
          reason: "the stored bytes could not be read"
        }
      ]
    });
    renderHost();

    expect(screen.getByText("Files moved")).toBeInTheDocument();
    expect(screen.getByText("Your files are in /Users/me/NodeTool")).toBeInTheDocument();
    expect(
      screen.getByText("Aurora / fox.png: the stored bytes could not be read")
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();

    const reveal = screen
      .getAllByRole("button")
      .find((button) => /Reveal|Show in/.test(button.textContent ?? ""));
    expect(reveal).toBeDefined();
    if (reveal) await userEvent.click(reveal);
    expect(showItemInFolder).toHaveBeenCalledWith("/Users/me/NodeTool");

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dismiss).toHaveBeenCalled();
  });

  it("shows nothing once the finished move is closed", () => {
    status = baseStatus({ state: "done", dismissed: true });
    const { container } = renderHost();

    expect(container).toBeEmptyDOMElement();
  });
});
