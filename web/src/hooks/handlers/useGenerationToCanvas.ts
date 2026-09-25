// Drops media generated in chat (the canvas composer or otherwise) onto the
// workflow as constant nodes. Earlier this hook auto-dropped every new
// assistant media result; now it just exposes an imperative
// `addBlocksToCanvas` so UI surfaces (e.g. hover buttons in MediaOutputGroup
// and MessageContentRenderer) can let the user add assets on click.

import { useCallback, useContext } from "react";
import type { XYPosition } from "@xyflow/react";
import { NodeContext } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import type { NodeStore } from "../../stores/NodeStore";
import { assetLocator } from "../../utils/mediaRef";
import type {
  NodeMetadata,
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

/** Image, video, or audio headed for a workflow as a constant node. */
export interface WorkflowMediaItem {
  type: "image" | "video" | "audio";
  asset_id?: string | null;
  uri?: string;
  /** Node title, so a batch of shots or takes stays legible on the canvas. */
  title?: string;
}

const CONSTANT_NODE_TYPE: Record<WorkflowMediaItem["type"], string> = {
  image: "nodetool.constant.Image",
  video: "nodetool.constant.Video",
  audio: "nodetool.constant.Audio"
};

export const blockToMediaItem = (
  block: MediaContentBlock
): WorkflowMediaItem => {
  if (block.type === "image_url") {
    return { type: "image", asset_id: block.image.asset_id, uri: block.image.uri };
  }
  if (block.type === "video") {
    return { type: "video", asset_id: block.video.asset_id, uri: block.video.uri };
  }
  return { type: "audio", asset_id: block.audio.asset_id, uri: block.audio.uri };
};

export const mediaItemToConstant = (
  item: WorkflowMediaItem
): { nodeType: string; value: Record<string, unknown> } => ({
  nodeType: CONSTANT_NODE_TYPE[item.type],
  value: {
    type: item.type,
    asset_id: item.asset_id,
    // An asset-only ref still needs a locator: `asset://<id>` is the id form
    // every media renderer resolves.
    uri: item.uri || (item.asset_id ? assetLocator(item.asset_id) : "")
  }
});

export const blockToConstant = (
  block: MediaContentBlock
): { nodeType: string; value: Record<string, unknown> } =>
  mediaItemToConstant(blockToMediaItem(block));

/**
 * Add each item as a constant node right of the graph in `store`. Returns how
 * many nodes were added; an item whose node metadata has not loaded is skipped.
 */
export const addMediaNodes = (
  store: Pick<NodeStore, "getState">,
  items: readonly WorkflowMediaItem[],
  getMetadata: (nodeType: string) => NodeMetadata | undefined
): number => {
  const { nodes, createNode, addNode } = store.getState();
  const base = computeBasePosition(nodes);
  let added = 0;
  items.forEach((item) => {
    const constant = mediaItemToConstant(item);
    const metadata = getMetadata(constant.nodeType);
    if (!metadata) {
      console.warn(
        `Cannot add media to canvas: metadata for ${constant.nodeType} is missing`
      );
      return;
    }
    const position: XYPosition = {
      x: base.x + (added % 2) * 340,
      y: base.y + Math.floor(added / 2) * 300
    };
    const node = createNode(metadata, position);
    node.data.properties.value = constant.value;
    if (item.title) {
      node.data.title = item.title;
    }
    addNode(node);
    added += 1;
  });
  return added;
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
      addMediaNodes(store, blocks.map(blockToMediaItem), getMetadata);
    },
    [store, getMetadata]
  );

  return { isCanvasAvailable: store !== null, addBlocksToCanvas };
};
