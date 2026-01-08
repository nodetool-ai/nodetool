import { act } from "@testing-library/react";
import { useFavoriteNodesStore } from "../../../stores/FavoriteNodesStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { NodeMetadata } from "../../../stores/ApiTypes";

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
            outputs: []
          } as unknown as NodeMetadata
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
            outputs: []
          } as unknown as NodeMetadata,
          "nodetool.test.Node2": {
            title: "Node Two",
            node_type: "nodetool.test.Node2",
            namespace: "nodetool.test",
            properties: [],
            layout: "default",
            outputs: []
          } as unknown as NodeMetadata
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
            outputs: []
          } as unknown as NodeMetadata
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

