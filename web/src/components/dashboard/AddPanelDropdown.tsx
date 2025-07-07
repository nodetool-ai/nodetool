/** @jsxImportSource @emotion/react */
import React from "react";
import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { IDockviewPanel } from "dockview";

interface AddPanelDropdownProps {
  availablePanels: IDockviewPanel[];
  onAddPanel: (panelId: string) => void;
}

const AddPanelDropdown: React.FC<AddPanelDropdownProps> = ({
  availablePanels,
  onAddPanel
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleAddPanel = (panelId: string) => {
    onAddPanel(panelId);
    handleClose();
  };

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
          <MenuItem key={panel.id} onClick={() => handleAddPanel(panel.id)}>
            <ListItemText>{panel.title}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
};

export default AddPanelDropdown;
