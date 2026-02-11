/**
 * Canvas Component
 *
 * Visual editing canvas for the HTML builder with drag-and-drop support,
 * inline text editing, and element reordering capabilities.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
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
  onTextChange: (elementId: string, text: string) => void;
  onDragStart: (elementId: string, event: React.DragEvent) => void;
  onDragOver: (elementId: string, event: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (targetId: string, event: React.DragEvent) => void;
  dragOverId: string | null;
  depth: number;
}

/**
 * Check if element supports rich text editing
 */
const isEditableElement = (element: BuilderElement): boolean => {
  // Container types like section, div support rich text editing
  const editableTypes = ["container", "text", "heading"];
  const editableTags = ["section", "div", "p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "button", "label", "a"];
  return editableTypes.includes(element.type) || editableTags.includes(element.tag);
};

/**
 * Render a single element and its children
 */
const ElementRenderer: React.FC<ElementRendererProps> = ({
  element,
  elements,
  selectedId,
  multiSelectedIds,
  onElementClick,
  onTextChange,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  dragOverId,
  depth
}) => {
  const theme = useTheme();
  const isSelected = selectedId === element.id;
  const isMultiSelected = multiSelectedIds.includes(element.id);
  const isDragOver = dragOverId === element.id;
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onElementClick(element.id, event);
    },
    [element.id, onElementClick]
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (isEditableElement(element)) {
        setIsEditing(true);
        // Focus the contentEditable element
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.focus();
            // Select all text for easy editing
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(contentRef.current);
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }, 0);
      }
    },
    [element]
  );

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (contentRef.current) {
      const newText = contentRef.current.innerText || "";
      if (newText !== element.textContent) {
        onTextChange(element.id, newText);
      }
    }
  }, [element.id, element.textContent, onTextChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Exit editing on Escape
      if (event.key === "Escape") {
        setIsEditing(false);
        contentRef.current?.blur();
      }
      // Exit editing on Enter (unless Shift is held for multiline)
      if (event.key === "Enter" && !event.shiftKey && !["div", "section", "p"].includes(element.tag)) {
        event.preventDefault();
        setIsEditing(false);
        contentRef.current?.blur();
      }
    },
    [element.tag]
  );

  const handleDragStartElement = useCallback(
    (event: React.DragEvent) => {
      event.stopPropagation();
      onDragStart(element.id, event);
    },
    [element.id, onDragStart]
  );

  const handleDragOverElement = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onDragOver(element.id, event);
    },
    [element.id, onDragOver]
  );

  const handleDropElement = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onDrop(element.id, event);
    },
    [element.id, onDrop]
  );

  // Build inline styles
  const elementStyles = useMemo(() => {
    const baseStyles: React.CSSProperties = {
      ...element.styles,
      position: "relative" as const,
      cursor: isEditing ? "text" : "pointer",
      outline: isSelected
        ? `2px solid ${theme.vars.palette.primary.main}`
        : isMultiSelected
          ? `2px dashed ${theme.vars.palette.primary.light}`
          : isDragOver
            ? `2px dashed ${theme.vars.palette.success.main}`
            : isHovered
              ? `1px solid ${theme.vars.palette.primary.light}`
              : "1px dashed transparent",
      outlineOffset: "2px",
      transition: "outline 0.15s ease, background-color 0.15s ease",
      minHeight: element.children.length === 0 && !element.textContent ? "32px" : undefined,
      minWidth: "32px",
      backgroundColor: isDragOver
        ? `${theme.vars.palette.success.main}10`
        : element.styles.backgroundColor
    };

    return baseStyles;
  }, [element.styles, element.children.length, element.textContent, isSelected, isMultiSelected, isDragOver, isHovered, isEditing, theme.vars.palette]);

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
          onTextChange={onTextChange}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
          dragOverId={dragOverId}
          depth={depth + 1}
        />
      );
    });
  }, [element.children, elements, selectedId, multiSelectedIds, onElementClick, onTextChange, onDragStart, onDragOver, onDragEnd, onDrop, dragOverId, depth]);

  // Handle void elements (self-closing tags)
  const voidElements = ["img", "br", "hr", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"];
  const isVoidElement = voidElements.includes(element.tag);

  // Determine if element can have children
  const canHaveChildren = !isVoidElement && element.type === "container";

  // Handle mouse enter/leave for hover state
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  // Wrapper for drag handle and element
  return (
    <Box
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        position: "relative",
        "&:hover .drag-handle": {
          opacity: 1
        },
        "&:hover .element-label": {
          opacity: 1
        }
      }}
    >
      {/* Hover/Selection label showing element tag */}
      {(isHovered || isSelected) && (
        <Box
          className="element-label"
          sx={{
            position: "absolute",
            top: -20,
            left: 0,
            fontSize: "10px",
            fontWeight: 500,
            color: isSelected ? theme.vars.palette.primary.contrastText : theme.vars.palette.text.secondary,
            backgroundColor: isSelected ? theme.vars.palette.primary.main : theme.vars.palette.background.paper,
            padding: "2px 6px",
            borderRadius: "3px",
            zIndex: 11,
            pointerEvents: "none",
            opacity: isSelected ? 1 : 0.9,
            transition: "opacity 0.15s ease",
            border: `1px solid ${isSelected ? theme.vars.palette.primary.main : theme.vars.palette.divider}`,
            whiteSpace: "nowrap"
          }}
        >
          {element.displayName || element.tag}
        </Box>
      )}

      {/* Drag handle */}
      <Box
        className="drag-handle"
        draggable
        onDragStart={handleDragStartElement}
        onDragEnd={onDragEnd}
        sx={{
          position: "absolute",
          left: -24,
          top: "50%",
          transform: "translateY(-50%)",
          cursor: "grab",
          opacity: isSelected || isHovered ? 1 : 0,
          transition: "opacity 0.2s ease",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 20,
          height: 20,
          borderRadius: "4px",
          backgroundColor: theme.vars.palette.background.paper,
          border: `1px solid ${theme.vars.palette.divider}`,
          "&:hover": {
            backgroundColor: theme.vars.palette.action.hover
          },
          "&:active": {
            cursor: "grabbing"
          }
        }}
      >
        <DragIndicatorIcon sx={{ fontSize: 14, color: theme.vars.palette.text.secondary }} />
      </Box>

      {/* Element content */}
      <Box
        ref={contentRef}
        component={element.tag as keyof JSX.IntrinsicElements}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onBlur={handleBlur}
        onKeyDown={isEditing ? handleKeyDown : undefined}
        onDragOver={canHaveChildren ? handleDragOverElement : undefined}
        onDrop={canHaveChildren ? handleDropElement : undefined}
        contentEditable={isEditing && isEditableElement(element)}
        suppressContentEditableWarning
        sx={elementStyles}
        data-builder-element={element.id}
        data-element-type={element.type}
        {...element.attributes}
      >
        {isVoidElement ? null : (
          <>
            {element.textContent}
            {renderedChildren}
          </>
        )}
      </Box>
    </Box>
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
  const [draggedElementId, setDraggedElementId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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
  const updateElement = useHTMLBuilderStore((state) => state.updateElement);
  const moveElement = useHTMLBuilderStore((state) => state.moveElement);
  const reorderElement = useHTMLBuilderStore((state) => state.reorderElement);
  const deleteElement = useHTMLBuilderStore((state) => state.deleteElement);
  const copyElement = useHTMLBuilderStore((state) => state.copyElement);
  const pasteElement = useHTMLBuilderStore((state) => state.pasteElement);
  const duplicateElement = useHTMLBuilderStore((state) => state.duplicateElement);

  // Keyboard shortcuts for delete, copy, paste, duplicate
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle if typing in an input or contentEditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Delete/Backspace - delete selected element
      if ((event.key === "Delete" || event.key === "Backspace") && selectedElementId) {
        event.preventDefault();
        deleteElement(selectedElementId);
      }

      // Ctrl/Cmd + C - copy
      if ((event.ctrlKey || event.metaKey) && event.key === "c" && selectedElementId) {
        event.preventDefault();
        copyElement(selectedElementId);
      }

      // Ctrl/Cmd + V - paste
      if ((event.ctrlKey || event.metaKey) && event.key === "v") {
        event.preventDefault();
        const parentId = selectedElementId ? elements[selectedElementId]?.parentId : undefined;
        pasteElement(parentId);
      }

      // Ctrl/Cmd + D - duplicate
      if ((event.ctrlKey || event.metaKey) && event.key === "d" && selectedElementId) {
        event.preventDefault();
        duplicateElement(selectedElementId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedElementId, elements, deleteElement, copyElement, pasteElement, duplicateElement]);

  // Handle element click
  const handleElementClick = useCallback(
    (elementId: string, event: React.MouseEvent) => {
      selectElement(elementId);
      onElementClick?.(elementId, event);
    },
    [selectElement, onElementClick]
  );

  // Handle text content change from inline editing
  const handleTextChange = useCallback(
    (elementId: string, text: string) => {
      updateElement(elementId, { textContent: text });
    },
    [updateElement]
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (elementId: string, event: React.DragEvent) => {
      setDraggedElementId(elementId);
      event.dataTransfer.setData("text/plain", elementId);
      event.dataTransfer.effectAllowed = "move";
    },
    []
  );

  // Handle drag over
  const handleDragOver = useCallback(
    (elementId: string, _event: React.DragEvent) => {
      if (draggedElementId && draggedElementId !== elementId) {
        setDragOverId(elementId);
      }
    },
    [draggedElementId]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedElementId(null);
    setDragOverId(null);
  }, []);

  // Handle drop
  const handleDrop = useCallback(
    (targetId: string, _event: React.DragEvent) => {
      if (draggedElementId && draggedElementId !== targetId) {
        const draggedElement = elements[draggedElementId];
        const targetElement = elements[targetId];
        
        if (draggedElement && targetElement) {
          // If target is a container, move into it
          if (targetElement.type === "container") {
            moveElement(draggedElementId, targetId);
          } else {
            // Otherwise, reorder within same parent
            const draggedParent = draggedElement.parentId;
            const targetParent = targetElement.parentId;
            
            if (draggedParent === targetParent) {
              // Same parent - find target index
              const parentChildren = draggedParent 
                ? elements[draggedParent]?.children || []
                : rootElementIds;
              const targetIndex = parentChildren.indexOf(targetId);
              if (targetIndex !== -1) {
                reorderElement(draggedElementId, targetIndex);
              }
            } else {
              // Different parents - move to target's parent
              moveElement(draggedElementId, targetParent);
            }
          }
        }
      }
      handleDragEnd();
    },
    [draggedElementId, elements, rootElementIds, moveElement, reorderElement, handleDragEnd]
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

  // Handle canvas drag over for root-level drops
  const handleCanvasDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (draggedElementId) {
        setDragOverId(null);
      }
    },
    [draggedElementId]
  );

  // Handle canvas drop for root-level repositioning
  const handleCanvasDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (draggedElementId) {
        // Move to root level
        moveElement(draggedElementId, undefined);
      }
      handleDragEnd();
    },
    [draggedElementId, moveElement, handleDragEnd]
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
          onTextChange={handleTextChange}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
          dragOverId={dragOverId}
          depth={0}
        />
      );
    });
  }, [rootElementIds, elements, selectedElementId, multiSelectedIds, handleElementClick, handleTextChange, handleDragStart, handleDragOver, handleDragEnd, handleDrop, dragOverId]);

  // Canvas styles
  const canvasStyles = useMemo(() => ({
    width: "100%",
    height: "100%",
    minHeight: "400px",
    backgroundColor: theme.vars.palette.background.paper,
    backgroundImage: canvas.gridEnabled
      ? `linear-gradient(${theme.vars.palette.divider} 1px, transparent 1px), linear-gradient(90deg, ${theme.vars.palette.divider} 1px, transparent 1px)`
      : "none",
    backgroundSize: `${canvas.gridSize}px ${canvas.gridSize}px`,
    backgroundPosition: `${canvas.panOffset.x}px ${canvas.panOffset.y}px`,
    overflow: "auto",
    padding: "16px",
    paddingLeft: "40px", // Extra space for drag handles
    transform: `scale(${canvas.zoom})`,
    transformOrigin: "top left",
    cursor: "default"
  }), [theme.vars.palette, canvas]);

  return (
    <Box
      ref={canvasRef}
      onClick={handleCanvasClick}
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
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
            color: theme.vars.palette.text.secondary,
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
