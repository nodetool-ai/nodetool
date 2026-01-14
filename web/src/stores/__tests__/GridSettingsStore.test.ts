import { useGridSettingsStore, defaultGridSettings } from '../GridSettingsStore';

describe('GridSettingsStore', () => {
  const initialState = useGridSettingsStore.getState();

  afterEach(() => {
    useGridSettingsStore.setState(initialState, true);
    localStorage.clear();
  });

  test('default grid settings are correct', () => {
    const settings = useGridSettingsStore.getState().gridSettings;
    expect(settings.visible).toBe(true);
    expect(settings.gap).toBe(20);
    expect(settings.size).toBe(1);
    expect(settings.color).toBe("#888888");
    expect(settings.variant).toBe("cross");
  });

  test('setGridVisible toggles visibility', () => {
    expect(useGridSettingsStore.getState().gridSettings.visible).toBe(true);
    useGridSettingsStore.getState().setGridVisible(false);
    expect(useGridSettingsStore.getState().gridSettings.visible).toBe(false);
    useGridSettingsStore.getState().setGridVisible(true);
    expect(useGridSettingsStore.getState().gridSettings.visible).toBe(true);
  });

  test('setGridGap updates gap value with clamping', () => {
    useGridSettingsStore.getState().setGridGap(50);
    expect(useGridSettingsStore.getState().gridSettings.gap).toBe(50);

    useGridSettingsStore.getState().setGridGap(5);
    expect(useGridSettingsStore.getState().gridSettings.gap).toBe(10);

    useGridSettingsStore.getState().setGridGap(150);
    expect(useGridSettingsStore.getState().gridSettings.gap).toBe(100);
  });

  test('setGridSize updates size value with clamping', () => {
    useGridSettingsStore.getState().setGridSize(2);
    expect(useGridSettingsStore.getState().gridSettings.size).toBe(2);

    useGridSettingsStore.getState().setGridSize(0.1);
    expect(useGridSettingsStore.getState().gridSettings.size).toBe(0.5);

    useGridSettingsStore.getState().setGridSize(10);
    expect(useGridSettingsStore.getState().gridSettings.size).toBe(5);
  });

  test('setGridColor updates color', () => {
    useGridSettingsStore.getState().setGridColor("#ff0000");
    expect(useGridSettingsStore.getState().gridSettings.color).toBe("#ff0000");
  });

  test('setGridVariant updates variant', () => {
    expect(useGridSettingsStore.getState().gridSettings.variant).toBe("cross");
    useGridSettingsStore.getState().setGridVariant("dots");
    expect(useGridSettingsStore.getState().gridSettings.variant).toBe("dots");
  });

  test('setGridSettings merges partial settings', () => {
    useGridSettingsStore.getState().setGridSettings({
      visible: false,
      gap: 30
    });
    const settings = useGridSettingsStore.getState().gridSettings;
    expect(settings.visible).toBe(false);
    expect(settings.gap).toBe(30);
    expect(settings.size).toBe(1);
    expect(settings.color).toBe("#888888");
  });

  test('resetGridSettings restores defaults', () => {
    useGridSettingsStore.getState().setGridVisible(false);
    useGridSettingsStore.getState().setGridGap(50);
    useGridSettingsStore.getState().setGridColor("#ff0000");
    useGridSettingsStore.getState().resetGridSettings();
    const settings = useGridSettingsStore.getState().gridSettings;
    expect(settings).toEqual(defaultGridSettings);
  });

  test('togglePanel toggles panel open state', () => {
    expect(useGridSettingsStore.getState().isPanelOpen).toBe(false);
    useGridSettingsStore.getState().togglePanel();
    expect(useGridSettingsStore.getState().isPanelOpen).toBe(true);
    useGridSettingsStore.getState().togglePanel();
    expect(useGridSettingsStore.getState().isPanelOpen).toBe(false);
  });

  test('setPanelOpen sets panel open state', () => {
    useGridSettingsStore.getState().setPanelOpen(true);
    expect(useGridSettingsStore.getState().isPanelOpen).toBe(true);
    useGridSettingsStore.getState().setPanelOpen(false);
    expect(useGridSettingsStore.getState().isPanelOpen).toBe(false);
  });
});
