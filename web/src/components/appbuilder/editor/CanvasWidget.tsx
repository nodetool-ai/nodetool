/** @jsxImportSource @emotion/react */
import React, { useCallback, useRef } from "react";
import Draggable, { DraggableData, DraggableEvent } from "react-draggable";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import { AppGridConfig, Widget, WidgetLayout } from "../appSchema";
import {
  layoutToPixels,
  pixelToGridPosition,
  pixelToGridSize
} from "../gridUtils";
import RuntimeWidget from "../RuntimeWidget";
import {
  Box,
  ToolbarIconButton,
  FlexRow,
  BORDER_RADIUS,
  Z_INDEX
} from "../../ui_primitives";

interface CanvasWidgetProps {
  widget: Widget;
  containerWidth: number;
  grid: AppGridConfig;
  selected: boolean;
  onSelect: (id: string) => void;
  onChangeLayout: (id: string, layout: WidgetLayout) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
}

const CanvasWidget: React.FC<CanvasWidgetProps> = ({
  widget,
  containerWidth,
  grid,
  selected,
  onSelect,
  onChangeLayout,
  onRemove,
  onDuplicate
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const rect = layoutToPixels(widget.layout, containerWidth, grid);
  const resizeStart = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const handleDragStop = useCallback(
    (_e: DraggableEvent, data: DraggableData) => {
      const { x, y } = pixelToGridPosition(
        data.x,
        data.y,
        widget.layout,
        containerWidth,
        grid
      );
      if (x !== widget.layout.x || y !== widget.layout.y) {
        onChangeLayout(widget.id, { ...widget.layout, x, y });
      }
    },
    [containerWidth, grid, onChangeLayout, widget.id, widget.layout]
  );

  const handleResizeMove = useCallback(
    (e: PointerEvent) => {
      const start = resizeStart.current;
      if (!start) return;
      const width = start.width + (e.clientX - start.x);
      const height = start.height + (e.clientY - start.y);
      const { w, h } = pixelToGridSize(
        width,
        height,
        widget.layout,
        containerWidth,
        grid
      );
      if (w !== widget.layout.w || h !== widget.layout.h) {
        onChangeLayout(widget.id, { ...widget.layout, w, h });
      }
    },
    [containerWidth, grid, onChangeLayout, widget.id, widget.layout]
  );

  const handleResizeEnd = useCallback(() => {
    resizeStart.current = null;
    window.removeEventListener("pointermove", handleResizeMove);
    window.removeEventListener("pointerup", handleResizeEnd);
  }, [handleResizeMove]);

  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: rect.width,
        height: rect.height
      };
      window.addEventListener("pointermove", handleResizeMove);
      window.addEventListener("pointerup", handleResizeEnd);
    },
    [handleResizeEnd, handleResizeMove, rect.height, rect.width]
  );

  return (
    <Draggable
      nodeRef={nodeRef as React.RefObject<HTMLElement>}
      position={{ x: rect.left, y: rect.top }}
      onStart={() => onSelect(widget.id)}
      onStop={handleDragStop}
      handle=".appbuilder-drag-handle"
      cancel=".appbuilder-no-drag"
    >
      <Box
        ref={nodeRef}
        className="appbuilder-canvas-widget"
        onMouseDown={() => onSelect(widget.id)}
        sx={{
          position: "absolute",
          width: rect.width,
          height: rect.height,
          boxSizing: "border-box",
          borderRadius: BORDER_RADIUS.sm,
          border: "1px solid",
          borderColor: selected ? "primary.main" : "transparent",
          outline: selected ? "1px solid" : "none",
          outlineColor: "primary.main",
          "&:hover": { borderColor: selected ? "primary.main" : "divider" }
        }}
      >
        {/* Drag handle / toolbar overlay (visible when selected) */}
        {selected && (
          <FlexRow
            className="appbuilder-drag-handle"
            align="center"
            gap={0}
            sx={{
              position: "absolute",
              top: -26,
              left: 0,
              height: 24,
              px: 0.5,
              cursor: "move",
              backgroundColor: "primary.main",
              color: "primary.contrastText",
              borderRadius: BORDER_RADIUS.sm,
              zIndex: Z_INDEX.raised
            }}
          >
            <Box sx={{ fontSize: "0.7rem", px: 0.5, userSelect: "none" }}>
              {widget.type}
            </Box>
            <ToolbarIconButton
              className="appbuilder-no-drag"
              size="small"
              icon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
              tooltip="Duplicate"
              onClick={() => onDuplicate(widget.id)}
            />
            <ToolbarIconButton
              className="appbuilder-no-drag"
              size="small"
              icon={<DeleteOutlineIcon sx={{ fontSize: 14 }} />}
              tooltip="Delete"
              onClick={() => onRemove(widget.id)}
            />
          </FlexRow>
        )}

        {/* Widget preview (inert in design mode) */}
        <Box
          className={selected ? undefined : "appbuilder-drag-handle"}
          sx={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
            p: 0.5,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            pointerEvents: "none"
          }}
        >
          <RuntimeWidget widget={widget} />
        </Box>

        {/* Resize handle */}
        {selected && (
          <Box
            className="appbuilder-no-drag"
            onPointerDown={handleResizeStart}
            sx={{
              position: "absolute",
              right: -4,
              bottom: -4,
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: "primary.main",
              cursor: "nwse-resize",
              zIndex: Z_INDEX.raised
            }}
          />
        )}
      </Box>
    </Draggable>
  );
};

export default CanvasWidget;
