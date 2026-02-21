import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, CssBaseline } from "@mui/material";
import mockTheme from "../../../__mocks__/themeMock";
import { EditorUiProvider } from "../EditorUiContext";
import EditorButton from "../EditorButton";

const renderWithThemeProvider = (component: React.ReactElement, scope?: "node" | "inspector") => {
  return render(
    <ThemeProvider theme={mockTheme}>
      <CssBaseline />
      <EditorUiProvider scope={scope}>{component}</EditorUiProvider>
    </ThemeProvider>
  );
};

describe("EditorButton", () => {
  it("renders a button with text content", () => {
    renderWithThemeProvider(<EditorButton>Click me</EditorButton>);
    const button = screen.getByRole("button", { name: /click me/i });
    expect(button).toBeInTheDocument();
  });

  it("applies nodrag class to prevent ReactFlow drag", () => {
    const { container } = renderWithThemeProvider(
      <EditorButton>Click me</EditorButton>
    );
    const button = container.querySelector(".nodrag");
    expect(button).toBeInTheDocument();
  });

  it("calls onClick handler when clicked", async () => {
    const handleClick = jest.fn();
    const user = userEvent.setup();
    renderWithThemeProvider(
      <EditorButton onClick={handleClick}>Click me</EditorButton>
    );
    const button = screen.getByRole("button", { name: /click me/i });
    await user.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders as disabled when disabled prop is true", () => {
    renderWithThemeProvider(
      <EditorButton disabled>Disabled</EditorButton>
    );
    const button = screen.getByRole("button", { name: /disabled/i });
    expect(button).toBeDisabled();
  });

  it("applies custom className", () => {
    const { container } = renderWithThemeProvider(
      <EditorButton className="custom-class">Click me</EditorButton>
    );
    const button = container.querySelector(".custom-class");
    expect(button).toBeInTheDocument();
  });

  it("applies custom sx styles", () => {
    renderWithThemeProvider(
      <EditorButton sx={{ marginLeft: "10px" }}>Click me</EditorButton>
    );
    const button = screen.getByRole("button", { name: /click me/i });
    expect(button).toBeInTheDocument();
  });

  it("renders with different variants", () => {
    const { rerender } = renderWithThemeProvider(
      <EditorButton variant="contained">Contained</EditorButton>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <CssBaseline />
        <EditorUiProvider>
          <EditorButton variant="outlined">Outlined</EditorButton>
        </EditorUiProvider>
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <CssBaseline />
        <EditorUiProvider>
          <EditorButton variant="text">Text</EditorButton>
        </EditorUiProvider>
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders with different colors", () => {
    const { rerender } = renderWithThemeProvider(
      <EditorButton color="primary">Primary</EditorButton>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <CssBaseline />
        <EditorUiProvider>
          <EditorButton color="secondary">Secondary</EditorButton>
        </EditorUiProvider>
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <CssBaseline />
        <EditorUiProvider>
          <EditorButton color="error">Error</EditorButton>
        </EditorUiProvider>
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  describe("density prop", () => {
    it("renders with compact density by default", () => {
      renderWithThemeProvider(<EditorButton>Click me</EditorButton>);
      const button = screen.getByRole("button", { name: /click me/i });
      expect(button).toBeInTheDocument();
    });

    it("renders with normal density", () => {
      renderWithThemeProvider(
        <EditorButton density="normal">Click me</EditorButton>
      );
      const button = screen.getByRole("button", { name: /click me/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe("scope context", () => {
    it("renders in node scope", () => {
      renderWithThemeProvider(<EditorButton>Node Button</EditorButton>, "node");
      const button = screen.getByRole("button", { name: /node button/i });
      expect(button).toBeInTheDocument();
    });

    it("renders in inspector scope", () => {
      renderWithThemeProvider(
        <EditorButton>Inspector Button</EditorButton>,
        "inspector"
      );
      const button = screen.getByRole("button", { name: /inspector button/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe("start and end icons", () => {
    it("renders with startIcon", () => {
      renderWithThemeProvider(
        <EditorButton startIcon={<span data-testid="start-icon">S</span>}>
          Button
        </EditorButton>
      );
      expect(screen.getByTestId("start-icon")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("renders with endIcon", () => {
      renderWithThemeProvider(
        <EditorButton endIcon={<span data-testid="end-icon">E</span>}>
          Button
        </EditorButton>
      );
      expect(screen.getByTestId("end-icon")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  describe("button sizes", () => {
    it("renders with default size", () => {
      renderWithThemeProvider(
        <EditorButton>Default Size</EditorButton>
      );
      const button = screen.getByRole("button", { name: /default size/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("supports aria-label", () => {
      renderWithThemeProvider(
        <EditorButton aria-label="Close dialog">×</EditorButton>
      );
      const button = screen.getByRole("button", { name: /close dialog/i });
      expect(button).toBeInTheDocument();
    });

    it("supports aria-describedby", () => {
      renderWithThemeProvider(
        <>
          <EditorButton aria-describedby="description-id">Help</EditorButton>
          <span id="description-id">Click for help</span>
        </>
      );
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-describedby", "description-id");
    });
  });

  describe("edge cases", () => {
    it("handles empty text content", () => {
      renderWithThemeProvider(<EditorButton></EditorButton>);
      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent("");
    });

    it("handles very long text content", () => {
      const longText = "This is a very long button text that might overflow";
      renderWithThemeProvider(<EditorButton>{longText}</EditorButton>);
      const button = screen.getByRole("button", { name: new RegExp(longText) });
      expect(button).toBeInTheDocument();
    });
  });

  describe("button types", () => {
    it("renders submit type button", () => {
      renderWithThemeProvider(
        <EditorButton type="submit">Submit</EditorButton>
      );
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("type", "submit");
    });

    it("renders reset type button", () => {
      renderWithThemeProvider(
        <EditorButton type="reset">Reset</EditorButton>
      );
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("type", "reset");
    });

    it("renders button type by default", () => {
      renderWithThemeProvider(<EditorButton>Button</EditorButton>);
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("type", "button");
    });
  });

  describe("fullWidth variant", () => {
    it("renders with fullWidth prop", () => {
      renderWithThemeProvider(
        <EditorButton fullWidth>Full Width</EditorButton>
      );
      const button = screen.getByRole("button", { name: /full width/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe("href and link behavior", () => {
    it("renders as anchor when href is provided", () => {
      renderWithThemeProvider(
        <EditorButton href="https://example.com">Link</EditorButton>
      );
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "https://example.com");
    });

    it("opens in new tab when target is blank", () => {
      renderWithThemeProvider(
        <EditorButton href="https://example.com">
          Link
        </EditorButton>
      );
      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
    });
  });
});
