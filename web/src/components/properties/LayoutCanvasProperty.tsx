/**
 * LayoutCanvasProperty - Property component for layout canvas data
 * Renders the LayoutCanvasEditor in a modal for editing canvas layouts
 */

import React, { memo, useCallback, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import isEqual from "lodash/isEqual";
import { LayoutCanvasEditor } from "../design";
import { LayoutCanvasData, DEFAULT_CANVAS_DATA } from "../design/types";

const LayoutCanvasProperty: React.FC<PropertyProps> = (props) => {
  const theme = useTheme();
  const id = `layout-canvas-${props.property.name}-${props.propertyIndex}`;
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Get current value or use default
  const canvasData: LayoutCanvasData = props.value || DEFAULT_CANVAS_DATA;

  const handleOpenEditor = useCallback(() => {
    setIsEditorOpen(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setIsEditorOpen(false);
  }, []);

  const handleChange = useCallback(
    (newData: LayoutCanvasData) => {
      props.onChange(newData);
    },
    [props]
  );

  // Summary of canvas contents
  const elementCount = canvasData.elements?.length || 0;
  const exposedCount = canvasData.exposedInputs?.length || 0;

  return (
    <div className="layout-canvas-property">
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          mt: 1
        }}
      >
        {/* Preview/summary */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            backgroundColor: theme.vars.palette.background.paper,
            border: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Canvas: {canvasData.width} × {canvasData.height}px
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Elements: {elementCount} | Exposed inputs: {exposedCount}
          </Typography>
        </Box>

        {/* Edit button */}
        <Button
          variant="outlined"
          size="small"
          startIcon={<EditIcon />}
          onClick={handleOpenEditor}
          sx={{ alignSelf: "flex-start" }}
        >
          Edit Canvas
        </Button>
      </Box>

      {/* Editor dialog */}
      <Dialog
        open={isEditorOpen}
        onClose={handleCloseEditor}
        maxWidth={false}
        fullWidth
        PaperProps={{
          sx: {
            width: "90vw",
            height: "85vh",
            maxWidth: "none"
          }
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            py: 1
          }}
        >
          <Typography variant="h6">Layout Canvas Editor</Typography>
          <IconButton
            size="small"
            onClick={handleCloseEditor}
            aria-label="Close editor"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent
          sx={{
            p: 0,
            display: "flex",
            overflow: "hidden"
          }}
        >
          <LayoutCanvasEditor
            value={canvasData}
            onChange={handleChange}
            width={canvasData.width}
            height={canvasData.height}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default memo(LayoutCanvasProperty, isEqual);
