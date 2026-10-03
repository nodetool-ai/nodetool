import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import * as THREE from "three";
import mockTheme from "../../../__mocks__/themeMock";
import { initKeyListeners } from "../../../stores/KeyPressedStore";
import Model3DEditor from "../Model3DEditor";
import { getModel3DToolHandler } from "../model3DToolBridge";

jest.mock("@react-three/fiber", () => ({
  Canvas: () => null,
  useThree: () => ({})
}));

jest.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
  Grid: () => null,
  Environment: () => null,
  TransformControls: () => null
}));

jest.mock("three/examples/jsm/loaders/GLTFLoader.js", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const three = require("three") as typeof THREE;
  return {
    GLTFLoader: jest.fn().mockImplementation(() => ({
      load: (_url: string, onLoad: (gltf: unknown) => void) => {
        const scene = new three.Group();
        const box = new three.Mesh();
        box.name = "Box";
        scene.add(box);
        onLoad({ scene, animations: [] });
      }
    }))
  };
});

jest.mock("../exportGltf", () => ({
  exportSceneToGlb: jest.fn(() => Promise.resolve(new Blob(["glb"])))
}));

jest.mock("../Model3DChatPanel", () => ({
  __esModule: true,
  default: () => null
}));

const renderEditor = (
  props: Partial<React.ComponentProps<typeof Model3DEditor>> = {},
  wrap: (ui: React.ReactElement) => React.ReactElement = (ui) => ui
) => {
  const onSave = jest.fn();
  const view = render(
    <ThemeProvider theme={mockTheme}>
      {wrap(
        <Model3DEditor url="model.glb" onSave={onSave} onClose={jest.fn()} {...props} />
      )}
    </ThemeProvider>
  );
  return { ...view, onSave };
};

const pressSave = () => {
  fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  fireEvent.keyUp(window, { key: "s", ctrlKey: true });
  fireEvent.keyUp(window, { key: "Control" });
};

describe("Model3DEditor", () => {
  let detachKeys: () => void;

  beforeEach(() => {
    detachKeys = initKeyListeners();
  });

  afterEach(() => {
    detachKeys();
  });

  it("saves on Ctrl+S when it is the visible tab", async () => {
    const { onSave } = renderEditor();

    await act(async () => {
      pressSave();
    });

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("leaves Ctrl+S to the visible tab while it sits in an inert background tab", async () => {
    const { onSave } = renderEditor({}, (ui) => <div inert>{ui}</div>);

    await act(async () => {
      pressSave();
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("serves the agent's 3D tools only while active", () => {
    const { rerender, onSave } = renderEditor({ active: false });
    expect(() => getModel3DToolHandler()).toThrow("No 3D model editor is open");

    rerender(
      <ThemeProvider theme={mockTheme}>
        <Model3DEditor url="model.glb" onSave={onSave} onClose={jest.fn()} active />
      </ThemeProvider>
    );
    expect(getModel3DToolHandler().listScene().map((node) => node.name)).toEqual([
      "Box"
    ]);
  });
});
