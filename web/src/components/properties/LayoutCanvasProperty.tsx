/**
 * LayoutCanvasProperty - Property component for layout canvas data
 * Renders the LayoutCanvasEditor in a modal for editing canvas layouts
 */

import React, { memo, useCallback, useState, useEffect } from "react";
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
import { LayoutCanvasData, DEFAULT_CANVAS_DATA, ExposedInput } from "../design/types";
import { useNodes } from "../../contexts/NodeContext";

const LayoutCanvasProperty: React.FC<PropertyProps> = (props) => {
  const theme = useTheme();
  const id = `layout-canvas-${props.property.name}-${props.propertyIndex}`;
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Access node store for updating dynamic properties
  const { findNode, updateNodeData } = useNodes((state) => ({
    findNode: state.findNode,
    updateNodeData: state.updateNodeData
  }));

  // Get current value or use default, ensuring type field is present
  const canvasData: LayoutCanvasData = props.value 
    ? { ...props.value, type: "layout_canvas" as const }
    : DEFAULT_CANVAS_DATA;

  // Sync exposed inputs to node's dynamic_properties
  const syncExposedInputs = useCallback(
    (exposedInputs: ExposedInput[]) => {
      const node = findNode(props.nodeId);
      if (!node) return;

      // Build dynamic properties from exposed inputs
      const dynamicProps: Record<string, any> = {};
      exposedInputs.forEach((input) => {
        // Use a default value based on input type
        const defaultValue = input.inputType === "image" ? null : "";
        // Preserve existing value if it exists
        const existingValue = node.data.dynamic_properties?.[input.inputName];
        dynamicProps[input.inputName] = existingValue !== undefined ? existingValue : defaultValue;
      });

      // Only update if dynamic properties changed
      const currentDynamic = node.data.dynamic_properties || {};
      if (!isEqual(Object.keys(dynamicProps).sort(), Object.keys(currentDynamic).sort())) {
        updateNodeData(props.nodeId, { dynamic_properties: dynamicProps });
      }
    },
    [findNode, updateNodeData, props.nodeId]
  );

  // Sync exposed inputs when canvas data changes
  useEffect(() => {
    if (canvasData.exposedInputs) {
      syncExposedInputs(canvasData.exposedInputs);
    }
  }, [canvasData.exposedInputs, syncExposedInputs]);

  const handleOpenEditor = useCallback(() => {
    setIsEditorOpen(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setIsEditorOpen(false);
  }, []);

  const handleChange = useCallback(
    (newData: LayoutCanvasData) => {
      props.onChange(newData);
      // Also sync exposed inputs to dynamic properties
      if (newData.exposedInputs) {
        syncExposedInputs(newData.exposedInputs);
      }
    },
    [props, syncExposedInputs]
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
          component="div"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            py: 1
          }}
        >
          <Typography variant="h6" component="span">Layout Canvas Editor</Typography>
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
