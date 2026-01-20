import { defaultSettings, defaultAutosaveSettings } from './SettingsStore';

describe('SettingsStore', () => {
  describe('defaultSettings', () => {
    it('has correct default values', () => {
      expect(defaultSettings.gridSnap).toBe(1);
      expect(defaultSettings.connectionSnap).toBe(20);
      expect(defaultSettings.panControls).toBe('LMB');
      expect(defaultSettings.selectionMode).toBe('partial');
      expect(defaultSettings.workflowOrder).toBe('name');
      expect(defaultSettings.assetsOrder).toBe('name');
      expect(defaultSettings.assetItemSize).toBe(2);
      expect(defaultSettings.timeFormat).toBe('12h');
      expect(defaultSettings.alertBeforeTabClose).toBe(true);
      expect(defaultSettings.selectNodesOnDrag).toBe(false);
      expect(defaultSettings.showWelcomeOnStartup).toBe(true);
      expect(defaultSettings.soundNotifications).toBe(true);
      expect(defaultSettings.instantUpdate).toBe(false);
    });

    it('has correct autosave defaults', () => {
      expect(defaultSettings.autosave.enabled).toBe(true);
      expect(defaultSettings.autosave.intervalMinutes).toBe(10);
      expect(defaultSettings.autosave.saveBeforeRun).toBe(true);
      expect(defaultSettings.autosave.saveOnClose).toBe(true);
      expect(defaultSettings.autosave.maxVersionsPerWorkflow).toBe(50);
      expect(defaultSettings.autosave.keepManualVersionsDays).toBe(90);
      expect(defaultSettings.autosave.keepAutosaveVersionsDays).toBe(7);
    });
  });

  describe('AutosaveSettings', () => {
    it('has correct default values', () => {
      expect(defaultAutosaveSettings.enabled).toBe(true);
      expect(defaultAutosaveSettings.intervalMinutes).toBe(10);
      expect(defaultAutosaveSettings.saveBeforeRun).toBe(true);
      expect(defaultAutosaveSettings.saveOnClose).toBe(true);
      expect(defaultAutosaveSettings.maxVersionsPerWorkflow).toBe(50);
      expect(defaultAutosaveSettings.keepManualVersionsDays).toBe(90);
      expect(defaultAutosaveSettings.keepAutosaveVersionsDays).toBe(7);
    });
  });
});
