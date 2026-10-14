import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const openTab = jest.fn();
const handleViewChange = jest.fn();
let activeProjectId: string | null = "p1";
let threads: Array<{
  id: string;
  user_id: string;
  project_id?: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}> = [];
let next: string | null = null;
const listThreads = jest.fn((input: { project_id: string; limit: number }) => ({
  data: { threads: threads.slice(0, input.limit), next }
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  LOOSE_PROJECT_ID: "default",
  useWorkspaceTabsStore: <T,>(
    selector: (state: {
      activeProjectId: string | null;
      personalProjectId: string | null;
      openTab: jest.Mock;
    }) => T
  ) => selector({ activeProjectId, personalProjectId: "personal", openTab })
}));

jest.mock("../../../stores/PanelStore", () => ({
  usePanelStore: <T,>(
    selector: (state: { handleViewChange: jest.Mock }) => T
  ) => selector({ handleViewChange })
}));

jest.mock("../../../trpc/client", () => ({
  trpc: {
    threads: {
      list: {
        useQuery: (input: { project_id: string; limit: number }) =>
          listThreads(input)
      }
    }
  }
}));

import RecentChats from "../RecentChats";

const thread = (id: string, title: string | null) => ({
  id,
  user_id: "u1",
  project_id: "p1",
  title,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

const renderChats = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <RecentChats />
    </ThemeProvider>
  );

describe("RecentChats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activeProjectId = "p1";
    threads = [];
    next = null;
  });

  it("renders nothing when the project has no chats", () => {
    const { container } = renderChats();
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the active project's latest chats and opens one as a tab", async () => {
    threads = [thread("t1", "Launch spot ideas"), thread("t2", null)];
    renderChats();

    expect(listThreads).toHaveBeenCalledWith({ project_id: "p1", limit: 4 });
    expect(
      screen.getByRole("region", { name: "Recent chats" })
    ).toBeInTheDocument();
    expect(screen.getByText("New chat")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Launch spot ideas"));
    expect(openTab).toHaveBeenCalledWith({
      type: "chat",
      ref: "t1",
      mode: "view",
      title: "Launch spot ideas",
      projectId: "p1"
    });
  });

  it("scopes the loose bucket to the personal project", () => {
    activeProjectId = "default";
    renderChats();
    expect(listThreads).toHaveBeenCalledWith({
      project_id: "personal",
      limit: 4
    });
  });

  it("offers the Chats panel only when more chats exist", async () => {
    threads = [thread("t1", "One")];
    const { rerender } = renderChats();
    expect(
      screen.queryByRole("button", { name: "All chats" })
    ).not.toBeInTheDocument();

    next = "t4";
    rerender(
      <ThemeProvider theme={mockTheme}>
        <RecentChats />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: "All chats" }));
    expect(handleViewChange).toHaveBeenCalledWith("chats");
  });
});
