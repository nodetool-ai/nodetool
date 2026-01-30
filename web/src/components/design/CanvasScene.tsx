/**
 * CanvasScene - Rendering portion of the layout canvas editor
 */

import React, { memo } from "react";
import { Paper } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Stage, Layer, Rect, Line } from "react-konva";
import type Konva from "konva";
import type { LayoutCanvasData, LayoutElement, SnapGuide, GridSettings } from "./types";
import CanvasElement from "./CanvasElement";

interface CanvasSceneProps {
  canvasData: LayoutCanvasData;
  gridSettings: GridSettings;
  snapGuides: SnapGuide[];
  sortedElements: LayoutElement[];
  selectedIds: string[];
  effectiveVisibleById: Map<string, boolean>;
  effectiveLockedById: Map<string, boolean>;
  selectionRect: { x: number; y: number; width: number; height: number } | null;
  selectionStroke: string;
  selectionFill: string;
  stageRef: React.RefObject<Konva.Stage>;
  stagePosition: { x: number; y: number };
  zoom: number;
  isPanning: boolean;
  elementsOpacity?: number;
  showGrid?: boolean;
  showGuides?: boolean;
  backgroundColor?: string;
  onSelect: (id: string, event: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragStart: (id: string) => void;
  onTransformEnd: (
    id: string,
    attrs: { x: number; y: number; width: number; height: number; rotation: number }
  ) => void;
  onDragMove: (id: string, x: number, y: number, width: number, height: number) => { x: number; y: number };
  onDragEnd: (id: string, x: number, y: number) => void;
  snapToGrid: (value: number) => number;
  onStageMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onStageMouseMove: () => void;
  onStageMouseUp: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onStageClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

const SnapGuidesLayer: React.FC<{ guides: SnapGuide[] }> = memo(({ guides }) => {
  if (guides.length === 0) {
    return null;
  }

  return (
    <>
      {guides.map((guide, index) => (
        <Line
          key={`guide-${index}`}
          points={
            guide.type === "vertical"
              ? [guide.position, guide.start, guide.position, guide.end]
              : [guide.start, guide.position, guide.end, guide.position]
          }
          stroke="#ff00ff"
          strokeWidth={1}
          dash={[4, 4]}
        />
      ))}
    </>
  );
});
SnapGuidesLayer.displayName = "SnapGuidesLayer";

const GridLines: React.FC<{
  width: number;
  height: number;
  gridSize: number;
  enabled: boolean;
}> = memo(({ width, height, gridSize, enabled }) => {
  const theme = useTheme();

  if (!enabled) {
    return null;
  }

  const lines: React.ReactNode[] = [];
  const strokeColor = theme.palette.mode === "dark" ? "#333" : "#e0e0e0";

  for (let x = 0; x <= width; x += gridSize) {
    lines.push(
      <Line
        key={`v-${x}`}
        points={[x, 0, x, height]}
        stroke={strokeColor}
        strokeWidth={x % (gridSize * 5) === 0 ? 0.5 : 0.25}
      />
    );
  }

  for (let y = 0; y <= height; y += gridSize) {
    lines.push(
      <Line
        key={`h-${y}`}
        points={[0, y, width, y]}
        stroke={strokeColor}
        strokeWidth={y % (gridSize * 5) === 0 ? 0.5 : 0.25}
      />
    );
  }

  return <>{lines}</>;
});
GridLines.displayName = "GridLines";

const CanvasScene: React.FC<CanvasSceneProps> = ({
  canvasData,
  gridSettings,
  snapGuides,
  sortedElements,
  selectedIds,
  effectiveVisibleById,
  effectiveLockedById,
  selectionRect,
  selectionStroke,
  selectionFill,
  stageRef,
  stagePosition,
  zoom,
  isPanning,
  elementsOpacity = 1,
  showGrid = true,
  showGuides = true,
  backgroundColor,
  onSelect,
  onDragStart,
  onTransformEnd,
  onDragMove,
  onDragEnd,
  snapToGrid,
  onStageMouseDown,
  onStageMouseMove,
  onStageMouseUp,
  onStageClick
}) => {
  return (
    <Paper
      className="layout-canvas-stage-wrapper"
      elevation={3}
      sx={{
        overflow: "hidden",
        backgroundColor: "transparent"
      }}
    >
      <Stage
        ref={stageRef}
        width={canvasData.width}
        height={canvasData.height}
        x={stagePosition.x}
        y={stagePosition.y}
        scaleX={zoom}
        scaleY={zoom}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onClick={onStageClick}
        onTap={onStageClick}
      >
        <Layer>
          <Rect
            x={0}
            y={0}
            width={canvasData.width}
            height={canvasData.height}
            fill={backgroundColor ?? canvasData.backgroundColor}
            name="canvas-background"
          />
          {showGrid && (
            <GridLines
              width={canvasData.width}
              height={canvasData.height}
              gridSize={gridSettings.size}
              enabled={gridSettings.enabled}
            />
          )}
        </Layer>

        <Layer>
          {sortedElements.map((element) => (
            <CanvasElement
              key={element.id}
              element={element}
              isSelected={selectedIds.includes(element.id)}
              effectiveVisible={effectiveVisibleById.get(element.id)}
              effectiveLocked={effectiveLockedById.get(element.id)}
              contentOpacity={elementsOpacity}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onTransformEnd={onTransformEnd}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              snapToGrid={snapToGrid}
            />
          ))}
        </Layer>

        <Layer listening={false}>
          {selectionRect && (
            <Rect
              x={selectionRect.x}
              y={selectionRect.y}
              width={selectionRect.width}
              height={selectionRect.height}
              stroke={selectionStroke}
              fill={selectionFill}
              strokeWidth={1}
              dash={[4, 4]}
            />
          )}
        </Layer>

        {showGuides && (
          <Layer>
            <SnapGuidesLayer guides={snapGuides} />
          </Layer>
        )}
      </Stage>
    </Paper>
  );
};

export default memo(CanvasScene);
