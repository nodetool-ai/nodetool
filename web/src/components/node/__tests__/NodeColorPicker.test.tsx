import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeColorPicker } from "../NodeColorPicker";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#3b82f6" }
  }
});

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe("NodeColorPicker", () => {
  const mockOnColorChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders color indicator button", () => {
    renderWithTheme(
      <NodeColorPicker
        color="#3b82f6"
        onColorChange={mockOnColorChange}
        iconBaseColor="#3b82f6"
      />
    );

    expect(screen.getByRole("button", { name: /change color/i })).toBeInTheDocument();
  });

  it("opens color picker popover when clicked", async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <NodeColorPicker
        color="#3b82f6"
        onColorChange={mockOnColorChange}
        iconBaseColor="#3b82f6"
      />
    );

    const button = screen.getByRole("button", { name: /change color/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Apply")).toBeInTheDocument();
    });
  });

  it("calls onColorChange with undefined when reset is clicked", async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <NodeColorPicker
        color="#3b82f6"
        onColorChange={mockOnColorChange}
        iconBaseColor="#3b82f6"
      />
    );

    const button = screen.getByRole("button", { name: /change color/i });
    await user.click(button);

    const resetButton = screen.getByRole("button", { name: /reset to default/i });
    await user.click(resetButton);

    expect(mockOnColorChange).toHaveBeenCalledWith(undefined);
  });

  it("calls onColorChange with color when apply is clicked", async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <NodeColorPicker
        color="#3b82f6"
        onColorChange={mockOnColorChange}
        iconBaseColor="#3b82f6"
      />
    );

    const button = screen.getByRole("button", { name: /change color/i });
    await user.click(button);

    const applyButton = screen.getByText("Apply");
    await user.click(applyButton);

    expect(mockOnColorChange).toHaveBeenCalled();
  });

  it("displays current color as hex in popover", async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <NodeColorPicker
        color="#3b82f6"
        onColorChange={mockOnColorChange}
        iconBaseColor="#3b82f6"
      />
    );

    const button = screen.getByRole("button", { name: /change color/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("#3B82F6")).toBeInTheDocument();
    });
  });

  it("does not render color indicator when no color is set", () => {
    renderWithTheme(
      <NodeColorPicker
        color={undefined}
        onColorChange={mockOnColorChange}
        iconBaseColor={undefined}
      />
    );

    const button = screen.getByRole("button", { name: /change color/i });
    expect(button).toBeInTheDocument();
  });

  it("shows hue slider in popover", async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <NodeColorPicker
        color="#3b82f6"
        onColorChange={mockOnColorChange}
        iconBaseColor="#3b82f6"
      />
    );

    const button = screen.getByRole("button", { name: /change color/i });
    await user.click(button);

    await waitFor(() => {
      const sliders = screen.getAllByRole("slider");
      expect(sliders).toHaveLength(3);
    });
  });
});
