/** @jsxImportSource @emotion/react */
import React, { useState } from "react";
import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions
} from "@mui/material";
import { Save, Layers, Add } from "@mui/icons-material";
import { useSettingsStore, UserLayout } from "../../stores/SettingsStore";
import { DockviewApi } from "dockview";
import { defaultLayout } from "../../config/defaultLayouts";

interface LayoutMenuProps {
  dockviewApi: DockviewApi | null;
}

const LayoutMenu: React.FC<LayoutMenuProps> = ({ dockviewApi }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isSaveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const { settings, addLayout, setActiveLayoutId, deleteLayout } =
    useSettingsStore();
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSaveClick = () => {
    setSaveDialogOpen(true);
    handleClose();
  };

  const handleSaveDialogClose = () => {
    setSaveDialogOpen(false);
    setNewLayoutName("");
  };

  const handleSaveLayout = () => {
    if (dockviewApi && newLayoutName) {
      const layout = dockviewApi.toJSON();
      Object.values(layout.panels).forEach((panel) => {
        delete (panel as any).params;
      });

      const newLayout: UserLayout = {
        id: new Date().toISOString(),
        name: newLayoutName,
        layout: layout
      };
      addLayout(newLayout);
      setActiveLayoutId(newLayout.id);
      handleSaveDialogClose();
    }
  };

  const handleLayoutSelect = (layoutId: string | null) => {
    setActiveLayoutId(layoutId);
    window.location.reload();
    handleClose();
  };

  return (
    <div>
      <Button onClick={handleClick} variant="outlined" startIcon={<Layers />}>
        Layouts
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        <MenuItem onClick={() => handleLayoutSelect(null)}>
          <ListItemText>Default Layout</ListItemText>
        </MenuItem>
        <Divider />
        {(settings.layouts || []).map((layout) => (
          <MenuItem
            key={layout.id}
            onClick={() => handleLayoutSelect(layout.id)}
            selected={layout.id === settings.activeLayoutId}
          >
            <ListItemText>{layout.name}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={handleSaveClick}>
          <ListItemIcon>
            <Add fontSize="small" />
          </ListItemIcon>
          <ListItemText>Save current layout...</ListItemText>
        </MenuItem>
      </Menu>
      <Dialog open={isSaveDialogOpen} onClose={handleSaveDialogClose}>
        <DialogTitle>Save Layout</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Layout Name"
            type="text"
            fullWidth
            variant="standard"
            value={newLayoutName}
            onChange={(e) => setNewLayoutName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSaveDialogClose}>Cancel</Button>
          <Button onClick={handleSaveLayout}>Save</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default LayoutMenu;
