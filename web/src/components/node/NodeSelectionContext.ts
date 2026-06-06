import { createContext } from "react";

/**
 * Boolean signal that this subtree should surface all handle tooltips at
 * once. `BaseNode` sets it true when the node is selected, or when the
 * pointer has been hovering the node body long enough to filter out
 * incidental passes. Descendants like `HandleTooltip` use it to expose
 * every port's name without the user having to hover each handle.
 */
export const NodeSelectionContext = createContext<boolean>(false);
