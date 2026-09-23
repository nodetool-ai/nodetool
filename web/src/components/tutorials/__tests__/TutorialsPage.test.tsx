import { stub } from "../../../test-utils/doubles";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import mockTheme from "../../../__mocks__/themeMock";
import TutorialsPage from "../TutorialsPage";
import { TUTORIALS } from "../tutorialsData";

const MAX_WIDTH_QUERY = /max-width/;
const mockStartGuidedFlow = jest.fn().mockResolvedValue(undefined);
const mockCreateNewThread = jest.fn().mockResolvedValue("thread-new");
const mockOpenTab = jest.fn();

jest.mock("../../workspace/useGuidedFlowStarters", () => ({
  useGuidedFlowStarters: () => ({
    starters: [
      { id: "image", start: mockStartGuidedFlow },
      { id: "script", start: mockStartGuidedFlow },
      { id: "storyboard", start: mockStartGuidedFlow },
      { id: "video", start: mockStartGuidedFlow },
      { id: "workflow", start: mockStartGuidedFlow }
    ],
    starting: null
  })
}));

jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: <T,>(selector: (state: { createNewThread: typeof mockCreateNewThread }) => T): T =>
    selector({ createNewThread: mockCreateNewThread })
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "project-1",
  useWorkspaceTabsStore: <T,>(selector: (state: { openTab: typeof mockOpenTab }) => T): T =>
    selector({ openTab: mockOpenTab })
}));

/** Drive MUI's useMediaQuery: only max-width queries match on "narrow". */
const setViewport = (narrow: boolean) => {
  window.matchMedia = jest.fn((query: string) => stub<MediaQueryList>({
    matches: narrow && MAX_WIDTH_QUERY.test(query),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }));
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={mockTheme}>
        <TutorialsPage />
      </ThemeProvider>
    </MemoryRouter>
  );

describe("TutorialsPage video loading", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    jest.clearAllMocks();
  });

  // The videos live on the docs site. Setting `src` on mount would fetch a
  // cross-origin file on every page load — including in CI, before the docs
  // site has published a newly added tutorial.
  it("requests no video until the viewer presses play", async () => {
    setViewport(false);
    const first = TUTORIALS[0];
    const { container } = renderPage();

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).toHaveAttribute("poster", first.poster);
    expect(video).not.toHaveAttribute("src");

    await userEvent.click(
      screen.getByRole("button", { name: `Play video: ${first.title}` })
    );

    expect(container.querySelector("video")).toHaveAttribute("src", first.video);
  });

  it("shows the task loop and opens the matching guided flow", async () => {
    setViewport(false);
    const first = TUTORIALS[0];
    const startingState = first.startingState;
    const task = first.task;
    const result = first.result;
    if (!startingState || !task || !result) {
      throw new Error("The first tutorial must expose a task loop");
    }
    renderPage();

    expect(screen.getByRole("heading", { name: "Try it yourself" })).toBeInTheDocument();
    expect(screen.getByText(startingState)).toBeInTheDocument();
    expect(screen.getByText(task)).toBeInTheDocument();
    expect(screen.getByText(result)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open task" }));

    expect(mockStartGuidedFlow).toHaveBeenCalledWith("project-1");
  });
});

describe("TutorialsPage responsive layout", () => {
  const originalMatchMedia = window.matchMedia;
  const second = TUTORIALS[1];

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    jest.restoreAllMocks();
  });

  it("stacks the list under the player and scrolls back up on select", async () => {
    setViewport(true);
    const scrollTo = jest.fn();
    Element.prototype.scrollTo = scrollTo;

    const { container } = renderPage();

    const body = container.querySelector(".tut-body");
    const main = container.querySelector(".tut-main");
    const sidebar = container.querySelector(".tut-sidebar");
    expect(body).toContainElement(main as HTMLElement);
    expect(body).toContainElement(sidebar as HTMLElement);

    await userEvent.click(
      screen.getByRole("button", { name: `Play tutorial: ${second.title}` })
    );

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(
      screen.getByRole("button", { name: `Play tutorial: ${second.title}` })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the two-column layout put on a wide viewport", async () => {
    setViewport(false);
    const scrollTo = jest.fn();
    Element.prototype.scrollTo = scrollTo;

    renderPage();

    await userEvent.click(
      screen.getByRole("button", { name: `Play tutorial: ${second.title}` })
    );

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
