import React from "react";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import GameRevisions from "../GameRevisions";

it("F25 requires confirmation before restoring a revision or clearing draft undo history", async () => {
  const onRestore = jest.fn(async () => undefined);
  render(<ThemeProvider theme={mockTheme}><GameRevisions busy={false} onRestore={onRestore}
    revisions={[{ revision: "a".repeat(32), modifiedAt: 0, current: false, message: "Earlier release" }]} /></ThemeProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Restore to draft" }));
  expect(onRestore).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toHaveTextContent("clears its undo history");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onRestore).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Restore to draft" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore to draft" }));
  expect(onRestore).toHaveBeenCalledWith("a".repeat(32));
});
