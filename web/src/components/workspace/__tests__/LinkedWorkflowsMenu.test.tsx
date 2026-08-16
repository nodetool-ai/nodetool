import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import type { LinkedWorkflow } from "../../../hooks/useApplications";

const links: { value: LinkedWorkflow[] } = { value: [] };
const useLinkedWorkflows = jest.fn((_id: string, _active?: boolean) => ({
  links: links.value,
  isLoading: false
}));

jest.mock("../../../hooks/useApplications", () => ({
  useLinkedWorkflows: (id: string, active?: boolean) =>
    useLinkedWorkflows(id, active)
}));

const openTab = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  tabId: (type: string, ref: string) => `${type}:${ref}`,
  useWorkspaceTabsStore: <T,>(selector: (s: unknown) => T) =>
    selector({ openTab, activeTabId: "application:app-1" })
}));

import LinkedWorkflowsMenu from "../LinkedWorkflowsMenu";

const link = (overrides: Partial<LinkedWorkflow>): LinkedWorkflow => ({
  workflowId: "wf-1",
  name: "Draft copy",
  operations: [{ id: "draft", name: "Draft" }],
  pinnedVersion: null,
  isPinned: false,
  isLoading: false,
  error: null,
  ...overrides
});

const renderMenu = (active = true) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <LinkedWorkflowsMenu applicationId="app-1" active={active} />
    </ThemeProvider>
  );

const openMenu = async () => {
  const user = userEvent.setup();
  renderMenu();
  await user.click(screen.getByRole("button", { name: /Linked workflows/ }));
  await waitFor(() =>
    expect(screen.getByRole("menu", { name: "Linked workflows" })).toBeInTheDocument()
  );
  return user;
};

beforeEach(() => {
  jest.clearAllMocks();
  links.value = [];
});

describe("LinkedWorkflowsMenu", () => {
  it("lists each linked workflow with the operations using it", async () => {
    links.value = [
      link({
        operations: [
          { id: "draft", name: "Draft" },
          { id: "refine", name: "Refine" }
        ]
      }),
      link({ workflowId: "wf-2", name: "Caption", operations: [] })
    ];
    await openMenu();

    expect(screen.getByText("Draft copy")).toBeInTheDocument();
    expect(screen.getByText("Used by Draft, Refine")).toBeInTheDocument();
    expect(screen.getByText("Bound to no operation")).toBeInTheDocument();
  });

  it("marks a workflow the release pinned", async () => {
    links.value = [link({ isPinned: true, pinnedVersion: 4 })];
    await openMenu();

    expect(screen.getByText("Pinned v4")).toBeInTheDocument();
  });

  it("opens a workflow tab when one is picked", async () => {
    links.value = [link({})];
    const user = await openMenu();

    await user.click(screen.getByRole("menuitem", { name: /Draft copy/ }));

    expect(openTab).toHaveBeenCalledWith({
      type: "workflow",
      ref: "wf-1",
      mode: "edit",
      title: "Draft copy"
    });
  });

  it("renders a deleted workflow as an error instead of crashing", async () => {
    links.value = [link({ error: new Error("Workflow not found") })];
    await openMenu();

    expect(screen.getByText("Workflow unavailable")).toBeInTheDocument();
    expect(screen.getByText("wf-1 — Workflow not found")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Workflow unavailable/ })
    ).toHaveAttribute("aria-disabled", "true");
    expect(openTab).not.toHaveBeenCalled();
  });

  it("passes the tab's focus through so a background app fetches nothing", () => {
    renderMenu(false);

    expect(useLinkedWorkflows).toHaveBeenCalledWith("app-1", false);
  });
});
