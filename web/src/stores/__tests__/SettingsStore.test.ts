import {
  useSettingsStore
} from "../SettingsStore";

describe("SettingsStore", () => {
  const initialState = useSettingsStore.getState();

  afterEach(() => {
    useSettingsStore.setState(initialState, true);
    localStorage.clear();
  });

  describe("Initial State", () => {
    test("has correct default settings", () => {
      const settings = useSettingsStore.getState().settings;
      expect(settings.gridSnap).toBe(1);
      expect(settings.connectionSnap).toBe(20);
      expect(settings.panControls).toBe("LMB");
      expect(settings.selectionMode).toBe("partial");
      expect(settings.workflowOrder).toBe("name");
      expect(settings.assetsOrder).toBe("name");
      expect(settings.assetItemSize).toBe(2);
      expect(settings.timeFormat).toBe("12h");
      expect(settings.alertBeforeTabClose).toBe(true);
      expect(settings.selectNodesOnDrag).toBe(false);
      expect(settings.showWelcomeOnStartup).toBe(true);
      expect(settings.soundNotifications).toBe(true);
      expect(settings.instantUpdate).toBe(false);
    });

  });

  describe("Grid and Connection Settings", () => {
    test("setGridSnap updates value", () => {
      useSettingsStore.getState().setGridSnap(5);
      expect(useSettingsStore.getState().settings.gridSnap).toBe(5);
    });

    test("setGridSnap defaults to 1 when falsy value passed", () => {
      useSettingsStore.getState().setGridSnap(0);
      expect(useSettingsStore.getState().settings.gridSnap).toBe(1);
    });

    test("setConnectionSnap updates value", () => {
      useSettingsStore.getState().setConnectionSnap(15);
      expect(useSettingsStore.getState().settings.connectionSnap).toBe(15);
    });

    test("setConnectionSnap defaults to 20 when falsy value passed", () => {
      useSettingsStore.getState().setConnectionSnap(0);
      expect(useSettingsStore.getState().settings.connectionSnap).toBe(20);
    });
  });

  describe("Control Settings", () => {
    test("setPanControls updates value", () => {
      useSettingsStore.getState().setPanControls("RMB");
      expect(useSettingsStore.getState().settings.panControls).toBe("RMB");
    });

    test("setPanControls defaults to LMB when falsy value passed", () => {
      useSettingsStore.getState().setPanControls("");
      expect(useSettingsStore.getState().settings.panControls).toBe("LMB");
    });

    test("setSelectionMode updates value", () => {
      useSettingsStore.getState().setSelectionMode("full");
      expect(useSettingsStore.getState().settings.selectionMode).toBe("full");
    });

    test("setSelectionMode defaults to partial when falsy value passed", () => {
      useSettingsStore.getState().setSelectionMode("");
      expect(useSettingsStore.getState().settings.selectionMode).toBe(
        "partial"
      );
    });
  });

  describe("Order Settings", () => {
    test("setAssetsOrder updates to date", () => {
      useSettingsStore.getState().setAssetsOrder("date");
      expect(useSettingsStore.getState().settings.assetsOrder).toBe("date");
    });

    test("setAssetsOrder updates to size", () => {
      useSettingsStore.getState().setAssetsOrder("size");
      expect(useSettingsStore.getState().settings.assetsOrder).toBe("size");
    });

    test("setAssetsOrder defaults to name when falsy value passed", () => {
      useSettingsStore
        .getState()
        .setAssetsOrder("" as "name" | "date" | "size");
      expect(useSettingsStore.getState().settings.assetsOrder).toBe("name");
    });
  });

  describe("Display Settings", () => {
    test("setAssetItemSize updates value", () => {
      useSettingsStore.getState().setAssetItemSize(3);
      expect(useSettingsStore.getState().settings.assetItemSize).toBe(3);
    });

    test("setTimeFormat updates to 24h", () => {
      useSettingsStore.getState().setTimeFormat("24h");
      expect(useSettingsStore.getState().settings.timeFormat).toBe("24h");
    });

    test("setTimeFormat defaults to 12h when falsy value passed", () => {
      useSettingsStore.getState().setTimeFormat("" as "12h" | "24h");
      expect(useSettingsStore.getState().settings.timeFormat).toBe("12h");
    });
  });

  describe("Behavior Settings", () => {
    test("setSelectNodesOnDrag toggles value", () => {
      useSettingsStore.getState().setSelectNodesOnDrag(true);
      expect(useSettingsStore.getState().settings.selectNodesOnDrag).toBe(true);
      useSettingsStore.getState().setSelectNodesOnDrag(false);
      expect(useSettingsStore.getState().settings.selectNodesOnDrag).toBe(
        false
      );
    });

    test("setShowWelcomeOnStartup toggles value", () => {
      useSettingsStore.getState().setShowWelcomeOnStartup(false);
      expect(useSettingsStore.getState().settings.showWelcomeOnStartup).toBe(
        false
      );
      useSettingsStore.getState().setShowWelcomeOnStartup(true);
      expect(useSettingsStore.getState().settings.showWelcomeOnStartup).toBe(
        true
      );
    });

    test("setSoundNotifications toggles value", () => {
      useSettingsStore.getState().setSoundNotifications(false);
      expect(useSettingsStore.getState().settings.soundNotifications).toBe(
        false
      );
      useSettingsStore.getState().setSoundNotifications(true);
      expect(useSettingsStore.getState().settings.soundNotifications).toBe(
        true
      );
    });

    test("setInstantUpdate toggles value", () => {
      useSettingsStore.getState().setInstantUpdate(true);
      expect(useSettingsStore.getState().settings.instantUpdate).toBe(true);
      useSettingsStore.getState().setInstantUpdate(false);
      expect(useSettingsStore.getState().settings.instantUpdate).toBe(false);
    });
  });

  describe("updateSettings", () => {
    test("updateSettings merges partial settings", () => {
      useSettingsStore
        .getState()
        .updateSettings({ panControls: "RMB", alertBeforeTabClose: false });
      const settings = useSettingsStore.getState().settings;
      expect(settings.panControls).toBe("RMB");
      expect(settings.alertBeforeTabClose).toBe(false);
    });

    test("updateSettings preserves other settings", () => {
      useSettingsStore.getState().setGridSnap(10);
      useSettingsStore.getState().updateSettings({ panControls: "RMB" });
      const settings = useSettingsStore.getState().settings;
      expect(settings.gridSnap).toBe(10);
      expect(settings.panControls).toBe("RMB");
    });

    test("updateSettings with multiple properties", () => {
      useSettingsStore.getState().updateSettings({
        gridSnap: 5,
        connectionSnap: 30,
        selectionMode: "full",
        soundNotifications: false
      });
      const settings = useSettingsStore.getState().settings;
      expect(settings.gridSnap).toBe(5);
      expect(settings.connectionSnap).toBe(30);
      expect(settings.selectionMode).toBe("full");
      expect(settings.soundNotifications).toBe(false);
    });
  });

  describe("Autosave Settings", () => {
    test("default autosave settings are present", () => {
      const settings = useSettingsStore.getState().settings;
      expect(settings.autosave).toBeDefined();
      expect(settings.autosave.enabled).toBe(true);
      expect(settings.autosave.intervalMinutes).toBe(10);
      expect(settings.autosave.saveBeforeRun).toBe(true);
      expect(settings.autosave.saveOnClose).toBe(true);
      expect(settings.autosave.maxVersionsPerWorkflow).toBe(50);
      expect(settings.autosave.keepManualVersionsDays).toBe(90);
      expect(settings.autosave.keepAutosaveVersionsDays).toBe(7);
    });

    test("updateAutosaveSettings updates only autosave properties", () => {
      useSettingsStore
        .getState()
        .updateAutosaveSettings({ enabled: false, intervalMinutes: 5 });
      const settings = useSettingsStore.getState().settings;
      expect(settings.autosave.enabled).toBe(false);
      expect(settings.autosave.intervalMinutes).toBe(5);
      expect(settings.autosave.saveBeforeRun).toBe(true);
    });

    test("updateAutosaveSettings preserves other settings", () => {
      useSettingsStore.getState().setGridSnap(10);
      useSettingsStore.getState().updateAutosaveSettings({ enabled: false });
      const settings = useSettingsStore.getState().settings;
      expect(settings.gridSnap).toBe(10);
      expect(settings.autosave.enabled).toBe(false);
    });

    test("updateAutosaveSettings with multiple properties", () => {
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

  describe("Default Values", () => {
    test("store has correct default settings structure", () => {
      const settings = useSettingsStore.getState().settings;
      expect(settings.gridSnap).toBeDefined();
      expect(settings.connectionSnap).toBeDefined();
      expect(settings.panControls).toBeDefined();
      expect(settings.selectionMode).toBeDefined();
      expect(settings.workflowOrder).toBeDefined();
      expect(settings.assetsOrder).toBeDefined();
      expect(settings.assetItemSize).toBeDefined();
      expect(settings.timeFormat).toBeDefined();
      expect(settings.alertBeforeTabClose).toBeDefined();
      expect(settings.selectNodesOnDrag).toBeDefined();
      expect(settings.showWelcomeOnStartup).toBeDefined();
      expect(settings.soundNotifications).toBeDefined();
      expect(settings.instantUpdate).toBeDefined();
      expect(settings.autosave).toBeDefined();
    });
  });
});
