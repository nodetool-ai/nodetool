/**
 * EditorActivationCover
 *
 * Transparent layer over an idle code editor on the canvas. It carries no
 * nodrag/nowheel class, so pans, pinches, and node drags pass to React Flow.
 * A click hands the point to the owner, which focuses the editor there.
 */

import { memo, useCallback, type MouseEvent } from "react";
import { Box } from "@mui/material";
import { Z_INDEX } from "../ui_primitives";

export interface EditorActivationCoverProps {
  onActivate: (clientX: number, clientY: number) => void;
}

export function EditorActivationCover({
  onActivate
}: EditorActivationCoverProps) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      onActivate(event.clientX, event.clientY);
    },
    [onActivate]
  );

  return (
    <Box
      className="editor-activation-cover"
      aria-hidden
      onClick={handleClick}
      // Above Monaco's own layers (scrollbars sit near 10).
      sx={{ position: "absolute", inset: 0, zIndex: Z_INDEX.sticky, cursor: "text" }}
    />
  );
}

export default memo(EditorActivationCover);
