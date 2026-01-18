/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import {
  Typography,
  Tabs,
  Tab,
  Box,
  Dialog,
  DialogContent
} from "@mui/material";
import CloseButton from "../../buttons/CloseButton";
import { useAppHeaderStore } from "../../../stores/AppHeaderStore";
import DataTypesList from "./DataTypesList";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useState } from "react";
import { DATA_TYPES } from "../../../config/data_types";
import KeyboardShortcutsGrid from "./KeyboardShortcutsGrid";
import ControlsShortcutsTab from "./ControlsShortcutsTab";

interface HelpItem {
  text: string;
  buttons?: string[];
  isButtonBorderless?: boolean[];
  details?: string;
}

interface _HelpItemGroup {
  category?: string;
  subCategory?: string;
  explanation?: string;
  items?: HelpItem[];
}

interface TabPanelProps {
  children: React.ReactNode;
  index: number;
  value: number;
}

const helpStyles = (theme: Theme) =>
  css({
    height: "100%",
    ".help": {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: ".1em",
      overflow: "hidden"
    },

    ".top": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "0.5em",
      padding: "0.5em 1.5em",
      borderBottom: `1px solid ${theme.vars.palette.grey[600]}`
    },
    ".content": {
      flex: 1,
      padding: "0 1.5em 1.5em 1.5em",
      overflow: "hidden"
    },
    ".help-tabs": {
      margin: "0 1.5em 0.5em 1.5em",
      paddingTop: "0",
      lineHeight: "1.5",
      "& .MuiTabs-indicator": {
        backgroundColor: "var(--palette-primary-main)",
        height: "3px",
        borderRadius: "1.5px"
      },
      "& .MuiTab-root": {
        color: theme.vars.palette.grey[200],
        transition: "color 0.2s ease",
        paddingBottom: "0em",
        "&.Mui-selected": {
          color: theme.vars.palette.grey[0]
        },
        "&:hover": {
          color: theme.vars.palette.grey[0]
        }
      },
      button: {
        alignItems: "flex-start",
        textAlign: "left",
        paddingLeft: "0",
        marginRight: "0.5em",
        minWidth: "unset"
      }
    },
    ".tabpanel": {
      height: "100%",
      padding: "0.5em 0",
      fontSize: "var(--fontSizeBig)",
      overflow: "hidden"
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
        borderRadius: "4px"
      },
      "&::-webkit-scrollbar-thumb:hover": {
        background: theme.vars.palette.grey[400]
      }
    },
    ".help-item": {
      marginBottom: "0.25em",
      paddingBottom: "0.5em",
      display: "flex",
      alignItems: "center",
      gap: "1rem",
      p: {
        minWidth: "240px"
      },
      button: {
        marginTop: "2px",
        color: theme.vars.palette.grey[200],
        border: `1px solid ${theme.vars.palette.grey[600]}`,
        padding: "1px 6px",
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
      marginBottom: "1em",
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.grey[200]
    }
  });

function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;
  return (
    <div
      role="tabpanel"
      className="tabpanel"
      hidden={value !== index}
      id={`help-tabpanel-${index}`}
      aria-labelledby={`help-tab-${index}`}
    >
      {value === index && <Box className="tabpanel-content">{children}</Box>}
    </div>
  );
}

const Help = ({
  open,
  handleClose
}: {
  open: boolean;
  handleClose: () => void;
}) => {
  const helpIndex = useAppHeaderStore((state) => state.helpIndex);
  const setHelpIndex = useAppHeaderStore((state) => state.setHelpIndex);
  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setHelpIndex(newValue);
  };
  const [expandedNodetool, setExpandedNodetool] = useState(true);
  const [expandedComfy, setExpandedComfy] = useState(false);

  const theme = useTheme();

  const nodetoolTypes = DATA_TYPES.filter(
    (type) => !type.value.startsWith("comfy.")
  );
  const comfyTypes = DATA_TYPES.filter((type) =>
    type.value.startsWith("comfy.")
  );

  const handleAccordionChange =
    (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
      if (panel === "nodetool") {
        setExpandedNodetool(isExpanded);
      } else if (panel === "comfy") {
        setExpandedComfy(isExpanded);
      }
    };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen
      data-testid="help-dialog"
      sx={{
        "& .MuiDialog-paper": {
          margin: "2rem",
          width: "calc(100vw - 4rem)",
          height: "calc(100vh - 4rem)",
          maxWidth: "none",
          maxHeight: "none",
          borderRadius: (theme as any)?.rounded?.dialog ?? 2,
          border: `1px solid ${theme.vars.palette.grey[700]}`,
          backgroundColor:
            (theme as any)?.palette?.glass?.backgroundDialogContent ??
            "transparent"
        }
      }}
      slotProps={{
        backdrop: {
          style: {
            backdropFilter: theme.vars.palette.glass.blur,
            backgroundColor: theme.vars.palette.glass.backgroundDialog
          }
        },
        paper: {
          style: {
            borderRadius: theme.vars.rounded.dialog,
            background: theme.vars.palette.glass.backgroundDialogContent
          }
        }
      }}
    >
      <DialogContent sx={{ p: 0, overflow: "hidden" }}>
        <div css={helpStyles(theme)}>
          <div className="help">
            <div className="top">
              <Typography variant="h2">Keyboard Shortcuts</Typography>
              <CloseButton onClick={handleClose} />
            </div>
            <Tabs
              className="help-tabs"
              value={helpIndex}
              onChange={handleChange}
              aria-label="help tabs"
            >
              <Tab label="All Shortcuts" id="help-tab-0" data-testid="shortcuts-tab" />
              <Tab label="Shortcuts List" id="help-tab-1" />
              <Tab label="DataTypes" id="help-tab-2" />
            </Tabs>
            <div className="content">
              <TabPanel value={helpIndex} index={0}>
                <KeyboardShortcutsGrid />
              </TabPanel>
              <TabPanel value={helpIndex} index={1}>
                <ControlsShortcutsTab />
              </TabPanel>
              <TabPanel value={helpIndex} index={2}>
                <DataTypesList
                  title="Nodetool Data Types"
                  dataTypes={nodetoolTypes}
                  expanded={expandedNodetool}
                  onChange={handleAccordionChange("nodetool")}
                />
                <DataTypesList
                  title="Comfy Data Types"
                  dataTypes={comfyTypes}
                  expanded={expandedComfy}
                  onChange={handleAccordionChange("comfy")}
                />
              </TabPanel>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Help;
