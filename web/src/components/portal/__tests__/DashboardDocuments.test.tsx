import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import DashboardDocuments from "../DashboardDocuments";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import {
  useRecentDocuments,
  type RecentDocument
} from "../../../hooks/useRecentDocuments";

jest.mock("../../../hooks/useRecentDocuments", () => ({
  ...jest.requireActual("../../../hooks/useRecentDocuments"),
  useRecentDocuments: jest.fn()
}));

const mockedDocuments = useRecentDocuments as jest.Mock;

const doc = (
  kind: RecentDocument["kind"],
  id: string,
  name: string,
  updatedAt: string,
  tabType: RecentDocument["tabType"]
): RecentDocument => ({
  key: `${kind}:${id}`,
  id,
  kind,
  name,
  updatedAt,
  tabType,
  thumbUrl: null
});

const DOCUMENTS: RecentDocument[] = [
  doc("timeline", "t1", "Trailer cut", "2026-08-16T00:00:00Z", "timeline"),
  doc("image", "i1", "poster.png", "2026-08-15T00:00:00Z", "image"),
  doc("app", "a1", "Note drafter", "2026-08-14T00:00:00Z", "application"),
  doc("script", "s1", "Voiceover", "2026-08-13T00:00:00Z", "script")
];

const renderDocuments = (documents = DOCUMENTS, isLoading = false) => {
  mockedDocuments.mockReturnValue({ documents, isLoading });
  return render(
    <MemoryRouter>
      <ThemeProvider theme={mockTheme}>
        <DashboardDocuments />
      </ThemeProvider>
    </MemoryRouter>
  );
};

describe("DashboardDocuments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
  });

  it("lists every document type in one feed", () => {
    renderDocuments();

    for (const name of [
      "Trailer cut",
      "poster.png",
      "Note drafter",
      "Voiceover"
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("opens a document in the workspace tab its type uses", async () => {
    const user = userEvent.setup();
    renderDocuments();

    await user.click(screen.getByRole("button", { name: /note drafter/i }));

    const { tabs } = useWorkspaceTabsStore.getState();
    expect(tabs).toEqual([
      expect.objectContaining({ type: "application", ref: "a1" })
    ]);
  });

  it("narrows the feed to one type when a chip is pressed", async () => {
    const user = userEvent.setup();
    renderDocuments();

    await user.click(screen.getByRole("button", { name: /^Images/ }));

    expect(screen.getByText("poster.png")).toBeInTheDocument();
    expect(screen.queryByText("Trailer cut")).not.toBeInTheDocument();
  });

  it("offers only the types the user actually has", () => {
    renderDocuments([doc("script", "s1", "Voiceover", "2026-08-13T00:00:00Z", "script")]);

    expect(screen.getByRole("button", { name: /^Scripts/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Storyboards/ })
    ).not.toBeInTheDocument();
  });

  it("filters by name and recovers from a search with no matches", async () => {
    const user = userEvent.setup();
    renderDocuments();

    await user.type(screen.getByLabelText("Search documents"), "trailer");
    expect(screen.getByText("Trailer cut")).toBeInTheDocument();
    expect(screen.queryByText("Voiceover")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search documents"));
    await user.type(screen.getByLabelText("Search documents"), "zzz");
    expect(screen.getByText(/No matching documents/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(screen.getByText("Voiceover")).toBeInTheDocument();
  });

  it("renders nothing when the user has no documents", () => {
    const { container } = renderDocuments([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the lists are still loading", () => {
    const { container } = renderDocuments(DOCUMENTS, true);

    expect(container).toBeEmptyDOMElement();
  });
});
