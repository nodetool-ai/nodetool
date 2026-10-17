import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { requestConfirm, useConfirmStore } from "../../../stores/ConfirmStore";
import ConfirmDialogHost from "../ConfirmDialogHost";

const renderHost = (): void => {
  render(
    <ThemeProvider theme={mockTheme}>
      <ConfirmDialogHost />
    </ThemeProvider>
  );
};

describe("ConfirmDialogHost", () => {
  beforeEach(() => useConfirmStore.setState({ pending: null }));

  it("renders nothing until something asks", () => {
    renderHost();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["Close anyway", true],
    ["Keep open", false]
  ])("clicking %s resolves the request with %s", async (button, expected) => {
    const user = userEvent.setup();
    renderHost();
    let answer: Promise<boolean> = Promise.resolve(!expected);
    act(() => {
      answer = requestConfirm({
        title: "Close document with unsaved changes?",
        content: "Unsaved changes may be lost.",
        confirmText: "Close anyway",
        cancelText: "Keep open"
      });
    });
    expect(
      screen.getByText("Close document with unsaved changes?")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: button }));
    await expect(answer).resolves.toBe(expected);
    expect(useConfirmStore.getState().pending).toBeNull();
  });
});
