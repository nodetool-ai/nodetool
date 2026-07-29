import React from "react";
import { render, screen } from "@testing-library/react";
import { FormField } from "../FormField";
import { TextInput } from "../TextInput";
import { SelectField } from "../SelectField";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("FormField", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    );
  };

  const options = [
    { value: "red", label: "Red" },
    { value: "blue", label: "Blue" }
  ] as const;

  it("renders exactly one label for a TextInput child, even when both pass one", () => {
    renderWithTheme(
      <FormField label="Name">
        <TextInput label="Name" />
      </FormField>
    );
    expect(document.querySelectorAll("label")).toHaveLength(1);
  });

  it("keeps the child's own label when FormField has none", () => {
    renderWithTheme(
      <FormField helperText="Pick a name">
        <TextInput label="Name" />
      </FormField>
    );
    // Suppressing here would leave the input with no accessible name.
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(document.querySelectorAll("label")).toHaveLength(1);
  });

  it("keeps a SelectField's own label when FormField has none", () => {
    renderWithTheme(
      <FormField helperText="Pick a color">
        <SelectField
          label="Color"
          value="red"
          onChange={jest.fn()}
          options={options}
        />
      </FormField>
    );
    expect(
      screen.getByRole("combobox", { name: "Color" })
    ).toBeInTheDocument();
    expect(screen.getByText("Color")).toBeInTheDocument();
  });

  it("links its label to the child input via htmlFor", () => {
    renderWithTheme(
      <FormField label="Name">
        <TextInput />
      </FormField>
    );
    const input = screen.getByLabelText("Name");
    expect(document.querySelector("label")).toHaveAttribute("for", input.id);
  });

  it("renders helper text with the fixed on-grid top margin", () => {
    renderWithTheme(
      <FormField label="Name" helperText="Your full name">
        <TextInput />
      </FormField>
    );
    expect(screen.getByText("Your full name")).toHaveStyle({
      marginTop: mockTheme.spacing(1)
    });
  });

  it("shows the error message instead of helper text", () => {
    renderWithTheme(
      <FormField label="Email" helperText="We never share it" error="Invalid email">
        <TextInput />
      </FormField>
    );
    expect(screen.getByText("Invalid email")).toBeInTheDocument();
    expect(screen.queryByText("We never share it")).not.toBeInTheDocument();
  });

  it("shows a single required asterisk", () => {
    renderWithTheme(
      <FormField label="Name" required>
        <TextInput label="Name" required />
      </FormField>
    );
    expect(screen.getAllByText("*")).toHaveLength(1);
    expect(screen.getByLabelText(/Name/)).toBeRequired();
  });

  it("keeps the label-control association in row layout", () => {
    renderWithTheme(
      <FormField label="Theme" direction="row" labelWidth={120}>
        <TextInput />
      </FormField>
    );
    const input = screen.getByLabelText("Theme");
    expect(document.querySelector("label")).toHaveAttribute("for", input.id);
  });

  it("still renders a child's own helperText", () => {
    renderWithTheme(
      <FormField label="Name">
        <TextInput helperText="from child" />
      </FormField>
    );
    expect(screen.getByText("from child")).toBeInTheDocument();
  });

  it("renders one visible label and still names a SelectField combobox", () => {
    renderWithTheme(
      <FormField label="Color">
        <SelectField
          label="Color"
          value="red"
          onChange={jest.fn()}
          options={options}
        />
      </FormField>
    );
    expect(document.querySelectorAll("label")).toHaveLength(1);
    expect(
      screen.getByRole("combobox", { name: "Color" })
    ).toBeInTheDocument();
  });
});
