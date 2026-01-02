import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Model3DViewer from "../Model3DViewer";

// The @google/model-viewer is mocked globally in jest.config.ts
// We need to mock the model-viewer element behavior
beforeAll(() => {
  // Define the custom element if not already defined
  if (!customElements.get("model-viewer")) {
    customElements.define(
      "model-viewer",
      class extends HTMLElement {
        connectedCallback() {
          // Simulate load event after a short delay
          setTimeout(() => {
            this.dispatchEvent(new Event("load"));
          }, 10);
        }
      }
    );
  }
});

const mockTheme = {
  vars: {
    palette: {
      grey: {
        800: "#333",
        900: "#222"
      },
      primary: {
        main: "#1976d2"
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

  test("renders model-viewer element with src", () => {
    const { container } = render(<Model3DViewer url={testUrl} />);
    const modelViewer = container.querySelector("model-viewer");
    expect(modelViewer).toBeInTheDocument();
    expect(modelViewer).toHaveAttribute("src", testUrl);
  });

  test("renders in compact mode", () => {
    const { container } = render(<Model3DViewer url={testUrl} compact={true} />);
    const modelViewer = container.querySelector("model-viewer");
    expect(modelViewer).toBeInTheDocument();
  });

  test("calls onClick handler when clicked", async () => {
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

    const { container } = render(<Model3DViewer asset={asset} />);
    const modelViewer = container.querySelector("model-viewer");
    expect(modelViewer).toBeInTheDocument();
    expect(modelViewer).toHaveAttribute("src", testUrl);
  });

  test("shows asset name in non-compact mode", async () => {
    const asset = {
      id: "test-id",
      name: "test-model.glb",
      get_url: testUrl
    } as any;

    render(<Model3DViewer asset={asset} compact={false} />);

    // Wait for the model to load
    await waitFor(
      () => {
        expect(screen.queryByText("Loading model...")).not.toBeInTheDocument();
      },
      { timeout: 100 }
    );

    expect(screen.getByText("test-model.glb")).toBeInTheDocument();
  });
});
