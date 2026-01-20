import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Model3DViewer from "../Model3DViewer";

// Mock React Three Fiber components
jest.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useThree: () => ({
    camera: { position: { set: jest.fn() }, lookAt: jest.fn() },
    controls: null,
    gl: {
      render: jest.fn(),
      domElement: { toDataURL: () => "data:image/png;base64,test" }
    },
    scene: { children: [], rotation: { y: 0 } }
  }),
  useFrame: jest.fn(),
  ThreeEvent: jest.fn()
}));

// Mock React Three Drei components
jest.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
  Grid: () => null,
  useGLTF: () => ({
    scene: {
      clone: () => ({
        traverse: jest.fn()
      })
    }
  }),
  Center: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Environment: () => null,
  ContactShadows: () => null,
  Html: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

// Mock Three.js
jest.mock("three", () => ({
  Mesh: class {},
  MeshStandardMaterial: class {},
  WebGLRenderer: class {},
  Scene: class {},
  Camera: class {},
  Vector3: class {
    set() {
      return this;
    }
  },
  AmbientLight: class {
    color: number | string;
    intensity: number;
    constructor(color?: number | string, intensity?: number) {
      this.color = color ?? 0xffffff;
      this.intensity = intensity ?? 1;
    }
  },
  AxesHelper: class AxesHelper {
    size: number;
    constructor(size?: number) {
      this.size = size ?? 1;
    }
  }
}));

const mockTheme = {
  vars: {
    palette: {
      grey: {
        100: "#f5f5f5",
        800: "#333",
        900: "#222"
      },
      primary: {
        main: "#1976d2",
        dark: "#1565c0"
      },
      common: {
        white: "#fff"
      }
    }
  }
};

// Mock the theme hook
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => mockTheme
}));

describe("Model3DViewer", () => {
  const testUrl = "https://example.com/model.glb";

  test("renders loading state initially", () => {
    render(<Model3DViewer url={testUrl} />);
    expect(screen.getByText("Loading model...")).toBeInTheDocument();
  });

  test("renders without URL showing placeholder", () => {
    render(<Model3DViewer />);
    expect(screen.getByText("No 3D model loaded")).toBeInTheDocument();
  });

  test("renders Canvas component with URL", () => {
    render(<Model3DViewer url={testUrl} />);
    expect(screen.getByTestId("r3f-canvas")).toBeInTheDocument();
  });

  test("renders in compact mode without toolbar", () => {
    const { container } = render(
      <Model3DViewer url={testUrl} compact={true} />
    );
    // Toolbar should not be present in compact mode
    expect(container.querySelector(".controls-toolbar")).not.toBeInTheDocument();
  });

  test("renders toolbar in non-compact mode", () => {
    const { container } = render(
      <Model3DViewer url={testUrl} compact={false} />
    );
    // Toolbar should be present in non-compact mode
    expect(container.querySelector(".controls-toolbar")).toBeInTheDocument();
  });

  test("calls onClick handler when clicked in compact mode", async () => {
    const handleClick = jest.fn();
    const user = userEvent.setup();
    const { container } = render(
      <Model3DViewer url={testUrl} compact={true} onClick={handleClick} />
    );

    const modelContainer = container.querySelector(".model-container");
    if (modelContainer) {
      await user.click(modelContainer);
      expect(handleClick).toHaveBeenCalledTimes(1);
    }
  });

  test("renders with asset", () => {
    const asset = {
      id: "test-id",
      name: "test-model.glb",
      get_url: testUrl
    } as any;

    render(<Model3DViewer asset={asset} />);
    expect(screen.getByTestId("r3f-canvas")).toBeInTheDocument();
  });

  test("shows asset name in non-compact mode", () => {
    const asset = {
      id: "test-id",
      name: "test-model.glb",
      get_url: testUrl
    } as any;

    render(<Model3DViewer asset={asset} compact={false} />);
    expect(screen.getByText("test-model.glb")).toBeInTheDocument();
  });

  test("renders control buttons in non-compact mode", () => {
    render(<Model3DViewer url={testUrl} compact={false} />);

    // Check for various control buttons by their tooltip titles
    expect(screen.getByRole("button", { name: /toggle grid/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /toggle axes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset camera/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /take screenshot/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fullscreen/i })).toBeInTheDocument();
  });

  test("renders wireframe toggle buttons", () => {
    render(<Model3DViewer url={testUrl} compact={false} />);

    expect(screen.getByRole("button", { name: /solid/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /wire/i })).toBeInTheDocument();
  });
});
