/** @jsxImportSource @emotion/react */
import React, { useLayoutEffect, useRef, useState } from "react";

import { Workflow } from "../../../stores/ApiTypes";
import { useAppBuilderStore } from "../../../stores/AppBuilderStore";
import { useAppRuntime } from "../runtime/useAppRuntime";
import { AppRuntimeContext } from "../runtime/AppRuntimeContext";
import { canvasHeight, cellWidth } from "../gridUtils";
import CanvasWidget from "./CanvasWidget";
import { Box, EmptyState } from "../../ui_primitives";

interface AppCanvasProps {
  workflow: Workflow;
  padding?: number;
}

const AppCanvas: React.FC<AppCanvasProps> = ({ workflow, padding = 16 }) => {
  const runtime = useAppRuntime(workflow, true);
  const spec = useAppBuilderStore((s) => s.spec);
  const selectedWidgetId = useAppBuilderStore((s) => s.selectedWidgetId);
  const selectWidget = useAppBuilderStore((s) => s.selectWidget);
  const updateLayout = useAppBuilderStore((s) => s.updateLayout);
  const removeWidget = useAppBuilderStore((s) => s.removeWidget);
  const duplicateWidget = useAppBuilderStore((s) => s.duplicateWidget);

  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(960);
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

  const innerWidth = Math.max(0, width - padding * 2);
  const cw = innerWidth > 0 ? cellWidth(innerWidth, spec.grid) : 0;
  const minHeight = Math.max(
    400,
    canvasHeight(spec.widgets, spec.grid) + spec.grid.rowHeight * 3
  );

  return (
    <AppRuntimeContext.Provider value={runtime}>
      <Box
        ref={ref}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) selectWidget(null);
        }}
        sx={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "auto",
          backgroundColor: "background.default"
        }}
      >
        <Box
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) selectWidget(null);
          }}
          sx={{
            position: "relative",
            margin: `${padding}px`,
            minHeight,
            // Column guide stripes
            backgroundImage:
              cw > 0
                ? `repeating-linear-gradient(to right, var(--appbuilder-grid-line, rgba(127,127,127,0.08)) 0, var(--appbuilder-grid-line, rgba(127,127,127,0.08)) ${cw}px, transparent ${cw}px, transparent ${cw + spec.grid.gap}px)`
                : undefined,
            backgroundSize: `${cw + spec.grid.gap}px ${spec.grid.rowHeight + spec.grid.gap}px`
          }}
        >
          {spec.widgets.length === 0 && (
            <Box sx={{ position: "absolute", inset: 0 }}>
              <EmptyState
                title="Empty canvas"
                description="Add widgets from the palette, then bind them to workflow inputs and outputs."
              />
            </Box>
          )}
          {innerWidth > 0 &&
            spec.widgets.map((widget) => (
              <CanvasWidget
                key={widget.id}
                widget={widget}
                containerWidth={innerWidth}
                grid={spec.grid}
                selected={widget.id === selectedWidgetId}
                onSelect={selectWidget}
                onChangeLayout={updateLayout}
                onRemove={removeWidget}
                onDuplicate={duplicateWidget}
              />
            ))}
        </Box>
      </Box>
    </AppRuntimeContext.Provider>
  );
};

export default AppCanvas;
