import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../__mocks__/themeMock";

const navigate = jest.fn();
const createStoryboard = jest.fn(async () => ({ id: "b9" }));

jest.mock("react-router-dom", () => ({
  __esModule: true,
  useNavigate: () => navigate
}));

jest.mock("../StudioShell", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
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
  useCreateStoryboard: () => ({ mutateAsync: createStoryboard })
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
    createStoryboard.mockClear();
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

  // PRD § 6.1 and D24: Studio offers Storyboard, Video and Script — Image and
  // Workflow are workspace flows and are not here at all.
  it("offers three entry cards and names the phase behind each unbuilt one", async () => {
    renderHome();

    const cards = await screen.findByRole("group", {
      name: "What are you making?"
    });
    expect(
      within(cards)
        .getAllByRole("button")
        .map((card) => card.textContent)
    ).toEqual([
      "StoryboardFrom a sentence to a rendered board in three steps.",
      "VideoFrom a sentence to a cut on the timeline, no board.",
      "ScriptFrom a topic to voiced lines, ready to place."
    ]);

    const video = within(cards).getByRole("button", { name: /^Video / });
    expect(video).toHaveAttribute("aria-disabled", "true");
    expect(video).toHaveAttribute("title", "Video ships in phase P6.");

    const script = within(cards).getByRole("button", { name: /^Script / });
    expect(script).toHaveAttribute("aria-disabled", "true");
    expect(script).toHaveAttribute("title", "Script ships in phase P7.");

    expect(
      within(cards).getByRole("button", { name: /^Storyboard / })
    ).not.toHaveAttribute("aria-disabled");
  });

  it("creates a board at stage idea and opens it", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(
      await screen.findByRole("button", { name: /^Storyboard From a sentence/ })
    );

    await waitFor(() =>
      expect(createStoryboard).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({ setupStage: "idea", brief: "" })
        })
      )
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/studio/storyboard/b9")
    );
  });
});
