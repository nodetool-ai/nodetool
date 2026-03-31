/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, useMemo } from "react";
import {
  Button,
  Menu,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField
} from "@mui/material";
import { MenuItemPrimitive } from "../ui_primitives/MenuItemPrimitive";
import { Save, Layers, Add } from "@mui/icons-material";
import { useLayoutStore, UserLayout } from "../../stores/LayoutStore";
import { DockviewApi } from "dockview";
import { defaultLayout } from "../../config/defaultLayouts";
import { applyDockviewLayoutSafely } from "../../utils/dockviewLayout";
import { DialogActionButtons } from "../ui_primitives/DialogActionButtons";

/** Minimal shape of a panel entry in SerializedDockview.panels */
interface SerializedPanel {
  id?: string;
  params?: Record<string, unknown>;
}

interface LayoutMenuProps {
  dockviewApi: DockviewApi | null;
}

const LayoutMenu: React.FC<LayoutMenuProps> = ({ dockviewApi }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isSaveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");

  // Combine multiple store subscriptions into a single selector to reduce re-renders
  const { layouts, activeLayoutId, addLayout, setActiveLayoutId, updateActiveLayout } =
    useLayoutStore(
      useCallback(
        (state) => ({
          layouts: state.layouts,
          activeLayoutId: state.activeLayoutId,
          addLayout: state.addLayout,
          setActiveLayoutId: state.setActiveLayoutId,
          updateActiveLayout: state.updateActiveLayout
        }),
        []
      )
    );

  const open = Boolean(anchorEl);

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleSaveAsNewClick = useCallback(() => {
    setSaveDialogOpen(true);
    handleClose();
  }, [handleClose]);

  const handleSaveDialogClose = useCallback(() => {
    setSaveDialogOpen(false);
    setNewLayoutName("");
  }, []);

  const handleSaveNewLayout = useCallback(() => {
    if (dockviewApi && newLayoutName) {
      const layout = dockviewApi.toJSON();
      Object.values(layout.panels).forEach((panel) => {
        const p = panel as SerializedPanel;
        if (p.id !== "mini-app" && !p.id?.startsWith("mini-app")) {
             delete p.params;
        }
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
  }, [dockviewApi, newLayoutName, addLayout, setActiveLayoutId, handleSaveDialogClose]);

  const handleUpdateLayout = useCallback(() => {
    if (dockviewApi) {
      const layout = dockviewApi.toJSON();
      Object.values(layout.panels).forEach((panel) => {
        const p = panel as SerializedPanel;
        if (p.id !== "mini-app" && !p.id?.startsWith("mini-app")) {
            delete p.params;
        }
      });
      updateActiveLayout(layout);
    }
    handleClose();
  }, [dockviewApi, updateActiveLayout, handleClose]);

  const handleLayoutSelect = useCallback((layoutId: string | null) => {
    setActiveLayoutId(layoutId);
    if (dockviewApi) {
      if (layoutId === null) {
        applyDockviewLayoutSafely(dockviewApi, defaultLayout);
      } else {
        const newLayout = layouts.find((l) => l.id === layoutId);
        if (newLayout) {
          applyDockviewLayoutSafely(dockviewApi, newLayout.layout);
        }
      }
    }
    handleClose();
  }, [dockviewApi, layouts, setActiveLayoutId, handleClose]);

  const handleSelectDefaultLayout = useCallback(() => {
    handleLayoutSelect(null);
  }, [handleLayoutSelect]);

  const handleSelectLayout = useCallback(
    (layoutId: string) => () => {
      handleLayoutSelect(layoutId);
    },
    [handleLayoutSelect]
  );

  // Memoize button sx prop to prevent unnecessary re-renders
  const buttonSx = useMemo(() => ({
    padding: "0.2em 0.5em",
    border: 0
  }), []);

  return (
    <div>
      <Button
        className="layout-menu-button"
        sx={buttonSx}
        onClick={handleClick}
        variant="outlined"
        startIcon={<Layers />}
      >
        Layouts
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        <MenuItemPrimitive
          label="Default Layout"
          onClick={handleSelectDefaultLayout}
          selected={activeLayoutId === null}
        />
        <Divider />
        {(layouts || []).map((layout) => (
          <MenuItemPrimitive
            key={layout.id}
            label={layout.name}
            onClick={handleSelectLayout(layout.id)}
            selected={layout.id === activeLayoutId}
          />
        ))}
        <Divider />
        {activeLayoutId && (
          <MenuItemPrimitive
            label="Save layout"
            icon={<Save fontSize="small" />}
            onClick={handleUpdateLayout}
          />
        )}
        <MenuItemPrimitive
          label="Save as new layout..."
          icon={<Add fontSize="small" />}
          onClick={handleSaveAsNewClick}
        />
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
        <DialogActionButtons
          onCancel={handleSaveDialogClose}
          onConfirm={handleSaveNewLayout}
          confirmText="Save"
        />
      </Dialog>
    </div>
  );
};

export default React.memo(LayoutMenu);
