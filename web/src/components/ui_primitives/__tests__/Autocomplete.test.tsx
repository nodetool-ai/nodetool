import React from "react";
import { render, screen } from "@testing-library/react";
import { Autocomplete } from "../Autocomplete";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import userEvent from "@testing-library/user-event";

const options = [
  { label: "Option 1", value: "1" },
  { label: "Option 2", value: "2" },
  { label: "Option 3", value: "3" },
];

describe("Autocomplete", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    );
  };

  it("renders with placeholder", () => {
    renderWithTheme(
      <Autocomplete options={options} placeholder="Search..." />
    );
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("renders with label", () => {
    renderWithTheme(
      <Autocomplete options={options} label="Choose option" />
    );
    expect(screen.getByLabelText("Choose option")).toBeInTheDocument();
  });

  it("shows options on focus", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <Autocomplete options={options} placeholder="Search..." />
    );

    const input = screen.getByPlaceholderText("Search...");
    await user.click(input);
    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.getByText("Option 2")).toBeInTheDocument();
  });

  it("filters options on type", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <Autocomplete options={options} placeholder="Search..." />
    );

    const input = screen.getByPlaceholderText("Search...");
    await user.type(input, "Option 1");
    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.queryByText("Option 2")).not.toBeInTheDocument();
  });

  it("renders in compact mode", () => {
    renderWithTheme(
      <Autocomplete options={options} placeholder="Compact" compact />
    );
    expect(screen.getByPlaceholderText("Compact")).toBeInTheDocument();
  });

  it("shows error state", () => {
    renderWithTheme(
      <Autocomplete
        options={options}
        label="Field"
        error
        helperText="Required field"
      />
    );
    expect(screen.getByText("Required field")).toBeInTheDocument();
  });
});
