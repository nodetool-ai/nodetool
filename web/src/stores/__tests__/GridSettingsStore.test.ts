import { useGridSettingsStore, GridPattern } from "../../stores/GridSettingsStore";

describe("GridSettingsStore", () => {
  beforeEach(() => {
    useGridSettingsStore.setState({
      pattern: "dots",
      gap: 100,
      size: 8,
      color: "#3e4c5e",
      visible: true
    });
  });

  it("has default values", () => {
    const store = useGridSettingsStore.getState();
    expect(store.pattern).toBe("dots");
    expect(store.gap).toBe(100);
    expect(store.size).toBe(8);
    expect(store.visible).toBe(true);
  });

  it("cycles through patterns", () => {
    const store = useGridSettingsStore.getState();
    expect(store.pattern).toBe("dots");
    store.cyclePattern();
    expect(useGridSettingsStore.getState().pattern).toBe("lines");
    store.cyclePattern();
    expect(useGridSettingsStore.getState().pattern).toBe("cross");
    store.cyclePattern();
    expect(useGridSettingsStore.getState().pattern).toBe("none");
    store.cyclePattern();
    expect(useGridSettingsStore.getState().pattern).toBe("dots");
  });

  it("clamps gap values", () => {
    const store = useGridSettingsStore.getState();
    store.setGap(1000);
    expect(useGridSettingsStore.getState().gap).toBe(500);
    store.setGap(-100);
    expect(useGridSettingsStore.getState().gap).toBe(10);
  });

  it("clamps size values", () => {
    const store = useGridSettingsStore.getState();
    store.setSize(100);
    expect(useGridSettingsStore.getState().size).toBe(50);
    store.setSize(-10);
    expect(useGridSettingsStore.getState().size).toBe(1);
  });

  it("toggles visibility", () => {
    const store = useGridSettingsStore.getState();
    expect(store.visible).toBe(true);
    store.toggleVisibility();
    expect(useGridSettingsStore.getState().visible).toBe(false);
    store.toggleVisibility();
    expect(useGridSettingsStore.getState().visible).toBe(true);
  });

  it("sets pattern", () => {
    const store = useGridSettingsStore.getState();
    store.setPattern("lines" as GridPattern);
    expect(useGridSettingsStore.getState().pattern).toBe("lines");
  });

  it("sets color", () => {
    const store = useGridSettingsStore.getState();
    store.setColor("#ff0000");
    expect(useGridSettingsStore.getState().color).toBe("#ff0000");
  });

  it("resets to defaults", () => {
    useGridSettingsStore.setState({ pattern: "lines", gap: 200, size: 15, color: "#ff0000", visible: false });
    const store = useGridSettingsStore.getState();
    store.resetToDefaults();
    const newState = useGridSettingsStore.getState();
    expect(newState.pattern).toBe("dots");
    expect(newState.gap).toBe(100);
    expect(newState.size).toBe(8);
    expect(newState.color).toBe("#3e4c5e");
    expect(newState.visible).toBe(true);
  });
});
