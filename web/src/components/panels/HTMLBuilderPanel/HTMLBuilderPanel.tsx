/**
 * HTMLBuilderPanel Component
 *
 * Main panel component for the WYSIWYG HTML builder.
 * Provides a split-view interface with visual canvas and live preview.
 */

import React, { useCallback, useState, useMemo } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Button,
  Divider,
  Tabs,
  Tab,
  Snackbar,
  Alert
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import SaveIcon from "@mui/icons-material/Save";
import DownloadIcon from "@mui/icons-material/Download";
import { useHTMLBuilderStore } from "../../../stores/useHTMLBuilderStore";

// Sub-components
import { Canvas } from "./components/Canvas";
import { ComponentLibrary } from "./components/ComponentLibrary";
import { PropertyEditor } from "./components/PropertyEditor";
import { PreviewPane } from "./components/PreviewPane";
import { LayerTree } from "./components/LayerTree";
import { PropertyBindingDialog } from "./components/PropertyBindingDialog";

// Types
import type { ComponentDefinition, BuilderElement } from "./types/builder.types";

/**
 * Props for HTMLBuilderPanel
 */
interface HTMLBuilderPanelProps {
  /** Property values from workflow for resolving bindings */
  propertyValues?: Record<string, unknown>;
  /** Called when HTML is generated/saved */
  onSave?: (html: string) => void;
  /** Called when panel state changes */
  onChange?: (isDirty: boolean) => void;
  /** Initial builder state to load */
  initialState?: {
    elements: Record<string, BuilderElement>;
    rootElementIds: string[];
  };
}

/**
 * Left sidebar tab types
 */
type LeftTab = "components" | "layers";

/**
 * Right panel tab types
 */
type RightTab = "properties" | "preview";

/**
 * HTMLBuilderPanel component
 */
export const HTMLBuilderPanel: React.FC<HTMLBuilderPanelProps> = ({
  propertyValues = {},
  onSave,
  onChange,
  initialState
}) => {
  const theme = useTheme();

  // Local state
  const [leftTab, setLeftTab] = useState<LeftTab>("components");
  const [rightTab, setRightTab] = useState<RightTab>("properties");
  const [bindingDialogOpen, setBindingDialogOpen] = useState(false);
  const [bindingTarget, setBindingTarget] = useState<string>("");
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "info" });

  // Get state from store
  const selectedElementId = useHTMLBuilderStore(
    (state) => state.selectedElementId
  );
  const elements = useHTMLBuilderStore((state) => state.elements);
  const isDirty = useHTMLBuilderStore((state) => state.isDirty);

  // Store actions
  const addElement = useHTMLBuilderStore((state) => state.addElement);
  const deleteElement = useHTMLBuilderStore((state) => state.deleteElement);
  const duplicateElement = useHTMLBuilderStore((state) => state.duplicateElement);
  const selectElement = useHTMLBuilderStore((state) => state.selectElement);
  const generateHTML = useHTMLBuilderStore((state) => state.generateHTML);
  const clearAll = useHTMLBuilderStore((state) => state.clearAll);
  const markClean = useHTMLBuilderStore((state) => state.markClean);
  const loadState = useHTMLBuilderStore((state) => state.loadState);

  // Undo/redo state - access temporal store directly
  // Zundo's temporal middleware adds a .temporal property to the store
  // For now, we disable undo/redo since the temporal API access pattern varies by zundo version
  const canUndo = false;
  const canRedo = false;

  // Load initial state on mount
  React.useEffect(() => {
    if (initialState) {
      loadState(initialState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - intentionally ignoring initialState and loadState changes

  // Notify parent of dirty state changes
  React.useEffect(() => {
    onChange?.(isDirty);
  }, [isDirty, onChange]);

  // Get selected element
  const selectedElement = useMemo(() => {
    return selectedElementId ? elements[selectedElementId] || null : null;
  }, [elements, selectedElementId]);

  // Handle component selection from library
  const handleComponentSelect = useCallback(
    (component: ComponentDefinition) => {
      const element: Omit<BuilderElement, "id"> = {
        type: component.type,
        tag: component.tag,
        children: [],
        attributes: { ...component.defaultAttributes },
        styles: { ...component.defaultStyles },
        textContent: component.defaultTextContent,
        propertyBindings: {},
        displayName: component.name,
        expanded: true
      };

      // Add to selected element if it can have children, otherwise add to root
      const parentId =
        selectedElementId && elements[selectedElementId]?.type === "container"
          ? selectedElementId
          : undefined;

      const newId = addElement(element, parentId);
      selectElement(newId);

      setSnackbar({
        open: true,
        message: `Added ${component.name}`,
        severity: "success"
      });
    },
    [selectedElementId, elements, addElement, selectElement]
  );

  // Handle delete selected
  const handleDeleteSelected = useCallback(() => {
    if (selectedElementId) {
      deleteElement(selectedElementId);
      setSnackbar({
        open: true,
        message: "Element deleted",
        severity: "info"
      });
    }
  }, [selectedElementId, deleteElement]);

  // Handle duplicate selected
  const handleDuplicateSelected = useCallback(() => {
    if (selectedElementId) {
      const newId = duplicateElement(selectedElementId);
      if (newId) {
        selectElement(newId);
        setSnackbar({
          open: true,
          message: "Element duplicated",
          severity: "success"
        });
      }
    }
  }, [selectedElementId, duplicateElement, selectElement]);

  // Handle save/export
  const handleSave = useCallback(() => {
    const html = generateHTML(propertyValues);
    onSave?.(html);
    markClean();
    setSnackbar({
      open: true,
      message: "HTML saved successfully",
      severity: "success"
    });
  }, [generateHTML, propertyValues, onSave, markClean]);

  // Handle download
  const handleDownload = useCallback(() => {
    const html = generateHTML(propertyValues);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "output.html";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setSnackbar({
      open: true,
      message: "HTML downloaded",
      severity: "success"
    });
  }, [generateHTML, propertyValues]);

  // Handle clear all - available for toolbar integration
  const _handleClearAll = useCallback(() => {
    /* eslint-disable-next-line no-alert */
    const confirmed = window.confirm(
      "Are you sure you want to clear all elements? This action cannot be undone."
    );
    if (confirmed) {
      clearAll();
      setSnackbar({
        open: true,
        message: "All elements cleared",
        severity: "info"
      });
    }
  }, [clearAll]);

  // Handle open binding dialog
  const handleOpenBindingDialog = useCallback(
    (elementId: string, target: string) => {
      setBindingTarget(target);
      setBindingDialogOpen(true);
    },
    []
  );

  // Handle close binding dialog
  const handleCloseBindingDialog = useCallback(() => {
    setBindingDialogOpen(false);
    setBindingTarget("");
  }, []);

  // Handle snackbar close
  const handleSnackbarClose = useCallback(() => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  }, []);

  // Handle undo - currently disabled pending proper zundo integration
  const handleUndo = useCallback(() => {
    // TODO: Implement proper zundo temporal store access
    console.log("Undo not yet implemented");
  }, []);

  // Handle redo - currently disabled pending proper zundo integration
  const handleRedo = useCallback(() => {
    // TODO: Implement proper zundo temporal store access
    console.log("Redo not yet implemented");
  }, []);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: theme.vars.palette.background.default,
        overflow: "hidden"
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          p: 1,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.background.paper
        }}
      >
        <Typography variant="subtitle1" fontWeight="bold" sx={{ mr: 2 }}>
          HTML Builder
        </Typography>

        <Divider orientation="vertical" flexItem />

        {/* Undo/Redo */}
        <Tooltip title="Undo (Ctrl+Z)">
          <span>
            <IconButton
              size="small"
              onClick={handleUndo}
              disabled={!canUndo}
            >
              <UndoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo (Ctrl+Shift+Z)">
          <span>
            <IconButton
              size="small"
              onClick={handleRedo}
              disabled={!canRedo}
            >
              <RedoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* Element actions */}
        <Tooltip title="Delete selected (Delete)">
          <span>
            <IconButton
              size="small"
              onClick={handleDeleteSelected}
              disabled={!selectedElementId}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Duplicate selected (Ctrl+D)">
          <span>
            <IconButton
              size="small"
              onClick={handleDuplicateSelected}
              disabled={!selectedElementId}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        {/* Save/Export */}
        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
        >
          Download
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={!isDirty}
        >
          Save
        </Button>
      </Box>

      {/* Main content area */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          overflow: "hidden"
        }}
      >
        {/* Left sidebar */}
        <Box
          sx={{
            width: 280,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            borderRight: `1px solid ${theme.vars.palette.divider}`,
            backgroundColor: theme.vars.palette.background.paper
          }}
        >
          <Tabs
            value={leftTab}
            onChange={(_, v) => setLeftTab(v)}
            variant="fullWidth"
            sx={{ borderBottom: `1px solid ${theme.vars.palette.divider}` }}
          >
            <Tab label="Components" value="components" />
            <Tab label="Layers" value="layers" />
          </Tabs>

          <Box sx={{ flex: 1, overflow: "hidden" }}>
            {leftTab === "components" && (
              <ComponentLibrary onComponentSelect={handleComponentSelect} />
            )}
            {leftTab === "layers" && <LayerTree />}
          </Box>
        </Box>

        {/* Center - Canvas */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}
        >
          <Canvas />
        </Box>

        {/* Right sidebar */}
        <Box
          sx={{
            width: 320,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            borderLeft: `1px solid ${theme.vars.palette.divider}`,
            backgroundColor: theme.vars.palette.background.paper
          }}
        >
          <Tabs
            value={rightTab}
            onChange={(_, v) => setRightTab(v)}
            variant="fullWidth"
            sx={{ borderBottom: `1px solid ${theme.vars.palette.divider}` }}
          >
            <Tab label="Properties" value="properties" />
            <Tab label="Preview" value="preview" />
          </Tabs>

          <Box sx={{ flex: 1, overflow: "hidden" }}>
            {rightTab === "properties" && (
              <PropertyEditor
                element={selectedElement}
                onOpenBindingDialog={handleOpenBindingDialog}
              />
            )}
            {rightTab === "preview" && (
              <PreviewPane propertyValues={propertyValues} />
            )}
          </Box>
        </Box>
      </Box>

      {/* Property Binding Dialog */}
      <PropertyBindingDialog
        open={bindingDialogOpen}
        onClose={handleCloseBindingDialog}
        elementId={selectedElementId}
        initialTarget={bindingTarget}
      />

      {/* Snackbar notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default HTMLBuilderPanel;
