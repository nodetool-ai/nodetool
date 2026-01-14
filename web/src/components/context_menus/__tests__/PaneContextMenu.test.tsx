import { act } from "@testing-library/react";
import { useFavoriteNodesStore } from "../../../stores/FavoriteNodesStore";
import { useRecentNodesStore } from "../../../stores/RecentNodesStore";
import useMetadataStore from "../../../stores/MetadataStore";

// Test the integration of favorites with context menu logic
describe("PaneContextMenu favorites integration", () => {
  beforeEach(() => {
    // Reset stores
    act(() => {
      useFavoriteNodesStore.setState({ favorites: [] });
      useMetadataStore.setState({ metadata: {} });
    });
    localStorage.removeItem("nodetool-favorite-nodes");
  });

  it("favorites store provides correct data for context menu", () => {
    // Setup metadata for the favorite node
    act(() => {
      useMetadataStore.setState({
        metadata: {
          "nodetool.test.TestNode": {
            title: "Test Node",
            node_type: "nodetool.test.TestNode",
            namespace: "nodetool.test",
            properties: [],
            layout: "default",
            outputs: [],
            description: "",
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false
          }
        }
      });
      useFavoriteNodesStore.getState().addFavorite("nodetool.test.TestNode");
    });

    // Verify the favorites store provides the correct data
    const favorites = useFavoriteNodesStore.getState().favorites;
    expect(favorites).toHaveLength(1);
    expect(favorites[0].nodeType).toBe("nodetool.test.TestNode");

    // Verify metadata can be retrieved for the favorite
    const metadata = useMetadataStore.getState().getMetadata("nodetool.test.TestNode");
    expect(metadata).toBeDefined();
    expect(metadata?.title).toBe("Test Node");
  });

  it("returns empty favorites when none are set", () => {
    const favorites = useFavoriteNodesStore.getState().favorites;
    expect(favorites).toHaveLength(0);
  });

  it("multiple favorites can be retrieved in order", () => {
    // Setup metadata for the favorite nodes
    act(() => {
      useMetadataStore.setState({
        metadata: {
          "nodetool.test.Node1": {
            title: "Node One",
            node_type: "nodetool.test.Node1",
            namespace: "nodetool.test",
            properties: [],
            layout: "default",
            outputs: [],
            description: "",
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false
          },
          "nodetool.test.Node2": {
            title: "Node Two",
            node_type: "nodetool.test.Node2",
            namespace: "nodetool.test",
            properties: [],
            layout: "default",
            outputs: [],
            description: "",
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false
          }
        }
      });
      useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node1");
      useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node2");
    });

    const favorites = useFavoriteNodesStore.getState().favorites;
    expect(favorites).toHaveLength(2);
    // Most recent first
    expect(favorites[0].nodeType).toBe("nodetool.test.Node2");
    expect(favorites[1].nodeType).toBe("nodetool.test.Node1");
  });

  it("getNodeDisplayName returns title from metadata", () => {
    // Setup metadata
    act(() => {
      useMetadataStore.setState({
        metadata: {
          "nodetool.test.TestNode": {
            title: "Custom Title",
            node_type: "nodetool.test.TestNode",
            namespace: "nodetool.test",
            properties: [],
            layout: "default",
            outputs: [],
            description: "",
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false
          }
        }
      });
    });

    // This is the logic from PaneContextMenu's getNodeDisplayName
    const getNodeDisplayName = (nodeType: string) => {
      const metadata = useMetadataStore.getState().getMetadata(nodeType);
      if (metadata) {
        return (
          metadata.title || metadata.node_type.split(".").pop() || nodeType
        );
      }
      return nodeType.split(".").pop() || nodeType;
    };

    expect(getNodeDisplayName("nodetool.test.TestNode")).toBe("Custom Title");
  });

  it("getNodeDisplayName falls back to node type suffix", () => {
    // No metadata set
    const getNodeDisplayName = (nodeType: string) => {
      const metadata = useMetadataStore.getState().getMetadata(nodeType);
      if (metadata) {
        return (
          metadata.title || metadata.node_type.split(".").pop() || nodeType
        );
      }
      return nodeType.split(".").pop() || nodeType;
    };

    expect(getNodeDisplayName("nodetool.test.MyNode")).toBe("MyNode");
  });
});

describe("PaneContextMenu recent nodes integration", () => {
  beforeEach(() => {
    act(() => {
      useFavoriteNodesStore.setState({ favorites: [] });
      useRecentNodesStore.setState({ recentNodes: [] });
      useMetadataStore.setState({ metadata: {} });
    });
    localStorage.removeItem("nodetool-favorite-nodes");
    localStorage.removeItem("nodetool-recent-nodes");
  });

  it("recent nodes store provides correct data for context menu", () => {
    act(() => {
      useMetadataStore.setState({
        metadata: {
          "nodetool.test.RecentNode": {
            title: "Recent Node",
            node_type: "nodetool.test.RecentNode",
            namespace: "nodetool.test",
            properties: [],
            layout: "default",
            outputs: [],
            description: "",
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false
          }
        }
      });
      useRecentNodesStore.getState().addRecentNode("nodetool.test.RecentNode");
    });

    const recentNodes = useRecentNodesStore.getState().recentNodes;
    expect(recentNodes).toHaveLength(1);
    expect(recentNodes[0].nodeType).toBe("nodetool.test.RecentNode");
  });

  it("returns empty recent nodes when none are used", () => {
    const recentNodes = useRecentNodesStore.getState().recentNodes;
    expect(recentNodes).toHaveLength(0);
  });

  it("recent nodes are ordered by most recently used first", () => {
    act(() => {
      useMetadataStore.setState({
        metadata: {
          "nodetool.test.First": {
            title: "First Node",
            node_type: "nodetool.test.First",
            namespace: "nodetool.test",
            properties: [],
            layout: "default",
            outputs: [],
            description: "",
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false
          },
          "nodetool.test.Second": {
            title: "Second Node",
            node_type: "nodetool.test.Second",
            namespace: "nodetool.test",
            properties: [],
            layout: "default",
            outputs: [],
            description: "",
            the_model_info: {},
            recommended_models: [],
            basic_fields: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false
          }
        }
      });
      useRecentNodesStore.getState().addRecentNode("nodetool.test.First");
      useRecentNodesStore.getState().addRecentNode("nodetool.test.Second");
    });

    const recentNodes = useRecentNodesStore.getState().recentNodes;
    expect(recentNodes).toHaveLength(2);
    expect(recentNodes[0].nodeType).toBe("nodetool.test.Second");
    expect(recentNodes[1].nodeType).toBe("nodetool.test.First");
  });

  it("recent nodes limits to MAX_RECENT_NODES (12)", () => {
    act(() => {
      for (let i = 1; i <= 15; i++) {
        useRecentNodesStore.getState().addRecentNode(`nodetool.test.Node${i}`);
      }
    });

    const recentNodes = useRecentNodesStore.getState().recentNodes;
    expect(recentNodes).toHaveLength(12);
    expect(recentNodes[0].nodeType).toBe("nodetool.test.Node15");
  });

  it("duplicate recent nodes move to front", () => {
    act(() => {
      useRecentNodesStore.getState().addRecentNode("nodetool.test.Node1");
      useRecentNodesStore.getState().addRecentNode("nodetool.test.Node2");
      useRecentNodesStore.getState().addRecentNode("nodetool.test.Node1");
    });

    const recentNodes = useRecentNodesStore.getState().recentNodes;
    expect(recentNodes).toHaveLength(2);
    expect(recentNodes[0].nodeType).toBe("nodetool.test.Node1");
    expect(recentNodes[1].nodeType).toBe("nodetool.test.Node2");
  });

  it("clearRecentNodes removes all recent nodes", () => {
    act(() => {
      useRecentNodesStore.getState().addRecentNode("nodetool.test.Node1");
      useRecentNodesStore.getState().addRecentNode("nodetool.test.Node2");
      useRecentNodesStore.getState().clearRecentNodes();
    });

    const recentNodes = useRecentNodesStore.getState().recentNodes;
    expect(recentNodes).toHaveLength(0);
  });
});

