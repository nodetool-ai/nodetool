import React, { useCallback, memo } from "react";
import { useTranslation } from "react-i18next";

import {
  Caption,
  ContextMenu,
  FlexColumn,
  ListItemText,
  ListSubheader,
  MenuItem
} from "../ui_primitives";
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
  const { t } = useTranslation();
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
    <ContextMenu
      className="context-menu connection-match-menu"
      open
      onClose={closeContextMenu}
      paperSx={{ maxWidth: "300px" }}
      onContextMenu={(event) => event.preventDefault()}
      position={menuPosition}
    >
      <ListSubheader>{t("screen_editor.selectConnection")}</ListSubheader>
      {options.map((option) => (
        <MenuItem key={option.id} onClick={createSelectOptionHandler(option)}>
          <ListItemText
            primary={option.label}
            secondary={
              <FlexColumn component="span">
                {option.typeLabel && (
                  <Caption
                    color="secondary"
                    component="span"
                    sx={{ whiteSpace: "normal" }}
                  >
                    {option.typeLabel.toUpperCase()}
                  </Caption>
                )}
                {option.description && (
                  <Caption
                    color="secondary"
                    component="span"
                    sx={{ whiteSpace: "normal" }}
                  >
                    {option.description}
                  </Caption>
                )}
              </FlexColumn>
            }
          />
        </MenuItem>
      ))}
    </ContextMenu>
  );
};

export default memo(ConnectionMatchMenu);
