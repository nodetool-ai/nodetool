/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Tooltip,
  Box,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  TabGroup,
  TabPanel,
  type TabItem
} from "../../ui_primitives";
import { useAppHeaderStore } from "../../../stores/AppHeaderStore";
import DataTypesList from "./DataTypesList";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { DATA_TYPES } from "../../../config/data_types";
import KeyboardShortcutsView from "./KeyboardShortcutsView";
import { NODE_EDITOR_SHORTCUTS } from "../../../config/shortcuts";
import ControlsShortcutsTab from "./ControlsShortcutsTab";
import { Dialog } from "../../ui_primitives";

const helpStyles = (theme: Theme) =>
  css({
    height: "100%",
    ".help": {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.micro),
      overflow: "hidden"
    },

    ".content": {
      height: "calc(100% - 40px)",
      padding: `0 ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xxxl)} ${getSpacingPx(SPACING.xl)}`
    },
    ".tabs-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      margin: `0 ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xl)}`
    },
    ".tabpanel": {
      height: "calc(100% - 40px)",
      padding: `${getSpacingPx(SPACING.xl)} 0`,
      fontSize: "var(--fontSizeBig)"
    },
    ".tabpanel-content": {
      height: "100%",
      overflowY: "auto",
      "&::-webkit-scrollbar": {
        width: "8px"
      },
      "&::-webkit-scrollbar-track": {
        background: theme.vars.palette.grey[800]
      },
      "&::-webkit-scrollbar-thumb": {
        background: theme.vars.palette.grey[500],
        borderRadius: BORDER_RADIUS.sm
      },
      "&::-webkit-scrollbar-thumb:hover": {
        background: theme.vars.palette.grey[400]
      }
    },
    ".help-item": {
      marginBottom: getSpacingPx(SPACING.xs),
      paddingBottom: getSpacingPx(SPACING.md),
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.xl),
      p: {
        minWidth: "240px"
      },
      button: {
        marginTop: getSpacingPx(SPACING.micro),
        color: theme.vars.palette.grey[200],
        border: `1px solid ${theme.vars.palette.grey[600]}`,
        padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.sm)}`, // was 1px 6px

        textAlign: "left",
        lineHeight: "1.3em",
        minWidth: "unset",
        fontSize: "0.85em",
        height: "auto",
        "&.no-border": {
          border: "0"
        }
      }
    },
    ".explanation": {
      marginBottom: getSpacingPx(SPACING.xl),
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.grey[200]
    }
  });

const docsButtonStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: getSpacingPx(SPACING.lg), // was 10px
    color: theme.vars.palette.secondary.contrastText,
    backgroundColor: theme.vars.palette.secondary.main,
    textDecoration: "none",
    fontSize: "var(--fontSizeNormal)",
    fontWeight: 500,
    padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`, // was 8px 14px
    borderRadius: BORDER_RADIUS.lg,
    transition: MOTION.all,
    flexShrink: 0,
    "&:hover": {
      backgroundColor: theme.vars.palette.secondary.light,
      borderColor: theme.vars.palette.primary.main,
      textDecoration: "none"
    },
    ".docs-button-text": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      textTransform: "uppercase",
      fontSize: "var(--fontSizeSmall)",
      fontFamily: theme.vars.fontFamily2,
      lineHeight: 1.0,
      fontWeight: 600
    },
    "& svg": {
      fontSize: "var(--fontSizeBig)"
    }
  });

const Help = ({
  open,
  handleClose
}: {
  open: boolean;
  handleClose: () => void;
}) => {
  const { t } = useTranslation();
  const helpIndex = useAppHeaderStore((state) => state.helpIndex);
  const setHelpIndex = useAppHeaderStore((state) => state.setHelpIndex);
  const helpTabs: TabItem[] = [
    { value: "shortcuts", label: t("i18n-next35.help.tabs.shortcuts") },
    { value: "keyboard", label: t("i18n-next35.help.tabs.keyboard") },
    { value: "datatypes", label: t("i18n-next35.help.tabs.dataTypes") }
  ];
  const activeTab = helpTabs[helpIndex]?.value ?? helpTabs[0].value;
  const handleChange = (newValue: string) => {
    setHelpIndex(helpTabs.findIndex((tab) => tab.value === newValue));
  };
  const [expandedNodetool, setExpandedNodetool] = useState(true);

  const theme = useTheme();

  const nodetoolTypes = DATA_TYPES;

  const handleAccordionChange =
    (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
      if (panel === "nodetool") {
        setExpandedNodetool(isExpanded);
      }
    };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="lg"
      title={t("i18n-next35.help.title")}
      titleActions={
        <Tooltip title={t("i18n-next35.help.openDocs")} placement="bottom">
          <a
            href="https://docs.nodetool.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="docs-button"
            css={docsButtonStyles(theme)}
          >
            <div className="docs-button-text">
              <span>Nodetool</span>
              <span>{t("i18n-next35.help.docsLabel")}</span>
            </div>
            <OpenInNewIcon />
          </a>
        </Tooltip>
      }
    >
      <div css={helpStyles(theme)}>
        <div className="help">
          <div className="tabs-row">
            <TabGroup
              tabs={helpTabs}
              value={activeTab}
              onChange={handleChange}
              aria-label={t("i18n-next35.help.tabsAriaLabel")}
              sx={{ flex: 1 }}
            />
          </div>
          <div className="content">
            <TabPanel value="shortcuts" activeValue={activeTab} className="tabpanel">
              <Box className="tabpanel-content">
                <ControlsShortcutsTab />
              </Box>
            </TabPanel>
            <TabPanel value="keyboard" activeValue={activeTab} className="tabpanel">
              <Box className="tabpanel-content">
                <KeyboardShortcutsView shortcuts={NODE_EDITOR_SHORTCUTS} />
              </Box>
            </TabPanel>
            <TabPanel value="datatypes" activeValue={activeTab} className="tabpanel">
              <Box className="tabpanel-content">
                <DataTypesList
                  title={t("i18n-next35.help.dataTypesTitle")}
                  dataTypes={nodetoolTypes}
                  expanded={expandedNodetool}
                  onChange={handleAccordionChange("nodetool")}
                />
              </Box>
            </TabPanel>
          </div>
        </div>
      </div>
    </Dialog>
  );
};

export default Help;
