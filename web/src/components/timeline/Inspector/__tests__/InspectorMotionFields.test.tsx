import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { TextCommitField } from "../InspectorMotionFields";

describe("TextCommitField", () => {
  it("shows the stored value again when the commit is rejected", () => {
    const onCommit = jest.fn();
    render(<ThemeProvider theme={mockTheme}>
      <TextCommitField ariaLabel="Dash pattern" value="4 2" onCommit={onCommit} />
    </ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Dash pattern" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "not a pattern" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith("not a pattern");
    expect(input).toHaveValue("4 2");
  });

  it("shows the accepted value after a commit", () => {
    const Stateful = () => {
      const [value, setValue] = useState("4 2");
      return <TextCommitField ariaLabel="Dash pattern" value={value} onCommit={setValue} />;
    };
    render(<ThemeProvider theme={mockTheme}><Stateful /></ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Dash pattern" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "8 4" } });
    fireEvent.blur(input);

    expect(input).toHaveValue("8 4");
  });
});
