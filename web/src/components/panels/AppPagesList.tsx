/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

import { useAppMenuActions } from "./useAppMenuActions";
import {
  Caption,
  CONTROL,
  Divider,
  EmptyState,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  SectionHeader,
  SPACING,
  TYPOGRAPHY,
  focusRing,
  getSpacingPx,
  selectableRowStyles,
  selectedRowStyles
} from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    paddingBottom: getSpacingPx(SPACING.xl),
    "& .page-row": {
      minHeight: CONTROL.height.xl,
      gap: getSpacingPx(SPACING.md),
      paddingLeft: getSpacingPx(SPACING.xl),
      paddingRight: getSpacingPx(SPACING.xl),
      ...selectableRowStyles(theme),
      "&.Mui-selected": selectedRowStyles(theme),
      // MUI tints a keyboard-focused button with action.focus; the shared
      // ring replaces that tint.
      "&.Mui-focusVisible": {
        backgroundColor: "transparent",
        ...focusRing(theme)
      },
      "& .MuiListItemText-primary": TYPOGRAPHY.sans.label
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
  readonly onAction: () => void;
  /** Shared query from the consolidated panel search. */
  readonly query?: string;
  /** Labels these destinations as a section of the consolidated panel. */
  readonly showSectionTitle?: boolean;
  /** Show a no-results message when a shared query filters every destination. */
  readonly showEmptyState?: boolean;
  /** Mobile combines both menus; desktop shows sidebar destinations only. */
  readonly scope?: "all" | "sidebar";
}

/**
 * The app-level destinations (Settings, Help, Downloads, …) as rows in the
 * mobile browse sheet. On desktop the same list is the logo popover
 * (RailAppMenu); mobile folds it into the one sheet the hamburger opens rather
 * than carrying a second menu button in the top row.
 */
const AppPagesList: React.FC<AppPagesListProps> = ({
  onAction,
  query = "",
  showSectionTitle = false,
  showEmptyState = false,
  scope = "sidebar"
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const listStyles = useMemo(() => styles(theme), [theme]);
  const actions = useAppMenuActions(onAction);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredActions = actions.filter(
    (action) =>
      (scope === "all" || action.placement !== "logo") &&
      `${action.label} ${action.secondary ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery)
  );

  return (
    <div css={listStyles}>
      {showSectionTitle && filteredActions.length > 0 && (
        <SectionHeader
          title={t("i18n-next58.panels.application")}
          size="small"
        />
      )}
      <List dense disablePadding>
        {filteredActions.map((action) => (
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
      {filteredActions.length === 0 && showEmptyState && (
        <EmptyState
          variant="no-results"
          title={t("i18n-next58.panels.noPanelsFound")}
          description={t("i18n-next58.panels.noPanelsMatchSearch")}
          size="small"
        />
      )}

    </div>
  );
};

AppPagesList.displayName = "AppPagesList";

export default AppPagesList;
