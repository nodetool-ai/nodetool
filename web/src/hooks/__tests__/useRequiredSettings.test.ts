import { renderHook } from "@testing-library/react";
import { useRequiredSettings } from "../useRequiredSettings";
import useMetadataStore from "../../stores/MetadataStore";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";

jest.mock("../../stores/MetadataStore");
jest.mock("../../stores/RemoteSettingStore");

const mockUseMetadataStore = useMetadataStore as jest.MockedFunction<typeof useMetadataStore>;
const mockUseRemoteSettingsStore = useRemoteSettingsStore as jest.MockedFunction<typeof useRemoteSettingsStore>;

describe("useRequiredSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when node has no metadata", () => {
    it("returns empty array", () => {
      mockUseMetadataStore.mockImplementation((selector: any) => {
        if (selector.name === "getMetadata") {
          return () => undefined;
        }
        return selector({
          metadata: {},
          getMetadata: () => undefined,
          setMetadata: jest.fn(),
          recommendedModels: [],
          setRecommendedModels: jest.fn(),
          modelPacks: [],
          setModelPacks: jest.fn(),
          nodeTypes: {},
          setNodeTypes: jest.fn(),
          addNodeType: jest.fn()
        });
      });

      mockUseRemoteSettingsStore.mockImplementation((selector: any) =>
        selector({
          settings: [],
          settingsByGroup: new Map(),
          isLoading: false,
          error: null,
          fetchSettings: jest.fn(),
          updateSettings: jest.fn(),
          getSettingValue: jest.fn(),
          setSettingValue: jest.fn()
        })
      );

      const { result } = renderHook(() => useRequiredSettings("test.node"));

      expect(result.current).toEqual([]);
    });
  });

  describe("when node has no required settings", () => {
    it("returns empty array", () => {
      mockUseMetadataStore.mockImplementation((selector: any) => {
        if (selector.name === "getMetadata") {
          return () => ({
            title: "Test Node",
            node_type: "test.node",
            namespace: "test",
            description: "Test",
            layout: "default",
            properties: [],
            outputs: [],
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false
          });
        }
        return selector({
          metadata: {},
          getMetadata: () => ({
            title: "Test Node",
            node_type: "test.node",
            namespace: "test",
            description: "Test",
            layout: "default",
            properties: [],
            outputs: [],
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false
          }),
          setMetadata: jest.fn(),
          recommendedModels: [],
          setRecommendedModels: jest.fn(),
          modelPacks: [],
          setModelPacks: jest.fn(),
          nodeTypes: {},
          setNodeTypes: jest.fn(),
          addNodeType: jest.fn()
        });
      });

      mockUseRemoteSettingsStore.mockImplementation((selector: any) =>
        selector({
          settings: [],
          settingsByGroup: new Map(),
          isLoading: false,
          error: null,
          fetchSettings: jest.fn(),
          updateSettings: jest.fn(),
          getSettingValue: jest.fn(),
          setSettingValue: jest.fn()
        })
      );

      const { result } = renderHook(() => useRequiredSettings("test.node"));

      expect(result.current).toEqual([]);
    });
  });

  describe("when node has required settings", () => {
    it("returns missing settings when none are configured", () => {
      mockUseMetadataStore.mockImplementation((selector: any) => {
        if (selector.name === "getMetadata") {
          return () => ({
            title: "Test Node",
            node_type: "test.node",
            namespace: "test",
            description: "Test",
            layout: "default",
            properties: [],
            outputs: [],
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false,
            required_settings: ["API_KEY", "SECRET_TOKEN"]
          });
        }
        return selector({
          metadata: {},
          getMetadata: () => ({
            title: "Test Node",
            node_type: "test.node",
            namespace: "test",
            description: "Test",
            layout: "default",
            properties: [],
            outputs: [],
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false,
            required_settings: ["API_KEY", "SECRET_TOKEN"]
          }),
          setMetadata: jest.fn(),
          recommendedModels: [],
          setRecommendedModels: jest.fn(),
          modelPacks: [],
          setModelPacks: jest.fn(),
          nodeTypes: {},
          setNodeTypes: jest.fn(),
          addNodeType: jest.fn()
        });
      });

      mockUseRemoteSettingsStore.mockImplementation((selector: any) =>
        selector({
          settings: [],
          settingsByGroup: new Map(),
          isLoading: false,
          error: null,
          fetchSettings: jest.fn(),
          updateSettings: jest.fn(),
          getSettingValue: jest.fn(),
          setSettingValue: jest.fn()
        })
      );

      const { result } = renderHook(() => useRequiredSettings("test.node"));

      expect(result.current).toEqual(["API_KEY", "SECRET_TOKEN"]);
    });

    it("returns empty array when all required settings are configured", () => {
      mockUseMetadataStore.mockImplementation((selector: any) => {
        if (selector.name === "getMetadata") {
          return () => ({
            title: "Test Node",
            node_type: "test.node",
            namespace: "test",
            description: "Test",
            layout: "default",
            properties: [],
            outputs: [],
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false,
            required_settings: ["API_KEY", "SECRET_TOKEN"]
          });
        }
        return selector({
          metadata: {},
          getMetadata: () => ({
            title: "Test Node",
            node_type: "test.node",
            namespace: "test",
            description: "Test",
            layout: "default",
            properties: [],
            outputs: [],
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false,
            required_settings: ["API_KEY", "SECRET_TOKEN"]
          }),
          setMetadata: jest.fn(),
          recommendedModels: [],
          setRecommendedModels: jest.fn(),
          modelPacks: [],
          setModelPacks: jest.fn(),
          nodeTypes: {},
          setNodeTypes: jest.fn(),
          addNodeType: jest.fn()
        });
      });

      mockUseRemoteSettingsStore.mockImplementation((selector: any) =>
        selector({
          settings: [
            {
              env_var: "API_KEY",
              value: "some-api-key",
              is_secret: true,
              label: "API Key",
              description: "Test API Key",
              group: "test"
            },
            {
              env_var: "SECRET_TOKEN",
              value: "some-token",
              is_secret: true,
              label: "Secret Token",
              description: "Test Token",
              group: "test"
            }
          ],
          settingsByGroup: new Map(),
          isLoading: false,
          error: null,
          fetchSettings: jest.fn(),
          updateSettings: jest.fn(),
          getSettingValue: jest.fn(),
          setSettingValue: jest.fn()
        })
      );

      const { result } = renderHook(() => useRequiredSettings("test.node"));

      expect(result.current).toEqual([]);
    });

    it("returns only missing settings when some are configured", () => {
      mockUseMetadataStore.mockImplementation((selector: any) => {
        if (selector.name === "getMetadata") {
          return () => ({
            title: "Test Node",
            node_type: "test.node",
            namespace: "test",
            description: "Test",
            layout: "default",
            properties: [],
            outputs: [],
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false,
            required_settings: ["API_KEY", "SECRET_TOKEN", "ANOTHER_KEY"]
          });
        }
        return selector({
          metadata: {},
          getMetadata: () => ({
            title: "Test Node",
            node_type: "test.node",
            namespace: "test",
            description: "Test",
            layout: "default",
            properties: [],
            outputs: [],
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false,
            required_settings: ["API_KEY", "SECRET_TOKEN", "ANOTHER_KEY"]
          }),
          setMetadata: jest.fn(),
          recommendedModels: [],
          setRecommendedModels: jest.fn(),
          modelPacks: [],
          setModelPacks: jest.fn(),
          nodeTypes: {},
          setNodeTypes: jest.fn(),
          addNodeType: jest.fn()
        });
      });

      mockUseRemoteSettingsStore.mockImplementation((selector: any) =>
        selector({
          settings: [
            {
              env_var: "API_KEY",
              value: "some-api-key",
              is_secret: true,
              label: "API Key",
              description: "Test API Key",
              group: "test"
            }
          ],
          settingsByGroup: new Map(),
          isLoading: false,
          error: null,
          fetchSettings: jest.fn(),
          updateSettings: jest.fn(),
          getSettingValue: jest.fn(),
          setSettingValue: jest.fn()
        })
      );

      const { result } = renderHook(() => useRequiredSettings("test.node"));

      expect(result.current).toEqual(["SECRET_TOKEN", "ANOTHER_KEY"]);
    });

    it("treats empty string values as missing", () => {
      mockUseMetadataStore.mockImplementation((selector: any) => {
        if (selector.name === "getMetadata") {
          return () => ({
            title: "Test Node",
            node_type: "test.node",
            namespace: "test",
            description: "Test",
            layout: "default",
            properties: [],
            outputs: [],
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false,
            required_settings: ["API_KEY"]
          });
        }
        return selector({
          metadata: {},
          getMetadata: () => ({
            title: "Test Node",
            node_type: "test.node",
            namespace: "test",
            description: "Test",
            layout: "default",
            properties: [],
            outputs: [],
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false,
            required_settings: ["API_KEY"]
          }),
          setMetadata: jest.fn(),
          recommendedModels: [],
          setRecommendedModels: jest.fn(),
          modelPacks: [],
          setModelPacks: jest.fn(),
          nodeTypes: {},
          setNodeTypes: jest.fn(),
          addNodeType: jest.fn()
        });
      });

      mockUseRemoteSettingsStore.mockImplementation((selector: any) =>
        selector({
          settings: [
            {
              env_var: "API_KEY",
              value: "  ",
              is_secret: true,
              label: "API Key",
              description: "Test API Key",
              group: "test"
            }
          ],
          settingsByGroup: new Map(),
          isLoading: false,
          error: null,
          fetchSettings: jest.fn(),
          updateSettings: jest.fn(),
          getSettingValue: jest.fn(),
          setSettingValue: jest.fn()
        })
      );

      const { result } = renderHook(() => useRequiredSettings("test.node"));

      expect(result.current).toEqual(["API_KEY"]);
    });
  });

  describe("loading state", () => {
    it("returns empty array while loading", () => {
      mockUseMetadataStore.mockImplementation((selector: any) => {
        if (selector.name === "getMetadata") {
          return () => ({
            title: "Test Node",
            node_type: "test.node",
            namespace: "test",
            description: "Test",
            layout: "default",
            properties: [],
            outputs: [],
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false,
            required_settings: ["API_KEY"]
          });
        }
        return selector({
          metadata: {},
          getMetadata: () => ({
            title: "Test Node",
            node_type: "test.node",
            namespace: "test",
            description: "Test",
            layout: "default",
            properties: [],
            outputs: [],
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false,
            required_settings: ["API_KEY"]
          }),
          setMetadata: jest.fn(),
          recommendedModels: [],
          setRecommendedModels: jest.fn(),
          modelPacks: [],
          setModelPacks: jest.fn(),
          nodeTypes: {},
          setNodeTypes: jest.fn(),
          addNodeType: jest.fn()
        });
      });

      mockUseRemoteSettingsStore.mockImplementation((selector: any) =>
        selector({
          settings: [],
          settingsByGroup: new Map(),
          isLoading: true,
          error: null,
          fetchSettings: jest.fn(),
          updateSettings: jest.fn(),
          getSettingValue: jest.fn(),
          setSettingValue: jest.fn()
        })
      );

      const { result } = renderHook(() => useRequiredSettings("test.node"));

      expect(result.current).toEqual([]);
    });
  });
});
