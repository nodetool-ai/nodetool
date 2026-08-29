/**
 * The project overview tab: what the project is made of and what it cost, and
 * that opening one of its documents keeps it inside the project's tab group.
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
      spendUsd: 4.12,
      unpricedCount: 1,
      thumbnails: []
    }
  ],
  spend: { totalUsd: 4.12, unpricedCount: 1, byCategory: [] }
};

jest.mock("../../../trpc/client", () => ({
  trpc: {
    projects: {
      get: { useQuery: () => ({ data: detail, isPending: false, error: null }) }
    }
  }
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
    // Once in the header, once on the board's own card.
    expect(screen.getAllByText("8 shots · stills 8/8")).toHaveLength(2);
    // The project total and the one document's share are the same figure here.
    expect(screen.getAllByText("$4.12 · 1 unpriced")).toHaveLength(2);
  });

  it("opens a document into the project's group", async () => {
    renderSurface();
    await userEvent.click(screen.getByLabelText("Board"));
    expect(openTab).toHaveBeenCalledWith({
      type: "storyboard",
      ref: "b1",
      title: "Board",
      projectId: "p1"
    });
  });
});
