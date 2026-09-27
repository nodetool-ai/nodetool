import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { InspectorValueInput } from "../InspectorValueInput";

describe("InspectorValueInput", () => {
  it("commits typed values on blur and restores the external value after rejection", () => {
    const onCommit = jest.fn();
    render(<ThemeProvider theme={mockTheme}>
      <InspectorValueInput ariaLabel="Rotation" value="12" onCommit={onCommit} />
    </ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Rotation" });
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith("25");
    expect(input).toHaveValue("12");
  });

  it("does not commit an escaped draft", () => {
    const onCommit = jest.fn();
    render(<ThemeProvider theme={mockTheme}>
      <InspectorValueInput ariaLabel="Scale" value="1" onCommit={onCommit} />
    </ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Scale" });
    input.focus();
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input).toHaveValue("1");
    expect(input).not.toHaveFocus();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
