import React from "react";
import { render, screen } from "@testing-library/react";

// Mocks
jest.mock("../../themes/ThemeNodetool", () => ({
  __esModule: true,
  default: {
    palette: {},
    fontSizeNormal: "",
    fontFamily1: "",
    fontSizeSmall: "",
    fontSizeTiny: ""
  }
}));
jest.mock("../../../config/data_types", () => ({}));
jest.mock("../../../stores/ApiClient", () => ({ client: { GET: jest.fn() } }));
jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector) => {
    const state = { edges: [] };
    return selector(state);
  })
}));
jest.mock("../../../serverState/useAsset", () => ({
  useAsset: () => ({
    asset: undefined,
    uri: undefined
  })
}));
jest.mock("../../../hooks/handlers/useFileDrop", () => ({
  useFileDrop: () => ({
    onDrop: jest.fn(),
    onDragOver: jest.fn(),
    filename: ""
  })
}));
jest.mock("../../assets/AssetViewer", () => ({
  __esModule: true,
  default: () => <div data-testid="asset-viewer" />
}));
jest.mock("../../asset_viewer/Model3DViewer", () => ({
  __esModule: true,
  default: ({ url, compact }: { url: string; compact: boolean }) => (
    <div data-testid="model3d-viewer" data-url={url} data-compact={compact} />
  )
}));

// Mock the MUI theme hook
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    vars: {
      palette: {
        grey: {
          100: "#f5f5f5",
          400: "#bdbdbd",
          500: "#9e9e9e",
          600: "#757575",
          800: "#424242",
          900: "#212121"
        },
        primary: {
          main: "#1976d2"
        },
        action: {
          hover: "rgba(0, 0, 0, 0.04)"
        },
        text: {
          primary: "#fff",
          secondary: "#bdbdbd"
        },
        common: {
          white: "#fff",
          black: "#000"
        },
        background: {
          paper: "#424242",
          default: "#303030"
        }
      }
    },
    fontFamily1: "Arial",
    fontSizeTiny: "11px",
    fontSizeNormal: "14px",
    fontSizeSmall: "12px",
    spacing: (value: number) => `${value * 8}px`
  })
}));

import Model3DProperty from "../Model3DProperty";

const defaultProps = {
  property: {
    name: "model",
    description: "A 3D model",
    type: { type: "model_3d", optional: false, type_args: [] }
  } as any,
  propertyIndex: "0",
  value: undefined,
  onChange: jest.fn(),
  nodeId: "node1",
  nodeType: "test.Model3D"
};

describe("Model3DProperty", () => {
  it("renders property label", () => {
    render(<Model3DProperty {...defaultProps} />);
    expect(screen.getByText("Model")).toBeInTheDocument();
  });

  it("renders drop zone when not connected", () => {
    render(<Model3DProperty {...defaultProps} />);
    expect(
      screen.getByText("Drop 3D model (GLB, GLTF)")
    ).toBeInTheDocument();
  });

  it("renders URL toggle button", () => {
    render(<Model3DProperty {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "Show input to enter a URL" })
    ).toBeInTheDocument();
  });
});
