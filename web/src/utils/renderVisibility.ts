import { VISIBLE_ELEMENTS_NODE_THRESHOLD } from "../config/constants";

export const shouldRenderVisibleElements = (nodeCount: number): boolean =>
  nodeCount >= VISIBLE_ELEMENTS_NODE_THRESHOLD;
