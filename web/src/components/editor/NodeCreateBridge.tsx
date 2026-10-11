import { memo, useEffect, useMemo } from "react";

import { useCreateNode } from "../../hooks/useCreateNode";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import usePendingNodeCreateStore from "../../stores/PendingNodeCreateStore";

/**
 * Bridge that drains `PendingNodeCreateStore` and creates the requested node
 * using `useCreateNode`. Mounted inside the workflow editor's
 * `ReactFlowProvider` so the React-Flow hooks resolve.
 *
 * A pick from the floating node menu lands where the menu was opened, the
 * same spot Enter uses. Requests from outside the menu (sidebar tiles) land
 * at the viewport center.
 *
 * Renders nothing.
 */
const NodeCreateBridge = memo(() => {
  // Stable center reference. Computed once per mount so `handleCreate`
  // keeps its callback identity (otherwise the effect re-fires every commit
  // and useCreateNode loses its memoization). Window-resize staleness is
  // accepted — sidebar-tile clicks happen quickly after the bridge mounts.
  const center = useMemo(
    () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
    []
  );
  const menuOpen = useNodeMenuStore((state) => state.isMenuOpen);
  const handleCreate = useCreateNode(menuOpen ? undefined : center);
  const pending = usePendingNodeCreateStore((s) => s.pending);
  const consume = usePendingNodeCreateStore((s) => s.consume);

  useEffect(() => {
    if (!pending) {
      return;
    }
    const metadata = consume();
    if (metadata) {
      handleCreate(metadata);
    }
  }, [pending, consume, handleCreate]);

  return null;
});

NodeCreateBridge.displayName = "NodeCreateBridge";

export default NodeCreateBridge;
