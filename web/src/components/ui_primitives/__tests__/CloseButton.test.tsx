import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { CloseButton } from "../CloseButton";
import mockTheme from "../../../__mocks__/themeMock";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

describe("CloseButton", () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with close icon by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("CloseOutlinedIcon")).toBeInTheDocument();
  });

  it("renders with clear icon when iconVariant is 'clear'", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} iconVariant="clear" />
      </ThemeProvider>
    );

    expect(screen.getByTestId("ClearIcon")).toBeInTheDocument();
    expect(screen.queryByTestId("CloseOutlinedIcon")).not.toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("stops event propagation on click", () => {
    const parentOnClick = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <div onClick={parentOnClick}>
          <CloseButton onClick={mockOnClick} />
        </div>
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
    expect(parentOnClick).not.toHaveBeenCalled();
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} disabled={true} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("does not call onClick when disabled", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} disabled={true} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("nodrag");
  });

  it("applies close-button class", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("close-button");
  });

  it("does not apply nodrag class when nodrag is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} nodrag={false} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).not.toHaveClass("nodrag");
  });

  it("applies custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} className="custom-class" />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });

  it("has accessible label from tooltip (aria-label)", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} tooltip="Close Dialog" />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Close Dialog");
  });

  it("uses default tooltip when not provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Close");
  });

  it("has keyboard accessibility (tabIndex=0) by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveAttribute("tabIndex", "0");
  });

  it("accepts custom tabIndex", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} tabIndex={-1} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveAttribute("tabIndex", "-1");
  });

  it("renders with small buttonSize by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("MuiIconButton-sizeSmall");
  });

  it("renders with medium buttonSize", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} buttonSize="medium" />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("MuiIconButton-sizeMedium");
  });

  it("renders with large buttonSize", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CloseButton onClick={mockOnClick} buttonSize="large" />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("MuiIconButton-sizeLarge");
  });

  describe("tooltips", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      cleanup();
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it("shows the default tooltip on hover", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ThemeProvider theme={mockTheme}>
          <CloseButton onClick={mockOnClick} />
        </ThemeProvider>
      );

      await user.hover(screen.getByRole("button"));
      await act(async () => {
        jest.advanceTimersByTime(TOOLTIP_ENTER_DELAY);
      });
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toBeVisible();
      expect(tooltip).toHaveTextContent(/^Close$/);
    });

    it("renders custom tooltip text", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <ThemeProvider theme={mockTheme}>
          <CloseButton onClick={mockOnClick} tooltip="Cancel" />
        </ThemeProvider>
      );

      await user.hover(screen.getByRole("button"));
      await act(async () => {
        jest.advanceTimersByTime(TOOLTIP_ENTER_DELAY);
      });
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toBeVisible();
      expect(tooltip).toHaveTextContent(/^Cancel$/);
    });
  });
});
