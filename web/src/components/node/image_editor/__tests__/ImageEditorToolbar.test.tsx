import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

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
import { DEFAULT_BRUSH_SETTINGS, DEFAULT_ADJUSTMENTS } from "../types";

describe("ImageEditorToolbar", () => {
  const mockOnToolChange = jest.fn();
  const mockOnBrushSettingsChange = jest.fn();
  const mockOnAdjustmentsChange = jest.fn();
  const mockOnAction = jest.fn();
  const mockOnZoomChange = jest.fn();
  const mockOnUndo = jest.fn();
  const mockOnRedo = jest.fn();

  const defaultProps = {
    tool: "select" as const,
    brushSettings: DEFAULT_BRUSH_SETTINGS,
    adjustments: DEFAULT_ADJUSTMENTS,
    zoom: 1,
    isCropping: false,
    canUndo: false,
    canRedo: false,
    onToolChange: mockOnToolChange,
    onBrushSettingsChange: mockOnBrushSettingsChange,
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
});
