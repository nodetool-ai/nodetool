/** @jsxImportSource @emotion/react */
import React, { useCallback, memo } from "react";
import {
  Button,
  Menu,
  MenuItem,
  ListItemText
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";

export interface PanelInfo {
  id: string;
  title: string;
}

interface AddPanelDropdownProps {
  availablePanels: PanelInfo[];
  onAddPanel: (panelId: string) => void;
}

const AddPanelDropdown: React.FC<AddPanelDropdownProps> = ({
  availablePanels,
  onAddPanel
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleAddPanel = useCallback((panelId: string) => {
    onAddPanel(panelId);
    handleClose();
  }, [onAddPanel, handleClose]);

  if (availablePanels.length === 0) {
    return null;
  }

  return (
    <div>
      <Button
        id="add-panel-button"
        aria-controls={open ? "add-panel-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        onClick={handleClick}
        variant="outlined"
        startIcon={<AddIcon />}
      >
        Add Panel
      </Button>
      <Menu
        id="add-panel-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": "add-panel-button"
        }}
      >
        {availablePanels.map((panel) => (
          <MenuItem key={panel.id} onClick={handleAddPanel.bind(null, panel.id)}>
            <ListItemText>{panel.title}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
};

export default memo(AddPanelDropdown);
