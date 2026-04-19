import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import EditorToolbar from "../EditorToolbar";
import { extendTheme } from "@mui/material/styles";

describe("EditorToolbar", () => {
  const renderWithTheme = (props: Partial<React.ComponentProps<typeof EditorToolbar>> = {}) => {
    const mockTheme = extendTheme({
      colorSchemes: {
        light: {
          palette: {
            background: { default: '#000000' },
            primary: { main: '#1976d2', light: '#42a5f5' },
            grey: { 100: '#f5f5f5', 300: '#e0e0e0', 600: '#757575' },
            common: { white: '#ffffff' }
          }
        }
      }
    });

    return render(
      <ThemeProvider theme={mockTheme}>
        <EditorToolbar {...props} />
      </ThemeProvider>
    );
  };

  it("has proper ARIA labels for accessibility", () => {
    renderWithTheme({ readOnly: false });

    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find & Replace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle Word Wrap" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Format as Code Block" })).toBeInTheDocument();
  });
});
