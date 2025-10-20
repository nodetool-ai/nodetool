import { renderHook, act, waitFor } from "@testing-library/react";
import useRemoteSettingsStore from "../RemoteSettingStore";
import * as ApiClient from "../ApiClient";

jest.mock("../ApiClient");

const mockClient = ApiClient.client as jest.Mocked<typeof ApiClient.client>;

describe("RemoteSettingStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRemoteSettingsStore.setState({
      settings: [],
      settingsByGroup: new Map(),
      isLoading: false,
      error: null
    });
  });

  describe("fetchSettings", () => {
    it("should fetch non-secret settings only", async () => {
      const mockData = [
        {
          package_name: "nodetool",
          env_var: "API_KEY",
          group: "API Services",
          description: "API key",
          is_secret: true,
          value: "********",
          enum: null
        },
        {
          package_name: "nodetool",
          env_var: "TIMEOUT",
          group: "Configuration",
          description: "Request timeout",
          is_secret: false,
          value: "30",
          enum: null
        },
        {
          package_name: "nodetool",
          env_var: "MAX_WORKERS",
          group: "Configuration",
          description: "Number of workers",
          is_secret: false,
          value: "4",
          enum: null
        }
      ];

      mockClient.GET.mockResolvedValueOnce({
        error: null,
        data: { settings: mockData }
      });

      const { result } = renderHook(() => useRemoteSettingsStore());

      let settings;
      await act(async () => {
        settings = await result.current.fetchSettings();
      });

      // All settings should be returned
      expect(settings).toEqual(mockData);
      expect(result.current.settings).toEqual(mockData);

      // But settingsByGroup should group them correctly
      expect(result.current.settingsByGroup.size).toBe(2);
      expect(result.current.settingsByGroup.get("API Services")).toEqual([mockData[0]]);
      expect(result.current.settingsByGroup.get("Configuration")).toEqual([
        mockData[1],
        mockData[2]
      ]);
    });

    it("should not store secrets in the store", async () => {
      const mockData = [
        {
          package_name: "nodetool",
          env_var: "SECRET_KEY",
          group: "Secrets",
          description: "Secret key",
          is_secret: true,
          value: "********",
          enum: null
        }
      ];

      mockClient.GET.mockResolvedValueOnce({
        error: null,
        data: { settings: mockData }
      });

      const { result } = renderHook(() => useRemoteSettingsStore());

      await act(async () => {
        await result.current.fetchSettings();
      });

      // Store should not have a 'secrets' field
      expect((result.current as any).secrets).toBeUndefined();
    });

    it("should group settings by group field", async () => {
      const mockData = [
        {
          package_name: "nodetool",
          env_var: "SETTING1",
          group: "GroupA",
          description: "Setting 1",
          is_secret: false,
          value: "value1",
          enum: null
        },
        {
          package_name: "nodetool",
          env_var: "SETTING2",
          group: "GroupA",
          description: "Setting 2",
          is_secret: false,
          value: "value2",
          enum: null
        },
        {
          package_name: "nodetool",
          env_var: "SETTING3",
          group: "GroupB",
          description: "Setting 3",
          is_secret: false,
          value: "value3",
          enum: null
        }
      ];

      mockClient.GET.mockResolvedValueOnce({
        error: null,
        data: { settings: mockData }
      });

      const { result } = renderHook(() => useRemoteSettingsStore());

      await act(async () => {
        await result.current.fetchSettings();
      });

      expect(result.current.settingsByGroup.get("GroupA")).toHaveLength(2);
      expect(result.current.settingsByGroup.get("GroupB")).toHaveLength(1);
    });

    it("should handle fetch error", async () => {
      mockClient.GET.mockResolvedValueOnce({
        error: { detail: "Failed to fetch" },
        data: null
      });

      const { result } = renderHook(() => useRemoteSettingsStore());

      await expect(
        act(async () => {
          await result.current.fetchSettings();
        })
      ).rejects.toThrow();
    });
  });

  describe("updateSettings", () => {
    it("should update non-secret settings only", async () => {
      mockClient.PUT.mockResolvedValueOnce({
        error: null,
        data: { message: "Settings updated" }
      });

      const { result } = renderHook(() => useRemoteSettingsStore());

      const settingsToUpdate = {
        TIMEOUT: "60",
        MAX_WORKERS: "8"
      };

      await act(async () => {
        await result.current.updateSettings(settingsToUpdate);
      });

      expect(mockClient.PUT).toHaveBeenCalledWith("/api/settings/", {
        body: {
          settings: settingsToUpdate,
          secrets: {} // Empty secrets dict
        }
      });
    });

    it("should accept settings parameter only", async () => {
      mockClient.PUT.mockResolvedValueOnce({
        error: null,
        data: { message: "Settings updated" }
      });

      const { result } = renderHook(() => useRemoteSettingsStore());

      const settingsToUpdate = {
        SETTING1: "value1"
      };

      await act(async () => {
        await result.current.updateSettings(settingsToUpdate);
      });

      // Verify the old API call that included secrets parameter would fail
      const callArgs = mockClient.PUT.mock.calls[0][1];
      expect(callArgs.body).toHaveProperty("settings");
      expect(callArgs.body).toHaveProperty("secrets");
      expect(callArgs.body.secrets).toEqual({});
    });

    it("should handle update error", async () => {
      mockClient.PUT.mockResolvedValueOnce({
        error: { detail: "Update failed" },
        data: null
      });

      const { result } = renderHook(() => useRemoteSettingsStore());

      await expect(
        act(async () => {
          await result.current.updateSettings({ KEY: "value" });
        })
      ).rejects.toThrow();
    });

    it("should set isLoading correctly", async () => {
      mockClient.PUT.mockResolvedValueOnce({
        error: null,
        data: { message: "Settings updated" }
      });

      const { result } = renderHook(() => useRemoteSettingsStore());

      await act(async () => {
        await result.current.updateSettings({ KEY: "value" });
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("getSettingValue", () => {
    it("should get setting value by env var", () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "TIMEOUT",
          group: "Configuration",
          description: "Timeout",
          is_secret: false,
          value: "30",
          enum: null
        }
      ];

      useRemoteSettingsStore.setState({ settings: mockSettings });

      const { result } = renderHook(() => useRemoteSettingsStore());

      const value = result.current.getSettingValue("TIMEOUT");
      expect(value).toBe("30");
    });

    it("should return undefined for non-existent setting", () => {
      useRemoteSettingsStore.setState({ settings: [] });

      const { result } = renderHook(() => useRemoteSettingsStore());

      const value = result.current.getSettingValue("NONEXISTENT");
      expect(value).toBeUndefined();
    });

    it("should return undefined for null values", () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "TIMEOUT",
          group: "Configuration",
          description: "Timeout",
          is_secret: false,
          value: null,
          enum: null
        }
      ];

      useRemoteSettingsStore.setState({ settings: mockSettings });

      const { result } = renderHook(() => useRemoteSettingsStore());

      const value = result.current.getSettingValue("TIMEOUT");
      expect(value).toBeUndefined();
    });
  });

  describe("setSettingValue", () => {
    it("should update setting value", () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "TIMEOUT",
          group: "Configuration",
          description: "Timeout",
          is_secret: false,
          value: "30",
          enum: null
        }
      ];

      useRemoteSettingsStore.setState({ settings: mockSettings });

      const { result } = renderHook(() => useRemoteSettingsStore());

      act(() => {
        result.current.setSettingValue("TIMEOUT", "60");
      });

      expect(result.current.getSettingValue("TIMEOUT")).toBe("60");
    });

    it("should not affect other settings", () => {
      const mockSettings = [
        {
          package_name: "nodetool",
          env_var: "TIMEOUT",
          group: "Configuration",
          description: "Timeout",
          is_secret: false,
          value: "30",
          enum: null
        },
        {
          package_name: "nodetool",
          env_var: "MAX_WORKERS",
          group: "Configuration",
          description: "Workers",
          is_secret: false,
          value: "4",
          enum: null
        }
      ];

      useRemoteSettingsStore.setState({ settings: mockSettings });

      const { result } = renderHook(() => useRemoteSettingsStore());

      act(() => {
        result.current.setSettingValue("TIMEOUT", "60");
      });

      expect(result.current.getSettingValue("TIMEOUT")).toBe("60");
      expect(result.current.getSettingValue("MAX_WORKERS")).toBe("4");
    });
  });

  describe("Store Separation from Secrets", () => {
    it("should not have secrets property", () => {
      const { result } = renderHook(() => useRemoteSettingsStore());

      const state = useRemoteSettingsStore.getState();
      expect(Object.keys(state)).not.toContain("secrets");
    });

    it("should not process secret settings into store", async () => {
      const mockData = [
        {
          package_name: "nodetool",
          env_var: "SECRET_KEY",
          group: "Secrets",
          description: "Secret key",
          is_secret: true,
          value: "********",
          enum: null
        },
        {
          package_name: "nodetool",
          env_var: "PUBLIC_SETTING",
          group: "Public",
          description: "Public setting",
          is_secret: false,
          value: "public_value",
          enum: null
        }
      ];

      mockClient.GET.mockResolvedValueOnce({
        error: null,
        data: { settings: mockData }
      });

      const { result } = renderHook(() => useRemoteSettingsStore());

      await act(async () => {
        await result.current.fetchSettings();
      });

      // Both should be in settings array
      expect(result.current.settings).toHaveLength(2);

      // But they should be grouped separately
      expect(result.current.settingsByGroup.get("Secrets")).toBeDefined();
      expect(result.current.settingsByGroup.get("Public")).toBeDefined();
    });
  });
});
