import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { findFileInputNodes, matchFileToInputNode } from "../useFolderBatch";

describe("useFolderBatch utilities", () => {
  const createMockNode = (id: string, type: string): Node<NodeData> => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      properties: {},
      selectable: true,
      workflow_id: "test-workflow",
    },
  });

  describe("findFileInputNodes", () => {
    it("should find image input nodes", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.input.ImageInput"),
        createMockNode("2", "nodetool.constant.String"),
        createMockNode("3", "nodetool.input.AudioInput"),
      ];

      const result = findFileInputNodes(nodes);
      expect(result).toHaveLength(2);
      expect(result.map((n) => n.id)).toContain("1");
      expect(result.map((n) => n.id)).toContain("3");
    });

    it("should return empty array when no input nodes", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.constant.String"),
        createMockNode("2", "nodetool.constant.Integer"),
      ];

      const result = findFileInputNodes(nodes);
      expect(result).toHaveLength(0);
    });

    it("should find all supported input node types", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.input.ImageInput"),
        createMockNode("2", "nodetool.input.AudioInput"),
        createMockNode("3", "nodetool.input.VideoInput"),
        createMockNode("4", "nodetool.input.DocumentInput"),
        createMockNode("5", "nodetool.input.DataFrameInput"),
      ];

      const result = findFileInputNodes(nodes);
      expect(result).toHaveLength(5);
    });
  });

  describe("matchFileToInputNode", () => {
    it("should match image files to ImageInput nodes", () => {
      const inputNodes: Node<NodeData>[] = [
        createMockNode("img-node", "nodetool.input.ImageInput"),
        createMockNode("audio-node", "nodetool.input.AudioInput"),
      ];

      const result = matchFileToInputNode("image/png", inputNodes);
      expect(result?.id).toBe("img-node");
    });

    it("should match audio files to AudioInput nodes", () => {
      const inputNodes: Node<NodeData>[] = [
        createMockNode("img-node", "nodetool.input.ImageInput"),
        createMockNode("audio-node", "nodetool.input.AudioInput"),
      ];

      const result = matchFileToInputNode("audio/mp3", inputNodes);
      expect(result?.id).toBe("audio-node");
    });

    it("should match video files to VideoInput nodes", () => {
      const inputNodes: Node<NodeData>[] = [
        createMockNode("video-node", "nodetool.input.VideoInput"),
      ];

      const result = matchFileToInputNode("video/mp4", inputNodes);
      expect(result?.id).toBe("video-node");
    });

    it("should match document files to DocumentInput nodes", () => {
      const inputNodes: Node<NodeData>[] = [
        createMockNode("doc-node", "nodetool.input.DocumentInput"),
      ];

      const result = matchFileToInputNode("application/pdf", inputNodes);
      expect(result?.id).toBe("doc-node");
    });

    it("should return null for unsupported content types", () => {
      const inputNodes: Node<NodeData>[] = [
        createMockNode("img-node", "nodetool.input.ImageInput"),
      ];

      const result = matchFileToInputNode("application/octet-stream", inputNodes);
      expect(result).toBeNull();
    });

    it("should return null when no matching input node", () => {
      const inputNodes: Node<NodeData>[] = [
        createMockNode("audio-node", "nodetool.input.AudioInput"),
      ];

      const result = matchFileToInputNode("image/png", inputNodes);
      expect(result).toBeNull();
    });

    it("should match first available node when multiple match", () => {
      const inputNodes: Node<NodeData>[] = [
        createMockNode("first-img", "nodetool.input.ImageInput"),
        createMockNode("second-img", "nodetool.input.ImageInput"),
      ];

      const result = matchFileToInputNode("image/jpeg", inputNodes);
      expect(result?.id).toBe("first-img");
    });

    it("should support various image formats", () => {
      const inputNodes: Node<NodeData>[] = [
        createMockNode("img-node", "nodetool.input.ImageInput"),
      ];

      const imageTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
      
      imageTypes.forEach((contentType) => {
        const result = matchFileToInputNode(contentType, inputNodes);
        expect(result?.id).toBe("img-node");
      });
    });

    it("should support various audio formats", () => {
      const inputNodes: Node<NodeData>[] = [
        createMockNode("audio-node", "nodetool.input.AudioInput"),
      ];

      const audioTypes = ["audio/mp3", "audio/wav", "audio/ogg", "audio/flac"];
      
      audioTypes.forEach((contentType) => {
        const result = matchFileToInputNode(contentType, inputNodes);
        expect(result?.id).toBe("audio-node");
      });
    });
  });
});
