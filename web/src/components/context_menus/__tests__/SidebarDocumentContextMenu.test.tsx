/**
 * @jest-environment jsdom
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { ContextMenuProvider } from "../../../providers/ContextMenuProvider";
import { useContextMenuActions } from "../../../stores/ContextMenuStore";
import { useSidebarDocumentActionsStore } from "../../../stores/SidebarDocumentActionsStore";
import SidebarDocumentContextMenu from "../SidebarDocumentContextMenu";

type Payload = { id: string; name: string; readOnly?: boolean };

/** Opens the menu the way a list row does, then renders it. */
const Harness = ({ payload }: { payload: Payload }) => {
  const { openContextMenu } = useContextMenuActions();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          openContextMenu(
            "sidebar-document-context-menu",
            payload.id,
            10,
            20,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            payload
          )
        }
      >
        open
      </button>
      <SidebarDocumentContextMenu />
    </>
  );
};

const openOn = async (payload: Payload) => {
  useSidebarDocumentActionsStore.getState().setActions({
    onRename: jest.fn(),
    onDuplicate: jest.fn(),
    onDelete: jest.fn()
  });
  render(
    <ThemeProvider theme={mockTheme}>
      <ContextMenuProvider active>
        <Harness payload={payload} />
      </ContextMenuProvider>
    </ThemeProvider>
  );
  await userEvent.click(screen.getByRole("button", { name: "open" }));
};

describe("SidebarDocumentContextMenu", () => {
  afterEach(() => {
    act(() => {
      useSidebarDocumentActionsStore.getState().clearActions();
    });
  });

  it("offers rename, duplicate and delete on an ordinary document", async () => {
    await openOn({ id: "doc-1", name: "My doc" });
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  // A shipped skill has no row: the server refuses a rename and a delete, so
  // offering them would put two failing actions in the menu.
  it("offers duplicate alone on a read-only document", async () => {
    await openOn({
      id: "system:motion-graphics",
      name: "motion-graphics",
      readOnly: true
    });
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.queryByText("Rename")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });
});
