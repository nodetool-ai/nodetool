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
  ListGroup,
  ListItemRow,
  SectionHeader,
  SPACING,
  getSpacingPx
} from "../ui_primitives";

const PAGE_ROW_SX = {
  minHeight: CONTROL.height.xl,
  gap: SPACING.md,
  px: SPACING.xl
} as const;

const styles = (theme: Theme) =>
  css({
    paddingBottom: getSpacingPx(SPACING.xl),
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
      <ListGroup compact flush>
        {filteredActions.map((action) => (
          <React.Fragment key={action.key}>
            <ListItemRow
              onClick={action.onClick}
              buttonSx={PAGE_ROW_SX}
              icon={
                <span className="row-icon" aria-hidden>
                  {action.icon}
                </span>
              }
              primary={action.label}
            >
              {action.secondary && (
                <Caption color="secondary">{action.secondary}</Caption>
              )}
            </ListItemRow>
            {action.dividerAfter && <Divider />}
          </React.Fragment>
        ))}
      </ListGroup>
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
