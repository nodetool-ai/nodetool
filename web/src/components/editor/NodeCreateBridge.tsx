import { memo, useEffect } from "react";

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
  // Center of the viewport — recomputed each pending request via effect.
  const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
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
