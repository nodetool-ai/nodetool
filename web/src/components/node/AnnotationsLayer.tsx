/** @jsxImportSource @emotion/react */
import { memo, useCallback } from "react";
import { Box } from "@mui/material";
import { useViewport } from "@xyflow/react";
import AnnotationNode from "./AnnotationNode";
import useAnnotationStore, { Annotation } from "../../stores/AnnotationStore";

interface AnnotationsLayerProps {
  workflowId: string;
  onAnnotationPositionChange?: (id: string, position: { x: number; y: number }) => void;
}

const AnnotationsLayer: React.FC<AnnotationsLayerProps> = ({ workflowId: _workflowId, onAnnotationPositionChange }) => {
  const viewport = useViewport();
  const annotations = useAnnotationStore((state) => state.getAllAnnotations());
  const selectedAnnotationId = useAnnotationStore((state) => state.selectedAnnotationId);
  const deleteAnnotation = useAnnotationStore((state) => state.deleteAnnotation);
  const updateAnnotation = useAnnotationStore((state) => state.updateAnnotation);
  const selectAnnotation = useAnnotationStore((state) => state.selectAnnotation);

  const handleSelectAnnotation = useCallback(
    (id: string) => {
      selectAnnotation(id);
    },
    [selectAnnotation]
  );

  const handleDeleteAnnotation = useCallback(
    (id: string) => {
      deleteAnnotation(id);
    },
    [deleteAnnotation]
  );

  const handleUpdateAnnotation = useCallback(
    (id: string, updates: Partial<Annotation>) => {
      updateAnnotation(id, updates);
      if (updates.position && onAnnotationPositionChange) {
        onAnnotationPositionChange(id, updates.position);
      }
    },
    [updateAnnotation, onAnnotationPositionChange]
  );

  if (annotations.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 5,
        "& > *": {
          pointerEvents: "auto"
        }
      }}
    >
      {annotations.map((annotation) => (
        <AnnotationNode
          key={annotation.id}
          annotation={annotation}
          isSelected={selectedAnnotationId === annotation.id}
          onSelect={() => handleSelectAnnotation(annotation.id)}
          onDelete={handleDeleteAnnotation}
          onUpdate={handleUpdateAnnotation}
          zoom={viewport.zoom}
        />
      ))}
    </Box>
  );
};

export default memo(AnnotationsLayer);
