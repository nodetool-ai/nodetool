import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const useQuery = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpc: { storyboards: { get: { useQuery: (...args: unknown[]) => useQuery(...args) } } },
  trpcClient: {}
}));

import BoardLineageChip from "../BoardLineageChip";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

/** Answer each `storyboards.get` by id, so the chip's two queries differ. */
const boards = (rows: Record<string, unknown>): void => {
  useQuery.mockImplementation((input: unknown) => {
    const id = (input as { id: string }).id;
    return { data: rows[id] };
  });
};

const renderChip = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <BoardLineageChip boardId="copy" />
    </ThemeProvider>
  );

describe("BoardLineageChip", () => {
  beforeEach(() => {
    useQuery.mockReset();
    useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
  });

  it("renders nothing for a board authored directly", () => {
    boards({ copy: { id: "copy", name: "Courier", document: {} } });

    const { container } = renderChip();

    expect(container).toBeEmptyDOMElement();
  });

  it("names the template a recast board came from", () => {
    boards({
      copy: {
        id: "copy",
        name: "Courier — Kai",
        document: { templateId: "tpl" }
      },
      tpl: { id: "tpl", name: "Courier", document: {} }
    });

    renderChip();

    expect(screen.getByText("Recast from Courier")).toBeInTheDocument();
  });

  it("opens the template board when clicked", async () => {
    boards({
      copy: { id: "copy", name: "Copy", document: { templateId: "tpl" } },
      tpl: { id: "tpl", name: "Courier", document: {} }
    });

    renderChip();
    await userEvent.click(screen.getByText("Recast from Courier"));

    const tabs = useWorkspaceTabsStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({
      type: "storyboard",
      ref: "tpl",
      title: "Courier"
    });
  });
});
