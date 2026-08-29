/**
 * The project overview tab: the header's derived status and next step, the
 * document cards, the spend bar, and that opening a document keeps it inside
 * the project's tab group.
 *
 * The agent column is stubbed — it is a live chat surface with its own thread
 * hydration, covered by its own tests.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const detail = {
  project: {
    id: "p1",
    name: "Aurora",
    kind: "spot",
    threadId: null,
    createdAt: "",
    updatedAt: ""
  },
  documents: [
    {
      type: "storyboard",
      ref: "b1",
      name: "Board",
      updatedAt: "2026-08-29T00:00:00.000Z",
      status: { kind: "storyboard", shots: 8, stills: 8, clips: 6 },
      spendUsd: 3.88,
      unpricedCount: 1,
      thumbnails: [],
      preview: null
    },
    {
      type: "script",
      ref: "s1",
      name: "Script",
      updatedAt: "2026-08-28T00:00:00.000Z",
      status: { kind: "script", lines: 6, voiced: 5, stale: 1 },
      spendUsd: 0.19,
      unpricedCount: 0,
      thumbnails: [],
      preview: {
        kind: "script",
        lines: [
          { speaker: "VO", text: "Late is when ideas show up.", state: "voiced" },
          { speaker: "VO", text: "One touch.", state: "stale" }
        ]
      }
    }
  ],
  spend: {
    totalUsd: 4.07,
    unpricedCount: 1,
    byCategory: [
      { category: "stills", usd: 1.28, unpricedCount: 0 },
      { category: "clips", usd: 2.6, unpricedCount: 1 },
      { category: "voice", usd: 0.19, unpricedCount: 0 },
      { category: "pipeline", usd: 0, unpricedCount: 0 }
    ]
  }
};

jest.mock("../../../trpc/client", () => ({
  trpc: {
    projects: {
      get: { useQuery: () => ({ data: detail, isPending: false, error: null }) }
    }
  }
}));

jest.mock("../ProjectAgentPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="agent-panel" />
}));

const openTab = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(selector: (s: { openTab: jest.Mock }) => T) =>
    selector({ openTab })
}));

import ProjectOverviewSurface from "../ProjectOverviewSurface";

const renderSurface = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectOverviewSurface refId="p1" />
    </ThemeProvider>
  );

beforeEach(() => jest.clearAllMocks());

describe("ProjectOverviewSurface", () => {
  it("reports the derived status and a spend that names what was unpriced", () => {
    renderSurface();
    expect(screen.getByText("Aurora")).toBeInTheDocument();
    expect(
      screen.getByText("8 shots · stills 8/8 · voiced 5/6 · 1 stale")
    ).toBeInTheDocument();
    expect(screen.getByText("$4.07 · 1 unpriced")).toBeInTheDocument();
  });

  it("names the next step and opens the document that performs it", async () => {
    renderSurface();
    // Stills are complete, clips are not — the board is what is waiting.
    await userEvent.click(screen.getByRole("button", { name: "Render clips" }));
    expect(openTab).toHaveBeenCalledWith({
      type: "storyboard",
      ref: "b1",
      title: "Board",
      projectId: "p1"
    });
  });

  it("splits the spend bar by category and shows the unpriced calls", () => {
    renderSurface();
    expect(screen.getByText("stills $1.28")).toBeInTheDocument();
    expect(screen.getByText("clips $2.60")).toBeInTheDocument();
    expect(screen.getByText("unpriced 1 call")).toBeInTheDocument();
    // A category that spent nothing gets no segment rather than a zero one.
    expect(screen.queryByText("pipeline $0.00")).not.toBeInTheDocument();
  });

  it("opens a document into the project's group", async () => {
    renderSurface();
    await userEvent.click(screen.getByLabelText("Script"));
    expect(openTab).toHaveBeenCalledWith({
      type: "script",
      ref: "s1",
      title: "Script",
      projectId: "p1"
    });
  });

  it("draws a script card from its stored lines", () => {
    renderSurface();
    expect(screen.getByText("Late is when ideas show up.")).toBeInTheDocument();
    expect(screen.getByText("stale")).toBeInTheDocument();
  });
});
