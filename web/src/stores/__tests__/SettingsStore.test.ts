import { useSettingsStore, defaultSettings, defaultAutosaveSettings } from '../SettingsStore';

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

  describe('Autosave Settings', () => {
    test('default autosave settings are present', () => {
      const settings = useSettingsStore.getState().settings;
      expect(settings.autosave).toBeDefined();
      expect(settings.autosave.enabled).toBe(defaultAutosaveSettings.enabled);
      expect(settings.autosave.intervalMinutes).toBe(defaultAutosaveSettings.intervalMinutes);
    });

    test('updateAutosaveSettings updates only autosave properties', () => {
      useSettingsStore.getState().updateAutosaveSettings({ enabled: false, intervalMinutes: 5 });
      const settings = useSettingsStore.getState().settings;
      expect(settings.autosave.enabled).toBe(false);
      expect(settings.autosave.intervalMinutes).toBe(5);
      // Other autosave settings should remain default
      expect(settings.autosave.saveBeforeRun).toBe(defaultAutosaveSettings.saveBeforeRun);
    });

    test('updateAutosaveSettings preserves other settings', () => {
      useSettingsStore.getState().setGridSnap(10);
      useSettingsStore.getState().updateAutosaveSettings({ enabled: false });
      const settings = useSettingsStore.getState().settings;
      expect(settings.gridSnap).toBe(10);
      expect(settings.autosave.enabled).toBe(false);
    });
  });

  describe('Audio Input Device Settings', () => {
    test('default audio input device is empty string (system default)', () => {
      const settings = useSettingsStore.getState().settings;
      expect(settings.defaultAudioInputDeviceId).toBe('');
    });

    test('setDefaultAudioInputDeviceId updates device ID', () => {
      useSettingsStore.getState().setDefaultAudioInputDeviceId('device-123');
      const settings = useSettingsStore.getState().settings;
      expect(settings.defaultAudioInputDeviceId).toBe('device-123');
    });

    test('setDefaultAudioInputDeviceId can set to empty string for system default', () => {
      useSettingsStore.getState().setDefaultAudioInputDeviceId('device-123');
      useSettingsStore.getState().setDefaultAudioInputDeviceId('');
      const settings = useSettingsStore.getState().settings;
      expect(settings.defaultAudioInputDeviceId).toBe('');
    });

    test('setDefaultAudioInputDeviceId preserves other settings', () => {
      useSettingsStore.getState().setGridSnap(15);
      useSettingsStore.getState().setDefaultAudioInputDeviceId('device-456');
      const settings = useSettingsStore.getState().settings;
      expect(settings.gridSnap).toBe(15);
      expect(settings.defaultAudioInputDeviceId).toBe('device-456');
    });

    test('resetSettings restores default audio input device', () => {
      useSettingsStore.getState().setDefaultAudioInputDeviceId('device-789');
      useSettingsStore.getState().resetSettings();
      const settings = useSettingsStore.getState().settings;
      expect(settings.defaultAudioInputDeviceId).toBe(defaultSettings.defaultAudioInputDeviceId);
    });
  });
});
