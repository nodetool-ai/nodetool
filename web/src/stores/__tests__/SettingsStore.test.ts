import { useSettingsStore, defaultSettings } from '../SettingsStore';

describe('SettingsStore', () => {
  const initialState = useSettingsStore.getState();

  afterEach(() => {
    useSettingsStore.setState(initialState, true);
    localStorage.clear();
  });

  test('setGridSnap updates value', () => {
    useSettingsStore.getState().setGridSnap(5);
    expect(useSettingsStore.getState().settings.gridSnap).toBe(5);
  });

  test('updateSettings merges partial settings', () => {
    useSettingsStore.getState().updateSettings({ panControls: 'RMB', alertBeforeTabClose: false });
    const settings = useSettingsStore.getState().settings;
    expect(settings.panControls).toBe('RMB');
    expect(settings.alertBeforeTabClose).toBe(false);
  });

  test('resetSettings restores defaults', () => {
    useSettingsStore.getState().setGridSnap(3);
    useSettingsStore.getState().resetSettings();
    expect(useSettingsStore.getState().settings.gridSnap).toBe(defaultSettings.gridSnap);
  });
});
