import { useSettingsStore, defaultSettings, defaultAutosaveSettings } from '../SettingsStore';

describe('SettingsStore', () => {
  const initialState = useSettingsStore.getState();

  afterEach(() => {
    useSettingsStore.setState(initialState, true);
    localStorage.clear();
  });

  describe('Initial State', () => {
    test('has correct default settings', () => {
      const settings = useSettingsStore.getState().settings;
      expect(settings.gridSnap).toBe(1);
      expect(settings.connectionSnap).toBe(20);
      expect(settings.panControls).toBe('LMB');
      expect(settings.selectionMode).toBe('partial');
      expect(settings.workflowOrder).toBe('name');
      expect(settings.assetsOrder).toBe('name');
      expect(settings.assetItemSize).toBe(2);
      expect(settings.timeFormat).toBe('12h');
      expect(settings.alertBeforeTabClose).toBe(true);
      expect(settings.selectNodesOnDrag).toBe(false);
      expect(settings.showWelcomeOnStartup).toBe(true);
      expect(settings.soundNotifications).toBe(true);
      expect(settings.instantUpdate).toBe(false);
    });

    test('isMenuOpen and settingsTab have correct defaults', () => {
      expect(useSettingsStore.getState().isMenuOpen).toBe(false);
      expect(useSettingsStore.getState().settingsTab).toBe(0);
    });
  });

  describe('Grid and Connection Settings', () => {
    test('setGridSnap updates value', () => {
      useSettingsStore.getState().setGridSnap(5);
      expect(useSettingsStore.getState().settings.gridSnap).toBe(5);
    });

    test('setGridSnap defaults to 1 when falsy value passed', () => {
      useSettingsStore.getState().setGridSnap(0);
      expect(useSettingsStore.getState().settings.gridSnap).toBe(1);
    });

    test('setConnectionSnap updates value', () => {
      useSettingsStore.getState().setConnectionSnap(15);
      expect(useSettingsStore.getState().settings.connectionSnap).toBe(15);
    });

    test('setConnectionSnap defaults to 20 when falsy value passed', () => {
      useSettingsStore.getState().setConnectionSnap(0);
      expect(useSettingsStore.getState().settings.connectionSnap).toBe(20);
    });
  });

  describe('Control Settings', () => {
    test('setPanControls updates value', () => {
      useSettingsStore.getState().setPanControls('RMB');
      expect(useSettingsStore.getState().settings.panControls).toBe('RMB');
    });

    test('setPanControls defaults to LMB when falsy value passed', () => {
      useSettingsStore.getState().setPanControls('');
      expect(useSettingsStore.getState().settings.panControls).toBe('LMB');
    });

    test('setSelectionMode updates value', () => {
      useSettingsStore.getState().setSelectionMode('full');
      expect(useSettingsStore.getState().settings.selectionMode).toBe('full');
    });

    test('setSelectionMode defaults to partial when falsy value passed', () => {
      useSettingsStore.getState().setSelectionMode('');
      expect(useSettingsStore.getState().settings.selectionMode).toBe('partial');
    });
  });

  describe('Order Settings', () => {
    test('setWorkflowOrder updates to date', () => {
      useSettingsStore.getState().setWorkflowOrder('date');
      expect(useSettingsStore.getState().settings.workflowOrder).toBe('date');
    });

    test('setWorkflowOrder defaults to name when falsy value passed', () => {
      useSettingsStore.getState().setWorkflowOrder('' as 'name' | 'date');
      expect(useSettingsStore.getState().settings.workflowOrder).toBe('name');
    });

    test('setAssetsOrder updates to date', () => {
      useSettingsStore.getState().setAssetsOrder('date');
      expect(useSettingsStore.getState().settings.assetsOrder).toBe('date');
    });

    test('setAssetsOrder updates to size', () => {
      useSettingsStore.getState().setAssetsOrder('size');
      expect(useSettingsStore.getState().settings.assetsOrder).toBe('size');
    });

    test('setAssetsOrder defaults to name when falsy value passed', () => {
      useSettingsStore.getState().setAssetsOrder('' as 'name' | 'date' | 'size');
      expect(useSettingsStore.getState().settings.assetsOrder).toBe('name');
    });
  });

  describe('Display Settings', () => {
    test('setAssetItemSize updates value', () => {
      useSettingsStore.getState().setAssetItemSize(3);
      expect(useSettingsStore.getState().settings.assetItemSize).toBe(3);
    });

    test('setTimeFormat updates to 24h', () => {
      useSettingsStore.getState().setTimeFormat('24h');
      expect(useSettingsStore.getState().settings.timeFormat).toBe('24h');
    });

    test('setTimeFormat defaults to 12h when falsy value passed', () => {
      useSettingsStore.getState().setTimeFormat('' as '12h' | '24h');
      expect(useSettingsStore.getState().settings.timeFormat).toBe('12h');
    });
  });

  describe('Behavior Settings', () => {
    test('setAlertBeforeTabClose toggles value', () => {
      useSettingsStore.getState().setAlertBeforeTabClose(false);
      expect(useSettingsStore.getState().settings.alertBeforeTabClose).toBe(false);
      useSettingsStore.getState().setAlertBeforeTabClose(true);
      expect(useSettingsStore.getState().settings.alertBeforeTabClose).toBe(true);
    });

    test('setSelectNodesOnDrag toggles value', () => {
      useSettingsStore.getState().setSelectNodesOnDrag(true);
      expect(useSettingsStore.getState().settings.selectNodesOnDrag).toBe(true);
      useSettingsStore.getState().setSelectNodesOnDrag(false);
      expect(useSettingsStore.getState().settings.selectNodesOnDrag).toBe(false);
    });

    test('setShowWelcomeOnStartup toggles value', () => {
      useSettingsStore.getState().setShowWelcomeOnStartup(false);
      expect(useSettingsStore.getState().settings.showWelcomeOnStartup).toBe(false);
      useSettingsStore.getState().setShowWelcomeOnStartup(true);
      expect(useSettingsStore.getState().settings.showWelcomeOnStartup).toBe(true);
    });

    test('setSoundNotifications toggles value', () => {
      useSettingsStore.getState().setSoundNotifications(false);
      expect(useSettingsStore.getState().settings.soundNotifications).toBe(false);
      useSettingsStore.getState().setSoundNotifications(true);
      expect(useSettingsStore.getState().settings.soundNotifications).toBe(true);
    });

    test('setInstantUpdate toggles value', () => {
      useSettingsStore.getState().setInstantUpdate(true);
      expect(useSettingsStore.getState().settings.instantUpdate).toBe(true);
      useSettingsStore.getState().setInstantUpdate(false);
      expect(useSettingsStore.getState().settings.instantUpdate).toBe(false);
    });
  });

  describe('updateSettings', () => {
    test('updateSettings merges partial settings', () => {
      useSettingsStore.getState().updateSettings({ panControls: 'RMB', alertBeforeTabClose: false });
      const settings = useSettingsStore.getState().settings;
      expect(settings.panControls).toBe('RMB');
      expect(settings.alertBeforeTabClose).toBe(false);
    });

    test('updateSettings preserves other settings', () => {
      useSettingsStore.getState().setGridSnap(10);
      useSettingsStore.getState().updateSettings({ panControls: 'RMB' });
      const settings = useSettingsStore.getState().settings;
      expect(settings.gridSnap).toBe(10);
      expect(settings.panControls).toBe('RMB');
    });

    test('updateSettings with multiple properties', () => {
      useSettingsStore.getState().updateSettings({
        gridSnap: 5,
        connectionSnap: 30,
        selectionMode: 'full',
        soundNotifications: false
      });
      const settings = useSettingsStore.getState().settings;
      expect(settings.gridSnap).toBe(5);
      expect(settings.connectionSnap).toBe(30);
      expect(settings.selectionMode).toBe('full');
      expect(settings.soundNotifications).toBe(false);
    });
  });

  describe('resetSettings', () => {
    test('resetSettings restores all defaults', () => {
      useSettingsStore.getState().setGridSnap(3);
      useSettingsStore.getState().setPanControls('RMB');
      useSettingsStore.getState().setSelectionMode('full');
      useSettingsStore.getState().setSoundNotifications(false);
      useSettingsStore.getState().setInstantUpdate(true);
      
      useSettingsStore.getState().resetSettings();
      
      expect(useSettingsStore.getState().settings).toEqual(defaultSettings);
    });
  });

  describe('Menu and Tab State', () => {
    test('setMenuOpen opens menu with default tab', () => {
      useSettingsStore.getState().setMenuOpen(true);
      expect(useSettingsStore.getState().isMenuOpen).toBe(true);
      expect(useSettingsStore.getState().settingsTab).toBe(0);
    });

    test('setMenuOpen opens menu with specific tab', () => {
      useSettingsStore.getState().setMenuOpen(true, 2);
      expect(useSettingsStore.getState().isMenuOpen).toBe(true);
      expect(useSettingsStore.getState().settingsTab).toBe(2);
    });

    test('setMenuOpen closes menu', () => {
      useSettingsStore.getState().setMenuOpen(true);
      useSettingsStore.getState().setMenuOpen(false);
      expect(useSettingsStore.getState().isMenuOpen).toBe(false);
    });
  });

  describe('Autosave Settings', () => {
    test('default autosave settings are present', () => {
      const settings = useSettingsStore.getState().settings;
      expect(settings.autosave).toBeDefined();
      expect(settings.autosave.enabled).toBe(defaultAutosaveSettings.enabled);
      expect(settings.autosave.intervalMinutes).toBe(defaultAutosaveSettings.intervalMinutes);
      expect(settings.autosave.saveBeforeRun).toBe(defaultAutosaveSettings.saveBeforeRun);
      expect(settings.autosave.saveOnClose).toBe(defaultAutosaveSettings.saveOnClose);
      expect(settings.autosave.maxVersionsPerWorkflow).toBe(defaultAutosaveSettings.maxVersionsPerWorkflow);
      expect(settings.autosave.keepManualVersionsDays).toBe(defaultAutosaveSettings.keepManualVersionsDays);
      expect(settings.autosave.keepAutosaveVersionsDays).toBe(defaultAutosaveSettings.keepAutosaveVersionsDays);
    });

    test('updateAutosaveSettings updates only autosave properties', () => {
      useSettingsStore.getState().updateAutosaveSettings({ enabled: false, intervalMinutes: 5 });
      const settings = useSettingsStore.getState().settings;
      expect(settings.autosave.enabled).toBe(false);
      expect(settings.autosave.intervalMinutes).toBe(5);
      expect(settings.autosave.saveBeforeRun).toBe(defaultAutosaveSettings.saveBeforeRun);
    });

    test('updateAutosaveSettings preserves other settings', () => {
      useSettingsStore.getState().setGridSnap(10);
      useSettingsStore.getState().updateAutosaveSettings({ enabled: false });
      const settings = useSettingsStore.getState().settings;
      expect(settings.gridSnap).toBe(10);
      expect(settings.autosave.enabled).toBe(false);
    });

    test('updateAutosaveSettings with multiple properties', () => {
      useSettingsStore.getState().updateAutosaveSettings({
        enabled: false,
        intervalMinutes: 30,
        saveBeforeRun: false,
        saveOnClose: false,
        maxVersionsPerWorkflow: 100,
        keepManualVersionsDays: 180,
        keepAutosaveVersionsDays: 14
      });
      const autosave = useSettingsStore.getState().settings.autosave;
      expect(autosave.enabled).toBe(false);
      expect(autosave.intervalMinutes).toBe(30);
      expect(autosave.saveBeforeRun).toBe(false);
      expect(autosave.saveOnClose).toBe(false);
      expect(autosave.maxVersionsPerWorkflow).toBe(100);
      expect(autosave.keepManualVersionsDays).toBe(180);
      expect(autosave.keepAutosaveVersionsDays).toBe(14);
    });
  });

  describe('Default Values', () => {
    test('defaultSettings has correct structure', () => {
      expect(defaultSettings.gridSnap).toBeDefined();
      expect(defaultSettings.connectionSnap).toBeDefined();
      expect(defaultSettings.panControls).toBeDefined();
      expect(defaultSettings.selectionMode).toBeDefined();
      expect(defaultSettings.workflowOrder).toBeDefined();
      expect(defaultSettings.assetsOrder).toBeDefined();
      expect(defaultSettings.assetItemSize).toBeDefined();
      expect(defaultSettings.timeFormat).toBeDefined();
      expect(defaultSettings.alertBeforeTabClose).toBeDefined();
      expect(defaultSettings.selectNodesOnDrag).toBeDefined();
      expect(defaultSettings.showWelcomeOnStartup).toBeDefined();
      expect(defaultSettings.soundNotifications).toBeDefined();
      expect(defaultSettings.instantUpdate).toBeDefined();
      expect(defaultSettings.autosave).toBeDefined();
    });

    test('defaultAutosaveSettings has correct structure', () => {
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
