import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { ExpandCollapseButton } from "../ExpandCollapseButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icons
jest.mock("@mui/icons-material/ExpandMore", () => ({
  __esModule: true,
  default: () => <span data-testid="expand-more-icon" />
}));

jest.mock("@mui/icons-material/ChevronRight", () => ({
  __esModule: true,
  default: () => <span data-testid="chevron-right-icon" />
}));

// Mock MUI IconButton
jest.mock("@mui/material/IconButton", () => ({
  __esModule: true,
  default: ({ children, disabled, onClick, className, ...rest }: any) => (
    <button disabled={disabled} onClick={onClick} className={className} {...rest}>
      {children}
    </button>
  )
}));

// Mock Tooltip to just render children
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

describe("ExpandCollapseButton", () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with expand-more icon by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ExpandCollapseButton
          expanded={false}
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("expand-more-icon")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ExpandCollapseButton
          expanded={false}
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("applies expanded class when expanded is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ExpandCollapseButton
          expanded={true}
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("expanded");
  });

  it("renders chevron-right icon when collapsed and iconVariant is chevron", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ExpandCollapseButton
          expanded={false}
          iconVariant="chevron"
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("chevron-right-icon")).toBeInTheDocument();
  });

  it("renders expand-more icon when expanded and iconVariant is chevron", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ExpandCollapseButton
          expanded={true}
          iconVariant="chevron"
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("expand-more-icon")).toBeInTheDocument();
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ExpandCollapseButton
          expanded={false}
          onClick={mockOnClick}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("nodrag");
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ExpandCollapseButton
          expanded={false}
          onClick={mockOnClick}
          disabled={true}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });
});
