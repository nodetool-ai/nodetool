import type React from "react";

import { Z_INDEX } from "../../ui_primitives";

/** Tallest the `/` and `@` menus draw before they scroll. */
export const MENTION_MENU_MAX_HEIGHT = 320;

/** Gap between the field and the menu, and the menu and the viewport edge. */
const MENU_OFFSET = 6;
const VIEWPORT_MARGIN = 8;

/**
 * Where a textarea's `/` or `@` menu sits, in viewport coordinates.
 *
 * The menu opens upward, because a chat composer sits at the foot of its
 * panel. A field near the top of the viewport (the home page prompt) has no
 * room above it, so there the menu opens downward when the space below is
 * larger.
 */
export const mentionMenuPosition = (rect: DOMRect): React.CSSProperties => {
  const spaceAbove = rect.top - MENU_OFFSET - VIEWPORT_MARGIN;
  const spaceBelow =
    window.innerHeight - rect.bottom - MENU_OFFSET - VIEWPORT_MARGIN;
  const opensUp =
    spaceAbove >= MENTION_MENU_MAX_HEIGHT || spaceAbove >= spaceBelow;
  return {
    position: "fixed",
    left: Math.max(VIEWPORT_MARGIN, rect.left),
    zIndex: Z_INDEX.tooltip,
    ...(opensUp
      ? {
          bottom: Math.max(
            VIEWPORT_MARGIN,
            window.innerHeight - rect.top + MENU_OFFSET
          )
        }
      : { top: rect.bottom + MENU_OFFSET })
  };
};
