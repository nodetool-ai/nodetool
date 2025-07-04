/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { Typography, Tabs, Tab, Box, TextField } from "@mui/material";
import CloseButton from "../../buttons/CloseButton";
import { useAppHeaderStore } from "../../../stores/AppHeaderStore";
import DataTypesList from "./DataTypesList";
import ThemeNodetool from "../../themes/ThemeNodetool";
import { useState } from "react";
import { DATA_TYPES } from "../../../config/data_types";
import KeyboardShortcutsView from "./KeyboardShortcutsView";
import { NODE_EDITOR_SHORTCUTS } from "../../../config/shortcuts";
import { getShortcutTooltip } from "../../../config/shortcuts";

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

const helpStyles = (theme: any) =>
  css({
    "&": {
      backgroundColor: "rgba(40, 40, 40, 0.5)",
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
      borderBottom: `1px solid ${theme.palette.grey[600]}`
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
        color: theme.palette.grey[200],
        transition: "color 0.2s ease",
        paddingBottom: "0em",
        "&.Mui-selected": {
          color: theme.palette.grey[0]
        },
        "&:hover": {
          color: theme.palette.grey[0]
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
        background: theme.palette.grey[800]
      },
      "&::-webkit-scrollbar-thumb": {
        background: theme.palette.grey[500],
        borderRadius: "4px"
      },
      "&::-webkit-scrollbar-thumb:hover": {
        background: theme.palette.grey[400]
      }
    },
    ".help-item": {
      marginBottom: "0.5em",
      paddingBottom: "0.5em",
      display: "flex",
      alignItems: "center",
      gap: "1rem",
      p: {
        minWidth: "240px",
        fontFamily: theme.fontFamily
      },
      button: {
        marginTop: "2px",
        color: theme.palette.grey[200],
        border: `1px solid ${theme.palette.grey[600]}`,
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
      color: theme.palette.grey[200]
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
          background-color: rgba(0, 0, 0, 0.7);
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
            <Tab label="Controls & Shortcuts" id="help-tab-0" />
            <Tab label="DataTypes" id="help-tab-1" />
            <Tab label="Keyboard Shortcuts" id="help-tab-2" />
          </Tabs>
          <div className="content">
            <TabPanel value={helpIndex} index={0}>
              <>
                <TextField
                  className="help-search"
                  label="SEARCH HELP"
                  variant="outlined"
                  size="small"
                  fullWidth
                  onChange={handleSearchChange}
                  sx={{
                    marginTop: "0.5em",
                    marginBottom: "1em",
                    "& label": {
                      top: "-0.5em",
                      wordSpacing: "0.1em"
                    },
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: ThemeNodetool.palette.grey[800],
                      borderRadius: "4px",
                      "& input": {
                        color: ThemeNodetool.palette.grey[0]
                      },
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: ThemeNodetool.palette.grey[500]
                      },
                      "&:hover .MuiOutlinedInput-notchedOutline": {
                        borderColor: ThemeNodetool.palette.grey[400]
                      },
                      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                        borderColor: ThemeNodetool.palette.primary.main
                      }
                    },
                    "& .MuiInputLabel-outlined": {
                      color: ThemeNodetool.palette.grey[200],
                      "&.Mui-focused": {
                        color: ThemeNodetool.palette.primary.main
                      }
                    }
                  }}
                />
                {(() => {
                  const lower = searchTerm.toLowerCase();
                  const filtered = NODE_EDITOR_SHORTCUTS.filter((s) => {
                    if (!lower) return true;
                    return (
                      s.title.toLowerCase().includes(lower) ||
                      (s.description &&
                        s.description.toLowerCase().includes(lower))
                    );
                  });
                  // KEYBOARD SHORTCUTS BY CATEGORY
                  const categories = ["panel", "nodes"] as const;
                  return categories.map((cat) => {
                    const list = filtered.filter((s) => s.category === cat);
                    if (!list.length) return null;
                    return (
                      <div key={cat} style={{ marginBottom: "1em" }}>
                        <Typography variant="h2" color="#999" sx={{ mb: 1 }}>
                          {cat === "panel" ? "Panels" : "Nodes"}
                        </Typography>
                        {list.map((s) => (
                          <div className="help-item" key={s.slug}>
                            <Typography sx={{ minWidth: 160 }}>
                              {s.title}
                            </Typography>
                            {
                              getShortcutTooltip(
                                s.slug,
                                undefined,
                                "combo"
                              ) as unknown as string
                            }
                            {s.description && (
                              <Typography variant="body2" sx={{ ml: 1 }}>
                                {s.description}
                              </Typography>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  });
                })()}
                {/* Static help sections (non-shortcut related) */}
                <Typography variant="h2" color="#999" sx={{ mt: 3 }}>
                  Nodes – Create
                </Typography>
                <div className="help-item">
                  <Typography sx={{ minWidth: 240 }}>Open Node Menu</Typography>
                  <Typography variant="body2">
                    Double-click on canvas or press Space
                  </Typography>
                </div>
                <div className="help-item">
                  <Typography sx={{ minWidth: 240 }}>
                    Search in Node Menu
                  </Typography>
                  <Typography variant="body2">
                    Start typing while Node Menu is open
                  </Typography>
                </div>
                <div className="help-item">
                  <Typography sx={{ minWidth: 240 }}>
                    Connection Menu
                  </Typography>
                  <Typography variant="body2">
                    End a connection on the canvas
                  </Typography>
                </div>

                <Typography variant="h2" color="#999" sx={{ mt: 3 }}>
                  Nodes – Parameters
                </Typography>
                <div className="help-item">
                  <Typography sx={{ minWidth: 240 }}>Drag Number</Typography>
                  <Typography variant="body2">
                    Click + drag horizontally (hold Shift for fine adjust)
                  </Typography>
                </div>
                <div className="help-item">
                  <Typography sx={{ minWidth: 240 }}>Edit Number</Typography>
                  <Typography variant="body2">
                    Click a number property and enter a value
                  </Typography>
                </div>
                <div className="help-item">
                  <Typography sx={{ minWidth: 240 }}>Set Default</Typography>
                  <Typography variant="body2">Ctrl/⌘ + Right-Click</Typography>
                </div>
                <div className="help-item">
                  <Typography sx={{ minWidth: 240 }}>
                    Confirm / Cancel
                  </Typography>
                  <Typography variant="body2">Enter / Esc</Typography>
                </div>

                <Typography variant="h2" color="#999" sx={{ mt: 3 }}>
                  Workflows
                </Typography>
                <Typography className="explanation">
                  You can start and stop workflows with the top menu buttons or
                  with shortcuts. Stopping a workflow may take a few seconds,
                  depending on the task.
                </Typography>
                <div className="help-item">
                  <Typography sx={{ minWidth: 240 }}>Run Workflow</Typography>
                  {
                    getShortcutTooltip(
                      "run-workflow",
                      undefined,
                      "combo"
                    ) as unknown as string
                  }
                </div>
                <div className="help-item">
                  <Typography sx={{ minWidth: 240 }}>
                    Cancel Workflow
                  </Typography>
                  {
                    getShortcutTooltip(
                      "stop-workflow",
                      undefined,
                      "combo"
                    ) as unknown as string
                  }
                </div>

                <Typography variant="h2" color="#999" sx={{ mt: 3 }}>
                  Command Menu
                </Typography>
                <div className="help-item">
                  <Typography sx={{ minWidth: 240 }}>
                    Open Command Menu
                  </Typography>
                  {
                    getShortcutTooltip(
                      "show-keyboard-shortcuts",
                      undefined,
                      "combo"
                    ) as unknown as string
                  }
                </div>
              </>
            </TabPanel>
            <TabPanel value={helpIndex} index={1}>
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
            <TabPanel value={helpIndex} index={2}>
              <KeyboardShortcutsView shortcuts={NODE_EDITOR_SHORTCUTS} />
            </TabPanel>
          </div>
        </div>
      </div>
    </>
  );
};

export default Help;
