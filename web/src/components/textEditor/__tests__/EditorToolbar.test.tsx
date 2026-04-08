import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import EditorToolbar from "../EditorToolbar";
import mockTheme from "../../../__mocks__/themeMock";

// Mock MUI components
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-tooltip={title}>{children}</div>
  )
}));

jest.mock("@mui/material/IconButton", () => ({
  __esModule: true,
  default: ({ children, disabled, onClick, className, "aria-label": ariaLabel, ...rest }: any) => (
    <button
      disabled={disabled}
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
      data-testid="icon-button"
      {...rest}
    >
      {children}
    </button>
  )
}));

jest.mock("@mui/material/Box", () => ({
  __esModule: true,
  default: ({ children, className }: any) => (
    <div className={className}>
      {children}
    </div>
  )
}));

describe("EditorToolbar", () => {
  const renderWithTheme = (props: any = {}) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        <EditorToolbar {...props} />
      </ThemeProvider>
    );
  };

  it("has proper ARIA labels for accessibility", () => {
    renderWithTheme({ readOnly: false });

    expect(screen.getByLabelText("Undo")).toBeInTheDocument();
    expect(screen.getByLabelText("Redo")).toBeInTheDocument();
    expect(screen.getByLabelText("Find & Replace")).toBeInTheDocument();
    expect(screen.getByLabelText("Toggle Word Wrap")).toBeInTheDocument();
    expect(screen.getByLabelText("Format as Code Block")).toBeInTheDocument();
  });
});
