/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { Typography, Button, Tabs, Tab, Box } from "@mui/material";
import CloseButton from "../../buttons/CloseButton";
import { useAppHeaderStore } from "../../../stores/AppHeaderStore";
import DataTypesList from "./DataTypesList";

interface TabPanelProps {
  children: React.ReactNode;
  index: number;
  value: number;
}

const helpStyles = (theme: any) =>
  css({
    "&": {
      backgroundColor: "#222",
      padding: "2em",
      borderRadius: "1em",
      position: "fixed",
      width: "50vw",
      minWidth: "600px",
      maxWidth: "800px",
      height: "85vh",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      border: "2px solid" + theme.palette.c_gray3
      //overflow: "hidden",
    },
    ".help": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      gap: ".1em"
      // overflow: "hidden"
    },

    ".top": {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      alignItems: "flex-start"
    },
    ".content": {
      height: "100%"
    },
    ".help-tabs": {
      button: {
        alignItems: "flex-start",
        textAlign: "left",
        paddingLeft: "0",
        marginRight: "0.5em",
        minWidth: "unset"
      }
    },
    ".tabpanel": {
      height: "100%"
    },
    ".tabpanel-content": {
      height: "90%",
      overflowY: "auto"
    },
    ".help-item": {
      marginBottom: "0.4em",
      display: "flex",
      alignItems: "center",
      gap: "1rem",
      p: {
        minWidth: "240px",
        borderRight: `1px solid ${theme.palette.c_gray3}`,
        fontFamily: theme.fontFamily
      },
      button: {
        marginTop: "2px",
        border: `1px solid ${theme.palette.c_gray3}`,
        padding: "1px 6px",
        textAlign: "left",
        lineHeight: "1.3em",
        "&.no-border": {
          border: "0"
        }
      }
    }
  });

function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;
  return (
    <div role="tabpanel" className="tabpanel" hidden={value !== index}>
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
    <div className="help-container" css={helpStyles}>
      <CloseButton onClick={handleClose} />
      <div className="help">
        <div className="top">
          <Typography variant="h4">Help</Typography>
          <Tabs className="help-tabs" value={helpIndex} onChange={handleChange}>
            <Tab label="Nodes" />
            <Tab label="Values" />
            <Tab label="Shortcuts" />
            <Tab label="DataTypes" />
          </Tabs>
        </div>
        <div className="content">
          <TabPanel value={helpIndex} index={0}>
            <Typography variant="h5" color="#999">
              Create Nodes
            </Typography>
            <div className="help-item">
              <Typography>Node Menu</Typography>
              <Button className="no-border">Double click on canvas</Button>
              <Button className="no-border">Shift+Space</Button>
            </div>
            <div className="help-item">
              <Typography>Command Menu</Typography>
              <Button className="no-border">Alt+K</Button>
              <Button className="no-border">Option+K</Button>
            </div>
            <div className="help-item">
              <Typography>Connection Menu</Typography>
              <Button className="no-border">
                End a connection on the canvas
              </Button>
            </div>
            <div className="help-item">
              <Typography>Asset Node</Typography>
              <Button className="no-border">
                Drop an asset from the Asset Menu or File Explorer on the Canvas
              </Button>
            </div>
            <Typography variant="h5" color="#999">
              Edit Nodes
            </Typography>
            <div className="help-item">
              <Typography>Delete Node</Typography>
              <Button className="no-border">Backspace</Button>
              <Button className="no-border">Delete</Button>
            </div>
            <div className="help-item">
              <Typography>Un/Collapse Node</Typography>
              <Button className="no-border">Double click on node name</Button>
            </div>
            <div className="help-item">
              <Typography>Select multiple Nodes</Typography>
              <Button className="no-border">
                Drag area with left click
                <br />
                Shift + Left Click if using LMB for panning
              </Button>
            </div>

            <Typography variant="h5" color="#999">
              Context Menus
            </Typography>
            <div className="help-item">
              <Typography>Node Menu</Typography>
              <Button className="no-border">
                Right click on node name or left click on top-right menu icon
              </Button>
            </div>
            <div className="help-item">
              <Typography>Selection Menu</Typography>
              <Button className="no-border">
                Right click on selection rectangle
              </Button>
            </div>
            <div className="help-item">
              <Typography>Canvas Menu</Typography>
              <Button className="no-border">Right click on empty canvas</Button>
            </div>
          </TabPanel>
          <TabPanel value={helpIndex} index={1}>
            <Typography variant="h5" color="#999">
              Edit Values
            </Typography>
            <div className="help-item">
              <Typography>Drag Number</Typography>
              <Button className="no-border">Drag Horizontal</Button>
            </div>
            <div className="help-item">
              <Typography></Typography>
              <Typography
                variant="body2"
                color="#999"
                style={{ border: "0", marginLeft: ".5em" }}
              >
                Shift: Slow
                <br />
                CTRL: Fast
                <br />
                Shift+CTRL: Faster
                <br />
              </Typography>
            </div>

            <div className="help-item">
              <Typography>Edit Number</Typography>
              <Button className="no-border">
                Double click a number property
              </Button>
            </div>
            <div className="help-item">
              <Typography>Set Default</Typography>
              <Button className="no-border">CTRL + Right Click</Button>
            </div>
            <div className="help-item">
              <Typography>Confirm Editing</Typography>
              <Button>Enter</Button>/<Button>Click anywhere outside</Button>
            </div>
            <div className="help-item">
              <Typography>Cancel Editing</Typography>
              <Button>ESC</Button>
            </div>
          </TabPanel>

          <TabPanel value={helpIndex} index={2}>
            <Typography variant="h5" color="#999">
              Menu
            </Typography>

            <div className="help-item">
              <Typography>Command Menu</Typography>
              <Button>Alt+k</Button>
              <Button>Option+k</Button>
            </div>
            <div className="help-item">
              <Typography>Open Node Menu</Typography>
              <Button className="no-border">Double Click on Canvas</Button>
              <Button className="no-border">CTRL+Space</Button>
            </div>
            <div className="help-item">
              <Typography>Focus Search in NodeMenu</Typography>
              <Button>Esc</Button> or just start typing with menu opened
            </div>
            <Typography variant="h5" color="#999">
              Nodes
            </Typography>

            <div className="help-item">
              <Typography>Help Menu</Typography>
              <Button>Alt+h</Button>
              <Button>Meta+h</Button>
            </div>
            <div className="help-item">
              <Typography>Copy selected nodes</Typography>
              <Button>CTRL+C | Meta+C</Button>
            </div>
            <div className="help-item">
              <Typography>Paste selected nodes</Typography>
              <Button>CTRL+V | Meta+V</Button>
            </div>
            <div className="help-item">
              <Typography>History Undo</Typography>
              <Button>CTRL+z</Button>
              <Button>Option+z</Button>
            </div>
            <div className="help-item">
              <Typography>History Redo</Typography>
              <Button>CTRL+SHIFT+z</Button>
              <Button>Option+Shift+z</Button>
            </div>
            <div className="help-item">
              <Typography>Align selected nodes</Typography>
              <Button>a</Button>
            </div>
            <div className="help-item">
              <Typography>Arrange selected nodes</Typography>
              <Button>Space+a</Button>
            </div>
            <div className="help-item">
              <Typography>Fit Screen</Typography>
              <Button>Alt+S</Button>
              <Button>Option+S</Button>
            </div>

            <Typography variant="h5" color="#999">
              Workflow
            </Typography>

            <div className="help-item">
              <Typography>Run Workflow</Typography>
              <Button>CTRL+Enter</Button>
            </div>
            <div className="help-item">
              <Typography>Cancel Workflow</Typography>
              <Button>ESC</Button>
            </div>
          </TabPanel>
          <TabPanel value={helpIndex} index={3}>
            <DataTypesList />
          </TabPanel>
        </div>
      </div>
    </div>
  );
};

export default Help;
