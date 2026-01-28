import React, { useCallback, memo } from "react";
import {
  Menu,
  MenuItem,
  ListItemText,
  Typography,
  Box,
  Divider
} from "@mui/material";
import { Connection } from "@xyflow/react";
import useContextMenu from "../../stores/ContextMenuStore";

export interface ConnectionMatchOption {
  id: string;
  label: string;
  typeLabel?: string;
  description?: string;
  connection: Connection;
}

export interface ConnectionMatchMenuPayload {
  options: ConnectionMatchOption[];
  onSelect?: (option: ConnectionMatchOption) => void;
}

const ConnectionMatchMenu: React.FC = () => {
  const { openMenuType, menuPosition, payload, closeContextMenu } =
    useContextMenu((state) => ({
      openMenuType: state.openMenuType,
      menuPosition: state.menuPosition,
      payload: state.payload,
      closeContextMenu: state.closeContextMenu
    }));

  const data = payload as ConnectionMatchMenuPayload | undefined;
  const options = data?.options ?? [];

  const handleSelectOption = useCallback((option: ConnectionMatchOption) => {
    data?.onSelect?.(option);
    closeContextMenu();
  }, [data, closeContextMenu]);

  if (openMenuType !== "connection-match-menu" || !menuPosition) {
    return null;
  }

  if (!options.length) {
    closeContextMenu();
    return null;
  }

  return (
    <Menu
      className="context-menu connection-match-menu"
      open
      onClose={closeContextMenu}
      sx={{
        "& .MuiList-root": {
          maxWidth: "300px"
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
      anchorReference="anchorPosition"
      anchorPosition={{ top: menuPosition.y, left: menuPosition.x }}
    >
      <MenuItem disabled>
        <Typography variant="body2" fontWeight={600}>
          Select Connection
        </Typography>
      </MenuItem>
      {options.map((option) => [
        <Divider key={`divider-${option.id}`} />,
        <MenuItem
          sx={{
            "& .MuiListItemText-root": {
              padding: "0.5em 0"
            }
          }}
          key={option.id}
          onClick={handleSelectOption.bind(null, option)}
        >
          <ListItemText
            primary={
              <Typography variant="body2" fontWeight={600}>
                {option.label}
              </Typography>
            }
            secondary={
              <Box
                component="span"
                display="flex"
                flexDirection="column"
              >
                {option.typeLabel && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    component="span"
                    sx={{ whiteSpace: "normal", lineHeight: 1.4 }}
                  >
                    {option.typeLabel.toUpperCase()}
                  </Typography>
                )}
                {option.description && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    component="span"
                    sx={{ whiteSpace: "normal", lineHeight: 1.4 }}
                  >
                    {option.description}
                  </Typography>
                )}
              </Box>
            }
          />
        </MenuItem>
      ])}
    </Menu>
  );
};

export default memo(ConnectionMatchMenu);
