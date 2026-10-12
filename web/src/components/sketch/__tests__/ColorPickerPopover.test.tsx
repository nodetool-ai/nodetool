import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ColorPickerPopover from "../ColorPickerPopover";

const Harness = ({ onChange }: { onChange: (color: string) => void }) => {
  const [color, setColor] = useState("#ffffff");
  return (
    <ThemeProvider theme={mockTheme}>
      <ColorPickerPopover
        anchorEl={document.body}
        color={color}
        initialColor="#ffffff"
        onColorChange={(next) => {
          setColor(next);
          onChange(next);
        }}
        onClose={jest.fn()}
      />
    </ThemeProvider>
  );
};

it("applies a hex value typed one character at a time", async () => {
  const onChange = jest.fn();
  render(<Harness onChange={onChange} />);
  const field = screen.getByLabelText("Hex color");

  await userEvent.clear(field);
  await userEvent.type(field, "#ff0000");

  expect(field).toHaveValue("#ff0000");
  expect(onChange).toHaveBeenLastCalledWith(
    expect.stringMatching(/^(#ff0000|rgba?\(255, ?0, ?0(, ?1)?\))$/i)
  );
});
