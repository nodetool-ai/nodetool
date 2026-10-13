import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ProjectDocumentCard from "../ProjectDocumentCard";
import type { ProjectDocument } from "../projectStatus";

const name = "A very long project document title that cannot fit in a compact tile";
const document: ProjectDocument = {
  type: "storyboard",
  ref: "board-1",
  name,
  updatedAt: "",
  status: null,
  thumbnails: [],
  preview: null,
  spendUsd: 0,
  unpricedCount: 0
};

it("keeps the full title accessible while truncating its compact label", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectDocumentCard
        document={document}
        sourceProjectId="p1"
        onOpen={jest.fn()}
        compact
      />
    </ThemeProvider>
  );

  expect(screen.getByRole("button", { name })).toBeInTheDocument();
  const label = screen.getByTitle(name);
  expect(label).toHaveStyle({
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  });
});

const renderCard = (
  overrides: Partial<ProjectDocument> = {},
  onRename: jest.Mock | undefined = jest.fn(),
  onOpen = jest.fn()
) => {
  const card = { ...document, name: "Board", ...overrides };
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectDocumentCard
        document={card}
        sourceProjectId="p1"
        onOpen={onOpen}
        onRename={onRename}
        compact
      />
    </ThemeProvider>
  );
  return { card, onRename, onOpen };
};

it("renames the document from the card's context menu", async () => {
  const user = userEvent.setup();
  const { card, onRename, onOpen } = renderCard();

  fireEvent.contextMenu(screen.getByRole("button", { name: "Board" }), {
    clientX: 40,
    clientY: 40
  });
  await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
  const input = await screen.findByRole("textbox", { name: "Document name" });
  await waitFor(() => expect(input).toHaveFocus());
  await user.clear(input);
  await user.type(input, "Launch board{Enter}");

  expect(onRename).toHaveBeenCalledWith(card, "Launch board");
  expect(onOpen).not.toHaveBeenCalled();
});

it("keeps the name when Escape cancels a card rename", async () => {
  const user = userEvent.setup();
  const { onRename } = renderCard();

  fireEvent.contextMenu(screen.getByRole("button", { name: "Board" }));
  await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
  const input = await screen.findByRole("textbox", { name: "Document name" });
  await waitFor(() => expect(input).toHaveFocus());
  await user.type(input, "x{Escape}");

  expect(onRename).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Board" })).toBeInTheDocument();
});

it("offers no rename menu for a kind that cannot be renamed", () => {
  renderCard({ type: "game" });
  fireEvent.contextMenu(screen.getByRole("button", { name: "Board" }));
  expect(screen.queryByRole("menuitem", { name: "Rename" })).toBeNull();
});
