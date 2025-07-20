/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { Typography, Tabs, Tab, Box, TextField } from "@mui/material";
import CloseButton from "../../buttons/CloseButton";
import { useAppHeaderStore } from "../../../stores/AppHeaderStore";
import DataTypesList from "./DataTypesList";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useState } from "react";
import { DATA_TYPES } from "../../../config/data_types";
import KeyboardShortcutsView from "./KeyboardShortcutsView";
import { NODE_EDITOR_SHORTCUTS } from "../../../config/shortcuts";
import { getShortcutTooltip } from "../../../config/shortcuts";
import ControlsShortcutsTab from "./ControlsShortcutsTab";

interface HelpItem {
  text: string;
  buttons?: string[];
  isButtonBorderless?: boolean[];
  details?: string;
}

interface HelpItemGroup {
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
    "&": {
      backgroundColor: theme.vars.palette.background.default,
      backdropFilter: "blur(10px)",
      padding: "0em 1em",
      borderRadius: "1em",
      position: "fixed",
      width: "70vw",
      minWidth: "600px",
      maxWidth: "1000px",
      height: "85vh",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
      overflow: "auto",
      fontSize: theme.fontSizeNormal,
      zIndex: 1000
    },
    ".help": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      gap: ".1em",
      overflow: "hidden"
    },

    ".top": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "0.5em",
      padding: "0em 1em",
      borderBottom: `1px solid ${theme.vars.palette.grey[600]}`
    },
    ".content": {
      height: "calc(100% - 40px)",
      padding: "0 1em 2em 1em"
    },
    ".help-tabs": {
      margin: "0 1em 1em 1em",
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
      height: "calc(100% - 40px)",
      padding: "1em 0",
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

const Help = ({ handleClose }: { handleClose: () => void }) => {
  const { helpIndex, setHelpIndex } = useAppHeaderStore();
  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setHelpIndex(newValue);
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedNodetool, setExpandedNodetool] = useState(true);
  const [expandedComfy, setExpandedComfy] = useState(false);

  const theme = useTheme();

  const nodetoolTypes = DATA_TYPES.filter(
    (type) => !type.value.startsWith("comfy.")
  );
  const comfyTypes = DATA_TYPES.filter((type) =>
    type.value.startsWith("comfy.")
  );

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value.toLowerCase());
  };

  const handleAccordionChange =
    (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
      if (panel === "nodetool") {
        setExpandedNodetool(isExpanded);
      } else if (panel === "comfy") {
        setExpandedComfy(isExpanded);
      }
    };

  return (
    <>
      <div
        css={css`
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: theme.vars.palette.background.default;
          backdrop-filter: blur(5px);
          z-index: 999;
        `}
        onClick={handleClose}
      />
      <div className="help-container" css={helpStyles}>
        <div className="help">
          <div className="top">
            <Typography variant="h2">Help</Typography>
            <CloseButton onClick={handleClose} />
          </div>
          <Tabs
            className="help-tabs"
            value={helpIndex}
            onChange={handleChange}
            aria-label="help tabs"
          >
            <Tab label="Shortcuts" id="help-tab-0" />
            <Tab label="Keyboard" id="help-tab-1" />
            <Tab label="DataTypes" id="help-tab-2" />
          </Tabs>
          <div className="content">
            <TabPanel value={helpIndex} index={0}>
              <ControlsShortcutsTab />
            </TabPanel>
            <TabPanel value={helpIndex} index={1}>
              <KeyboardShortcutsView shortcuts={NODE_EDITOR_SHORTCUTS} />
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
    </>
  );
};

export default Help;
