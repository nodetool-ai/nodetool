import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { UploadButton } from "../UploadButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icons
jest.mock("@mui/icons-material/Upload", () => ({
  __esModule: true,
  default: () => <span data-testid="upload-icon" />
}));

jest.mock("@mui/icons-material/FileUpload", () => ({
  __esModule: true,
  default: () => <span data-testid="file-upload-icon" />
}));

jest.mock("@mui/icons-material/CloudUpload", () => ({
  __esModule: true,
  default: () => <span data-testid="cloud-upload-icon" />
}));

// Mock MUI IconButton
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

// Mock MUI Button
jest.mock("@mui/material/Button", () => ({
  __esModule: true,
  default: ({ children, disabled, onClick, className, startIcon, ...rest }: any) => (
    <button
      disabled={disabled}
      onClick={onClick}
      className={className}
      data-has-start-icon={!!startIcon}
      {...rest}
    >
      {startIcon}
      {children}
    </button>
  )
}));

// Mock Tooltip
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
    <div data-tooltip={typeof title === "string" ? title : "tooltip"}>
      {children}
    </div>
  )
}));

describe("UploadButton", () => {
  const mockOnFileSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with default tooltip", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders with custom tooltip", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} tooltip="Upload Files" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("has aria-label for accessibility", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} tooltip="Upload Document" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Upload Document");
  });

  it("has aria-label matching tooltip prop", () => {
    const tooltipText = "Select files to upload";
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} tooltip={tooltipText} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", tooltipText);
  });

  it("uses default aria-label when tooltip is not provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Upload");
  });

  it("renders as IconButton when no label is provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} />
      </ThemeProvider>
    );
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    // Icon button doesn't have text content
    expect(button.textContent).toBe("");
  });

  it("renders as Button with label when label is provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} label="Upload Files" />
      </ThemeProvider>
    );
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Upload Files");
  });

  it("calls onClick handler when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Should create file input and click it
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} disabled={true} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("renders with different icon variants", () => {
    const { rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} iconVariant="upload" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} iconVariant="file" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} iconVariant="cloud" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} className="custom-class" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveClass("nodrag");
  });

  it("does not apply nodrag class when nodrag is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} nodrag={false} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).not.toHaveClass("nodrag");
  });

  it("sets multiple attribute on file input when multiple is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} multiple={true} />
      </ThemeProvider>
    );
    const input = document.querySelector('input[type="file"]');
    expect(input).toHaveAttribute("multiple");
  });

  it("sets accept attribute on file input", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <UploadButton onFileSelect={mockOnFileSelect} accept="image/*" />
      </ThemeProvider>
    );
    const input = document.querySelector('input[type="file"]');
    expect(input).toHaveAttribute("accept", "image/*");
  });
});
