import React from "react";
import { render, screen } from "@testing-library/react";
import { TextInput } from "../TextInput";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import userEvent from "@testing-library/user-event";

describe("TextInput", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    );
  };

  it("renders a text input", () => {
    renderWithTheme(<TextInput label="Name" />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("handles value changes", async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    renderWithTheme(
      <TextInput label="Email" onChange={handleChange} />
    );

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    expect(handleChange).toHaveBeenCalled();
  });

  it("shows error message", () => {
    renderWithTheme(
      <TextInput label="Email" errorMessage="Invalid email" />
    );
    expect(screen.getByText("Invalid email")).toBeInTheDocument();
  });

  it("shows helper text", () => {
    renderWithTheme(
      <TextInput label="Name" helperText="Enter your full name" />
    );
    expect(screen.getByText("Enter your full name")).toBeInTheDocument();
  });

  it("renders in compact mode", () => {
    renderWithTheme(<TextInput label="Compact" compact />);
    expect(screen.getByLabelText("Compact")).toBeInTheDocument();
  });

  it("renders as multiline", () => {
    renderWithTheme(
      <TextInput label="Notes" multiline rows={3} />
    );
    expect(screen.getByLabelText("Notes").tagName).toBe("TEXTAREA");
  });

  it("renders with placeholder", () => {
    renderWithTheme(
      <TextInput placeholder="Search..." />
    );
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("renders the label above the input, linked via htmlFor", () => {
    renderWithTheme(<TextInput label="Name" />);
    const input = screen.getByLabelText("Name");
    const label = document.querySelector("label");
    expect(label).not.toBeNull();
    expect(label).toHaveAttribute("for", input.id);
    expect(
      label!.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("uses a provided id for the input and label", () => {
    renderWithTheme(<TextInput label="Name" id="custom-id" />);
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("id", "custom-id");
    expect(document.querySelector("label")).toHaveAttribute(
      "for",
      "custom-id"
    );
  });

  it("keeps the accessible name when hideLabel is set", () => {
    renderWithTheme(<TextInput label="Search" hideLabel />);
    expect(document.querySelector("label")).toBeNull();
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
  });

  it("shows an asterisk on required labels", () => {
    renderWithTheme(<TextInput label="Email" required />);
    const label = document.querySelector("label");
    expect(label).toHaveTextContent("*");
    expect(screen.getByLabelText(/Email/)).toBeRequired();
  });
});
