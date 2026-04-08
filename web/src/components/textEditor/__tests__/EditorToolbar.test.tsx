import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import EditorToolbar from "../EditorToolbar";
import { createTheme, extendTheme } from "@mui/material/styles";

describe("EditorToolbar", () => {
  const renderWithTheme = (props: any = {}) => {
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

    // Material-UI Tooltip sets aria-label on the wrapper, while we explicitly set it on the button
    // This query matches both elements, so we use getAllByLabelText
    expect(screen.getAllByLabelText("Undo")[0]).toBeInTheDocument();
    expect(screen.getAllByLabelText("Redo")[0]).toBeInTheDocument();
    expect(screen.getAllByLabelText("Find & Replace")[0]).toBeInTheDocument();
    expect(screen.getAllByLabelText("Toggle Word Wrap")[0]).toBeInTheDocument();
    expect(screen.getAllByLabelText("Format as Code Block")[0]).toBeInTheDocument();
  });
});
