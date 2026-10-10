import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { NumericField } from "../NumericField";
import mockTheme from "../../../__mocks__/themeMock";

describe("NumericField", () => {
  it("commits typed values before applying limits on blur", () => {
    const onCommit = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <NumericField label="Segments" value={3} min={3} max={20} integer onCommit={onCommit} />
      </ThemeProvider>
    );

    const field = screen.getByRole("spinbutton", { name: "Segments" });
    fireEvent.change(field, { target: { value: "1" } });
    expect(onCommit).toHaveBeenLastCalledWith(1);
    fireEvent.blur(field);
    expect(onCommit).toHaveBeenLastCalledWith(3);
    expect(field).toHaveValue(3);
  });

  it("updates its buffer when an external value changes", () => {
    const onCommit = jest.fn();
    const view = render(
      <ThemeProvider theme={mockTheme}>
        <NumericField label="Position X" value={0} onCommit={onCommit} />
      </ThemeProvider>
    );
    view.rerender(
      <ThemeProvider theme={mockTheme}>
        <NumericField label="Position X" value={2.5} onCommit={onCommit} />
      </ThemeProvider>
    );
    expect(screen.getByRole("spinbutton", { name: "Position X" })).toHaveValue(2.5);
  });

  it("commits nothing when the field loses focus without an edit", () => {
    const onCommit = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <NumericField label="Scale X" value={0.00004} min={0.001} onCommit={onCommit} />
      </ThemeProvider>
    );

    const field = screen.getByRole("spinbutton", { name: "Scale X" });
    fireEvent.focus(field);
    fireEvent.blur(field);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
