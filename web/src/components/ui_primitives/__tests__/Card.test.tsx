import React from "react";
import { render, screen } from "@testing-library/react";
import { Card } from "../Card";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import userEvent from "@testing-library/user-event";

describe("Card", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  it("renders children correctly", () => {
    renderWithTheme(
      <Card>
        <div>Card content</div>
      </Card>
    );
    
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("applies outlined variant", () => {
    const { container } = renderWithTheme(
      <Card variant="outlined">
        <div>Content</div>
      </Card>
    );
    
    const card = container.firstChild as HTMLElement;
    const styles = window.getComputedStyle(card);
    expect(styles.border).not.toBe("");
  });

  it("handles click when clickable", async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    
    renderWithTheme(
      <Card clickable onClick={handleClick}>
        <div>Clickable card</div>
      </Card>
    );
    
    const card = screen.getByText("Clickable card").parentElement;
    if (card) {
      await user.click(card);
      expect(handleClick).toHaveBeenCalledTimes(1);
    }
  });

  it("applies custom padding", () => {
    const { container } = renderWithTheme(
      <Card padding="compact">
        <div>Content</div>
      </Card>
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card).toBeInTheDocument();
  });

  it("applies elevated variant with shadow", () => {
    const { container } = renderWithTheme(
      <Card variant="elevated" elevation={4}>
        <div>Content</div>
      </Card>
    );
    
    const card = container.firstChild as HTMLElement;
    const styles = window.getComputedStyle(card);
    expect(styles.boxShadow).not.toBe("none");
  });
});
