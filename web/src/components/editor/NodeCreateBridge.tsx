import { memo, useEffect, useMemo } from "react";

import { useCreateNode } from "../../hooks/useCreateNode";
import usePendingNodeCreateStore from "../../stores/PendingNodeCreateStore";

/**
 * Bridge that drains `PendingNodeCreateStore` and creates the requested node
 * at viewport center using `useCreateNode`. Mounted inside the workflow
 * editor's `ReactFlowProvider` so the React-Flow hooks resolve.
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
  const handleCreate = useCreateNode(center);
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
