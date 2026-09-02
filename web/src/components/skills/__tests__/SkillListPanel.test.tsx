/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { SkillListItem } from "@nodetool-ai/protocol/api-schemas/skills.js";
import mockTheme from "../../../__mocks__/themeMock";

const mockUseSkills = jest.fn();
const mockOpenTab = jest.fn();

jest.mock("../../../hooks/skills/useSkills", () => ({
  useSkills: (options: unknown) => mockUseSkills(options),
  useCreateSkill: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateSkill: () => ({ mutate: jest.fn() }),
  useDeleteSkill: () => ({ mutate: jest.fn() })
}));

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: "/workspace" })
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: (selector: (state: unknown) => unknown) =>
    selector({ openTab: mockOpenTab, activeTabId: null, setTitle: jest.fn() })
}));

jest.mock("../../../stores/PanelStore", () => ({
  usePanelStore: (selector: (state: unknown) => unknown) =>
    selector({ setVisibility: jest.fn() })
}));

jest.mock("../../../trpc/client", () => ({
  trpc: { useUtils: () => ({ skills: { get: { fetch: jest.fn() } } }) }
}));

jest.mock("../../../hooks/useSidebarDocumentMenu", () => ({
  useSidebarDocumentMenu: () => jest.fn()
}));

import SkillListPanel from "../SkillListPanel";

const own: SkillListItem = {
  id: "skill-1",
  name: "my-notes",
  description: "How I take notes",
  updatedAt: "2026-01-01T00:00:00Z",
  system: false
};

const shipped: SkillListItem = {
  id: "system:motion-graphics",
  name: "motion-graphics",
  description: "Animate a NodeTool timeline",
  updatedAt: "",
  system: true
};

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <SkillListPanel />
    </ThemeProvider>
  );

describe("SkillListPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSkills.mockReturnValue({
      data: [own, shipped],
      isLoading: false,
      isError: false
    });
  });

  it("asks for the shipped skills as well as the user's own", () => {
    renderPanel();
    expect(mockUseSkills).toHaveBeenCalledWith({ includeSystem: true });
  });

  // The two kinds behave differently, so they have to look different. Without
  // the marker a shipped row reads as one the user wrote and could delete.
  it("marks a shipped skill and leaves the user's own unmarked", () => {
    renderPanel();
    expect(screen.getByText("motion-graphics")).toBeInTheDocument();
    expect(screen.getByText("my-notes")).toBeInTheDocument();
    expect(screen.getAllByText("Built in")).toHaveLength(1);
  });

  it("opens a shipped skill to read and the user's own to edit", async () => {
    renderPanel();
    await userEvent.click(screen.getByText("motion-graphics"));
    expect(mockOpenTab).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "system:motion-graphics", mode: "view" })
    );

    await userEvent.click(screen.getByText("my-notes"));
    expect(mockOpenTab).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "skill-1", mode: "edit" })
    );
  });
});
