/**
 * OverlayLayer
 *
 * Tracks the stacking layer of the nearest enclosing overlay so a nested
 * overlay can render above it.
 *
 * MUI gives every popover and modal a fixed, full-viewport root containing an
 * invisible backdrop. Two overlays therefore never merely overlap: whichever
 * root paints last swallows every pointer event aimed at the other. The theme
 * pins `MuiPopover` roots well above `MuiModal` roots, so a dialog opened from
 * inside a popover renders underneath that popover's backdrop and its buttons
 * stop responding to the mouse, while keyboard activation still works because
 * focus never hit-tests.
 *
 * Each overlay publishes the layer it occupies; a descendant overlay takes the
 * next layer up. A top-level dialog publishes nothing, so popovers it contains
 * keep the theme default and the rest of the scale is untouched.
 */

import { createContext, useContext } from "react";

const OverlayLayerContext = createContext<number | undefined>(undefined);

export const OverlayLayerProvider = OverlayLayerContext.Provider;

/** Layer of the enclosing overlay, or `undefined` outside any overlay. */
export const useOverlayLayer = (): number | undefined =>
  useContext(OverlayLayerContext);
