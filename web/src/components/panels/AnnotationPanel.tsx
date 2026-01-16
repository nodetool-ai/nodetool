/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback } from "react";
import {
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Typography,
  Tooltip,
  Divider
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import PushPinIcon from "@mui/icons-material/PushPin";
import NoteIcon from "@mui/icons-material/Note";
import { ANNOTATION_COLORS, useAnnotationStore } from "../../stores/AnnotationStore";
import { prettyDate } from "../../utils/formatDateAndTime";

const containerStyles = css({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  width: "100%",
  padding: "8px 10px 10px 10px",
  boxSizing: "border-box",
  gap: 8
});

const headerStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: 40
});

const listStyles = css({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  "& .MuiListItem-root": {
    padding: "4px 8px"
  }
});

const emptyStateStyles = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "text.secondary",
  textAlign: "center",
  padding: 3,
  "& .MuiSvgIcon-root": {
    fontSize: "2.5rem",
    marginBottom: 1,
    opacity: 0.5
  }
});

interface AnnotationPanelProps {
  onFocusAnnotation?: (id: string, position: { x: number; y: number }) => void;
  onCreateAtCenter?: () => void;
}

const AnnotationPanel: React.FC<AnnotationPanelProps> = ({ onFocusAnnotation, onCreateAtCenter }) => {
  const theme = useTheme();
  const annotations = useAnnotationStore((state) => state.getAllAnnotations());
  const selectedAnnotationId = useAnnotationStore((state) => state.selectedAnnotationId);
  const deleteAnnotation = useAnnotationStore((state) => state.deleteAnnotation);
  const selectAnnotation = useAnnotationStore((state) => state.selectAnnotation);

  const sortedAnnotations = [...annotations].sort((a, b) => b.updatedAt - a.updatedAt);

  const handleSelectAnnotation = useCallback(
    (id: string) => {
      selectAnnotation(id);
      const annotation = annotations.find((a) => a.id === id);
      if (annotation && onFocusAnnotation) {
        onFocusAnnotation(id, annotation.position);
      }
    },
    [annotations, selectAnnotation, onFocusAnnotation]
  );

  const handleDeleteAnnotation = useCallback(
    (id: string, event: React.MouseEvent) => {
      event.stopPropagation();
      deleteAnnotation(id);
    },
    [deleteAnnotation]
  );

  const handleCreateAnnotation = useCallback(() => {
    if (onCreateAtCenter) {
      onCreateAtCenter();
    }
  }, [onCreateAtCenter]);

  const getColorInfo = (color: string) => {
    return ANNOTATION_COLORS.find((c) => c.id === color) || ANNOTATION_COLORS[0];
  };

  return (
    <Box css={containerStyles}>
      <Box css={headerStyles}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <NoteIcon sx={{ fontSize: "1.2rem", color: "primary.main" }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Annotations
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            ({annotations.length})
          </Typography>
        </Box>
        <Tooltip title="Add annotation at center" placement="top" arrow>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleCreateAnnotation}
            sx={{ minWidth: "auto", px: 1.5 }}
          >
            Add
          </Button>
        </Tooltip>
      </Box>

      <Divider />

      {annotations.length === 0 ? (
        <Box css={emptyStateStyles}>
          <NoteIcon />
          <Typography variant="body2" sx={{ mb: 1 }}>
            No annotations yet
          </Typography>
          <Typography variant="caption" sx={{ mb: 2 }}>
            Add notes to document your workflow
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleCreateAnnotation}
          >
            Create First Annotation
          </Button>
        </Box>
      ) : (
        <List css={listStyles} dense>
          {sortedAnnotations.map((annotation) => {
            const colorInfo = getColorInfo(annotation.color);
            const isSelected = selectedAnnotationId === annotation.id;
            const previewText = annotation.text
              ? annotation.text.length > 50
                ? annotation.text.substring(0, 50) + "..."
                : annotation.text
              : "Empty note";

            return (
              <ListItem
                key={annotation.id}
                disablePadding
                secondaryAction={
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={(e) => handleDeleteAnnotation(annotation.id, e)}
                    sx={{ opacity: 0.6, "&:hover": { opacity: 1, color: "error.main" } }}
                  >
                    <DeleteIcon sx={{ fontSize: "1rem" }} />
                  </IconButton>
                }
              >
                <ListItemButton
                  selected={isSelected}
                  onClick={() => handleSelectAnnotation(annotation.id)}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    "&.Mui-selected": {
                      backgroundColor: theme.vars.palette.action.selected
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Box
                      sx={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        backgroundColor: colorInfo.bgColor,
                        border: `1px solid ${colorInfo.borderColor}`
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: isSelected ? 600 : 400,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {previewText || "Empty note"}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {prettyDate(annotation.updatedAt)}
                      </Typography>
                    }
                  />
                  {isSelected && (
                    <Tooltip title="Focused" placement="top" arrow>
                      <PushPinIcon sx={{ fontSize: "0.9rem", color: "primary.main" }} />
                    </Tooltip>
                  )}
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      )}
    </Box>
  );
};

export default AnnotationPanel;
