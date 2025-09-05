import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CloseButton from "../CloseButton";

// Create a simple theme for testing
const theme = createTheme({
  palette: {
    c_gray5: "#888888",
    grey: {
      50: "#eee"
    }
  } as any,
  shape: { borderRadius: 4 },
  components: {
    MuiTooltip: {
      styleOverrides: {
        tooltip: {}
      }
    }
  }
});

// Add vars property directly to the theme object
(theme as any).vars = {
  palette: {
    grey: {
      0: "#000000",
      50: "#fafafa",
      100: "#f5f5f5",
      200: "#eeeeee",
      300: "#e0e0e0",
      400: "#bdbdbd",
      500: "#9e9e9e",
      600: "#757575",
      700: "#616161",
      800: "#424242",
      900: "#212121"
    }
  }
};

describe("CloseButton", () => {
  it("renders correctly", () => {
    const mockOnClick = jest.fn();

    render(
      <ThemeProvider theme={theme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("close-button");
  });

  it("applies custom className when provided", () => {
    const mockOnClick = jest.fn();
    const customClass = "custom-class";

    render(
      <ThemeProvider theme={theme}>
        <CloseButton className={customClass} onClick={mockOnClick} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toHaveClass("custom-class");
    expect(button).toHaveClass("close-button");
  });

  it("calls onClick when clicked", () => {
    const mockOnClick = jest.fn();

    render(
      <ThemeProvider theme={theme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });
});
