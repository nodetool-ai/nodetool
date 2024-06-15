/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Typography, Tabs, Tab, Box } from "@mui/material";
import { useState } from "react";
import CloseButton from "../../buttons/CloseButton";

interface TabPanelProps {
  children: React.ReactNode;
  index: number;
  value: number;
}

const welcomeStyles = (theme: any) =>
  css({
    "&": {
      backgroundColor: "#222",
      padding: "2em",
      borderRadius: "1em",
      position: "fixed",
      width: "50vw",
      minWidth: "600px",
      maxWidth: "90vw",
      height: "85vh",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      overflowY: "auto",
      border: `2px solid ${theme.palette.c_gray3}`
    },
    ".welcome-tabs": {
      button: {
        alignItems: "flex-start",
        textAlign: "left",
        paddingLeft: "0",
        marginRight: "0.5em",
        minWidth: "unset"
      }
    },
    ".link": {
      color: theme.palette.c_attention,
      display: "block",
      marginBottom: "1em"
    },
    ".link .body": {
      fontSize: theme.fontSizeSmall,
      color: theme.palette.c_gray6,
      margin: 0
    },
    ".body": {
      marginTop: "1em",
      maxWidth: "650px",
      color: theme.palette.c_white,
      fontSize: theme.fontSizeNormal,
      fontFamily: theme.fontFamily1,
      lineHeight: "1.2em"
    },
    ul: {
      listStyleType: "square",
      fontFamily: theme.fontFamily1,
      paddingLeft: "1.5em"
    },
    li: {
      marginBottom: "0.5em"
    },
    "ul li ul li": {
      listStyleType: "disc",
      margin: "0",
      lineHeight: "1.2em"
    },
    ".release": {
      padding: ".5em 0",
      marginBottom: "1em",
      borderBottom: `1px solid ${theme.palette.c_attention}`
    }
  });

function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

const Welcome = ({ handleClose }: { handleClose: () => void }) => {
  const [value, setValue] = useState(0);

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <div className="welcome" css={welcomeStyles}>
      <CloseButton onClick={handleClose} />
      <Typography variant="h4">NodeTool</Typography>
      <Tabs className="welcome-tabs" value={value} onChange={handleChange}>
        <Tab label="Overview" />
        <Tab label="What's new" />
        <Tab label="Links" />
      </Tabs>
      {/* OVERVIEW */}
      <TabPanel value={value} index={0}>
        <Typography variant="h5">Welcome to NodeTool</Typography>

        <Typography className="body">
          NodeTool lets you create workflows by combining nodes that perform
          various tasks.
          <br />
          It&apos;s designed to be simple yet powerful and flexible.
          <br />
          Combine Machine Learning models from sources like OpenAI, HuggingFace,
          Replicate, and more.
        </Typography>
        <Typography variant="h5"> Quick Tips:</Typography>
        <ul>
          <b>Workflows</b>
          <li>
            Create and manage workflows
            <ul>
              <li>Click on Workflows in the top panel</li>
              <li>Edit the current workflow in the left panel</li>
              <li>Save a workflow using the save button in the left Panel</li>
              <li>Open the examples inside the Workflow menu</li>
            </ul>
          </li>
          <li>
            {" "}
            Run workflows with the Play Button in the bottom Panel to see the
            results{" "}
          </li>
          <li>Some processes may take some time </li>

          <b>Node Menu</b>
          <li>
            Three ways to open the NodeMenu:
            <ul>
              <li>Double-click the canvas</li>
              <li>Press CTRL+Space</li>
              <li>Press the Nodes Button (circle icon) in the top Panel</li>
            </ul>
            Inside the NodeMenu:
            <ul>
              <li>
                Read the description in the menu to learn how to browse and
                create nodes
              </li>
            </ul>
          </li>

          <b>Nodes</b>
          <li>
            <li>Connect nodes to create data flows</li>
            <li>
              Compatible connections are highlighted while making a connection{" "}
            </li>
            <li> Delete connections by right clicking them </li>
            <li> Change node values with left click </li>
            <li> Changed values will appear highlighted </li>
            <li> Reset values to default with CTRL+RightClick </li>
            <li>
              Number values can be changed by dragging horizontally or clicking
              on them
            </li>
          </li>

          <li>
            Connection Menu with useful options:
            <ul>
              <li>
                Drag a connection from any input or output and release it on the
                empty canvas
              </li>
            </ul>
          </li>

          <li>
            Try to hover or right-click on elements for more options:
            <ul>
              <li>Buttons</li>
              <li>Parameters</li>
              <li>Node Header</li>
              <li>Canvas</li>
              <li>Node Selections</li>
              <li>Assets</li>
            </ul>
          </li>

          <li>
            Control the left and right panels by clicking, dragging the border,
            or using hotkeys 1 and 2
          </li>
          <b>Assets</b>
          <li>
            Drag assets (from your File Explorer / Finder) onto the Asset tab on
            the right to import them
          </li>
          <li>Drag and drop assets onto the canvas to create nodes</li>
          <li>
            Click on any asset in a node or inside the AssetBrowser to open the
            gallery
          </li>

          <b>Help</b>
          <li>
            Open the HelpMenu in the top right corner for more explanations and
            Keyboard Shortcuts
          </li>
          <li>
            Visit the{" "}
            <a
              href="https://forum.nodetool.ai"
              target="_blank"
              rel="noreferrer"
            >
              NodeTool forum
            </a>{" "}
            to ask questions and connect with others (also in the Links tab)
          </li>
          <li>Click outside to close this menu</li>
          <li>
            Click the NodeTool icon in the top left corner to open this menu
            again
          </li>
        </ul>
      </TabPanel>

      {/* RELEASE NOTES */}
      <TabPanel value={value} index={1}>
        <div className="release">
          <Typography variant="h5" color="#999">
            nodetool 0.1.52
          </Typography>
          <Typography className="body">
            <b>Additions</b>
            <ul>
              <li>Welcome screen</li>
              <li>Demucs node for audio separation </li>
            </ul>
            <b>Improvements</b>
            <ul>
              <li>fixed copy paste between tabs</li>
            </ul>
          </Typography>
        </div>
      </TabPanel>
      {/* LINKS */}
      <TabPanel value={value} index={2}>
        <Typography variant="h5" color="#999">
          Links
        </Typography>
        <div className="link">
          <a
            href="https://forum.nodetool.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            Forum
          </a>
          <div className="body">
            Go to the NodeTool forum for help and advise or share what you made.
          </div>
        </div>

        <div className="link">
          <a
            href="https://github.com/nodetool-ai/nodetool"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            GitHub
          </a>
          <div className="body">
            The source code for NodeTool is available on GitHub.
          </div>
        </div>
      </TabPanel>
    </div>
  );
};

export default Welcome;
