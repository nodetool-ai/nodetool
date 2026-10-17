import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import userEvent from "@testing-library/user-event";
import mockTheme from "../../../__mocks__/themeMock";
import { TextArea } from "../TextArea";

jest.mock("../../text_assist/TextAssistButton", () => ({
  __esModule: true,
  default: () => (
    <button type="button" aria-label="Open the writing assistant" />
  )
}));

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);

describe("TextArea", () => {
  it("renders a multiline field that reports its text", async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    renderWithTheme(
      <TextArea label="Descriptor" value="" onChange={handleChange} />
    );

    const field = screen.getByLabelText("Descriptor");
    expect(field.tagName).toBe("TEXTAREA");
    await user.type(field, "a");
    expect(handleChange).toHaveBeenCalledWith("a");
  });

  it("shows the writing assistant by default", async () => {
    renderWithTheme(<TextArea label="Notes" value="" onChange={jest.fn()} />);

    expect(
      await screen.findByRole("button", { name: "Open the writing assistant" })
    ).toBeInTheDocument();
  });

  it("hides the writing assistant when assist is off or the field is disabled", () => {
    const { rerender } = renderWithTheme(
      <TextArea label="Notes" value="" onChange={jest.fn()} assist={false} />
    );
    expect(
      screen.queryByRole("button", { name: "Open the writing assistant" })
    ).not.toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <TextArea label="Notes" value="" onChange={jest.fn()} disabled />
      </ThemeProvider>
    );
    expect(
      screen.queryByRole("button", { name: "Open the writing assistant" })
    ).not.toBeInTheDocument();
  });

  it.each([
    ["inputProps", { inputProps: { readOnly: true } }],
    ["slotProps.input", { slotProps: { input: { readOnly: true } } }],
    ["slotProps.htmlInput", { slotProps: { htmlInput: { readOnly: true } } }]
  ])("hides the writing assistant on a field read-only through %s", (_, props) => {
    renderWithTheme(
      <TextArea label="Notes" value="" onChange={jest.fn()} {...props} />
    );
    expect(
      screen.queryByRole("button", { name: "Open the writing assistant" })
    ).not.toBeInTheDocument();
  });
});
