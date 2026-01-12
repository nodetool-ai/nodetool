import {
  isCommentNode,
  getCommentContent,
  getNodeDisplayName,
  searchNodes,
  COMMENT_NODE_TYPE
} from "../findInWorkflowUtils";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

describe("findInWorkflowUtils", () => {
  const createMockNode = (overrides: Partial<Node<NodeData>> = {}): Node<NodeData> => ({
    id: "test-node",
    type: "test.type",
    position: { x: 0, y: 0 },
    data: {
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "test-workflow"
    },
    ...overrides
  });

  describe("isCommentNode", () => {
    it("should return true for comment node type", () => {
      const commentNode = createMockNode({
        type: COMMENT_NODE_TYPE
      });
      expect(isCommentNode(commentNode)).toBe(true);
    });

    it("should return false for non-comment node types", () => {
      const regularNode = createMockNode({
        type: "input.text"
      });
      expect(isCommentNode(regularNode)).toBe(false);
    });

    it("should return false for undefined type", () => {
      const nodeWithNoType = createMockNode({
        type: undefined
      });
      expect(isCommentNode(nodeWithNoType)).toBe(false);
    });
  });

  describe("getCommentContent", () => {
    it("should return string comment content directly", () => {
      const node = createMockNode({
        data: {
          ...createMockNode().data,
          properties: {
            comment: "This is my comment"
          }
        }
      });
      expect(getCommentContent(node)).toBe("This is my comment");
    });

    it("should return empty string for empty comment", () => {
      const node = createMockNode({
        data: {
          ...createMockNode().data,
          properties: {
            comment: ""
          }
        }
      });
      expect(getCommentContent(node)).toBe("");
    });

    it("should extract text from Lexical editor state", () => {
      const node = createMockNode({
        data: {
          ...createMockNode().data,
          properties: {
            comment: {
              root: {
                children: [
                  {
                    type: "paragraph",
                    children: [{ text: "Hello" }, { text: "World" }]
                  }
                ]
              }
            }
          }
        }
      });
      expect(getCommentContent(node)).toBe("Hello World");
    });

    it("should return empty string for null/undefined comment", () => {
      const node = createMockNode({
        data: {
          ...createMockNode().data,
          properties: {}
        }
      });
      expect(getCommentContent(node)).toBe("");
    });

    it("should return empty string for invalid Lexical state", () => {
      const node = createMockNode({
        data: {
          ...createMockNode().data,
          properties: {
            comment: {
              root: null
            }
          }
        }
      });
      expect(getCommentContent(node)).toBe("");
    });

    it("should handle nested children in Lexical state", () => {
      const node = createMockNode({
        data: {
          ...createMockNode().data,
          properties: {
            comment: {
              root: {
                children: [
                  {
                    type: "list",
                    children: [
                      {
                        type: "listitem",
                        children: [{ text: "Item 1" }]
                      },
                      {
                        type: "listitem",
                        children: [{ text: "Item 2" }]
                      }
                    ]
                  }
                ]
              }
            }
          }
        }
      });
      expect(getCommentContent(node)).toBe("Item 1 Item 2");
    });
  });

  describe("getNodeDisplayName", () => {
    it("should return name property if available", () => {
      const node = createMockNode({
        data: {
          ...createMockNode().data,
          properties: { name: "My Custom Node" }
        }
      });
      const mockMetadataStore = { getMetadata: () => ({ title: "Metadata Title" }) };
      expect(getNodeDisplayName(node, mockMetadataStore as any)).toBe("My Custom Node");
    });

    it("should return metadata title if name is empty", () => {
      const node = createMockNode({
        type: "custom.type",
        data: {
          ...createMockNode().data,
          properties: { name: "" }
        }
      });
      const mockMetadataStore = { getMetadata: () => ({ title: "Metadata Title" }) };
      expect(getNodeDisplayName(node, mockMetadataStore as any)).toBe("Metadata Title");
    });

    it("should return last part of node type if no metadata", () => {
      const node = createMockNode({
        type: "some.namespace.MyNodeType",
        data: {
          ...createMockNode().data,
          properties: {}
        }
      });
      const mockMetadataStore = { getMetadata: () => undefined };
      expect(getNodeDisplayName(node, mockMetadataStore as any)).toBe("MyNodeType");
    });

    it("should return node id as fallback", () => {
      const node = createMockNode({
        id: "fallback-id",
        type: "",
        data: {
          ...createMockNode().data,
          properties: {}
        }
      });
      const mockMetadataStore = { getMetadata: () => undefined };
      expect(getNodeDisplayName(node, mockMetadataStore as any)).toBe("fallback-id");
    });
  });

  describe("searchNodes", () => {
    it("should find nodes by name", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode({ id: "node-1", data: { ...createMockNode().data, properties: { name: "Text Source" } } })
      ];
      const mockGetDisplayName = () => "Text Source";

      const results = searchNodes("Text", nodes, mockGetDisplayName);

      expect(results.length).toBe(1);
      expect(results[0].node.id).toBe("node-1");
      expect(results[0].matchType).toBe("name");
    });

    it("should find nodes by type", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode({ id: "node-1", type: "input.text" })
      ];
      const mockGetDisplayName = () => "Text Source";

      const results = searchNodes("input", nodes, mockGetDisplayName);

      expect(results.length).toBe(1);
      expect(results[0].matchType).toBe("type");
    });

    it("should find nodes by ID", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode({ id: "unique-node-id" })
      ];
      const mockGetDisplayName = () => "Node";

      const results = searchNodes("unique", nodes, mockGetDisplayName);

      expect(results.length).toBe(1);
      expect(results[0].matchType).toBe("id");
    });

    it("should find comment nodes by comment content", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode({
          id: "comment-node",
          type: COMMENT_NODE_TYPE,
          data: {
            ...createMockNode().data,
            properties: { comment: "This workflow processes images" }
          }
        })
      ];
      const mockGetDisplayName = () => "Comment";

      const results = searchNodes("images", nodes, mockGetDisplayName);

      expect(results.length).toBe(1);
      expect(results[0].matchType).toBe("comment");
    });

    it("should include match context for comment matches", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode({
          id: "comment-node",
          type: COMMENT_NODE_TYPE,
          data: {
            ...createMockNode().data,
            properties: { comment: "This is a long comment about the workflow processing" }
          }
        })
      ];
      const mockGetDisplayName = () => "Comment";

      const results = searchNodes("workflow processing", nodes, mockGetDisplayName);

      expect(results.length).toBe(1);
      expect(results[0].matchType).toBe("comment");
      expect(results[0].matchContext).toBeDefined();
    });

    it("should be case insensitive", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode({
          id: "node-1",
          data: { ...createMockNode().data, properties: { name: "Text Source" } }
        })
      ];
      const mockGetDisplayName = () => "Text Source";

      const results = searchNodes("TEXT", nodes, mockGetDisplayName);

      expect(results.length).toBe(1);
    });

    it("should return empty array for whitespace only search", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode({ id: "node-1" })
      ];
      const mockGetDisplayName = () => "Node";

      const results = searchNodes("   ", nodes, mockGetDisplayName);

      expect(results).toEqual([]);
    });

    it("should return empty array for no match", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode({ id: "node-1", data: { ...createMockNode().data, properties: { name: "Text Source" } } })
      ];
      const mockGetDisplayName = () => "Text Source";

      const results = searchNodes("xyz", nodes, mockGetDisplayName);

      expect(results).toEqual([]);
    });

    it("should search in both name and comment for same node", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode({
          id: "node-1",
          data: {
            ...createMockNode().data,
            properties: { name: "Text Source", comment: "Important notes here" }
          }
        })
      ];
      const mockGetDisplayName = () => "Text Source";

      const nameResults = searchNodes("Text", nodes, mockGetDisplayName);
      const commentResults = searchNodes("notes", nodes, mockGetDisplayName);

      expect(nameResults.length).toBe(1);
      expect(nameResults[0].matchType).toBe("name");
      expect(commentResults.length).toBe(1);
      expect(commentResults[0].matchType).toBe("comment");
    });
  });
});
