import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggleButtonInternal } from "../ThemeToggleButton";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const mockSetMode = jest.fn();
jest.mock("@mui/material/styles", () => {
  const actual = jest.requireActual("@mui/material/styles");
  return {
    ...actual,
    useColorScheme: () => ({
      mode: "light",
      setMode: mockSetMode,
    }),
  };
});

const theme = createTheme({
  cssVariables: true,
  colorSchemes: {
    light: {
      palette: {
        text: { primary: "#000", secondary: "#666" },
        action: { hover: "#eee" },
      }
    },
    dark: {
      palette: {
        text: { primary: "#fff", secondary: "#aaa" },
        action: { hover: "#333" },
      }
    }
  }
});

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe("ThemeToggleButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adds aria-label to Switch when variant is switch", () => {
    renderWithTheme(<ThemeToggleButtonInternal variant="switch" />);
    const switchElement = screen.getByRole("switch");
    expect(switchElement).toHaveAttribute("aria-label", "Switch to dark mode");
  });

  it("calls setMode when clicked", () => {
    renderWithTheme(<ThemeToggleButtonInternal variant="switch" />);
    const switchElement = screen.getByRole("switch");
    fireEvent.click(switchElement);
    expect(mockSetMode).toHaveBeenCalledWith("dark");
  });
});
