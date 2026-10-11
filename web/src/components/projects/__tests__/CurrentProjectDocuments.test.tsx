import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const openTab = jest.fn();
let activeProjectId: string | null = "p1";
let personalProjectId: string | null = "personal";
let documentCount = 1;
const documentPage = jest.fn(
  (input: { id: string; offset: number; limit: number }) => {
    const all = Array.from({ length: documentCount }, (_, index) => ({
      type: "storyboard",
      ref: `${input.id}-board-${index + 1}`,
      name: `${input.id} board${documentCount > 1 ? ` ${index + 1}` : ""}`,
      thumbnails: [],
      preview: null
    }));
    return {
      data: {
        documents: all.slice(input.offset, input.offset + input.limit),
        total: all.length,
        partial: false
      },
      isPending: false,
      error: null
    };
  }
);
const prefetch = jest.fn();

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  LOOSE_PROJECT_ID: "default",
  useWorkspaceTabsStore: <T,>(
    selector: (state: {
      activeProjectId: string | null;
      personalProjectId: string | null;
      openTab: jest.Mock;
    }) => T
  ) => selector({ activeProjectId, personalProjectId, openTab })
}));

jest.mock("../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({ projects: { documentPage: { prefetch } } }),
    projects: {
      documentPage: {
        useQuery: (input: { id: string; offset: number; limit: number }) =>
          documentPage(input)
      }
    }
  }
}));

jest.mock("../ProjectDocumentCard", () => ({
  __esModule: true,
  default: ({
    document,
    onOpen,
    compact
  }: {
    document: { name: string };
    onOpen: (document: { name: string }) => void;
    compact: boolean;
  }) => (
    <button
      type="button"
      data-compact={compact}
      onClick={() => onOpen(document)}
    >
      {document.name}
    </button>
  )
}));

jest.mock("../ProjectSelector", () => ({
  __esModule: true,
  default: () => <button type="button">Switch project</button>
}));

import CurrentProjectDocuments from "../CurrentProjectDocuments";

const renderDocuments = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <CurrentProjectDocuments />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  activeProjectId = "p1";
  personalProjectId = "personal";
  documentCount = 1;
});

it("shows and opens documents from the active project", async () => {
  renderDocuments();
  expect(documentPage).toHaveBeenCalledWith({ id: "p1", offset: 0, limit: 4 });
  expect(screen.getByRole("button", { name: "Switch project" })).toBeInTheDocument();
  const document = screen.getByRole("button", { name: "p1 board" });
  expect(document).toHaveAttribute("data-compact", "true");
  await userEvent.click(document);
  expect(openTab).toHaveBeenCalledWith({
    type: "storyboard",
    ref: "p1-board-1",
    title: "p1 board",
    projectId: "p1"
  });
});

it("uses the personal project when no project is selected", () => {
  activeProjectId = null;
  renderDocuments();
  expect(documentPage).toHaveBeenCalledWith({
    id: "personal",
    offset: 0,
    limit: 4
  });
  expect(
    screen.getByRole("button", { name: "personal board" })
  ).toBeInTheDocument();
});

it("shows four documents per page and resets to the first page for another project", async () => {
  documentCount = 9;
  const { rerender } = renderDocuments();
  expect(screen.getAllByRole("button", { name: /p1 board/ })).toHaveLength(4);
  expect(screen.getByText("1–4 of 9")).toBeInTheDocument();
  // The next page is fetched ahead, so Next does not wait on the server.
  expect(prefetch).toHaveBeenCalledWith(
    { id: "p1", offset: 4, limit: 4 },
    expect.anything()
  );
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("button", { name: "p1 board 5" })
  ).toBeInTheDocument();
  expect(screen.getByText("5–8 of 9")).toBeInTheDocument();
  expect(documentPage).toHaveBeenLastCalledWith({
    id: "p1",
    offset: 4,
    limit: 4
  });
  activeProjectId = "p2";
  rerender(
    <ThemeProvider theme={mockTheme}>
      <CurrentProjectDocuments />
    </ThemeProvider>
  );
  expect(
    screen.getByRole("button", { name: "p2 board 1" })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "p2 board 5" })
  ).not.toBeInTheDocument();
  expect(screen.getByText("1–4 of 9")).toBeInTheDocument();
});

it("steps back to the last page when documents disappear", async () => {
  documentCount = 9;
  const { rerender } = renderDocuments();
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("9–9 of 9")).toBeInTheDocument();
  documentCount = 5;
  rerender(
    <ThemeProvider theme={mockTheme}>
      <CurrentProjectDocuments />
    </ThemeProvider>
  );
  expect(
    await screen.findByRole("button", { name: "p1 board 5" })
  ).toBeInTheDocument();
  expect(screen.getByText("5–5 of 5")).toBeInTheDocument();
});
