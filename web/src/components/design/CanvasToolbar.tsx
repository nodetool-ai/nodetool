/**
 * CanvasToolbar - Toolbar for the layout canvas editor
 */

import React, { useCallback, memo, useRef } from "react";
import {
  Box,
  IconButton,
  Tooltip,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import ImageIcon from "@mui/icons-material/Image";
import RectangleIcon from "@mui/icons-material/Rectangle";
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
import GridOnIcon from "@mui/icons-material/GridOn";
import GridOffIcon from "@mui/icons-material/GridOff";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import DownloadIcon from "@mui/icons-material/Download";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import { ElementType, GridSettings } from "./types";

interface CanvasToolbarProps {
  selectedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  clipboardCount: number;
  gridSettings: GridSettings;
  zoom: number;
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
  onAlignLeft: () => void;
  onAlignCenter: () => void;
  onAlignRight: () => void;
  onAlignTop: () => void;
  onAlignMiddle: () => void;
  onAlignBottom: () => void;
  onToggleGrid: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onExport: () => void;
  onImportSketch?: (file: File) => void;
  onExportSketch?: () => void;
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
  onToggleGrid,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onExport,
  onImportSketch,
  onExportSketch
}) => {
  const theme = useTheme();
  const [addMenuAnchor, setAddMenuAnchor] = React.useState<null | HTMLElement>(null);
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

  const hasSelection = selectedCount > 0;
  const hasMultipleSelection = selectedCount > 1;

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

      {/* Alignment (visible only when multiple selected) */}
      <ToolbarButton
        icon={<AlignHorizontalLeftIcon />}
        tooltip="Align left"
        onClick={onAlignLeft}
        disabled={!hasMultipleSelection}
      />
      <ToolbarButton
        icon={<AlignHorizontalCenterIcon />}
        tooltip="Align center horizontally"
        onClick={onAlignCenter}
        disabled={!hasMultipleSelection}
      />
      <ToolbarButton
        icon={<AlignHorizontalRightIcon />}
        tooltip="Align right"
        onClick={onAlignRight}
        disabled={!hasMultipleSelection}
      />
      <ToolbarButton
        icon={<AlignVerticalTopIcon />}
        tooltip="Align top"
        onClick={onAlignTop}
        disabled={!hasMultipleSelection}
      />
      <ToolbarButton
        icon={<AlignVerticalCenterIcon />}
        tooltip="Align center vertically"
        onClick={onAlignMiddle}
        disabled={!hasMultipleSelection}
      />
      <ToolbarButton
        icon={<AlignVerticalBottomIcon />}
        tooltip="Align bottom"
        onClick={onAlignBottom}
        disabled={!hasMultipleSelection}
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

      {/* Spacer */}
      <Box sx={{ flexGrow: 1 }} />

      {/* Zoom controls */}
      <ToolbarButton
        icon={<ZoomOutIcon />}
        tooltip="Zoom out"
        onClick={onZoomOut}
        disabled={zoom <= 0.25}
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
        tooltip="Zoom in"
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
