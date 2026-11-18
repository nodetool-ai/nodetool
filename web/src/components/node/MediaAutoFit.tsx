import { memo, useCallback, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";
import type { NodeStoreState } from "../../stores/NodeStore";
import { intrinsicRatio, measureMediaChrome } from "./measureNodeMedia";
import {
  clampedMediaRatio,
  fitNodeHeight,
  mediaDimensionsFromRef,
  mediaRatioKey
} from "./mediaNodeFit";

interface MediaAutoFitProps {
  nodeId: string;
  minHeight: number;
}

/** Clamped ratio of the first media ref in the node's properties. */
const selectMetadataRatio =
  (nodeId: string) =>
  (state: NodeStoreState): number | null => {
    const properties = state.findNode(nodeId)?.data.properties ?? {};
    for (const value of Object.values(properties)) {
      const dims = mediaDimensionsFromRef(value);
      if (dims) {
        return clampedMediaRatio(dims);
      }
    }
    return null;
  };

/**
 * Sets the node height so its media box takes the media's aspect ratio when
 * new content appears. The ratio comes from asset metadata when present, else
 * from the loaded element. A ratio the node was already fitted to is skipped,
 * so a manual resize stays until the content changes.
 */
const MediaAutoFit = memo(function MediaAutoFit({
  nodeId,
  minHeight
}: MediaAutoFitProps) {
  const reactFlow = useReactFlow();
  const store = useNodeStoreRef();
  const updateNode = useNodes((state: NodeStoreState) => state.updateNode);
  const metadataRatio = useNodes(selectMetadataRatio(nodeId));

  const findNodeElement = useCallback(
    (): HTMLElement | null =>
      document.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`
      ),
    [nodeId]
  );

  const fit = useCallback(
    (ratio: number) => {
      const node = store.getState().findNode(nodeId);
      const nodeEl = findNodeElement();
      if (!node || !nodeEl) {
        return;
      }
      const key = mediaRatioKey(ratio);
      if (node.data.mediaFitRatio === key) {
        return;
      }
      const zoom = reactFlow.getViewport().zoom || 1;
      const rect = nodeEl.getBoundingClientRect();
      const width = rect.width / zoom;
      const box = measureMediaChrome(nodeEl, zoom, width, rect.height / zoom);
      if (!box) {
        return;
      }
      updateNode(nodeId, {
        height: fitNodeHeight(width, ratio, box, minHeight),
        data: { ...node.data, mediaFitRatio: key }
      });
    },
    [store, nodeId, findNodeElement, reactFlow, updateNode, minHeight]
  );

  useEffect(() => {
    if (metadataRatio === null) {
      return;
    }
    const rafId = requestAnimationFrame(() => fit(metadataRatio));
    return () => cancelAnimationFrame(rafId);
  }, [metadataRatio, fit]);

  useEffect(() => {
    const nodeEl = findNodeElement();
    if (!nodeEl) {
      return;
    }
    const handleLoad = (event: Event) => {
      if (metadataRatio !== null || !(event.target instanceof Element)) {
        return;
      }
      const raw = intrinsicRatio(event.target);
      const ratio =
        raw === null ? null : clampedMediaRatio({ width: raw, height: 1 });
      if (ratio !== null) {
        fit(ratio);
      }
    };
    // Media load events do not bubble, so listen in the capture phase.
    nodeEl.addEventListener("load", handleLoad, true);
    nodeEl.addEventListener("loadedmetadata", handleLoad, true);
    return () => {
      nodeEl.removeEventListener("load", handleLoad, true);
      nodeEl.removeEventListener("loadedmetadata", handleLoad, true);
    };
  }, [findNodeElement, fit, metadataRatio]);

  return null;
});

export default MediaAutoFit;
