import React, { useCallback, memo } from "react";
import {
  Menu,
  MenuItem,
  ListItemText,
  Box,
  Divider
} from "@mui/material";
import { Caption, Text } from "../ui_primitives";
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

  const createSelectOptionHandler = useCallback((option: ConnectionMatchOption) => {
    return () => handleSelectOption(option);
  }, [handleSelectOption]);

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
        <Text size="small" weight={600}>
          Select Connection
        </Text>
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
          onClick={createSelectOptionHandler(option)}
        >
          <ListItemText
            primary={
              <Text size="small" weight={600}>
                {option.label}
              </Text>
            }
            secondary={
              <Box
                component="span"
                display="flex"
                flexDirection="column"
              >
                {option.typeLabel && (
                  <Caption
                    color="secondary"
                    component="span"
                    sx={{ whiteSpace: "normal", lineHeight: 1.4 }}
                  >
                    {option.typeLabel.toUpperCase()}
                  </Caption>
                )}
                {option.description && (
                  <Caption
                    color="secondary"
                    component="span"
                    sx={{ whiteSpace: "normal", lineHeight: 1.4 }}
                  >
                    {option.description}
                  </Caption>
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
