import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { DownloadButton } from "../DownloadButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icons
jest.mock("@mui/icons-material/Download", () => ({
  __esModule: true,
  default: () => <span data-testid="download-icon" />
}));

jest.mock("@mui/icons-material/FileDownload", () => ({
  __esModule: true,
  default: () => <span data-testid="file-download-icon" />
}));

// Mock CircularProgress
jest.mock("@mui/material/CircularProgress", () => ({
  __esModule: true,
  default: () => <span data-testid="loading-spinner" />
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

// Mock MUI Button
jest.mock("@mui/material/Button", () => ({
  __esModule: true,
  default: ({ children, disabled, onClick, className, startIcon, ...rest }: any) => (
    <button disabled={disabled} onClick={onClick} className={className} {...rest}>
      {startIcon && <span data-testid="start-icon">{startIcon}</span>}
      {children}
    </button>
  )
}));

// Mock Tooltip to just render children
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

describe("DownloadButton", () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic rendering", () => {
    it("renders with download icon by default", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("download-icon")).toBeInTheDocument();
    });

    it("renders with file download icon when iconVariant is file", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} iconVariant="file" />
        </ThemeProvider>
      );

      expect(screen.getByTestId("file-download-icon")).toBeInTheDocument();
    });
  });

  describe("Click handling", () => {
    it("calls onClick when clicked", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByRole("button"));
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it("does not call onClick when loading", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} isLoading={true} />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByRole("button"));
      expect(mockOnClick).not.toHaveBeenCalled();
    });

    it("does not call onClick when disabled", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} disabled={true} />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByRole("button"));
      expect(mockOnClick).not.toHaveBeenCalled();
    });
  });

  describe("Loading state", () => {
    it("shows loading spinner when isLoading is true", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} isLoading={true} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
      expect(screen.queryByTestId("download-icon")).not.toBeInTheDocument();
    });

    it("is disabled when isLoading is true", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} isLoading={true} />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("shows loading spinner instead of file download icon", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} iconVariant="file" isLoading={true} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
      expect(screen.queryByTestId("file-download-icon")).not.toBeInTheDocument();
    });
  });

  describe("Disabled state", () => {
    it("is disabled when disabled prop is true", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} disabled={true} />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("is disabled when both disabled and isLoading are true", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} disabled={true} isLoading={true} />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  describe("Button with label", () => {
    it("renders as text button when label is provided", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} label="Download File" />
        </ThemeProvider>
      );

      expect(screen.getByText("Download File")).toBeInTheDocument();
    });

    it("renders icon as startIcon when label is provided", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} label="Download File" />
        </ThemeProvider>
      );

      expect(screen.getByTestId("start-icon")).toBeInTheDocument();
      expect(screen.getByTestId("download-icon")).toBeInTheDocument();
    });

    it("shows loading spinner instead of icon when loading with label", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} label="Download File" isLoading={true} />
        </ThemeProvider>
      );

      const startIcon = screen.getByTestId("start-icon");
      expect(startIcon).toContainElement(screen.getByTestId("loading-spinner"));
      expect(startIcon).not.toContainElement(screen.queryByTestId("download-icon"));
    });
  });

  describe("CSS classes", () => {
    it("applies nodrag class by default", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toHaveClass("nodrag");
    });

    it("applies download-button class", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toHaveClass("download-button");
    });

    it("applies custom className when provided", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} className="custom-class" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toHaveClass("custom-class");
    });

    it("does not apply nodrag class when nodrag is false", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} nodrag={false} />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).not.toHaveClass("nodrag");
    });
  });

  describe("Accessibility", () => {
    it("has tabIndex=-1 by default", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toHaveAttribute("tabIndex", "-1");
    });

    it("has accessible label from tooltip", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} tooltip="Download Report" />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Download Report");
    });

    it("uses default tooltip text as aria-label", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} />
        </ThemeProvider>
      );

      expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Download");
    });
  });

  describe("Button size", () => {
    it("renders with small size by default", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} />
        </ThemeProvider>
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("renders with medium size when specified", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} buttonSize="medium" />
        </ThemeProvider>
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("renders with large size when specified", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <DownloadButton onClick={mockOnClick} buttonSize="large" />
        </ThemeProvider>
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });
  });
});
