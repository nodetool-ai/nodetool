import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import * as THREE from "three";
import mockTheme from "../../../__mocks__/themeMock";
import { initKeyListeners } from "../../../stores/KeyPressedStore";
import Model3DEditor from "../Model3DEditor";
import { getModel3DToolHandler } from "../model3DToolBridge";

const mockCanvasProps = jest.fn();
jest.mock("@react-three/fiber", () => ({
  Canvas: (props: { frameloop?: string }) => {
    mockCanvasProps(props);
    return null;
  },
  useThree: () => ({})
}));

jest.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
  Grid: () => null,
  Environment: () => null,
  TransformControls: () => null
}));

// Set per test: `animated` adds a clip that lifts Box to y = 5; `outcome`
// makes the load fail or never finish.
const mockLoader: { animated: boolean; outcome: "load" | "fail" | "pending" } = {
  animated: false,
  outcome: "load"
};

jest.mock("three/examples/jsm/loaders/GLTFLoader.js", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const three = require("three") as typeof THREE;
  return {
    GLTFLoader: jest.fn().mockImplementation(() => ({
      load: (
        _url: string,
        onLoad: (gltf: unknown) => void,
        _onProgress: unknown,
        onError: (error: unknown) => void
      ) => {
        if (mockLoader.outcome === "fail") {
          onError(new Error("404 Not Found"));
          return;
        }
        if (mockLoader.outcome === "pending") {
          return;
        }
        const scene = new three.Group();
        const box = new three.Mesh();
        box.name = "Box";
        scene.add(box);
        const animations = mockLoader.animated
          ? [
              new three.AnimationClip("Lift", 1, [
                new three.VectorKeyframeTrack("Box.position", [0, 1], [0, 5, 0, 0, 5, 0])
              ])
            ]
          : [];
        onLoad({ scene, animations });
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
    mockLoader.animated = false;
    mockLoader.outcome = "load";
  });

  it.each(["fail", "pending"] as const)(
    "does not overwrite the file with an empty scene when the load did %s",
    async (outcome) => {
      mockLoader.outcome = outcome;
      const { onSave, getByRole } = renderEditor();

      await act(async () => {
        pressSave();
      });

      expect(getByRole("button", { name: "Save" })).toBeDisabled();
      expect(onSave).not.toHaveBeenCalled();
    }
  );

  it("stops rendering frames while the editor is a background tab", () => {
    const { rerender } = renderEditor({ active: false });
    expect(mockCanvasProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ frameloop: "never" })
    );
    rerender(
      <ThemeProvider theme={mockTheme}>
        <Model3DEditor url="model.glb" onSave={jest.fn()} onClose={jest.fn()} active />
      </ThemeProvider>
    );
    expect(mockCanvasProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ frameloop: "always" })
    );
  });

  it("offers a reload when the file changed outside the editor", () => {
    const onReloadExternal = jest.fn();
    const { getByRole, getByText } = renderEditor({ externallyChanged: true, onReloadExternal });
    expect(getByText(/changed outside the editor/)).toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "Reload" }));
    expect(onReloadExternal).toHaveBeenCalled();
  });

  it("tells the host when the scene gains and loses unsaved edits", async () => {
    const onDirtyChange = jest.fn();
    const { unmount } = renderEditor({ onDirtyChange });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    act(() => {
      getModel3DToolHandler().setTransform("Box", { position: [1, 0, 0] });
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      pressSave();
    });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));

    act(() => {
      getModel3DToolHandler().setTransform("Box", { position: [2, 0, 0] });
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
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

  const press = (key: string, modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {}) => {
    if (modifiers.ctrlKey) {
      fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
    }
    fireEvent.keyDown(window, { key, ...modifiers });
    fireEvent.keyUp(window, { key, ...modifiers });
    if (modifiers.ctrlKey) {
      fireEvent.keyUp(window, { key: "Control" });
    }
  };

  it("undoes and redoes an agent edit from the keyboard", async () => {
    renderEditor();
    const handler = getModel3DToolHandler();

    act(() => {
      handler.setTransform("Box", { position: [1, 2, 3] });
    });
    expect(handler.listScene()[0].position).toEqual([1, 2, 3]);

    act(() => press("z", { ctrlKey: true }));
    expect(handler.listScene()[0].position).toEqual([0, 0, 0]);

    act(() => press("y", { ctrlKey: true }));
    expect(handler.listScene()[0].position).toEqual([1, 2, 3]);
  });

  it("marks unsaved changes and clears the mark after saving", async () => {
    const { onSave, findByLabelText, queryByLabelText } = renderEditor();
    expect(queryByLabelText("Unsaved changes")).toBeNull();

    act(() => {
      getModel3DToolHandler().addPrimitive("sphere");
    });
    expect(await findByLabelText("Unsaved changes")).toBeInTheDocument();

    await act(async () => {
      pressSave();
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(queryByLabelText("Unsaved changes")).toBeNull());
  });

  it("asks before closing with unsaved changes", async () => {
    const onClose = jest.fn();
    const { getByRole, findByText } = renderEditor({ onClose });

    act(() => {
      getModel3DToolHandler().deleteObject("Box");
    });
    fireEvent.click(getByRole("button", { name: "Close editor" }));

    expect(await findByText("Discard unsaved changes?")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(getByRole("button", { name: "Discard and close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes at once when nothing changed", () => {
    const onClose = jest.fn();
    const { getByRole } = renderEditor({ onClose });

    fireEvent.click(getByRole("button", { name: "Close editor" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("duplicates the selection with its own name and undoes it", () => {
    renderEditor();
    const handler = getModel3DToolHandler();
    act(() => {
      handler.selectObject("Box");
    });

    act(() => press("d", { ctrlKey: true }));
    expect(handler.listScene().map((n) => n.name)).toEqual(["Box", "Box 2"]);

    act(() => press("z", { ctrlKey: true }));
    expect(handler.listScene().map((n) => n.name)).toEqual(["Box"]);
  });

  it("lets the agent parent, restyle and undo through the shared history", () => {
    renderEditor();
    const handler = getModel3DToolHandler();
    act(() => {
      handler.addPrimitive("empty", "Props");
      handler.addPrimitive("box", "Crate");
      handler.setParent("Crate", "Props");
    });
    expect(handler.getObject("Crate").parentUuid).toBe(handler.getObject("Props").uuid);
    expect(handler.getObject("Props").children).toEqual(["Crate"]);

    const roughness = handler.getObject("Crate").materials?.[0].roughness;
    act(() => {
      handler.setMaterial("Crate", { roughness: 0.2, color: "#ff0000" });
    });
    expect(handler.getObject("Crate").materials?.[0]).toMatchObject({
      roughness: 0.2,
      color: "#ff0000"
    });

    let result: ReturnType<typeof handler.undo> | undefined;
    act(() => {
      result = handler.undo();
    });
    expect(result?.applied).toBe("Edit material of Crate");
    expect(handler.getObject("Crate").materials?.[0].roughness).toBe(roughness);

    act(() => {
      handler.undo();
    });
    expect(handler.getObject("Crate").parentUuid).toBeNull();
  });

  it("saves on Ctrl+S while an input in the editor has focus", async () => {
    const { onSave, getByLabelText } = renderEditor();
    const filter = getByLabelText("Filter scene objects");
    filter.focus();

    await act(async () => {
      pressSave();
    });

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("keeps a transform made during animation playback when saving", async () => {
    mockLoader.animated = true;
    const { onSave, getByRole } = renderEditor();
    const handler = getModel3DToolHandler();

    act(() => {
      fireEvent.click(getByRole("button", { name: "Play animation" }));
    });
    expect(handler.listScene()[0].position).toEqual([0, 5, 0]);

    act(() => {
      handler.setTransform("Box", { position: [1, 2, 3] });
    });
    await act(async () => {
      pressSave();
    });

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(handler.listScene()[0].position).toEqual([1, 2, 3]);
  });

  it("refuses to parent an object under its own child", () => {
    renderEditor();
    const handler = getModel3DToolHandler();
    act(() => {
      handler.addPrimitive("empty", "Child");
      handler.setParent("Child", "Box");
    });
    expect(() => handler.setParent("Box", "Child")).toThrow("one of its children");
  });
});
