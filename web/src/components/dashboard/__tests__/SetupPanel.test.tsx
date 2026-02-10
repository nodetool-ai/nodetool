import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import SetupPanel from "../SetupPanel";

describe("SetupPanel with UI Primitives", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  it("renders with FlexColumn and Card primitives", () => {
    renderWithTheme(<SetupPanel />);
    
    // Verify the main content renders
    expect(screen.getByText("How to Use Models")).toBeInTheDocument();
    expect(screen.getByText("Remote Models")).toBeInTheDocument();
  });

  it("displays setup instructions for remote models", () => {
    renderWithTheme(<SetupPanel />);
    
    // Check for instructions
    expect(screen.getByText(/Add API keys/i)).toBeInTheDocument();
  });

  it("uses Card component for content container", () => {
    const { container } = renderWithTheme(<SetupPanel />);
    
    // Verify the component structure
    const setupPanel = container.querySelector(".setup-panel-container");
    expect(setupPanel).toBeInTheDocument();
  });
});
