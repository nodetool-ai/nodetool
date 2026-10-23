/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";

import type {
  WorkspaceTab,
  WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import { useIsWorkflowRunning } from "../../hooks/useWorkflowRunnerState";
import { useWorkflowDirty } from "../../hooks/useWorkflowDirty";
import { useSettingsStore } from "../../stores/SettingsStore";
import {
  BORDER_RADIUS,
  CloseButton,
  Divider,
  ListGroup,
  ListItemRow,
  LoadingSpinner,
  MobileBottomSheet,
  MOTION,
  SPACING,
  StatusDot,
  getSpacingPx,
  EmptyState
} from "../ui_primitives";
import { PROJECT_HOME_GLYPH, tabDisplayTitle } from "./tabTypeIdentity";
import { PROJECT_COLOR } from "../projects/projectIdentity";

interface MobileDocumentSelectorProps {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  typeColor: Record<WorkspaceTabType, string>;
  typeGlyph: Record<WorkspaceTabType, string>;
  /** The project home is showing, which is not one of the listed documents. */
  homeIsActive?: boolean;
  onActivate: (tabId: string) => void;
  onClose: (tab: WorkspaceTab) => void;
  onCloseAll: () => void;
}

const ROW_SX = {
  minHeight: "44px",
  gap: SPACING.md,
  px: SPACING.xl
} as const;

const styles = (theme: Theme) =>
  css({
    WebkitAppRegion: "no-drag",
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: getSpacingPx(SPACING.sm),
    height: "100%",
    padding: `0 ${getSpacingPx(SPACING.md)}`,
    border: "none",
    background: "transparent",
    color: theme.vars.palette.text.primary,
    fontSize: "var(--fontSizeSmall)",
    cursor: "pointer",
    textAlign: "left",
    transition: `background-color ${MOTION.fast}`,
    "&:active": {
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .glyph": { flexShrink: 0 },
    "& .doc-title": {
      flex: 1,
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .doc-count": {
      flexShrink: 0,
      padding: `0 ${getSpacingPx(SPACING.sm)}`,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: theme.vars.palette.action.selected,
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmaller)",
      lineHeight: "18px"
    },
    "& .caret": {
      flexShrink: 0,
      width: "18px",
      height: "18px",
      color: theme.vars.palette.text.secondary
    }
  });

const sheetStyles = (theme: Theme) =>
  css({
    paddingBottom: getSpacingPx(SPACING.xl),
    "& .row-glyph": {
      flexShrink: 0,
      width: "20px",
      textAlign: "center"
    },
    "& .row-close": {
      flexShrink: 0,
      width: "44px",
      height: "44px"
    }
  });

/** Live per-document status: run spinner and unsaved-changes dot. */
const DocumentStatus = memo(function DocumentStatus({
  tab
}: {
  tab: WorkspaceTab;
}) {
  const { t } = useTranslation();
  const workflowId = tab.type === "workflow" ? tab.ref : undefined;
  const isDirty = useWorkflowDirty(workflowId);
  const isRunning = useIsWorkflowRunning(workflowId);
  // Instant-update re-runs on every keystroke, which would strobe the spinner.
  const instantUpdate = useSettingsStore(
    (state) => state.settings.instantUpdate
  );

  return (
    <>
      {isRunning && !instantUpdate && (
        <LoadingSpinner inline size={14} color="primary" />
      )}
      {isDirty && (
        <StatusDot tone="warning" size="medium" label={t("i18n-next51.documents.unsavedChanges")} />
      )}
    </>
  );
});

/**
 * The mobile stand-in for the tab strip: a single button naming the open
 * document, opening a bottom sheet that lists every open document. Tabs are
 * unusable at phone widths — they truncate to a few characters and their close
 * targets fall well under 44px.
 */
const MobileDocumentSelector = ({
  tabs,
  activeTabId,
  typeColor,
  typeGlyph,
  homeIsActive = false,
  onActivate,
  onClose,
  onCloseAll
}: MobileDocumentSelectorProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const buttonStyles = useMemo(() => styles(theme), [theme]);
  const listStyles = useMemo(() => sheetStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  const closeSheet = useCallback(() => setOpen(false), []);

  const handleSelect = useCallback(
    (tabId: string) => {
      onActivate(tabId);
      setOpen(false);
    },
    [onActivate]
  );

  const handleCloseAll = useCallback(() => {
    onCloseAll();
    setOpen(false);
  }, [onCloseAll]);

  return (
    <>
      <button
        type="button"
        css={buttonStyles}
        className="document-selector"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          activeTab
            ? t("i18n-next51.documents.openDocument", { title: tabDisplayTitle(activeTab) })
            : homeIsActive
              ? t("i18n-next51.documents.projectHomeSwitch")
              : t("i18n-next51.documents.openDocuments")
        }
        onClick={() => setOpen(true)}
      >
        {activeTab ? (
          <span className="glyph" style={{ color: typeColor[activeTab.type] }}>
            {typeGlyph[activeTab.type]}
          </span>
        ) : (
          homeIsActive && (
            <span className="glyph" style={{ color: PROJECT_COLOR }}>
              {PROJECT_HOME_GLYPH}
            </span>
          )
        )}
        <span className="doc-title">
          {activeTab
            ? tabDisplayTitle(activeTab)
            : homeIsActive
              ? t("i18n-next51.documents.projectHome")
              : t("i18n-next51.documents.noDocumentOpen")}
        </span>
        {activeTab && <DocumentStatus tab={activeTab} />}
        {tabs.length > 1 && (
          <span className="doc-count">{t("i18n-next51.documents.openCount", { count: tabs.length })}</span>
        )}
        <ExpandMoreRoundedIcon className="caret" aria-hidden />
      </button>

      <MobileBottomSheet
        open={open}
        onClose={closeSheet}
        title={t("i18n-next51.documents.openDocuments")}
        ariaLabel={t("i18n-next51.documents.switchDocuments")}
      >
        <div css={listStyles}>
          {tabs.length === 0 && (
            <EmptyState
              size="small"
              title={t("i18n-next51.documents.noDocumentsOpen")}
              description={t("i18n-next51.documents.noDocumentsDescription")}
            />
          )}
          <ListGroup compact flush>
            {tabs.map((tab) => (
              <ListItemRow
                key={tab.id}
                disablePadding
                selected={tab.id === activeTabId}
                onClick={() => handleSelect(tab.id)}
                buttonSx={ROW_SX}
                icon={
                  <span
                    className="row-glyph"
                    style={{ color: typeColor[tab.type] }}
                    aria-hidden
                  >
                    {typeGlyph[tab.type]}
                  </span>
                }
                primary={tabDisplayTitle(tab)}
                secondary={tab.type}
                secondaryAction={
                  <CloseButton
                    className="row-close"
                    tooltip={t("i18n-next51.documents.closeDocument", { title: tabDisplayTitle(tab) })}
                    onClick={() => onClose(tab)}
                  />
                }
              >
                <DocumentStatus tab={tab} />
              </ListItemRow>
            ))}
          </ListGroup>
          {tabs.length > 1 && (
            <>
              <Divider />
              <ListGroup compact flush>
                <ListItemRow
                  disablePadding
                  className="close-all"
                  onClick={handleCloseAll}
                  buttonSx={ROW_SX}
                  primary={t("i18n-next51.documents.closeAll")}
                />
              </ListGroup>
            </>
          )}
        </div>
      </MobileBottomSheet>
    </>
  );
};

export default memo(MobileDocumentSelector);
