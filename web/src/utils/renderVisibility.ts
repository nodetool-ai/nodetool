import { VISIBLE_ELEMENTS_NODE_THRESHOLD } from "../config/constants";

export const shouldRenderVisibleElements = (
  nodeCount: number,
  isInteracting = false
): boolean =>
  nodeCount >= VISIBLE_ELEMENTS_NODE_THRESHOLD && !isInteracting;
