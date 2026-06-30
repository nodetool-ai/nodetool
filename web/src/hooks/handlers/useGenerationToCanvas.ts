// Drops media generated in chat (the canvas composer or otherwise) onto the
// workflow as constant nodes. Earlier this hook auto-dropped every new
// assistant media result; now it just exposes an imperative
// `addBlocksToCanvas` so UI surfaces (e.g. hover buttons in MediaOutputGroup
// and MessageContentRenderer) can let the user add assets on click.

import { useCallback, useContext } from "react";
import type { XYPosition } from "@xyflow/react";
import { NodeContext } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import type {
  MessageImageContent,
  MessageVideoContent,
  MessageAudioContent
} from "../../stores/ApiTypes";

export type MediaContentBlock =
  | MessageImageContent
  | MessageVideoContent
  | MessageAudioContent;

// Where to drop the next batch: just right of the existing graph, top-aligned.
const computeBasePosition = (
  nodes: { position: XYPosition; width?: number | null }[]
): XYPosition => {
  if (nodes.length === 0) {
    return { x: 0, y: 0 };
  }
  let maxRight = -Infinity;
  let minTop = Infinity;
  for (const node of nodes) {
    const width = node.width ?? 200;
    maxRight = Math.max(maxRight, node.position.x + width);
    minTop = Math.min(minTop, node.position.y);
  }
  return {
    x: (Number.isFinite(maxRight) ? maxRight : 0) + 80,
    y: Number.isFinite(minTop) ? minTop : 0
  };
};

export const blockToConstant = (
  block: MediaContentBlock
): { nodeType: string; value: Record<string, unknown> } | null => {
  if (block.type === "image_url") {
    const ref = block.image;
    return {
      nodeType: "nodetool.constant.Image",
      value: { type: "image", asset_id: ref.asset_id, uri: ref.uri }
    };
  }
  if (block.type === "video") {
    const ref = block.video;
    return {
      nodeType: "nodetool.constant.Video",
      value: { type: "video", asset_id: ref.asset_id, uri: ref.uri }
    };
  }
  const ref = block.audio;
  return {
    nodeType: "nodetool.constant.Audio",
    value: { type: "audio", asset_id: ref.asset_id, uri: ref.uri }
  };
};

interface AddMediaToCanvas {
  /** True when a NodeProvider is in scope (i.e. there's a canvas to add to). */
  isCanvasAvailable: boolean;
  /** Add the given media blocks as constant nodes on the active canvas. */
  addBlocksToCanvas: (blocks: MediaContentBlock[]) => void;
}

export const useAddMediaToCanvas = (): AddMediaToCanvas => {
  const store = useContext(NodeContext);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const addBlocksToCanvas = useCallback(
    (blocks: MediaContentBlock[]) => {
      if (!store) {
        return;
      }
      const { nodes, createNode, addNode } = store.getState();
      const base = computeBasePosition(nodes);
      blocks.forEach((block, i) => {
        const constant = blockToConstant(block);
        if (!constant) {
          return;
        }
        const metadata = getMetadata(constant.nodeType);
        if (!metadata) {
          console.warn(
            `Cannot add media to canvas: metadata for ${constant.nodeType} is missing`
          );
          return;
        }
        const position: XYPosition = {
          x: base.x + (i % 2) * 340,
          y: base.y + Math.floor(i / 2) * 300
        };
        const node = createNode(metadata, position);
        node.data.properties.value = constant.value;
        addNode(node);
      });
    },
    [store, getMetadata]
  );

  return { isCanvasAvailable: store !== null, addBlocksToCanvas };
};
