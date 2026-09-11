/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const mockList = jest.fn();
const mockSearch = jest.fn();
const mockDelete = jest.fn();
const mockOpenTab = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      memories: {
        list: { invalidate: jest.fn() },
        search: { invalidate: jest.fn() }
      }
    }),
    memories: {
      list: {
        useQuery: (input: unknown, options: unknown) => mockList(input, options)
      },
      search: {
        useQuery: (input: unknown, options: unknown) =>
          mockSearch(input, options)
      },
      delete: { useMutation: () => ({ mutate: mockDelete, isPending: false }) }
    }
  }
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (selector: (state: unknown) => unknown) =>
    selector({ addNotification: jest.fn() })
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: (selector: (state: unknown) => unknown) =>
    selector({ openTab: mockOpenTab })
}));

import MemoryPage from "../MemoryPage";

const memory = (overrides: Record<string, unknown> = {}) => ({
  id: "mem-1",
  thread_id: "thread-1",
  kind: "note",
  title: "Brand palette",
  content: "The client signed off on the teal grade.",
  resources: [],
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-01T10:00:00Z",
  ...overrides
});

const renderPage = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MemoryPage />
    </ThemeProvider>
  );

describe("MemoryPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockList.mockReturnValue({
      data: { memories: [memory()] },
      isLoading: false
    });
    mockSearch.mockReturnValue({ data: undefined, isLoading: false });
  });

  // The page is the global view: it must not narrow to one conversation the
  // way the old chat rail did.
  it("lists memories from every conversation", () => {
    renderPage();
    expect(mockList).toHaveBeenCalledWith(
      { limit: 200 },
      expect.objectContaining({ enabled: true })
    );
    expect(mockList.mock.calls[0][0]).not.toHaveProperty("thread_id");
    expect(screen.getByText("Brand palette")).toBeInTheDocument();
  });

  it("shows an empty state when nothing is remembered", () => {
    mockList.mockReturnValue({ data: { memories: [] }, isLoading: false });
    renderPage();
    expect(screen.getByText("Nothing remembered yet")).toBeInTheDocument();
  });

  it("filters by kind once more than one kind is present", async () => {
    mockList.mockReturnValue({
      data: {
        memories: [
          memory(),
          memory({ id: "mem-2", kind: "decision", title: "Ship Friday" })
        ]
      },
      isLoading: false
    });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "decision" }));
    expect(screen.getByText("Ship Friday")).toBeInTheDocument();
    expect(screen.queryByText("Brand palette")).not.toBeInTheDocument();
  });

  it("deletes a memory only after the confirmation is accepted", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(mockDelete).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" })
    );
    expect(mockDelete).toHaveBeenCalledWith({ id: "mem-1" });
  });

  it("opens the conversation a memory was recorded in", async () => {
    renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: /open the conversation/i })
    );
    expect(mockOpenTab).toHaveBeenCalledWith({
      type: "chat",
      ref: "thread-1",
      mode: "view"
    });
  });
});
