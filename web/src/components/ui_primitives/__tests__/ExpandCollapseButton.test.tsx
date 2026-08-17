import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { ExpandCollapseButton } from "../ExpandCollapseButton";
import mockTheme from "../../../__mocks__/themeMock";

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

    expect(screen.getByTestId("ExpandMoreIcon")).toBeInTheDocument();
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

    expect(screen.getByTestId("ChevronRightIcon")).toBeInTheDocument();
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

    expect(screen.getByTestId("ExpandMoreIcon")).toBeInTheDocument();
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
