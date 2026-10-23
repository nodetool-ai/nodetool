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
import { getSketchDockLayoutStore } from "../../../stores/sketch/useSketchDockLayoutStore";
import { useSketchStore } from "../state/useSketchStore";

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
  });

  afterEach(() => {
    global.ResizeObserver = original;
  });

  function renderDesktopEditor() {
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
            [{ target: editor, contentRect: { width: 1400, height: 900 } } as unknown as ResizeObserverEntry],
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
});
