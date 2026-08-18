import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import DashboardAgentSessions from "../DashboardAgentSessions";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { trpcClient } from "../../../trpc/client";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    threads: {
      list: { query: jest.fn() }
    }
  }
}));

const listQuery = trpcClient.threads.list.query as jest.Mock;

const thread = (id: string, title: string | null, updatedAt: string) => ({
  id,
  user_id: "u1",
  workflow_id: null,
  title,
  created_at: updatedAt,
  updated_at: updatedAt
});

const renderSessions = (onNewSession = jest.fn()) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <DashboardAgentSessions onNewSession={onNewSession} />
        </ThemeProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return { onNewSession };
};

describe("DashboardAgentSessions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists sessions newest first and opens one as a chat tab", async () => {
    const user = userEvent.setup();
    listQuery.mockResolvedValue({
      threads: [
        thread("t-old", "Older session", "2026-08-01T00:00:00Z"),
        thread("t-new", "Newest session", "2026-08-16T00:00:00Z")
      ]
    });
    renderSessions();

    const newest = await screen.findByRole("button", {
      name: /newest session/i
    });
    const older = screen.getByRole("button", { name: /older session/i });
    // Newest first: the newest row precedes the older one in the list.
    expect(
      newest.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await user.click(newest);
    const tabs = useWorkspaceTabsStore.getState().tabs;
    expect(tabs.some((t) => t.type === "chat" && t.ref === "t-new")).toBe(true);
  });

  it("falls back to a name for an untitled thread", async () => {
    listQuery.mockResolvedValue({
      threads: [thread("t1", null, "2026-08-16T00:00:00Z")]
    });
    renderSessions();

    expect(await screen.findByText("Untitled chat")).toBeInTheDocument();
  });

  it("offers to start a session when there are none", async () => {
    const user = userEvent.setup();
    listQuery.mockResolvedValue({ threads: [] });
    const { onNewSession } = renderSessions();

    await user.click(
      await screen.findByRole("button", { name: /start a session/i })
    );
    expect(onNewSession).toHaveBeenCalled();
  });
});
