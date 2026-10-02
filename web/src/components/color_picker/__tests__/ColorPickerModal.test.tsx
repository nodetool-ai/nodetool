import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ColorPickerModal from "../ColorPickerModal";

it("does not republish an unchanged color when a parent replaces its callback", () => {
  const first = jest.fn();
  const replacement = jest.fn();
  const view = (onChange: typeof first) => (
    <ThemeProvider theme={mockTheme}>
      <ColorPickerModal
        color="#1248AB"
        alpha={1}
        onChange={onChange}
        onClose={jest.fn()}
      />
    </ThemeProvider>
  );
  const { rerender } = render(view(first));
  expect(first).toHaveBeenCalledTimes(1);
  rerender(view(replacement));
  expect(replacement).not.toHaveBeenCalled();
});
