/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { Typography, Button, Tabs, Tab, Box } from "@mui/material";
import CloseButton from "../../buttons/CloseButton";
import { useAppHeaderStore } from "../../../stores/AppHeaderStore";
import DataTypesList from "./DataTypesList";
import ThemeNodetool from "../../themes/ThemeNodetool";

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
      height: "100%",
      padding: "1em 0",
      fontSize: "var(--font-size-big)"
    },
    ".tabpanel-content": {
      height: "90%",
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
              <Typography variant="h2" color="#999">
                Nodes
              </Typography>
              <Typography variant="h5" color="#999">
                Create Nodes
              </Typography>
              <div className="help-item">
                <Typography>Open NodeMenu</Typography>
                <Button className="no-border">
                  Double click on canvas
                </Button> OR <Button className="no-border">SPACE</Button>
              </div>
              <div className="help-item">
                <Typography>Search in NodeMenu</Typography>
                Start typing anywhere while the NodeMenu is opened
                <br />
              </div>

              <div className="help-item">
                <Typography>Connection Menu</Typography>
                End a connection on the canvas
              </div>
              <div className="help-item">
                <Typography>Quick Asset Node</Typography>
                Drop any asset from the Asset Menu or external File Manager onto
                the Canvas
              </div>
              <Typography variant="h5" color="#999">
                Edit Nodes
              </Typography>
              <div className="help-item">
                <Typography>Copy selected Nodes</Typography>
                <Button>CTRL + C</Button> | <Button>⌘ + C</Button>
              </div>
              <div className="help-item">
                <Typography>Paste selected Nodes</Typography>
                <Button>CTRL + V</Button> | <Button>⌘ + V</Button>
              </div>
              <div className="help-item">
                <Typography>Duplicate selected Nodes</Typography>
                <Button>CTRL + D</Button> | <Button>⌘ + D</Button>
              </div>
              <div className="help-item">
                <Typography>History Undo</Typography>
                <Button>CTRL + Z</Button> | <Button>⌘ + Z</Button>
              </div>
              <div className="help-item">
                <Typography>History Redo</Typography>
                <Button>CTRL + SHIFT + Z</Button> |{" "}
                <Button>⌘ + SHIFT + Z</Button>
              </div>
              <div className="help-item">
                <Typography>Align selected Nodes</Typography>
                <Button>A</Button>
              </div>
              <div className="help-item">
                <Typography>Arrange selected Nodes</Typography>
                <Button>SHIFT + A</Button> | <Button>⌘ + A</Button>
              </div>

              <div className="help-item">
                <Typography>Delete Node</Typography>
                <Button>BACKSPACE</Button> OR <Button>DELETE</Button>
              </div>

              <div className="help-item">
                <Typography>Select multiple Nodes</Typography>
                Drag area with SHIFT + Left Click (default)
                <br />
                Drag area with Left Click if using RMB for panning (configurable
                in settings)
              </div>

              <div className="help-item">
                <Typography>Fit Screen (Focus all Nodes)</Typography>
                <Button>F</Button>
              </div>
              <div className="help-item">
                <Typography>Focus selected Nodes</Typography>
                <Button>F</Button>
              </div>

              <Typography variant="h5" color="#999">
                Edit Node Parameters
              </Typography>
              <div className="help-item">
                <Typography>Drag Number</Typography>
                <Button className="no-border">Click + Drag Horizontal</Button>
                <Typography
                  variant="body2"
                  // color="#999"
                  style={{
                    border: "0",
                    marginLeft: ".5em",
                    color: ThemeNodetool.palette.c_gray6,
                    fontSize: ThemeNodetool.fontSizeSmaller
                  }}
                >
                  hold SHIFT for FINE adjustment
                  <br />
                  hold CTRL for FAST adjustment
                  <br />
                  hold SHIFT + CTRL for FASTER adjustment
                  <br />
                </Typography>
              </div>

              <div className="help-item">
                <Typography>Edit Number</Typography>
                Click a number property and enter a value
              </div>
              <div className="help-item">
                <Typography>Set Default</Typography>
                <Button>CTRL + RightClick</Button> |{" "}
                <Button>⌘ + RightClick</Button>
              </div>
              <div className="help-item">
                <Typography>Confirm Editing</Typography>
                <Button>Enter</Button> OR{" "}
                <Button>Click anywhere outside</Button>
              </div>
              <div className="help-item">
                <Typography>Cancel Editing</Typography>
                <Button>ESC</Button>
              </div>

              <Typography variant="h2" color="#999">
                Workflows
              </Typography>
              <Typography className="explanation">
                Control starting and stopping of workflows with shortcuts
                instead of the center menu.
                <br />
                Stopping a workflow may take a few seconds, depending on the
                task.
              </Typography>

              <div className="help-item">
                <Typography>Run Workflow</Typography>
                <Button>CTRL + Enter</Button> | <Button>⌘ + Enter</Button>
              </div>
              <div className="help-item">
                <Typography>Cancel Workflow</Typography>
                <Button>ESC</Button>
              </div>

              <Typography variant="h2" color="#999">
                Command Menu
              </Typography>
              <Typography className="explanation">
                The command menu provides quick keyboard access to most
                features.
              </Typography>
              <div className="help-item">
                <Typography>Open Command Menu</Typography>
                <Button className="no-border">ALT + K</Button>
                <Button className="no-border">⌘ + K</Button>
              </div>
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
