import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material";
import mockTheme from "../../../__mocks__/themeMock";
import NodeTextPreview from "../NodeTextPreview";

const renderPreview = (onActivate: (caret: number | null) => void) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <NodeTextPreview
        value="a lighthouse at dusk"
        onActivate={onActivate}
        ariaLabel="Edit prompt"
        minRows={3}
        maxRows={3}
      />
    </ThemeProvider>
  );

describe("NodeTextPreview", () => {
  it("shows the text without a text field", () => {
    renderPreview(jest.fn());
    expect(screen.getByRole("button", { name: "Edit prompt" })).toHaveTextContent(
      "a lighthouse at dusk"
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("takes no canvas behavior classes", () => {
    renderPreview(jest.fn());
    const preview = screen.getByRole("button", { name: "Edit prompt" });
    expect(preview).not.toHaveClass("nowheel");
    expect(preview).not.toHaveClass("nodrag");
    expect(preview).not.toHaveClass("nopan");
  });

  it("asks to edit on click", async () => {
    const onActivate = jest.fn();
    renderPreview(onActivate);
    await userEvent.click(screen.getByRole("button", { name: "Edit prompt" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("asks to edit on Enter, with no caret offset", async () => {
    const onActivate = jest.fn();
    renderPreview(onActivate);
    screen.getByRole("button", { name: "Edit prompt" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalledWith(null);
  });
});
