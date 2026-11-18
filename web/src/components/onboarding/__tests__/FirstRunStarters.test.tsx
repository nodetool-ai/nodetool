import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { pinnedGameInspirationChip } from "@nodetool-ai/protocol";
import { readGameSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import mockTheme from "../../../__mocks__/themeMock";

const mockCreateStoryboard = jest.fn();
const mockCreateWorkflow = jest.fn();
const mockOpenTab = jest.fn();
const mockNoteStarter = jest.fn();
const mockNoteViewed = jest.fn();

jest.mock("../../../hooks/storyboard/useStoryboards", () => ({
  useCreateStoryboard: () => ({ mutateAsync: mockCreateStoryboard })
}));
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (select: (state: { create: typeof mockCreateWorkflow }) => unknown) =>
    select({ create: mockCreateWorkflow })
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "personal-project",
  useWorkspaceTabsStore: (select: (state: { openForegroundTab: typeof mockOpenTab }) => unknown) =>
    select({ openForegroundTab: mockOpenTab })
}));
jest.mock("../../../lib/analytics", () => ({
  noteStarterSelected: (...args: unknown[]) => mockNoteStarter(...args),
  noteFirstRunViewed: () => mockNoteViewed()
}));

import FirstRunStarters from "../FirstRunStarters";
import {
  FIRST_RUN_GAME_CHIP,
  FIRST_RUN_STORYBOARD_GENRE,
  FIRST_RUN_TEMPLATE
} from "../useFirstRunStarters";

const renderStarters = (onTryFirstTask = jest.fn()) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <FirstRunStarters onTryFirstTask={onTryFirstTask} />
    </ThemeProvider>
  );
  return onTryFirstTask;
};

describe("FirstRunStarters", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateStoryboard.mockResolvedValue({
      id: "board-1",
      name: "Storyboard a short film",
      projectId: "personal-project"
    });
    mockCreateWorkflow.mockResolvedValue({ id: "wf-1", name: "Copy" });
  });

  it("records the view once and sends the filled-in first task", async () => {
    const onTry = renderStarters();
    expect(mockNoteViewed).toHaveBeenCalledTimes(1);
    const prompt = screen.getByText(/three ideas for a 30-second video/);
    await userEvent.click(screen.getByRole("button", { name: "Send it" }));
    expect(onTry).toHaveBeenCalledWith(prompt.textContent);
    expect(mockNoteStarter).toHaveBeenCalledWith("first_task");
  });

  it("opens the storyboard on the screenplay step with a brief and a genre", async () => {
    renderStarters();
    await userEvent.click(screen.getByText("Storyboard a short film"));
    await waitFor(() => expect(mockOpenTab).toHaveBeenCalled());
    const { document } = mockCreateStoryboard.mock.calls[0][0];
    expect(document.setupStage).toBe("genre");
    expect(document.genre).toBe(FIRST_RUN_STORYBOARD_GENRE);
    expect(document.brief).toMatch(/lighthouse keeper/);
    expect(mockOpenTab).toHaveBeenCalledWith(
      expect.objectContaining({ type: "storyboard", ref: "board-1" })
    );
    expect(mockNoteStarter).toHaveBeenCalledWith("storyboard");
  });

  it("opens the game on the design step with a brief that has a pinned design", async () => {
    renderStarters();
    await userEvent.click(screen.getByText("Make a tiny game"));
    await waitFor(() => expect(mockOpenTab).toHaveBeenCalled());
    const request = mockCreateWorkflow.mock.calls[0][0];
    const setup = readGameSetup(request.settings);
    expect(setup?.stage).toBe("template");
    expect(pinnedGameInspirationChip(setup?.template ?? "", setup?.brief ?? "")).toBe(
      FIRST_RUN_GAME_CHIP
    );
  });

  it("copies the text-only template", async () => {
    renderStarters();
    await userEvent.click(screen.getByText("Run a template"));
    await waitFor(() => expect(mockOpenTab).toHaveBeenCalled());
    expect(mockCreateWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "personal-project" }),
      FIRST_RUN_TEMPLATE.packageName,
      FIRST_RUN_TEMPLATE.name
    );
  });
});
