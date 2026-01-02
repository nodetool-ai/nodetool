/**
 * Canvas Component
 *
 * Visual editing canvas for the HTML builder with drag-and-drop support.
 */

import React, { useCallback, useMemo, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useHTMLBuilderStore } from "../../../../stores/useHTMLBuilderStore";
import type { BuilderElement } from "../types/builder.types";

/**
 * Props for the Canvas component
 */
interface CanvasProps {
  /** Called when an element is clicked */
  onElementClick?: (elementId: string, event: React.MouseEvent) => void;
  /** Called when canvas background is clicked */
  onCanvasClick?: (event: React.MouseEvent) => void;
}

/**
 * Props for rendering a single element
 */
interface ElementRendererProps {
  element: BuilderElement;
  elements: Record<string, BuilderElement>;
  selectedId: string | null;
  multiSelectedIds: string[];
  onElementClick: (elementId: string, event: React.MouseEvent) => void;
  depth: number;
}

/**
 * Render a single element and its children
 */
const ElementRenderer: React.FC<ElementRendererProps> = ({
  element,
  elements,
  selectedId,
  multiSelectedIds,
  onElementClick,
  depth
}) => {
  const theme = useTheme();
  const isSelected = selectedId === element.id;
  const isMultiSelected = multiSelectedIds.includes(element.id);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onElementClick(element.id, event);
    },
    [element.id, onElementClick]
  );

  // Build inline styles
  const elementStyles = useMemo(() => {
    const baseStyles: React.CSSProperties = {
      ...element.styles,
      position: "relative" as const,
      cursor: "pointer",
      outline: isSelected
        ? `2px solid ${theme.palette.primary.main}`
        : isMultiSelected
          ? `2px dashed ${theme.palette.primary.light}`
          : "1px dashed transparent",
      outlineOffset: "2px",
      transition: "outline 0.15s ease",
      minHeight: element.children.length === 0 && !element.textContent ? "32px" : undefined,
      minWidth: "32px"
    };

    return baseStyles;
  }, [element.styles, element.children.length, element.textContent, isSelected, isMultiSelected, theme.palette.primary]);

  // Render children
  const renderedChildren = useMemo(() => {
    return element.children.map((childId) => {
      const child = elements[childId];
      if (!child) {
        return null;
      }
      return (
        <ElementRenderer
          key={childId}
          element={child}
          elements={elements}
          selectedId={selectedId}
          multiSelectedIds={multiSelectedIds}
          onElementClick={onElementClick}
          depth={depth + 1}
        />
      );
    });
  }, [element.children, elements, selectedId, multiSelectedIds, onElementClick, depth]);

  // Build element props
  const elementProps = useMemo(() => {
    const props: Record<string, unknown> = {
      ...element.attributes,
      style: elementStyles,
      onClick: handleClick,
      "data-builder-element": element.id,
      "data-element-type": element.type
    };

    // Remove src for img to prevent broken images in canvas
    if (element.tag === "img" && props.src) {
      props.src = props.src as string;
    }

    return props;
  }, [element.attributes, element.id, element.type, element.tag, elementStyles, handleClick]);

  // Create the element
  const Tag = element.tag as keyof JSX.IntrinsicElements;

  // Handle void elements (self-closing tags)
  const voidElements = ["img", "br", "hr", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"];
  const isVoidElement = voidElements.includes(element.tag);

  if (isVoidElement) {
    return React.createElement(Tag, elementProps as React.HTMLAttributes<HTMLElement>);
  }

  return React.createElement(
    Tag,
    elementProps as React.HTMLAttributes<HTMLElement>,
    element.textContent,
    ...renderedChildren
  );
};

/**
 * Canvas component for the HTML builder
 */
export const Canvas: React.FC<CanvasProps> = ({
  onElementClick,
  onCanvasClick
}) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLDivElement>(null);

  // Get state from store
  const elements = useHTMLBuilderStore((state) => state.elements);
  const rootElementIds = useHTMLBuilderStore((state) => state.rootElementIds);
  const selectedElementId = useHTMLBuilderStore(
    (state) => state.selectedElementId
  );
  const multiSelectedIds = useHTMLBuilderStore(
    (state) => state.multiSelectedIds
  );
  const canvas = useHTMLBuilderStore((state) => state.canvas);
  const selectElement = useHTMLBuilderStore((state) => state.selectElement);

  // Handle element click
  const handleElementClick = useCallback(
    (elementId: string, event: React.MouseEvent) => {
      selectElement(elementId);
      onElementClick?.(elementId, event);
    },
    [selectElement, onElementClick]
  );

  // Handle canvas background click
  const handleCanvasClick = useCallback(
    (event: React.MouseEvent) => {
      // Only handle if clicking directly on canvas, not on elements
      if (event.target === canvasRef.current) {
        selectElement(null);
        onCanvasClick?.(event);
      }
    },
    [selectElement, onCanvasClick]
  );

  // Render root elements
  const rootElements = useMemo(() => {
    return rootElementIds.map((id) => {
      const element = elements[id];
      if (!element) {
        return null;
      }
      return (
        <ElementRenderer
          key={id}
          element={element}
          elements={elements}
          selectedId={selectedElementId}
          multiSelectedIds={multiSelectedIds}
          onElementClick={handleElementClick}
          depth={0}
        />
      );
    });
  }, [rootElementIds, elements, selectedElementId, multiSelectedIds, handleElementClick]);

  // Canvas styles
  const canvasStyles = useMemo(() => ({
    width: "100%",
    height: "100%",
    minHeight: "400px",
    backgroundColor: theme.palette.background.paper,
    backgroundImage: canvas.gridEnabled
      ? `linear-gradient(${theme.palette.divider} 1px, transparent 1px), linear-gradient(90deg, ${theme.palette.divider} 1px, transparent 1px)`
      : "none",
    backgroundSize: `${canvas.gridSize}px ${canvas.gridSize}px`,
    backgroundPosition: `${canvas.panOffset.x}px ${canvas.panOffset.y}px`,
    overflow: "auto",
    padding: "16px",
    transform: `scale(${canvas.zoom})`,
    transformOrigin: "top left",
    cursor: "default"
  }), [theme.palette, canvas]);

  return (
    <Box
      ref={canvasRef}
      onClick={handleCanvasClick}
      sx={canvasStyles}
      role="region"
      aria-label="HTML Builder Canvas"
    >
      {rootElements.length === 0 ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            minHeight: "300px",
            color: theme.palette.text.secondary,
            textAlign: "center",
            p: 4
          }}
        >
          <Typography variant="h6" gutterBottom>
            Empty Canvas
          </Typography>
          <Typography variant="body2">
            Drag components from the library to start building your HTML
          </Typography>
        </Box>
      ) : (
        rootElements
      )}
    </Box>
  );
};

export default Canvas;
