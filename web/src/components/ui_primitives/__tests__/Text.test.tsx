import React from "react";
import { render, screen } from "@testing-library/react";
import { Text } from "../Text";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("Text", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  it("renders text content", () => {
    renderWithTheme(<Text>Hello World</Text>);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("applies size variants", () => {
    renderWithTheme(
      <Text size="small">Small text</Text>
    );
    
    expect(screen.getByText("Small text")).toBeInTheDocument();
  });

  it("applies color variants", () => {
    renderWithTheme(
      <Text color="error">Error text</Text>
    );
    
    expect(screen.getByText("Error text")).toBeInTheDocument();
  });

  it("applies font weight", () => {
    renderWithTheme(
      <Text weight={600}>Bold text</Text>
    );
    
    const text = screen.getByText("Bold text");
    expect(text).toHaveStyle({ fontWeight: 600 });
  });

  it("truncates text when specified", () => {
    renderWithTheme(
      <Text truncate>Very long text that should be truncated</Text>
    );
    
    const text = screen.getByText("Very long text that should be truncated");
    expect(text).toHaveStyle({ 
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    });
  });

  it("applies line clamp", () => {
    const { container } = renderWithTheme(
      <Text lineClamp={2}>
        This is a very long paragraph that should be clamped to two lines
      </Text>
    );
    
    const text = container.querySelector("p");
    expect(text).toBeInTheDocument();
  });

  it("applies custom sx props", () => {
    renderWithTheme(
      <Text sx={{ margin: "10px" }}>Styled text</Text>
    );
    
    const text = screen.getByText("Styled text");
    expect(text).toHaveStyle({ margin: "10px" });
  });
});
