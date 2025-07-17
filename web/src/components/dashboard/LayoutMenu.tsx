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
import { useLayoutStore, UserLayout } from "../../stores/LayoutStore";
import { DockviewApi } from "dockview";
import { defaultLayout } from "../../config/defaultLayouts";

interface LayoutMenuProps {
  dockviewApi: DockviewApi | null;
}

const LayoutMenu: React.FC<LayoutMenuProps> = ({ dockviewApi }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isSaveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const {
    layouts,
    activeLayoutId,
    addLayout,
    setActiveLayoutId,
    updateActiveLayout
  } = useLayoutStore();
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSaveAsNewClick = () => {
    setSaveDialogOpen(true);
    handleClose();
  };

  const handleSaveDialogClose = () => {
    setSaveDialogOpen(false);
    setNewLayoutName("");
  };

  const handleSaveNewLayout = () => {
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

  const handleUpdateLayout = () => {
    if (dockviewApi) {
      const layout = dockviewApi.toJSON();
      Object.values(layout.panels).forEach((panel) => {
        delete (panel as any).params;
      });
      updateActiveLayout(layout);
    }
    handleClose();
  };

  const handleLayoutSelect = (layoutId: string | null) => {
    setActiveLayoutId(layoutId);
    if (dockviewApi) {
      if (layoutId === null) {
        dockviewApi.fromJSON(defaultLayout);
      } else {
        const newLayout = layouts.find((l) => l.id === layoutId);
        if (newLayout) {
          dockviewApi.fromJSON(newLayout.layout);
        }
      }
    }
    handleClose();
  };

  return (
    <div>
      <Button onClick={handleClick} variant="outlined" startIcon={<Layers />}>
        Layouts
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        <MenuItem
          onClick={() => handleLayoutSelect(null)}
          selected={activeLayoutId === null}
        >
          <ListItemText>Default Layout</ListItemText>
        </MenuItem>
        <Divider />
        {(layouts || []).map((layout) => (
          <MenuItem
            key={layout.id}
            onClick={() => handleLayoutSelect(layout.id)}
            selected={layout.id === activeLayoutId}
          >
            <ListItemText>{layout.name}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        {activeLayoutId && (
          <MenuItem onClick={handleUpdateLayout}>
            <ListItemIcon>
              <Save fontSize="small" />
            </ListItemIcon>
            <ListItemText>Save layout</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={handleSaveAsNewClick}>
          <ListItemIcon>
            <Add fontSize="small" />
          </ListItemIcon>
          <ListItemText>Save as new layout...</ListItemText>
        </MenuItem>
      </Menu>
      <Dialog open={isSaveDialogOpen} onClose={handleSaveDialogClose}>
        <DialogTitle>Save New Layout</DialogTitle>
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
          <Button onClick={handleSaveNewLayout}>Save</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default LayoutMenu;
