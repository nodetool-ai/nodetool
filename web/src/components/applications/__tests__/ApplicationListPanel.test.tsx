import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import mockTheme from "../../../__mocks__/themeMock";

interface MutateOptions {
  onError?: (error: { message: string; data?: { code: string } }) => void;
}

const createMutateAsync = jest.fn(async () => ({
  id: "app-new",
  name: "Untitled app"
}));
const updateMutate = jest.fn(
  (_input: unknown, _options?: MutateOptions) => undefined
);
const deleteMutate = jest.fn(
  (_input: unknown, _options?: MutateOptions) => undefined
);
const listInvalidate = jest.fn();
const getFetch = jest.fn(async () => ({
  id: "app-1",
  projectId: "default",
  name: "Poster maker",
  description: "Makes posters",
  document: { schemaVersion: 1, ui: { root: {}, content: [] } },
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z"
}));

const applications = [
  {
    id: "app-1",
    projectId: "default",
    name: "Poster maker",
    description: "",
    operationCount: 2,
    updatedAt: "2026-07-20T10:00:00.000Z"
  },
  {
    id: "app-2",
    projectId: "default",
    name: "Caption writer",
    description: "",
    operationCount: 1,
    updatedAt: "2026-07-19T10:00:00.000Z"
  }
];

jest.mock("../../../hooks/useApplications", () => ({
  ...jest.requireActual("../../../hooks/useApplications"),
  useApplications: () => ({
    data: applications,
    isLoading: false,
    isError: false,
    error: null
  }),
  useCreateApplication: () => ({
    mutateAsync: createMutateAsync,
    isPending: false
  }),
  useUpdateApplication: () => ({ mutate: updateMutate }),
  useDeleteApplication: () => ({ mutate: deleteMutate })
}));

const workflowsQuery = jest.fn(() => ({
  data: { workflows: [{ id: "wf-1", name: "Render poster" }] },
  isLoading: false
}));

jest.mock("../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      applications: {
        get: { fetch: getFetch },
        list: { invalidate: listInvalidate }
      }
    }),
    workflows: { list: { useQuery: () => workflowsQuery() } }
  }
}));

const openTab = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  tabId: (type: string, ref: string) => `${type}:${ref}`,
  useWorkspaceTabsStore: <T,>(
    selector: (s: { openTab: jest.Mock; activeTabId: string }) => T
  ) => selector({ openTab, activeTabId: "application:app-1" })
}));

import ApplicationListPanel, {
  CreateApplicationButton,
  CreateApplicationFromWorkflowButton
} from "../ApplicationListPanel";
import { useSidebarDocumentActionsStore } from "../../../stores/SidebarDocumentActionsStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { ContextMenuProvider } from "../../../providers/ContextMenuProvider";

const renderPanel = (ui: React.ReactElement) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MemoryRouter initialEntries={["/workspace"]}>
        <ContextMenuProvider>{ui}</ContextMenuProvider>
      </MemoryRouter>
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  useNotificationStore.getState().clearNotifications();
});

describe("ApplicationListPanel", () => {
  it("lists apps newest first with their operation count", () => {
    renderPanel(<ApplicationListPanel />);

    const items = screen.getAllByRole("button", { name: /maker|writer/ });
    expect(items[0]).toHaveTextContent("Poster maker");
    expect(items[0]).toHaveTextContent("2 operations");
    expect(items[1]).toHaveTextContent("1 operation");
  });

  it("marks the app open in the active tab as current", () => {
    renderPanel(<ApplicationListPanel />);

    expect(
      screen.getByRole("button", { name: /Poster maker/ })
    ).toHaveAttribute("aria-current", "page");
  });

  it("opens the app in a workspace tab when clicked", async () => {
    const user = userEvent.setup();
    renderPanel(<ApplicationListPanel />);

    await user.click(screen.getByRole("button", { name: /Caption writer/ }));

    expect(openTab).toHaveBeenCalledWith({
      type: "application",
      ref: "app-2",
      mode: "edit",
      title: "Caption writer"
    });
  });

  it("filters by name", async () => {
    const user = userEvent.setup();
    renderPanel(<ApplicationListPanel />);

    await user.type(screen.getByPlaceholderText("Search apps..."), "caption");

    expect(screen.queryByText("Poster maker")).not.toBeInTheDocument();
    expect(screen.getByText("Caption writer")).toBeInTheDocument();
  });

  it("duplicates an app from its stored document", async () => {
    renderPanel(<ApplicationListPanel />);

    await act(async () => {
      await useSidebarDocumentActionsStore
        .getState()
        .onDuplicate?.({ id: "app-1", name: "Poster maker" });
    });

    expect(getFetch).toHaveBeenCalledWith({ id: "app-1" });
    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith({
        name: "Poster maker (copy)",
        description: "Makes posters",
        projectId: "default",
        document: { schemaVersion: 1, ui: { root: {}, content: [] } }
      })
    );
  });

  it("reports a duplicate that fails", async () => {
    getFetch.mockRejectedValueOnce(new Error("Application not found"));
    renderPanel(<ApplicationListPanel />);

    await act(async () => {
      await useSidebarDocumentActionsStore
        .getState()
        .onDuplicate?.({ id: "app-1", name: "Poster maker" });
    });

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .notifications.some((n) =>
            n.content.includes('Could not duplicate "Poster maker"')
          )
      ).toBe(true)
    );
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("renames an app through the sidebar rename action", async () => {
    const user = userEvent.setup();
    renderPanel(<ApplicationListPanel />);

    act(() => {
      useSidebarDocumentActionsStore
        .getState()
        .onRename?.({ id: "app-1", name: "Poster maker" });
    });

    const input = await screen.findByLabelText("App name");
    await user.clear(input);
    await user.type(input, "Poster studio{Enter}");

    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: "app-1",
        name: "Poster studio",
        baseUpdatedAt: "2026-07-20T10:00:00.000Z"
      },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("tells the user when a rename lost the concurrency check", async () => {
    const user = userEvent.setup();
    updateMutate.mockImplementationOnce((_input, options) => {
      options?.onError?.({
        message: "Application was modified since last read",
        data: { code: "CONFLICT" }
      });
      return undefined;
    });
    renderPanel(<ApplicationListPanel />);

    act(() => {
      useSidebarDocumentActionsStore
        .getState()
        .onRename?.({ id: "app-1", name: "Poster maker" });
    });

    const input = await screen.findByLabelText("App name");
    await user.clear(input);
    await user.type(input, "Poster studio{Enter}");

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .notifications.some(
            (n) =>
              n.type === "error" &&
              n.content.includes("changed elsewhere") &&
              n.content.includes("Poster studio")
          )
      ).toBe(true)
    );
    expect(listInvalidate).toHaveBeenCalled();
  });

  it("reports a rename that failed for any other reason", async () => {
    const user = userEvent.setup();
    updateMutate.mockImplementationOnce((_input, options) => {
      options?.onError?.({ message: "Network down" });
      return undefined;
    });
    renderPanel(<ApplicationListPanel />);

    act(() => {
      useSidebarDocumentActionsStore
        .getState()
        .onRename?.({ id: "app-1", name: "Poster maker" });
    });

    const input = await screen.findByLabelText("App name");
    await user.clear(input);
    await user.type(input, "Poster studio{Enter}");

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .notifications.some((n) => n.content.includes("Network down"))
      ).toBe(true)
    );
  });

  it("reports a delete that the server rejects", async () => {
    const user = userEvent.setup();
    deleteMutate.mockImplementationOnce((_input, options) => {
      options?.onError?.({ message: "Application not found" });
      return undefined;
    });
    renderPanel(<ApplicationListPanel />);

    act(() => {
      useSidebarDocumentActionsStore
        .getState()
        .onDelete?.({ id: "app-1", name: "Poster maker" });
    });
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .notifications.some((n) =>
            n.content.includes('Could not delete "Poster maker"')
          )
      ).toBe(true)
    );
  });

  it("deletes only after the confirmation is accepted", async () => {
    const user = userEvent.setup();
    renderPanel(<ApplicationListPanel />);

    act(() => {
      useSidebarDocumentActionsStore
        .getState()
        .onDelete?.({ id: "app-1", name: "Poster maker" });
    });

    expect(deleteMutate).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(deleteMutate).toHaveBeenCalledWith(
      { id: "app-1" },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });
});

describe("CreateApplicationButton", () => {
  it("creates an app and opens its tab", async () => {
    const user = userEvent.setup();
    renderPanel(<CreateApplicationButton />);

    await user.click(screen.getByRole("button", { name: "New app" }));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith({
        name: "Untitled app",
        description: "",
        projectId: "default"
      })
    );
    await waitFor(() =>
      expect(openTab).toHaveBeenCalledWith(
        expect.objectContaining({ type: "application", ref: "app-new" })
      )
    );
  });
});

describe("CreateApplicationFromWorkflowButton", () => {
  it("imports the picked workflow's app document", async () => {
    const user = userEvent.setup();
    renderPanel(<CreateApplicationFromWorkflowButton />);

    await user.click(
      screen.getByRole("button", { name: "Create app from workflow" })
    );
    await user.click(await screen.findByRole("button", { name: "Render poster" }));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith({
        name: "Render poster",
        description: "",
        projectId: "default",
        fromWorkflowId: "wf-1"
      })
    );
  });
});
