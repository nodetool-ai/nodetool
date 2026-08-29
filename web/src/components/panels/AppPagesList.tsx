/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";

import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import Help from "../content/Help/Help";
import { useAppMenuActions } from "./useAppMenuActions";
import {
  Caption,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  SPACING,
  getSpacingPx
} from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    paddingBottom: getSpacingPx(SPACING.xl),
    "& .page-row": {
      minHeight: "44px",
      gap: getSpacingPx(SPACING.md),
      paddingLeft: getSpacingPx(SPACING.xl),
      paddingRight: getSpacingPx(SPACING.xl)
    },
    "& .row-icon": {
      display: "flex",
      flexShrink: 0,
      color: theme.vars.palette.text.secondary,
      "& svg": {
        fontSize: "var(--fontSizeBig)"
      }
    }
  });

interface AppPagesListProps {
  /** Dismisses the sheet so the opened destination isn't hidden behind it. */
  onAction: () => void;
}

/**
 * The app-level destinations (Settings, Help, Downloads, …) as rows in the
 * mobile browse sheet. On desktop the same list is the logo popover
 * (RailAppMenu); mobile folds it into the one sheet the hamburger opens rather
 * than carrying a second menu button in the top row.
 */
const AppPagesList: React.FC<AppPagesListProps> = ({ onAction }) => {
  const theme = useTheme();
  const listStyles = useMemo(() => styles(theme), [theme]);
  const actions = useAppMenuActions(onAction);

  // RailAppMenu owns the Help dialog on desktop and is not mounted here.
  const { helpOpen, handleCloseHelp } = useAppHeaderStore(
    useShallow((state) => ({
      helpOpen: state.helpOpen,
      handleCloseHelp: state.handleCloseHelp
    }))
  );

  return (
    <div css={listStyles}>
      <List dense disablePadding>
        {actions.map((action) => (
          <React.Fragment key={action.key}>
            <ListItem disablePadding>
              <ListItemButton className="page-row" onClick={action.onClick}>
                <span className="row-icon" aria-hidden>
                  {action.icon}
                </span>
                <ListItemText primary={action.label} />
                {action.secondary && (
                  <Caption color="secondary">{action.secondary}</Caption>
                )}
              </ListItemButton>
            </ListItem>
            {action.dividerAfter && <Divider />}
          </React.Fragment>
        ))}
      </List>

      <Help open={helpOpen} handleClose={handleCloseHelp} />
    </div>
  );
};

AppPagesList.displayName = "AppPagesList";

export default AppPagesList;
