import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";

export interface NodeContentProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  isOutputNode: boolean;
  data: NodeData;
  status?: string;
  workflowId: string;
}

export const arePropsEqual = (
  prevProps: NodeContentProps,
  nextProps: NodeContentProps
): boolean => {
  if (
    prevProps.id !== nextProps.id ||
    prevProps.nodeType !== nextProps.nodeType ||
    prevProps.isOutputNode !== nextProps.isOutputNode ||
    prevProps.status !== nextProps.status ||
    prevProps.workflowId !== nextProps.workflowId
  ) {
    return false;
  }

  if (
    prevProps.nodeMetadata.title !== nextProps.nodeMetadata.title ||
    prevProps.nodeMetadata.layout !== nextProps.nodeMetadata.layout ||
    // `body` feeds isContentCardNode (the primary-output type is the other
    // input — compared below). Without this, a node whose metadata flips
    // to/from "content_card" (output shape unchanged) would keep its stale
    // body mounted.
    prevProps.nodeMetadata.body !== nextProps.nodeMetadata.body ||
    prevProps.nodeMetadata.supports_dynamic_inputs !== nextProps.nodeMetadata.supports_dynamic_inputs ||
    prevProps.nodeMetadata.supports_dynamic_outputs !==
      nextProps.nodeMetadata.supports_dynamic_outputs ||
    prevProps.nodeMetadata.is_streaming_output !==
      nextProps.nodeMetadata.is_streaming_output
  ) {
    return false;
  }

  // Compare property/output counts only — a deep compare every render is too
  // expensive.
  const prevPropsLen = prevProps.nodeMetadata.properties?.length ?? 0;
  const nextPropsLen = nextProps.nodeMetadata.properties?.length ?? 0;
  if (prevPropsLen !== nextPropsLen) {
    return false;
  }

  const prevOutputsLen = prevProps.nodeMetadata.outputs?.length ?? 0;
  const nextOutputsLen = nextProps.nodeMetadata.outputs?.length ?? 0;
  if (prevOutputsLen !== nextOutputsLen) {
    return false;
  }

  // The primary-output type drives the ContentCardBody variant
  // (image/audio/video/...). Two metadata objects with the same output count
  // but different primary-output types must re-render.
  const prevPrimary = prevProps.nodeMetadata.outputs?.[0];
  const nextPrimary = nextProps.nodeMetadata.outputs?.[0];
  const prevPrimaryType =
    (prevPrimary?.type as { type?: string } | undefined)?.type ?? "";
  const nextPrimaryType =
    (nextPrimary?.type as { type?: string } | undefined)?.type ?? "";
  if (prevPrimaryType !== nextPrimaryType) {
    return false;
  }

  const prevDataProps = prevProps.data.properties || {};
  const nextDataProps = nextProps.data.properties || {};
  const prevDataKeys = Object.keys(prevDataProps);
  const nextDataKeys = Object.keys(nextDataProps);
  if (prevDataKeys.length !== nextDataKeys.length) {
    return false;
  }
  for (const key of prevDataKeys) {
    if (prevDataProps[key] !== nextDataProps[key]) {
      return false;
    }
  }

  // Compare exposed input placements (affects node-body handles / labeled rows)
  const prevExposed = prevProps.data.exposedInputs || [];
  const nextExposed = nextProps.data.exposedInputs || [];
  if (prevExposed.length !== nextExposed.length) {
    return false;
  }
  for (let i = 0; i < prevExposed.length; i++) {
    if (prevExposed[i] !== nextExposed[i]) {
      return false;
    }
  }
  const prevLabeled = prevProps.data.exposedInputsLabeled || [];
  const nextLabeled = nextProps.data.exposedInputsLabeled || [];
  if (prevLabeled.length !== nextLabeled.length) {
    return false;
  }
  for (let i = 0; i < prevLabeled.length; i++) {
    if (prevLabeled[i] !== nextLabeled[i]) {
      return false;
    }
  }
  const prevHidden = prevProps.data.exposedInputsHidden || [];
  const nextHidden = nextProps.data.exposedInputsHidden || [];
  if (prevHidden.length !== nextHidden.length) {
    return false;
  }
  for (let i = 0; i < prevHidden.length; i++) {
    if (prevHidden[i] !== nextHidden[i]) {
      return false;
    }
  }

  const prevDynProps = prevProps.data.dynamic_properties || {};
  const nextDynProps = nextProps.data.dynamic_properties || {};
  const prevDynKeys = Object.keys(prevDynProps);
  const nextDynKeys = Object.keys(nextDynProps);
  if (prevDynKeys.length !== nextDynKeys.length) {
    return false;
  }
  for (const key of prevDynKeys) {
    if (prevDynProps[key] !== nextDynProps[key]) {
      return false;
    }
  }

  const prevDynamicOutputsKeys = Object.keys(
    prevProps.data.dynamic_outputs || {}
  );
  const nextDynamicOutputsKeys = Object.keys(
    nextProps.data.dynamic_outputs || {}
  );
  if (prevDynamicOutputsKeys.length !== nextDynamicOutputsKeys.length) {
    return false;
  }

  return true;
};
