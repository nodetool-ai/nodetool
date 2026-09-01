/**
 * A drawing pad the app's user paints in, bound like any other image input.
 *
 * The pad is the sketch editor's own canvas and session, so it is also the
 * heaviest thing in the widget catalog — several hundred KB of tools, painting
 * and rendering runtimes. Every mini app loads this config, but almost none
 * place a pad, so the surface is behind a lazy import and only an app that
 * actually places one pays for it. `SketchPadSurface` holds the working parts.
 */
import React from "react";

import {
  FlexColumn,
  LoadingSpinner,
  BORDER_RADIUS
} from "../../ui_primitives";
import { AppEvent } from "../types";
import {
  clampPadSide,
  DEFAULT_PAD_HEIGHT,
  type SketchPadBackground
} from "./sketchPadOptions";

export interface SketchPadWidgetProps {
  id: string;
  binding?: string;
  events?: AppEvent[];
  label?: string;
  disabled?: boolean;
  width?: number;
  height?: number;
  background?: SketchPadBackground;
}

const LazySketchPadSurface = React.lazy(
  async () => import("./SketchPadSurface")
);

export const SketchPadWidget: React.FC<SketchPadWidgetProps> = (props) => (
  <React.Suspense
    fallback={
      <FlexColumn
        align="center"
        justify="center"
        fullWidth
        sx={{
          // The chrome the surface will fill, so loading it does not shift the
          // widgets under the pad.
          height: clampPadSide(props.height, DEFAULT_PAD_HEIGHT),
          border: "1px solid",
          borderColor: "divider",
          borderRadius: BORDER_RADIUS.md
        }}
      >
        <LoadingSpinner size="small" text="Loading pad" />
      </FlexColumn>
    }
  >
    <LazySketchPadSurface {...props} />
  </React.Suspense>
);
