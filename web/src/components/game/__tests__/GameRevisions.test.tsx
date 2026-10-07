import React from "react";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import GameRevisions from "../panels/revisions/GameRevisions";

it("F25 requires confirmation before restoring a revision or clearing draft undo history", async () => {
  const user = userEvent.setup();
  const onRestore = jest.fn(async () => undefined);
  render(<ThemeProvider theme={mockTheme}><GameRevisions busy={false} onRestore={onRestore}
    revisions={[{ revision: "a".repeat(32), modifiedAt: 0, current: false, message: "Earlier release" }]} /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Restore to draft" }));
  expect(onRestore).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toHaveTextContent("clears its undo history");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onRestore).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Restore to draft" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore to draft" }));
  expect(onRestore).toHaveBeenCalledWith("a".repeat(32));
});
