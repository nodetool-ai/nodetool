/** @jsxImportSource @emotion/react */
import React, { useLayoutEffect, useRef, useState } from "react";

import { AppSpec } from "./appSchema";
import { Workflow } from "../../stores/ApiTypes";
import { useAppRuntime } from "./runtime/useAppRuntime";
import { AppRuntimeContext } from "./runtime/AppRuntimeContext";
import { useStore } from "zustand";
import RuntimeWidget from "./RuntimeWidget";
import { canvasHeight, layoutToPixels } from "./gridUtils";
import { Box, AlertBanner } from "../ui_primitives";

interface AppRuntimeViewProps {
  workflow: Workflow;
  spec: AppSpec;
  /** Outer padding around the grid (px). */
  padding?: number;
}

/** Used until the real container width is measured (and in non-DOM tests). */
const FALLBACK_WIDTH = 960;

const useContainerWidth = (): [
  React.RefObject<HTMLDivElement | null>,
  number
] => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
};

const RuntimeError: React.FC = () => {
  const ctx = React.useContext(AppRuntimeContext);
  const error = useStore(ctx!.store, (s) => s.error);
  if (!error) return null;
  return (
    <Box sx={{ mb: 1 }}>
      <AlertBanner severity="error">{error}</AlertBanner>
    </Box>
  );
};

const AppRuntimeView: React.FC<AppRuntimeViewProps> = ({
  workflow,
  spec,
  padding = 16
}) => {
  const runtime = useAppRuntime(workflow, false);
  const [ref, width] = useContainerWidth();
  const innerWidth = Math.max(0, width - padding * 2);
  const height = canvasHeight(spec.widgets, spec.grid) + padding * 2;

  return (
    <AppRuntimeContext.Provider value={runtime}>
      <Box
        ref={ref}
        sx={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "auto"
        }}
      >
        <Box sx={{ padding: `${padding}px` }}>
          <RuntimeError />
        </Box>
        <Box
          sx={{
            position: "relative",
            minHeight: height,
            margin: `0 ${padding}px`
          }}
        >
          {innerWidth > 0 &&
            spec.widgets.map((widget) => {
              const rect = layoutToPixels(widget.layout, innerWidth, spec.grid);
              return (
                <Box
                  key={widget.id}
                  sx={{
                    position: "absolute",
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    minHeight: rect.height,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center"
                  }}
                >
                  <RuntimeWidget widget={widget} />
                </Box>
              );
            })}
        </Box>
      </Box>
    </AppRuntimeContext.Provider>
  );
};

export default AppRuntimeView;
