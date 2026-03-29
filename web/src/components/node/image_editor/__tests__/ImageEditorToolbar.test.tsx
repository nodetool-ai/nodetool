import React from "react";
import { render, screen } from "@testing-library/react";

// Mock theme
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    vars: {
      palette: {
        grey: {
          400: "#9e9e9e",
          500: "#757575",
          600: "#616161",
          700: "#424242",
          800: "#303030",
          900: "#212121"
        },
        text: { primary: "#ffffff" },
        primary: {
          main: "#1976d2",
          dark: "#1565c0",
          light: "#42a5f5",
          contrastText: "#ffffff"
        },
        success: {
          main: "#2e7d32",
          dark: "#1b5e20",
          contrastText: "#ffffff"
        },
        action: { hover: "rgba(255,255,255,0.08)" },
        background: { default: "#121212", paper: "#1e1e1e" },
        common: { white: "#ffffff" }
      }
    },
    fontSizeTiny: "10px",
    fontSizeSmaller: "11px",
    fontSizeSmall: "12px"
  })
}));

// Mock ReactDOM.createPortal
jest.mock("react-dom", () => ({
  ...jest.requireActual("react-dom"),
  createPortal: (node: React.ReactNode) => node
}));

// Mock useCombo hook
jest.mock("../../../../stores/KeyPressedStore", () => ({
  useCombo: jest.fn()
}));

import ImageEditorToolbar from "../ImageEditorToolbar";
import { DEFAULT_BRUSH_SETTINGS, DEFAULT_ADJUSTMENTS, DEFAULT_SHAPE_SETTINGS, DEFAULT_TEXT_SETTINGS } from "../types";

describe("ImageEditorToolbar", () => {
  const mockOnToolChange = jest.fn();
  const mockOnBrushSettingsChange = jest.fn();
  const mockOnShapeSettingsChange = jest.fn();
  const mockOnTextSettingsChange = jest.fn();
  const mockOnAdjustmentsChange = jest.fn();
  const mockOnAction = jest.fn();
  const mockOnZoomChange = jest.fn();
  const mockOnUndo = jest.fn();
  const mockOnRedo = jest.fn();

  const defaultProps = {
    tool: "select" as const,
    brushSettings: DEFAULT_BRUSH_SETTINGS,
    shapeSettings: DEFAULT_SHAPE_SETTINGS,
    textSettings: DEFAULT_TEXT_SETTINGS,
    adjustments: DEFAULT_ADJUSTMENTS,
    zoom: 1,
    isCropping: false,
    canUndo: false,
    canRedo: false,
    onToolChange: mockOnToolChange,
    onBrushSettingsChange: mockOnBrushSettingsChange,
    onShapeSettingsChange: mockOnShapeSettingsChange,
    onTextSettingsChange: mockOnTextSettingsChange,
    onAdjustmentsChange: mockOnAdjustmentsChange,
    onAction: mockOnAction,
    onZoomChange: mockOnZoomChange,
    onUndo: mockOnUndo,
    onRedo: mockOnRedo
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders tools section", () => {
    render(<ImageEditorToolbar {...defaultProps} />);
    expect(screen.getByText("Tools")).toBeInTheDocument();
  });

  it("renders transform section", () => {
    render(<ImageEditorToolbar {...defaultProps} />);
    expect(screen.getByText("Transform")).toBeInTheDocument();
  });

  it("renders adjustments section", () => {
    render(<ImageEditorToolbar {...defaultProps} />);
    expect(screen.getByText("Adjustments")).toBeInTheDocument();
  });

  it("renders view section with zoom controls", () => {
    render(<ImageEditorToolbar {...defaultProps} />);
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("renders history section", () => {
    render(<ImageEditorToolbar {...defaultProps} />);
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  it("shows crop actions when isCropping is true", () => {
    render(<ImageEditorToolbar {...defaultProps} isCropping={true} />);
    expect(screen.getByText("Crop Selection")).toBeInTheDocument();
    expect(screen.getByText("Apply")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("shows brush settings when draw tool is active", () => {
    render(<ImageEditorToolbar {...defaultProps} tool="draw" />);
    expect(screen.getByText("Brush Settings")).toBeInTheDocument();
    expect(screen.getByText("Size")).toBeInTheDocument();
    expect(screen.getByText("Opacity")).toBeInTheDocument();
  });

  it("displays zoom percentage correctly", () => {
    render(<ImageEditorToolbar {...defaultProps} zoom={1.5} />);
    expect(screen.getByText("150%")).toBeInTheDocument();
  });

  it("shows fill settings when fill tool is active", () => {
    render(<ImageEditorToolbar {...defaultProps} tool="fill" />);
    expect(screen.getByText("Fill Settings")).toBeInTheDocument();
  });

  it("shows shape settings when rectangle tool is active", () => {
    render(<ImageEditorToolbar {...defaultProps} tool="rectangle" />);
    expect(screen.getByText("Shape Settings")).toBeInTheDocument();
    expect(screen.getByText("Stroke Width")).toBeInTheDocument();
    expect(screen.getByText("Filled")).toBeInTheDocument();
  });

  it("shows shape settings when ellipse tool is active", () => {
    render(<ImageEditorToolbar {...defaultProps} tool="ellipse" />);
    expect(screen.getByText("Shape Settings")).toBeInTheDocument();
    expect(screen.getByText("Stroke Width")).toBeInTheDocument();
    expect(screen.getByText("Filled")).toBeInTheDocument();
  });

  it("shows shape settings without filled option when line tool is active", () => {
    render(<ImageEditorToolbar {...defaultProps} tool="line" />);
    expect(screen.getByText("Shape Settings")).toBeInTheDocument();
    expect(screen.getByText("Stroke Width")).toBeInTheDocument();
    expect(screen.queryByText("Filled")).not.toBeInTheDocument();
  });

  it("shows shape settings without filled option when arrow tool is active", () => {
    render(<ImageEditorToolbar {...defaultProps} tool="arrow" />);
    expect(screen.getByText("Shape Settings")).toBeInTheDocument();
    expect(screen.getByText("Stroke Width")).toBeInTheDocument();
    expect(screen.queryByText("Filled")).not.toBeInTheDocument();
  });

  it("shows text settings when text tool is active", () => {
    render(<ImageEditorToolbar {...defaultProps} tool="text" />);
    expect(screen.getByText("Text Settings")).toBeInTheDocument();
    expect(screen.getByText("Font Size")).toBeInTheDocument();
    expect(screen.getByText("Bold")).toBeInTheDocument();
    expect(screen.getByText("Italic")).toBeInTheDocument();
  });

  describe("Accessibility", () => {
    it("has aria-label on all tool selection buttons", () => {
      render(<ImageEditorToolbar {...defaultProps} />);

      const buttons = screen.getAllByRole("button").filter((button) => {
        const ariaLabel = button.getAttribute("aria-label");
        return ariaLabel && (
          ariaLabel.includes("Select or Pan tool") ||
          ariaLabel.includes("Crop tool") ||
          ariaLabel.includes("Draw or Paint tool") ||
          ariaLabel.includes("Erase tool") ||
          ariaLabel.includes("Fill tool") ||
          ariaLabel.includes("Text tool") ||
          ariaLabel.includes("Rectangle tool") ||
          ariaLabel.includes("Ellipse tool") ||
          ariaLabel.includes("Line tool") ||
          ariaLabel.includes("Arrow tool")
        );
      });

      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach((button) => {
        expect(button.getAttribute("aria-label")).toBeTruthy();
      });
    });

    it("has aria-label on transform action buttons", () => {
      render(<ImageEditorToolbar {...defaultProps} />);

      const rotateCCWButton = screen.getByRole("button", { name: /rotate 90 degrees counter-clockwise/i });
      expect(rotateCCWButton).toBeInTheDocument();
      expect(rotateCCWButton.getAttribute("aria-label")).toBe("Rotate 90 degrees counter-clockwise");

      const rotateCWButton = screen.getByRole("button", { name: /rotate 90 degrees clockwise/i });
      expect(rotateCWButton).toBeInTheDocument();
      expect(rotateCWButton.getAttribute("aria-label")).toBe("Rotate 90 degrees clockwise");
    });

    it("has aria-label on zoom controls", () => {
      render(<ImageEditorToolbar {...defaultProps} />);

      const zoomInButton = screen.getByRole("button", { name: /zoom in/i });
      const zoomOutButton = screen.getByRole("button", { name: /zoom out/i });

      expect(zoomInButton).toBeInTheDocument();
      expect(zoomInButton.getAttribute("aria-label")).toBe("Zoom in");

      expect(zoomOutButton).toBeInTheDocument();
      expect(zoomOutButton.getAttribute("aria-label")).toBe("Zoom out");
    });

    it("has aria-label on history buttons", () => {
      render(<ImageEditorToolbar {...defaultProps} canUndo={true} canRedo={true} />);

      const undoButton = screen.getByRole("button", { name: /undo/i });
      const redoButton = screen.getByRole("button", { name: /redo/i });

      expect(undoButton).toBeInTheDocument();
      expect(undoButton.getAttribute("aria-label")).toBe("Undo last action");

      expect(redoButton).toBeInTheDocument();
      expect(redoButton.getAttribute("aria-label")).toBe("Redo last action");
    });
  });
});
