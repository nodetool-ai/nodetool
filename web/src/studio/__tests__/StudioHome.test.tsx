import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../__mocks__/themeMock";

const navigate = jest.fn();
const start = jest.fn();

jest.mock("react-router-dom", () => ({
  __esModule: true,
  useNavigate: () => navigate
}));

jest.mock("../StudioShell", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

jest.mock("../useStudioPromptStart", () => ({
  __esModule: true,
  useStudioPromptStart: () => ({
    start,
    stage: "idle" as const,
    busy: false,
    error: null
  })
}));

jest.mock("../../hooks/storyboard/useStoryboards", () => ({
  __esModule: true,
  useStoryboards: () => ({
    data: [
      {
        id: "b1",
        name: "Tides",
        updatedAt: "2026-01-03T00:00:00.000Z",
        projectId: "default",
        shotCount: 6
      }
    ],
    isLoading: false
  }),
  useCreateStoryboard: () => ({ mutateAsync: jest.fn() })
}));

jest.mock("../../hooks/script/useScripts", () => ({
  __esModule: true,
  useScripts: () => ({
    data: [
      {
        id: "s1",
        name: "Tides script",
        updatedAt: "2026-01-04T00:00:00.000Z",
        projectId: "default",
        lineCount: 4
      }
    ],
    isLoading: false
  }),
  useCreateScript: () => ({ mutateAsync: jest.fn() })
}));

jest.mock("../../hooks/useTimelineSequence", () => ({
  __esModule: true,
  useTimelines: () => ({
    data: [
      {
        id: "t1",
        name: "Tides cut",
        updatedAt: "2026-01-05T00:00:00.000Z",
        projectId: "default"
      }
    ],
    isLoading: false
  })
}));

jest.mock("../../trpc/client", () => ({
  __esModule: true,
  trpcClient: {
    scripts: {
      get: {
        query: jest.fn().mockResolvedValue({
          id: "s1",
          storyboardId: "b1",
          timelineId: "t1"
        })
      }
    },
    storyboards: {
      get: {
        query: jest.fn().mockResolvedValue({
          id: "b1",
          document: { screenplay: { script_id: "s1" } },
          timelineId: "t1"
        })
      }
    }
  }
}));

import StudioHome from "../StudioHome";

const renderHome = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <StudioHome />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe("StudioHome", () => {
  beforeEach(() => {
    navigate.mockReset();
    start.mockReset();
    start.mockResolvedValue({ boardId: "b9", scriptId: "s9" });
  });

  it("shows one card for the linked script, board and timeline", async () => {
    renderHome();

    // Before the link queries settle every document stands alone.
    await waitFor(() =>
      expect(screen.getAllByTestId("studio-project-card")).toHaveLength(1)
    );
    const card = screen.getByTestId("studio-project-card");
    expect(card).toHaveTextContent("Tides");
    expect(
      within(card).getAllByRole("button").map((b) => b.textContent)
    ).toEqual(["Storyboard", "Script", "Video"]);
  });

  it("opens the document whose chip was clicked", async () => {
    const user = userEvent.setup();
    renderHome();

    await waitFor(() =>
      expect(screen.getAllByTestId("studio-project-card")).toHaveLength(1)
    );
    await user.click(
      within(screen.getByTestId("studio-project-card")).getByText("Video")
    );
    expect(navigate).toHaveBeenCalledWith("/studio/timeline/t1");
  });

  it("starts a linked project from a prompt and lands on the board", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(
      screen.getByLabelText("What is the video about?"),
      "a short film about tides"
    );
    await user.click(screen.getByRole("button", { name: "Make it" }));

    await waitFor(() =>
      expect(start).toHaveBeenCalledWith("a short film about tides")
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/studio/storyboard/b9")
    );
  });
});
