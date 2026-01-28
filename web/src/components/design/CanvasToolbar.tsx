/**
 * CanvasToolbar - Toolbar for the layout canvas editor
 */

import React, { useCallback, memo, useRef, useState } from "react";
import {
  Box,
  IconButton,
  Tooltip,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  TextField,
  Button,
  Popover
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import ImageIcon from "@mui/icons-material/Image";
import RectangleIcon from "@mui/icons-material/Rectangle";
import CircleIcon from "@mui/icons-material/Circle";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import FolderIcon from "@mui/icons-material/Folder";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import DeleteIcon from "@mui/icons-material/Delete";
import FlipToFrontIcon from "@mui/icons-material/FlipToFront";
import FlipToBackIcon from "@mui/icons-material/FlipToBack";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import AlignHorizontalLeftIcon from "@mui/icons-material/AlignHorizontalLeft";
import AlignHorizontalCenterIcon from "@mui/icons-material/AlignHorizontalCenter";
import AlignHorizontalRightIcon from "@mui/icons-material/AlignHorizontalRight";
import AlignVerticalTopIcon from "@mui/icons-material/AlignVerticalTop";
import AlignVerticalCenterIcon from "@mui/icons-material/AlignVerticalCenter";
import AlignVerticalBottomIcon from "@mui/icons-material/AlignVerticalBottom";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import TableRowsIcon from "@mui/icons-material/TableRows";
import GridOnIcon from "@mui/icons-material/GridOn";
import GridOffIcon from "@mui/icons-material/GridOff";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import DownloadIcon from "@mui/icons-material/Download";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import AspectRatioIcon from "@mui/icons-material/AspectRatio";
import { ElementType, GridSettings, CANVAS_PRESETS, CanvasPreset } from "./types";

interface CanvasToolbarProps {
  selectedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  clipboardCount: number;
  gridSettings: GridSettings;
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
  onAddElement: (type: ElementType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onAlignLeft: (toCanvas?: boolean) => void;
  onAlignCenter: (toCanvas?: boolean) => void;
  onAlignRight: (toCanvas?: boolean) => void;
  onAlignTop: (toCanvas?: boolean) => void;
  onAlignMiddle: (toCanvas?: boolean) => void;
  onAlignBottom: (toCanvas?: boolean) => void;
  onDistributeHorizontally: () => void;
  onDistributeVertically: () => void;
  onTidy: () => void;
  onToggleGrid: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onExport: () => void;
  onImportSketch?: (file: File) => void;
  onExportSketch?: () => void;
  onCanvasSizeChange?: (width: number, height: number) => void;
}

// Toolbar button component
interface ToolbarButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = memo(({
  icon,
  tooltip,
  onClick,
  disabled = false
}) => {
  return (
    <Tooltip title={tooltip}>
      <span>
        <IconButton
          size="small"
          onClick={onClick}
          disabled={disabled}
          sx={{ p: 0.75 }}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
});
ToolbarButton.displayName = "ToolbarButton";

// Toolbar divider
const ToolbarDivider: React.FC = () => {
  const theme = useTheme();
  return (
    <Divider
      orientation="vertical"
      flexItem
      sx={{
        mx: 0.5,
        my: 0.5,
        borderColor: theme.vars.palette.divider
      }}
    />
  );
};

const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  selectedCount,
  canUndo,
  canRedo,
  clipboardCount,
  gridSettings,
  zoom,
  canvasWidth,
  canvasHeight,
  onAddElement,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onDelete,
  onBringToFront,
  onSendToBack,
  onBringForward,
  onSendBackward,
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onAlignTop,
  onAlignMiddle,
  onAlignBottom,
  onDistributeHorizontally,
  onDistributeVertically,
  onTidy,
  onToggleGrid,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onExport,
  onImportSketch,
  onExportSketch,
  onCanvasSizeChange
}) => {
  const theme = useTheme();
  const [addMenuAnchor, setAddMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [sizeMenuAnchor, setSizeMenuAnchor] = useState<null | HTMLElement>(null);
  const [customWidth, setCustomWidth] = useState(canvasWidth.toString());
  const [customHeight, setCustomHeight] = useState(canvasHeight.toString());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenAddMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setAddMenuAnchor(event.currentTarget);
    },
    []
  );

  const handleCloseAddMenu = useCallback(() => {
    setAddMenuAnchor(null);
  }, []);

  const handleAddElement = useCallback(
    (type: ElementType) => {
      onAddElement(type);
      handleCloseAddMenu();
    },
    [onAddElement, handleCloseAddMenu]
  );

  // Canvas size menu handlers
  const handleOpenSizeMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setCustomWidth(canvasWidth.toString());
      setCustomHeight(canvasHeight.toString());
      setSizeMenuAnchor(event.currentTarget);
    },
    [canvasWidth, canvasHeight]
  );

  const handleCloseSizeMenu = useCallback(() => {
    setSizeMenuAnchor(null);
  }, []);

  const handlePresetSelect = useCallback(
    (preset: CanvasPreset) => {
      if (onCanvasSizeChange) {
        onCanvasSizeChange(preset.width, preset.height);
      }
      handleCloseSizeMenu();
    },
    [onCanvasSizeChange, handleCloseSizeMenu]
  );

  const handleCustomSizeApply = useCallback(() => {
    const w = parseInt(customWidth, 10);
    const h = parseInt(customHeight, 10);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0 && onCanvasSizeChange) {
      onCanvasSizeChange(Math.min(w, 10000), Math.min(h, 10000));
    }
    handleCloseSizeMenu();
  }, [customWidth, customHeight, onCanvasSizeChange, handleCloseSizeMenu]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file && onImportSketch) {
        onImportSketch(file);
      }
      // Reset the input so the same file can be imported again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onImportSketch]
  );

  // Handlers that check for Alt/Option key for canvas alignment
  const handleAlignLeft = useCallback((event: React.MouseEvent<HTMLElement>) => {
    onAlignLeft(event.altKey || selectedCount === 1);
  }, [onAlignLeft, selectedCount]);

  const handleAlignCenter = useCallback((event: React.MouseEvent<HTMLElement>) => {
    onAlignCenter(event.altKey || selectedCount === 1);
  }, [onAlignCenter, selectedCount]);

  const handleAlignRight = useCallback((event: React.MouseEvent<HTMLElement>) => {
    onAlignRight(event.altKey || selectedCount === 1);
  }, [onAlignRight, selectedCount]);

  const handleAlignTop = useCallback((event: React.MouseEvent<HTMLElement>) => {
    onAlignTop(event.altKey || selectedCount === 1);
  }, [onAlignTop, selectedCount]);

  const handleAlignMiddle = useCallback((event: React.MouseEvent<HTMLElement>) => {
    onAlignMiddle(event.altKey || selectedCount === 1);
  }, [onAlignMiddle, selectedCount]);

  const handleAlignBottom = useCallback((event: React.MouseEvent<HTMLElement>) => {
    onAlignBottom(event.altKey || selectedCount === 1);
  }, [onAlignBottom, selectedCount]);

  const hasSelection = selectedCount > 0;
  // hasMultipleSelection is kept for future features that need 2+ selection
  const _hasMultipleSelection = selectedCount > 1;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.5,
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper,
        minHeight: 40
      }}
    >
      {/* Add element */}
      <ToolbarButton
        icon={<AddIcon />}
        tooltip="Add element"
        onClick={handleOpenAddMenu}
      />
      <Menu
        anchorEl={addMenuAnchor}
        open={Boolean(addMenuAnchor)}
        onClose={handleCloseAddMenu}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
      >
        <MenuItem onClick={() => handleAddElement("text")}>
          <ListItemIcon>
            <TextFieldsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Text</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleAddElement("rectangle")}>
          <ListItemIcon>
            <RectangleIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Rectangle</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleAddElement("ellipse")}>
          <ListItemIcon>
            <CircleIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Ellipse</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleAddElement("line")}>
          <ListItemIcon>
            <HorizontalRuleIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Line</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleAddElement("image")}>
          <ListItemIcon>
            <ImageIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Image</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleAddElement("group")}>
          <ListItemIcon>
            <FolderIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Group</ListItemText>
        </MenuItem>
      </Menu>

      <ToolbarDivider />

      {/* Undo/Redo */}
      <ToolbarButton
        icon={<UndoIcon />}
        tooltip="Undo (Ctrl+Z)"
        onClick={onUndo}
        disabled={!canUndo}
      />
      <ToolbarButton
        icon={<RedoIcon />}
        tooltip="Redo (Ctrl+Shift+Z)"
        onClick={onRedo}
        disabled={!canRedo}
      />

      <ToolbarDivider />

      {/* Copy/Paste/Delete */}
      <ToolbarButton
        icon={<ContentCopyIcon />}
        tooltip="Copy (Ctrl+C)"
        onClick={onCopy}
        disabled={!hasSelection}
      />
      <ToolbarButton
        icon={<ContentPasteIcon />}
        tooltip="Paste (Ctrl+V)"
        onClick={onPaste}
        disabled={clipboardCount === 0}
      />
      <ToolbarButton
        icon={<DeleteIcon />}
        tooltip="Delete (Delete/Backspace)"
        onClick={onDelete}
        disabled={!hasSelection}
      />

      <ToolbarDivider />

      {/* Layer ordering */}
      <ToolbarButton
        icon={<FlipToFrontIcon />}
        tooltip="Bring to front"
        onClick={onBringToFront}
        disabled={!hasSelection}
      />
      <ToolbarButton
        icon={<KeyboardArrowUpIcon />}
        tooltip="Bring forward"
        onClick={onBringForward}
        disabled={!hasSelection}
      />
      <ToolbarButton
        icon={<KeyboardArrowDownIcon />}
        tooltip="Send backward"
        onClick={onSendBackward}
        disabled={!hasSelection}
      />
      <ToolbarButton
        icon={<FlipToBackIcon />}
        tooltip="Send to back"
        onClick={onSendToBack}
        disabled={!hasSelection}
      />

      <ToolbarDivider />

      {/* Alignment - works with single element (aligns to canvas) or multiple */}
      <ToolbarButton
        icon={<AlignHorizontalLeftIcon />}
        tooltip="Align left (⌥+click = to canvas)"
        onClick={handleAlignLeft}
        disabled={!hasSelection}
      />
      <ToolbarButton
        icon={<AlignHorizontalCenterIcon />}
        tooltip="Align center (⌥+click = to canvas)"
        onClick={handleAlignCenter}
        disabled={!hasSelection}
      />
      <ToolbarButton
        icon={<AlignHorizontalRightIcon />}
        tooltip="Align right (⌥+click = to canvas)"
        onClick={handleAlignRight}
        disabled={!hasSelection}
      />
      <ToolbarButton
        icon={<AlignVerticalTopIcon />}
        tooltip="Align top (⌥+click = to canvas)"
        onClick={handleAlignTop}
        disabled={!hasSelection}
      />
      <ToolbarButton
        icon={<AlignVerticalCenterIcon />}
        tooltip="Align center (⌥+click = to canvas)"
        onClick={handleAlignMiddle}
        disabled={!hasSelection}
      />
      <ToolbarButton
        icon={<AlignVerticalBottomIcon />}
        tooltip="Align bottom (⌥+click = to canvas)"
        onClick={handleAlignBottom}
        disabled={!hasSelection}
      />

      <ToolbarDivider />

      {/* Distribute & Tidy */}
      <ToolbarButton
        icon={<ViewColumnIcon />}
        tooltip="Distribute horizontally"
        onClick={onDistributeHorizontally}
        disabled={selectedCount < 3}
      />
      <ToolbarButton
        icon={<TableRowsIcon />}
        tooltip="Distribute vertically"
        onClick={onDistributeVertically}
        disabled={selectedCount < 3}
      />
      <ToolbarButton
        icon={<AutoFixHighIcon />}
        tooltip="Tidy - arrange into neat grid"
        onClick={onTidy}
        disabled={selectedCount < 2}
      />

      <ToolbarDivider />

      {/* Grid toggle */}
      <ToolbarButton
        icon={gridSettings.enabled ? <GridOnIcon /> : <GridOffIcon />}
        tooltip={gridSettings.enabled ? "Hide grid" : "Show grid"}
        onClick={onToggleGrid}
      />

      <ToolbarDivider />

      {/* Export PNG */}
      <ToolbarButton
        icon={<DownloadIcon />}
        tooltip="Export as PNG"
        onClick={onExport}
      />

      {/* Sketch file import/export */}
      {onImportSketch && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sketch"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <ToolbarButton
            icon={<FileUploadIcon />}
            tooltip="Import Sketch file (.sketch)"
            onClick={handleImportClick}
          />
        </>
      )}
      {onExportSketch && (
        <ToolbarButton
          icon={<SaveAltIcon />}
          tooltip="Export as Sketch file (.sketch)"
          onClick={onExportSketch}
        />
      )}

      {/* Canvas size */}
      {onCanvasSizeChange && (
        <>
          <ToolbarDivider />
          <ToolbarButton
            icon={<AspectRatioIcon />}
            tooltip={`Canvas size: ${canvasWidth} × ${canvasHeight}`}
            onClick={handleOpenSizeMenu}
          />
          <Popover
            open={Boolean(sizeMenuAnchor)}
            anchorEl={sizeMenuAnchor}
            onClose={handleCloseSizeMenu}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "left"
            }}
            transformOrigin={{
              vertical: "top",
              horizontal: "left"
            }}
          >
            <Box sx={{ p: 2, width: 280 }}>
              <Typography variant="subtitle2" gutterBottom>
                Canvas Size
              </Typography>
              
              {/* Custom size input */}
              <Box sx={{ display: "flex", gap: 1, mb: 2, alignItems: "center" }}>
                <TextField
                  size="small"
                  label="Width"
                  type="number"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(e.target.value)}
                  sx={{ width: 90 }}
                  inputProps={{ min: 1, max: 10000 }}
                />
                <Typography variant="body2" color="text.secondary">×</Typography>
                <TextField
                  size="small"
                  label="Height"
                  type="number"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(e.target.value)}
                  sx={{ width: 90 }}
                  inputProps={{ min: 1, max: 10000 }}
                />
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleCustomSizeApply}
                >
                  Apply
                </Button>
              </Box>

              {/* Presets by category */}
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Presets
              </Typography>
              <Box sx={{ maxHeight: 300, overflowY: "auto" }}>
                {/* Screen sizes */}
                <Typography variant="caption" sx={{ fontWeight: "bold", display: "block", mt: 1, mb: 0.5 }}>
                  Screen
                </Typography>
                {CANVAS_PRESETS.filter(p => p.category === "screen").map((preset) => (
                  <MenuItem
                    key={preset.name}
                    onClick={() => handlePresetSelect(preset)}
                    dense
                    selected={preset.width === canvasWidth && preset.height === canvasHeight}
                  >
                    <ListItemText 
                      primary={preset.name} 
                      secondary={`${preset.width} × ${preset.height}`}
                    />
                  </MenuItem>
                ))}
                
                {/* Social media */}
                <Typography variant="caption" sx={{ fontWeight: "bold", display: "block", mt: 1, mb: 0.5 }}>
                  Social Media
                </Typography>
                {CANVAS_PRESETS.filter(p => p.category === "social").map((preset) => (
                  <MenuItem
                    key={preset.name}
                    onClick={() => handlePresetSelect(preset)}
                    dense
                    selected={preset.width === canvasWidth && preset.height === canvasHeight}
                  >
                    <ListItemText 
                      primary={preset.name} 
                      secondary={`${preset.width} × ${preset.height}`}
                    />
                  </MenuItem>
                ))}
                
                {/* Print */}
                <Typography variant="caption" sx={{ fontWeight: "bold", display: "block", mt: 1, mb: 0.5 }}>
                  Print
                </Typography>
                {CANVAS_PRESETS.filter(p => p.category === "print").map((preset) => (
                  <MenuItem
                    key={preset.name}
                    onClick={() => handlePresetSelect(preset)}
                    dense
                    selected={preset.width === canvasWidth && preset.height === canvasHeight}
                  >
                    <ListItemText 
                      primary={preset.name} 
                      secondary={`${preset.width} × ${preset.height}`}
                    />
                  </MenuItem>
                ))}
              </Box>
            </Box>
          </Popover>
        </>
      )}

      {/* Spacer */}
      <Box sx={{ flexGrow: 1 }} />

      {/* Zoom controls */}
      <ToolbarButton
        icon={<ZoomOutIcon />}
        tooltip="Zoom out (Ctrl/Cmd + scroll)"
        onClick={onZoomOut}
        disabled={zoom <= 0.1}
      />
      <Box
        sx={{
          px: 1,
          minWidth: 50,
          textAlign: "center",
          color: theme.vars.palette.text.secondary,
          fontSize: theme.fontSizeSmall
        }}
      >
        {Math.round(zoom * 100)}%
      </Box>
      <ToolbarButton
        icon={<ZoomInIcon />}
        tooltip="Zoom in (Ctrl/Cmd + scroll)"
        onClick={onZoomIn}
        disabled={zoom >= 4}
      />
      <ToolbarButton
        icon={<FitScreenIcon />}
        tooltip="Fit to screen"
        onClick={onFitToScreen}
      />
    </Box>
  );
};

export default memo(CanvasToolbar);
