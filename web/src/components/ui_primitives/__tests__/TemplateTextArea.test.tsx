import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { TemplateTextArea } from "../TemplateTextArea";

it("highlights placeholders while preserving the original editable text", () => {
  const value = "Animate {{title}} in {{color}}.\nKeep {ordinary braces}.";
  render(
    <ThemeProvider theme={mockTheme}>
      <TemplateTextArea label="Prompt" value={value} onChange={jest.fn()} />
    </ThemeProvider>
  );
  expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveValue(value);
  expect(
    screen.getByText("{{title}}", { selector: "mark" })
  ).toBeInTheDocument();
  expect(
    screen.getByText("{{color}}", { selector: "mark" })
  ).toBeInTheDocument();
  expect(
    screen.getByText("{{title}}", { selector: "mark" }).parentElement
  ).toHaveAttribute("aria-hidden", "true");
  expect(
    screen.queryByText("{ordinary braces}", { selector: "mark" })
  ).not.toBeInTheDocument();
});

it("updates the highlights as the template changes", () => {
  const view = (value: string) => (
    <ThemeProvider theme={mockTheme}>
      <TemplateTextArea label="Prompt" value={value} onChange={jest.fn()} />
    </ThemeProvider>
  );
  const { rerender } = render(view("Animate {{title}}"));
  rerender(view("Animate {{sku}}"));
  expect(
    screen.queryByText("{{title}}", { selector: "mark" })
  ).not.toBeInTheDocument();
  expect(screen.getByText("{{sku}}", { selector: "mark" })).toBeInTheDocument();
});
