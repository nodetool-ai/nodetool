import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DRAG_DATA_MIME } from "../../../lib/dragdrop";

// Mocks
jest.mock("../../themes/ThemeNodetool", () => ({
  __esModule: true,
  default: {
    palette: {},
    fontSizeNormal: "",
    fontFamily1: "",
    fontSizeSmall: "",
    fontSizeSmaller: ""
  }
}));
jest.mock("../../../config/data_types", () => ({}));
jest.mock("../../../contexts/NodeContext", () => ({
  useOptionalNodes: jest.fn((selector) => {
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
const addExampleModelAsset = jest.fn();
jest.mock("../../../hooks/useAddExampleModelAsset", () => ({
  useAddExampleModelAsset: () => addExampleModelAsset
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
    fontSizeSmaller: "var(--fontSizeSmaller)",
    fontSizeNormal: "14px",
    fontSizeSmall: "12px",
    spacing: (value: number) => `${value * 8}px`
  })
}));

import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import Model3DProperty from "../Model3DProperty";

// DropZone reads the theme through `sx`, which takes it from the provider.
const renderProperty = (props: Partial<typeof defaultProps> = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <Model3DProperty {...defaultProps} {...props} />
    </ThemeProvider>
  );

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
    renderProperty();
    expect(screen.getByText("Model")).toBeInTheDocument();
  });

  it("renders drop zone when not connected", () => {
    renderProperty();
    expect(
      screen.getByText("Drop 3D model (GLB, GLTF)")
    ).toBeInTheDocument();
  });

  it("renders URL toggle button", () => {
    renderProperty();
    expect(
      screen.getByRole("button", { name: "Show input to enter a URL" })
    ).toBeInTheDocument();
  });

  it("copies a dropped example model into the assets and selects it", async () => {
    const onChange = jest.fn();
    const model = {
      slug: "chest",
      name: "Chest",
      file: "chest.glb",
      uri: "package://nodetool-base/game-models/dungeon/chest.glb",
      triangles: 120,
      clips: [],
      use: "Loot"
    };
    addExampleModelAsset.mockResolvedValue({ id: "a".repeat(32) });
    renderProperty({ onChange });
    const drag = JSON.stringify({ type: "example-model", payload: model });
    fireEvent.drop(screen.getByText("Drop 3D model (GLB, GLTF)"), {
      dataTransfer: {
        getData: (key: string) => (key === DRAG_DATA_MIME ? drag : ""),
        items: [],
        files: []
      }
    });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        type: "model_3d",
        uri: `asset://${"a".repeat(32)}`,
        asset_id: "a".repeat(32)
      })
    );
    expect(addExampleModelAsset).toHaveBeenCalledWith(model);
  });
});
