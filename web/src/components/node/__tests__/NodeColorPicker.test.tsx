import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { NodeColorPicker } from "../NodeColorPicker";

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe("NodeColorPicker", () => {
  const mockOnColorChange = jest.fn();

  beforeEach(() => {
    mockOnColorChange.mockClear();
  });

  it("renders color indicator button", () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor={undefined}
        onColorChange={mockOnColorChange}
      />
    );

    const button = screen.getByLabelText("Change node color");
    expect(button).toBeInTheDocument();
  });

  it("shows default icon when no color is set", () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor={undefined}
        onColorChange={mockOnColorChange}
      />
    );

    const button = screen.getByLabelText("Change node color");
    expect(button).toBeInTheDocument();
  });

  it("shows color when color is set", () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor="#EF4444"
        onColorChange={mockOnColorChange}
      />
    );

    const button = screen.getByLabelText("Change node color");
    expect(button).toBeInTheDocument();
  });

  it("opens color palette on click", async () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor={undefined}
        onColorChange={mockOnColorChange}
      />
    );

    const button = screen.getByLabelText("Change node color");
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Node Color")).toBeInTheDocument();
    });
  });

  it("calls onColorChange when color is selected", async () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor={undefined}
        onColorChange={mockOnColorChange}
      />
    );

    const button = screen.getByLabelText("Change node color");
    await userEvent.click(button);

    const redOption = screen.getByText("Red");
    await userEvent.click(redOption);

    expect(mockOnColorChange).toHaveBeenCalledWith("#EF4444");
  });

  it("closes palette after color selection", async () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor={undefined}
        onColorChange={mockOnColorChange}
      />
    );

    const button = screen.getByLabelText("Change node color");
    await userEvent.click(button);

    const redOption = screen.getByText("Red");
    await userEvent.click(redOption);

    await waitFor(() => {
      expect(screen.queryByText("Node Color")).not.toBeInTheDocument();
    });
  });

  it("disables button when disabled prop is true", () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor={undefined}
        onColorChange={mockOnColorChange}
        disabled={true}
      />
    );

    const button = screen.getByLabelText("Change node color");
    expect(button).toBeDisabled();
  });

  it("allows resetting to default color", async () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor="#EF4444"
        onColorChange={mockOnColorChange}
      />
    );

    const button = screen.getByLabelText("Change node color");
    await userEvent.click(button);

    const defaultOption = screen.getByText("Default");
    await userEvent.click(defaultOption);

    expect(mockOnColorChange).toHaveBeenCalledWith("");
  });
});
