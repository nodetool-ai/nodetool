import React, { createRef, forwardRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { NodeIconButton } from "../NodeIconButton";
import mockTheme from "../../../__mocks__/themeMock";

// Add fontSizeTiny to mockTheme for NodeIconButton
(mockTheme as any).fontSizeTiny = "0.65em";

// Mock MUI IconButton to avoid reliance on theme.vars internals in tests
jest.mock("@mui/material/IconButton", () => ({
  __esModule: true,
  // eslint-disable-next-line react/display-name
  default: forwardRef<
    HTMLButtonElement,
    { children?: React.ReactNode; className?: string }
  >(({ children, className, ...rest }, ref) => (
    <button ref={ref} className={className} {...rest}>
      {children}
    </button>
  ))
}));

// Mock EditorUiContext to provide scope
jest.mock("../../editor_ui/EditorUiContext", () => ({
  useEditorScope: () => "node"
}));

describe("NodeIconButton", () => {
  // Simple mock icon component for tests
  const MockIcon = () => <span data-testid="mock-icon" />;

  it("renders with default props", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NodeIconButton aria-label="delete">
          <MockIcon />
        </NodeIconButton>
      </ThemeProvider>
    );

    const button = screen.getByRole("button", { name: /delete/i });
    expect(button).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NodeIconButton className="custom-class" aria-label="test">
          <MockIcon />
        </NodeIconButton>
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toHaveClass("custom-class");
    expect(button).toHaveClass("nodrag");
  });

  it("calls onClick when clicked", () => {
    const handleClick = jest.fn();

    render(
      <ThemeProvider theme={mockTheme}>
        <NodeIconButton onClick={handleClick} aria-label="click">
          <MockIcon />
        </NodeIconButton>
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders disabled state", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NodeIconButton disabled aria-label="disabled">
          <MockIcon />
        </NodeIconButton>
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("forwards ref correctly", () => {
    const ref = createRef<HTMLButtonElement>();

    render(
      <ThemeProvider theme={mockTheme}>
        <NodeIconButton ref={ref} aria-label="ref">
          <MockIcon />
        </NodeIconButton>
      </ThemeProvider>
    );

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("applies nodrag class for ReactFlow compatibility", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NodeIconButton aria-label="nodrag-test">
          <MockIcon />
        </NodeIconButton>
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toHaveClass("nodrag");
  });
});
