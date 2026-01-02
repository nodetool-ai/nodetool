import React, { createRef, forwardRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { NodeButton } from "../NodeButton";
import mockTheme from "../../../__mocks__/themeMock";

// Add fontSizeTiny to mockTheme for NodeButton
(mockTheme as any).fontSizeTiny = "0.65em";

// Create mock button component outside of jest.mock
const MockButton = forwardRef<
  HTMLButtonElement,
  { children?: React.ReactNode; className?: string }
>(({ children, className, ...rest }, ref) => (
  <button ref={ref} className={className} {...rest}>
    {children}
  </button>
));
MockButton.displayName = "MockButton";

// Mock MUI Button to avoid reliance on theme.vars internals in tests
jest.mock("@mui/material/Button", () => ({
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

describe("NodeButton", () => {
  it("renders with default props", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NodeButton>Click me</NodeButton>
      </ThemeProvider>
    );

    const button = screen.getByRole("button", { name: /click me/i });
    expect(button).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NodeButton className="custom-class">Test</NodeButton>
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
        <NodeButton onClick={handleClick}>Click</NodeButton>
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders disabled state", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NodeButton disabled>Disabled</NodeButton>
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("forwards ref correctly", () => {
    const ref = createRef<HTMLButtonElement>();

    render(
      <ThemeProvider theme={mockTheme}>
        <NodeButton ref={ref}>With Ref</NodeButton>
      </ThemeProvider>
    );

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("applies nodrag class for ReactFlow compatibility", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <NodeButton>Test</NodeButton>
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toHaveClass("nodrag");
  });
});
