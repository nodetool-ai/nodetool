/**
 * The sliver-reopen guard, pinned for all three panels.
 *
 * A drag can collapse a panel to its drag minimum (60px left/right, 40px
 * bottom). Reopening it through `setVisibility` used to leave that size, so the
 * panel came back as an unusable sliver — the guard existed only in
 * RightPanelStore before the three stores were unified.
 */
import type { StoreApi } from "zustand";

import { usePanelStore } from "../PanelStore";
import { useRightPanelStore } from "../RightPanelStore";
import { useBottomPanelStore } from "../BottomPanelStore";

/**
 * Each store carries its own view union, so a table holding the three stores
 * themselves infers a union of store types — and a union of `setState`
 * overloads is not callable. Binding each store inside a generic keeps its
 * concrete type at the call site and hands the table one shared shape.
 */
function panelCase<
  S extends {
    panel: { panelSize: number; isVisible: boolean };
    closePanel: () => void;
    setVisibility: (isVisible: boolean) => void;
  }
>(name: string, store: StoreApi<S>, drag: number, min: number) {
  const initial = store.getState();
  return {
    name,
    drag,
    min,
    reset: () => store.setState(initial, true),
    seedSize: (panelSize: number) =>
      store.setState({
        panel: { ...store.getState().panel, panelSize, isVisible: false }
      } as Partial<S>),
    panel: () => store.getState().panel,
    closePanel: () => store.getState().closePanel(),
    setVisibility: (isVisible: boolean) =>
      store.getState().setVisibility(isVisible)
  };
}

const panels = [
  panelCase("left", usePanelStore, 60, 160),
  panelCase("right", useRightPanelStore, 60, 130),
  panelCase("bottom", useBottomPanelStore, 40, 200)
];

describe.each(panels)(
  "$name panel",
  ({ reset, seedSize, panel, closePanel, setVisibility, drag, min }) => {
    afterEach(() => {
      reset();
    });

    it("reopens a drag-collapsed panel at the usable minimum", () => {
      closePanel();
      expect(panel().panelSize).toBe(drag);

      setVisibility(true);

      expect(panel().isVisible).toBe(true);
      expect(panel().panelSize).toBe(min);
    });

    it("leaves a usable size alone when reopening", () => {
      seedSize(min + 40);

      setVisibility(true);

      expect(panel().panelSize).toBe(min + 40);
    });

    it("keeps the collapsed size while hidden", () => {
      closePanel();
      setVisibility(false);

      expect(panel().panelSize).toBe(drag);
      expect(panel().isVisible).toBe(false);
    });
  }
);
