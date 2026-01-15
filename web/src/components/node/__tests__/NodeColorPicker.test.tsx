import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import NodeColorPicker from "../NodeColorPicker";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("NodeColorPicker", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
  };

  const mockOnColorChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render color preview button", () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor="#EF4444"
        onColorChange={mockOnColorChange}
      />
    );

    const colorButton = screen.getByRole("button", { name: "Set node color" });
    expect(colorButton).toBeInTheDocument();
  });

  it("should show default palette icon when no color is set", () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor={undefined}
        onColorChange={mockOnColorChange}
      />
    );

    const colorButton = screen.getByRole("button", { name: "Set node color" });
    expect(colorButton).toBeInTheDocument();
  });

  it("should open color palette on click", async () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor="#EF4444"
        onColorChange={mockOnColorChange}
      />
    );

    const colorButton = screen.getByRole("button", { name: "Set node color" });
    fireEvent.click(colorButton);

    await waitFor(() => {
      expect(screen.getByText("Node Color")).toBeInTheDocument();
    });
  });

  it("should call onColorChange when a color is selected", async () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor="#EF4444"
        onColorChange={mockOnColorChange}
      />
    );

    const colorButton = screen.getByRole("button", { name: "Set node color" });
    fireEvent.click(colorButton);

    await waitFor(() => {
      expect(screen.getByText("Node Color")).toBeInTheDocument();
    });

    const redColorButton = screen.getByRole("button", { name: /#EF4444/i });
    fireEvent.click(redColorButton);

    expect(mockOnColorChange).toHaveBeenCalledWith("#EF4444");
  });

  it("should call onColorChange with null when no color is selected", async () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor="#EF4444"
        onColorChange={mockOnColorChange}
      />
    );

    const colorButton = screen.getByRole("button", { name: "Set node color" });
    fireEvent.click(colorButton);

    await waitFor(() => {
      expect(screen.getByText("Node Color")).toBeInTheDocument();
    });

    const noColorButton = screen.getByRole("button", { name: "Default color" });
    fireEvent.click(noColorButton);

    expect(mockOnColorChange).toHaveBeenCalledWith(null);
  });

  it("should close palette after color selection", async () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor="#EF4444"
        onColorChange={mockOnColorChange}
      />
    );

    const colorButton = screen.getByRole("button", { name: "Set node color" });
    fireEvent.click(colorButton);

    await waitFor(() => {
      expect(screen.getByText("Node Color")).toBeInTheDocument();
    });

    const redColorButton = screen.getByRole("button", { name: /#EF4444/i });
    fireEvent.click(redColorButton);

    await waitFor(() => {
      expect(screen.queryByText("Node Color")).not.toBeInTheDocument();
    });
  });

  it("should display multiple color options", async () => {
    renderWithTheme(
      <NodeColorPicker
        currentColor="#EF4444"
        onColorChange={mockOnColorChange}
      />
    );

    const colorButton = screen.getByRole("button", { name: "Set node color" });
    fireEvent.click(colorButton);

    await waitFor(() => {
      expect(screen.getByText("Node Color")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /#EF4444/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /#22C55E/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /#3B82F6/i })).toBeInTheDocument();
  });
});
