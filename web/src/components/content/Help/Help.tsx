/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { Typography, Button, Tabs, Tab, Box, TextField } from "@mui/material";
import CloseButton from "../../buttons/CloseButton";
import { useAppHeaderStore } from "../../../stores/AppHeaderStore";
import DataTypesList from "./DataTypesList";
import ThemeNodetool from "../../themes/ThemeNodetool";
import { useState } from "react";

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
      backgroundColor: "rgba(0, 0, 0, 0.5)",
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
      borderBottom: `1px solid ${theme.palette.c_gray2}`
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
        backgroundColor: theme.palette.c_hl1,
        height: "3px",
        borderRadius: "1.5px"
      },
      "& .MuiTab-root": {
        color: theme.palette.c_gray5,
        transition: "color 0.2s ease",
        paddingBottom: "0em",
        "&.Mui-selected": {
          color: theme.palette.c_white
        },
        "&:hover": {
          color: theme.palette.c_white
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
      fontSize: "var(--font-size-big)"
    },
    ".tabpanel-content": {
      height: "100%",
      overflowY: "auto",
      "&::-webkit-scrollbar": {
        width: "8px"
      },
      "&::-webkit-scrollbar-track": {
        background: theme.palette.c_gray1
      },
      "&::-webkit-scrollbar-thumb": {
        background: theme.palette.c_gray3,
        borderRadius: "4px"
      },
      "&::-webkit-scrollbar-thumb:hover": {
        background: theme.palette.c_gray4
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
        color: theme.palette.c_gray5,
        border: `1px solid ${theme.palette.c_gray2}`,
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
      fontSize: "var(--font-size-normal)",
      color: theme.palette.c_gray5
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

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value.toLowerCase());
  };

  const helpItems: HelpItemGroup[] = [
    {
      category: "Nodes",
      subCategory: "Create Nodes",
      items: [
        {
          text: "Open NodeMenu",
          buttons: ["Double click on canvas", "SPACE"],
          isButtonBorderless: [true, true]
        },
        {
          text: "Search in NodeMenu",
          details: "Start typing anywhere while the NodeMenu is opened"
        },
        { text: "Connection Menu", details: "End a connection on the canvas" },
        {
          text: "Quick Asset Node",
          details:
            "Drop any asset from the Asset Menu or external File Manager onto the Canvas"
        }
      ]
    },
    {
      category: "Nodes",
      subCategory: "Edit Nodes",
      items: [
        { text: "Copy selected Nodes", buttons: ["CTRL + C", "⌘ + C"] },
        { text: "Paste selected Nodes", buttons: ["CTRL + V", "⌘ + V"] },
        { text: "Duplicate selected Nodes", buttons: ["CTRL + D", "⌘ + D"] },
        { text: "History Undo", buttons: ["CTRL + Z", "⌘ + Z"] },
        {
          text: "History Redo",
          buttons: ["CTRL + SHIFT + Z", "⌘ + SHIFT + Z"]
        },
        { text: "Align selected Nodes", buttons: ["A"] },
        { text: "Arrange selected Nodes", buttons: ["SHIFT + A", "⌘ + A"] },
        { text: "Delete Node", buttons: ["BACKSPACE", "DELETE"] },
        {
          text: "Select multiple Nodes",
          details:
            "Drag area with SHIFT + Left Click (default)\nDrag area with Left Click if using RMB for panning (configurable in settings)"
        },
        { text: "Fit Screen (Focus all Nodes)", buttons: ["F"] },
        { text: "Focus selected Nodes", buttons: ["F"] }
      ]
    },
    {
      category: "Nodes",
      subCategory: "Edit Node Parameters",
      items: [
        {
          text: "Drag Number",
          buttons: ["Click + Drag Horizontal"],
          isButtonBorderless: [true],
          details:
            "hold SHIFT for FINE adjustment\nhold CTRL for FAST adjustment\nhold SHIFT + CTRL for FASTER adjustment"
        },
        {
          text: "Edit Number",
          details: "Click a number property and enter a value"
        },
        {
          text: "Set Default",
          buttons: ["CTRL + RightClick", "⌘ + RightClick"]
        },
        {
          text: "Confirm Editing",
          buttons: ["Enter", "Click anywhere outside"]
        },
        { text: "Cancel Editing", buttons: ["ESC"] }
      ]
    },
    {
      category: "Workflows",
      explanation:
        "Control starting and stopping of workflows with shortcuts instead of the center menu.\nStopping a workflow may take a few seconds, depending on the task.",
      items: [
        { text: "Run Workflow", buttons: ["CTRL + Enter", "⌘ + Enter"] },
        { text: "Cancel Workflow", buttons: ["ESC"] }
      ]
    },
    {
      category: "Command Menu",
      explanation:
        "The command menu provides quick keyboard access to most features.",
      items: [
        {
          text: "Open Command Menu",
          buttons: ["ALT + K", "⌘ + K"],
          isButtonBorderless: [true, true]
        }
      ]
    }
  ];

  const filteredHelpItems = helpItems
    .map((group) => {
      if (!group.items) return group;
      const filtered = group.items.filter(
        (item) =>
          item.text.toLowerCase().includes(searchTerm) ||
          (item.buttons &&
            item.buttons.some((btn) =>
              btn.toLowerCase().includes(searchTerm)
            )) ||
          (item.details && item.details.toLowerCase().includes(searchTerm))
      );
      if (filtered.length > 0) {
        return { ...group, items: filtered };
      }
      if (
        group.category?.toLowerCase().includes(searchTerm) ||
        group.subCategory?.toLowerCase().includes(searchTerm)
      ) {
        return group;
      }
      return null;
    })
    .filter(Boolean as unknown as <T>(value: T | null) => value is T);

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
                      backgroundColor: ThemeNodetool.palette.c_gray1,
                      borderRadius: "4px",
                      "& input": {
                        color: ThemeNodetool.palette.c_white
                      },
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: ThemeNodetool.palette.c_gray3
                      },
                      "&:hover .MuiOutlinedInput-notchedOutline": {
                        borderColor: ThemeNodetool.palette.c_gray4
                      },
                      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                        borderColor: ThemeNodetool.palette.c_hl1
                      }
                    },
                    "& .MuiInputLabel-outlined": {
                      color: ThemeNodetool.palette.c_gray5,
                      "&.Mui-focused": {
                        color: ThemeNodetool.palette.c_hl1
                      }
                    }
                  }}
                />
                {filteredHelpItems.map(
                  (group, groupIndex) =>
                    group && (
                      <div key={groupIndex}>
                        {group.category &&
                          !filteredHelpItems.some(
                            (fg) =>
                              fg &&
                              fg.items &&
                              fg.items.length > 0 &&
                              fg.category === group.category &&
                              fg.subCategory !== group.subCategory
                          ) && (
                            <Typography variant="h2" color="#999">
                              {group.category}
                            </Typography>
                          )}
                        {group.subCategory && (
                          <Typography variant="h5" color="#999">
                            {group.subCategory}
                          </Typography>
                        )}
                        {group.explanation && (
                          <Typography className="explanation">
                            {group.explanation
                              .split("\n")
                              .map((line: string, i: number) => (
                                <span key={i}>
                                  {line}
                                  <br />
                                </span>
                              ))}
                          </Typography>
                        )}
                        {group.items &&
                          group.items.map((item, itemIndex) => (
                            <div className="help-item" key={itemIndex}>
                              <Typography>{item.text}</Typography>
                              {item.buttons &&
                                item.buttons.map((buttonText, btnIndex) => (
                                  <Button
                                    key={btnIndex}
                                    className={
                                      item.isButtonBorderless?.[btnIndex]
                                        ? "no-border"
                                        : ""
                                    }
                                  >
                                    {buttonText}
                                  </Button>
                                ))}
                              {item.details &&
                                !item.buttons &&
                                item.details
                                  .split("\n")
                                  .map((line: string, i: number) => (
                                    <span key={i}>
                                      {line}
                                      <br />
                                    </span>
                                  ))}
                              {item.details && item.buttons && (
                                <Typography
                                  variant="body2"
                                  style={{
                                    border: "0",
                                    marginLeft: ".5em",
                                    color: ThemeNodetool.palette.c_gray6,
                                    fontSize: ThemeNodetool.fontSizeSmaller
                                  }}
                                >
                                  {item.details
                                    .split("\n")
                                    .map((line: string, i: number) => (
                                      <span key={i}>
                                        {line}
                                        <br />
                                      </span>
                                    ))}
                                </Typography>
                              )}
                            </div>
                          ))}
                      </div>
                    )
                )}
                {filteredHelpItems.length === 0 && searchTerm && (
                  <Typography>
                    No results found for &quot;{searchTerm}&quot;
                  </Typography>
                )}
              </>
            </TabPanel>
            <TabPanel value={helpIndex} index={1}>
              <DataTypesList />
            </TabPanel>
          </div>
        </div>
      </div>
    </>
  );
};

export default Help;
