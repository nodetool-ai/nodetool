import { createContext } from "react";

/**
 * Boolean signal that this subtree belongs to a currently-selected node.
 * `BaseNode` populates it with its `selected` prop; descendants like
 * `HandleTooltip` use it to surface all handle tooltips at once while the
 * node is selected so users can see every port's name + type without
 * hovering them one by one.
 */
export const NodeSelectionContext = createContext<boolean>(false);
