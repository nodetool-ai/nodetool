/**
 * @jest-environment jsdom
 *
 * The sketch editor's panels sit in the shared dock. The assistant's open
 * flag (which the tool bar toggle and the phone sheet use) follows the dock:
 * closing the tab or choosing a layout updates it, and the toggle shows or
 * hides the dock panel.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import SketchEditor from "../SketchEditor";
import { SketchProvider } from "../../../stores/sketch/SketchInstance";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { getSketchDockLayoutStore } from "../../../stores/sketch/useSketchDockLayoutStore";
import { useSketchStore } from "../state/useSketchStore";
import {
  sketchEditorModeKey,
  useSketchEditorModeStore
} from "../../../stores/sketch/SketchEditorMode";

jest.mock("../../../hooks/useResolvedMediaUri");

jest.mock("../SketchAgentPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="assistant-panel" />
}));

type Observed = { callback: ResizeObserverCallback; targets: Element[] };

describe("SketchEditor dock", () => {
  const original = global.ResizeObserver;
  let observers: Observed[] = [];

  beforeEach(() => {
    observers = [];
    global.ResizeObserver = jest.fn().mockImplementation((callback) => {
      const entry: Observed = { callback, targets: [] };
      observers.push(entry);
      return {
        observe: (target: Element) => entry.targets.push(target),
        unobserve: jest.fn(),
        disconnect: jest.fn()
      };
    }) as unknown as typeof ResizeObserver;
    getSketchDockLayoutStore(null).getState().selectLayout("Essentials");
    localStorage.clear();
    useSketchEditorModeStore.setState({
      modes: { [sketchEditorModeKey(null)]: "expert" }
    });
  });

  afterEach(() => {
    global.ResizeObserver = original;
  });

  function renderDesktopEditor(width = 1400) {
    const view = render(
      <ThemeProvider theme={mockTheme}>
        <SketchProvider>
          <SketchEditor documentId="sketch-dock-doc" />
        </SketchProvider>
      </ThemeProvider>
    );
    const editor = document.querySelector(".sketch-editor");
    if (!editor) throw new Error("editor not mounted");
    act(() => {
      for (const { callback, targets } of observers) {
        if (targets.includes(editor)) {
          callback(
            [{ target: editor, contentRect: { width, height: 900 } } as unknown as ResizeObserverEntry],
            {} as ResizeObserver
          );
        }
      }
    });
    return view;
  }

  it("shows the side panels as dock tabs, with the assistant closed in the default layout", () => {
    renderDesktopEditor();
    act(() => {
      useSketchStore.getState().setAssistantPanelOpen(false, { persist: false });
    });
    for (const name of ["Canvas", "Color", "Layers", "History", "Properties", "Canvas size"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
    expect(screen.queryByTestId("assistant-panel")).not.toBeInTheDocument();
  });

  it("keeps the assistant flag and the dock panel in step", () => {
    renderDesktopEditor();
    act(() => {
      useSketchStore.getState().setAssistantPanelOpen(false, { persist: false });
    });
    const store = getSketchDockLayoutStore(null);

    act(() => store.getState().selectLayout("Assistant"));
    expect(useSketchStore.getState().assistantPanelOpen).toBe(true);
    expect(screen.getByTestId("assistant-panel")).toBeInTheDocument();

    const tab = screen.getByRole("tab", { name: /^Assistant/ });
    const close = tab.parentElement?.querySelector<HTMLElement>("[aria-label^='Close']");
    if (!close) throw new Error("assistant tab has no close button");
    fireEvent.click(close);
    expect(store.getState().layout.hidden).toContain("assistant");
    expect(useSketchStore.getState().assistantPanelOpen).toBe(false);
    expect(screen.queryByTestId("assistant-panel")).not.toBeInTheDocument();

    act(() => {
      useSketchStore.getState().setAssistantPanelOpen(true, { persist: false });
    });
    expect(store.getState().layout.hidden).not.toContain("assistant");
    expect(screen.getByTestId("assistant-panel")).toBeInTheDocument();
  });

  it("drops the side panels and the tab strips while Tab hides the chrome", () => {
    renderDesktopEditor();
    expect(screen.getByRole("tab", { name: /^Layers/ })).toBeInTheDocument();
    act(() => useSketchStore.getState().togglePanelsHidden());
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(document.querySelector(".sketch-editor__canvas-region")).toBeInTheDocument();
    act(() => useSketchStore.getState().togglePanelsHidden());
  });

  describe("Simple mode", () => {
    beforeEach(() => {
      useSketchEditorModeStore.setState({ modes: {} });
    });

    it("is the default: a short tool rail and a layer column, without dock tabs", () => {
      renderDesktopEditor();
      expect(screen.getByTestId("sketch-simple-sidebar")).toBeInTheDocument();
      expect(screen.getAllByTestId("sketch-simple-layer").length).toBeGreaterThan(0);
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sketch-status-bar")).not.toBeInTheDocument();
      const tools = document.querySelectorAll(".sketch-toolbar .MuiToggleButton-root");
      expect(Array.from(tools).map((b) => b.getAttribute("value"))).toEqual([
        "select", "brush", "eraser", "shape", "move"
      ]);
      expect(document.querySelector(".sketch-editor__canvas-region")).toBeInTheDocument();
    });

    it("shows the open assistant in a column at the right edge, not in the dock", () => {
      renderDesktopEditor();
      act(() => {
        useSketchStore.getState().setAssistantPanelOpen(true, { persist: false });
      });
      const panel = screen.getByTestId("assistant-panel");
      const column = screen.getByTestId("assistant-side-dock");
      expect(column).toContainElement(panel);
      expect(document.querySelector(".sketch-editor__dock")).not.toContainElement(panel);
      // The column is the body's last child, right of the layer column.
      expect(document.querySelector(".sketch-editor__body")?.lastElementChild).toBe(column);
      expect(screen.getAllByTestId("assistant-panel")).toHaveLength(1);

      act(() => {
        useSketchStore.getState().setAssistantPanelOpen(false, { persist: false });
      });
      expect(screen.queryByTestId("assistant-panel")).not.toBeInTheDocument();
    });

    it("switches to Expert mode and remembers it", () => {
      renderDesktopEditor();
      fireEvent.click(screen.getByRole("button", { name: "Expert" }));
      expect(screen.getByRole("tab", { name: /^Layers/ })).toBeInTheDocument();
      expect(screen.queryByTestId("sketch-simple-sidebar")).not.toBeInTheDocument();
      expect(localStorage.getItem(sketchEditorModeKey(null))).toBe("expert");

      fireEvent.click(screen.getByRole("button", { name: "Simple" }));
      expect(screen.getByTestId("sketch-simple-sidebar")).toBeInTheDocument();
      expect(localStorage.getItem(sketchEditorModeKey(null))).toBe("simple");
    });

    it("puts the layer list in the phone sheet", () => {
      renderDesktopEditor(390);
      expect(screen.queryByTestId("sketch-simple-sidebar")).not.toBeInTheDocument();
      fireEvent.click(document.querySelector(".sketch-editor__mobile-panels-fab")!);
      expect(screen.getByTestId("sketch-simple-sidebar")).toBeInTheDocument();
      expect(document.querySelector(".sketch-editor__layers-section")).not.toBeInTheDocument();
    });

    it("is the only mode on a phone, even when Expert is remembered", () => {
      useSketchEditorModeStore.setState({
        modes: { [sketchEditorModeKey(null)]: "expert" }
      });
      renderDesktopEditor(390);
      expect(screen.queryByRole("button", { name: "Expert" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Simple" })).not.toBeInTheDocument();
      fireEvent.click(document.querySelector(".sketch-editor__mobile-panels-fab")!);
      expect(screen.getByTestId("sketch-simple-sidebar")).toBeInTheDocument();
      expect(document.querySelector(".sketch-editor__layers-section")).not.toBeInTheDocument();
      expect(useSketchEditorModeStore.getState().modes[sketchEditorModeKey(null)]).toBe(
        "expert"
      );
    });

    it("selects a layer from the list and adds a new one", () => {
      renderDesktopEditor();
      const before = useSketchStore.getState().document.layers.length;
      fireEvent.click(screen.getByTestId("sketch-simple-add-layer"));
      expect(useSketchStore.getState().document.layers.length).toBe(before + 1);

      const rows = screen.getAllByTestId("sketch-simple-layer");
      const last = rows[rows.length - 1];
      fireEvent.click(last);
      const name = last.getAttribute("aria-label");
      const active = useSketchStore.getState().document.layers.find(
        (layer) => layer.id === useSketchStore.getState().document.activeLayerId
      );
      expect(active?.name).toBe(name);
    });

    it("allows generating from an uploaded source image without a source layer", () => {
      renderDesktopEditor();
      const { activeLayerId } = useSketchStore.getState().document;
      act(() => {
        useSketchSessionStore.getState().upsertBinding({
          layerId: activeLayerId!,
          kind: "image-to-image",
          provider: "openai",
          model: "test-image-model",
          prompt: "Watercolour painting style",
          sourceAssetId: "0123456789abcdef0123456789abcdef",
          sourceLayerId: null,
          status: "draft",
          versions: []
        });
      });
      expect(screen.getByTestId("sketch-simple-regenerate")).toBeEnabled();
    });

    it("uses the hovered half of the row to place a layer and records one undo step", () => {
      renderDesktopEditor();
      fireEvent.click(screen.getByTestId("sketch-simple-add-layer"));
      const [bottom, top] = useSketchStore.getState().document.layers;
      const getLayerOrder = () =>
        useSketchStore.getState().document.layers.map(({ id }) => id);
      const source = screen.getByRole("button", { name: bottom.name });
      const target = screen.getByRole("button", { name: top.name });
      expect(source).toHaveAttribute("draggable", "true");

      const payload = new Map<string, string>();
      const dataTransfer = {
        setData: (type: string, data: string) => payload.set(type, data),
        getData: (type: string) => payload.get(type) ?? "",
        get types() { return [...payload.keys()]; }
      };
      jest.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 40));
      const dragOver = (clientY: number): void => {
        const event = new MouseEvent("dragover", { bubbles: true, cancelable: true, clientY });
        Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
        fireEvent(target, event);
      };

      fireEvent.dragStart(source, { dataTransfer });
      dragOver(30);
      fireEvent.drop(target, { dataTransfer });
      expect(getLayerOrder()).toEqual([bottom.id, top.id]);

      fireEvent.dragStart(source, { dataTransfer });
      dragOver(10);
      fireEvent.drop(target, { dataTransfer });

      expect(getLayerOrder()).toEqual([top.id, bottom.id]);
      expect(screen.getAllByTestId("sketch-simple-layer")[0]).toBe(source);
      act(() => { useSketchStore.getState().undo(); });
      expect(getLayerOrder()).toEqual([bottom.id, top.id]);
    });
  });
});
