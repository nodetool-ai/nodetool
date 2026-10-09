import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CommandMenuHost from "../CommandMenuHost";
import { useCommandMenuStore } from "../../../stores/CommandMenuStore";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { initKeyListeners } from "../../../stores/KeyPressedStore";
import { navigateTo } from "../../../lib/appNavigation";
import { useContextCommands } from "../../../hooks/useContextCommands";
import type { ContextCommand } from "../../../stores/CommandMenuStore";

const mockOpenProject = jest.fn();
const mockCreateWorkflow = jest.fn();

jest.mock("../../../lib/appNavigation", () => ({ navigateTo: jest.fn() }));
jest.mock("../../../lib/runtimeConfig", () => ({ isAuthRequired: () => false }));
jest.mock("../../../stores/useAuth", () => ({
  __esModule: true,
  default: (selector: (state: { state: string }) => unknown) => selector({ state: "logged_in" })
}));
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ currentWorkflowId: null, load: async () => ({ workflows: [{ id: "wf1", name: "Upscaler" }] }) })
}));
jest.mock("../../../hooks/useProjects", () => ({
  useProjects: () => ({ data: [{ id: "a", name: "Alpha", isPersonal: false }, { id: "b", name: "Beta", isPersonal: false }] }),
  useOpenProject: () => mockOpenProject
}));
jest.mock("../../workspace/newDocumentCatalog", () => ({
  TEXT_FILE_TEMPLATES: [],
  useNewDocumentCatalog: () => ({
    entries: [{ key: "workflow", label: "Workflow", menuLabel: "New workflow", type: "workflow", icon: null, create: mockCreateWorkflow }],
    createTextFile: jest.fn(),
    createBlankStoryboard: jest.fn(),
    installStoryboardExample: jest.fn(),
    creating: null
  })
}));
jest.mock("../../ui_primitives", () => ({
  Dialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) => (open ? <div role="dialog">{children}</div> : null)
}));

const renderHost = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CommandMenuHost />
    </QueryClientProvider>
  );

const pressCommandK = () =>
  act(() => {
    fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.keyUp(window, { key: "k", ctrlKey: true });
    fireEvent.keyUp(window, { key: "Control" });
  });

let releaseKeys: () => void;
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: jest.fn() });
  releaseKeys = initKeyListeners();
});
afterAll(() => releaseKeys());

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, "", "/workspace");
  useCommandMenuStore.setState({ open: false, editorClaims: 0, contextGroups: [] });
  useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null, activeProjectId: "a", projectSessions: {} });
  const store = useWorkspaceTabsStore.getState();
  store.openTab({ type: "text", ref: "notes", projectId: "a", title: "Notes" });
  store.openTab({ type: "timeline", ref: "cut", projectId: "a", title: "Rough Cut" });
});

it("opens on Ctrl+K outside the node editor and lists app-wide commands", async () => {
  renderHost();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  pressCommandK();
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /Notes/ })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Model Manager" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /Beta/ })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "New workflow" })).toBeInTheDocument();
  expect(await screen.findByRole("option", { name: "Upscaler" })).toBeInTheDocument();
});

it("opens while a text field has focus", async () => {
  renderHost();
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  act(() => {
    fireEvent.keyDown(input, { key: "Control", ctrlKey: true });
    fireEvent.keyDown(input, { key: "k", ctrlKey: true });
    fireEvent.keyUp(input, { key: "k", ctrlKey: true });
    fireEvent.keyUp(input, { key: "Control" });
  });
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  input.remove();
});

it("switches to an open tab and closes", async () => {
  renderHost();
  pressCommandK();
  await userEvent.click(await screen.findByRole("option", { name: /Notes/ }));
  expect(useWorkspaceTabsStore.getState().activeTabId).toBe("text:notes");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(navigateTo).not.toHaveBeenCalled();
});

it("leaves another route for the workspace when switching tabs", async () => {
  window.history.replaceState(null, "", "/studio");
  renderHost();
  pressCommandK();
  await userEvent.click(await screen.findByRole("option", { name: /Rough Cut/ }));
  expect(useWorkspaceTabsStore.getState().activeTabId).toBe("timeline:cut");
  expect(navigateTo).toHaveBeenCalledWith("/workspace");
});

it("opens an app page as a workspace tab", async () => {
  renderHost();
  pressCommandK();
  await userEvent.click(await screen.findByRole("option", { name: "Model Manager" }));
  expect(useWorkspaceTabsStore.getState().activeTabId).toBe("page:models");
});

it("switches project and creates documents", async () => {
  mockOpenProject.mockResolvedValue(true);
  renderHost();
  pressCommandK();
  await userEvent.click(await screen.findByRole("option", { name: /Beta/ }));
  expect(mockOpenProject).toHaveBeenCalledWith({ id: "b", name: "Beta" });
  pressCommandK();
  await userEvent.click(await screen.findByRole("option", { name: "New workflow" }));
  expect(mockCreateWorkflow).toHaveBeenCalledTimes(1);
});

it("leaves the menu to an active node editor that claims it", () => {
  renderHost();
  let release = () => {};
  act(() => {
    release = useCommandMenuStore.getState().claimForEditor();
  });
  pressCommandK();
  expect(useCommandMenuStore.getState().open).toBe(true);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  act(() => release());
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("toggles closed on a second Ctrl+K", async () => {
  renderHost();
  pressCommandK();
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  pressCommandK();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

const ViewCommands = ({
  heading,
  commands,
  active
}: {
  heading: string;
  commands: readonly ContextCommand[];
  active: boolean;
}) => {
  useContextCommands(heading, commands, active);
  return null;
};

it("lists the active view's commands, merges a heading, and drops them when the view goes inactive", async () => {
  const assemble = jest.fn();
  const undo = jest.fn();
  const surface = [{ id: "undo", label: "Undo", run: undo, shortcut: "Ctrl+Z" }];
  const pane = [{ id: "assemble", label: "Assemble Timeline", run: assemble }];
  const view = (active: boolean) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CommandMenuHost />
      <ViewCommands heading="Storyboard" commands={surface} active={active} />
      <ViewCommands heading="Storyboard" commands={pane} active={active} />
    </QueryClientProvider>
  );
  const { rerender } = render(view(true));
  pressCommandK();
  const group = await screen.findByRole("group", { name: "Storyboard" });
  expect(group).toHaveTextContent("UndoCtrl+Z");
  expect(group).toHaveTextContent("Assemble Timeline");
  expect(screen.getAllByRole("group", { name: "Storyboard" })).toHaveLength(1);

  await userEvent.click(screen.getByRole("option", { name: "Assemble Timeline" }));
  expect(assemble).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  rerender(view(false));
  pressCommandK();
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Storyboard" })).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /Undo/ })).not.toBeInTheDocument();
  expect(undo).not.toHaveBeenCalled();
});
