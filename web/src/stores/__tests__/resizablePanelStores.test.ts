/**
 * The sliver-reopen guard, pinned for all three panels.
 *
 * A drag can collapse a panel to its drag minimum (60px left/right, 40px
 * bottom). Reopening it through `setVisibility` used to leave that size, so the
 * panel came back as an unusable sliver — the guard existed only in
 * RightPanelStore before the three stores were unified.
 */
import { usePanelStore } from "../PanelStore";
import { useRightPanelStore } from "../RightPanelStore";
import { useBottomPanelStore } from "../BottomPanelStore";

const panels = [
  { name: "left", store: usePanelStore, drag: 60, min: 160 },
  { name: "right", store: useRightPanelStore, drag: 60, min: 130 },
  { name: "bottom", store: useBottomPanelStore, drag: 40, min: 200 }
] as const;

describe.each(panels)("$name panel", ({ store, drag, min }) => {
  const initial = store.getState();
  afterEach(() => {
    store.setState(initial, true);
  });

  it("reopens a drag-collapsed panel at the usable minimum", () => {
    store.getState().closePanel();
    expect(store.getState().panel.panelSize).toBe(drag);

    store.getState().setVisibility(true);

    const { panel } = store.getState();
    expect(panel.isVisible).toBe(true);
    expect(panel.panelSize).toBe(min);
  });

  it("leaves a usable size alone when reopening", () => {
    store.setState({
      panel: { ...store.getState().panel, panelSize: min + 40, isVisible: false }
    });

    store.getState().setVisibility(true);

    expect(store.getState().panel.panelSize).toBe(min + 40);
  });

  it("keeps the collapsed size while hidden", () => {
    store.getState().closePanel();
    store.getState().setVisibility(false);

    expect(store.getState().panel.panelSize).toBe(drag);
    expect(store.getState().panel.isVisible).toBe(false);
  });
});
