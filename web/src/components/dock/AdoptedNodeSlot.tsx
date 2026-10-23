import { useLayoutEffect, useRef, type ReactNode } from "react";

import { Box } from "../ui_primitives";

interface AdoptedNodeSlotProps {
  /** A container that a portal renders into. It moves into this slot while the slot is mounted. */
  readonly node: HTMLElement;
}

/**
 * Hosts a portal container that lives above it in the tree, so content can move
 * between hosts (a dock panel and a side dock, say) without remounting. Only
 * one slot should hold `node` at a time: mounting a second one takes it over.
 */
export function AdoptedNodeSlot({ node }: AdoptedNodeSlotProps): ReactNode {
  const slot = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const target = slot.current;
    if (!target) { return; }
    target.appendChild(node);
    return () => { if (node.parentElement === target) { node.remove(); } };
  }, [node]);
  return <Box ref={slot} sx={{ width: "100%", height: "100%", minHeight: 0, minWidth: 0 }} />;
}
