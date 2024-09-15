import React, { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

export interface Section {
  id: string;
  title: string;
  content: ReactNode;
  originalContent?: ReactNode;
  defaultExpanded?: boolean;
}

export const overviewContents: Section[] = [
  {
    id: "panel1",
    title: "What is NodeTool?",
    defaultExpanded: true,
    content: (
      <Typography>
        NodeTool is a user-friendly platform that helps you create AI workflows
        without needing to code.
        <br />
        <br />
        With NodeTool, you can integrate advanced AI models to create and edit
        multimedia content like images, text, audio, and video, all within a
        single workflow.
        <br />
        <br />
        NodeTool makes it simple to see and modify how data flows through your
        project, giving you a clear picture of what's happening.
        <br />
        <br />
        <b>
          Check out the pre-built examples in the Workflow menu to get started
          and see what's possible.
        </b>
      </Typography>
    )
  },
  {
    id: "panel2",
    title: "Creating Workflows",
    content: (
      <>
        <ul>
          <li>
            Click on "Workflows" in the top panel to browse and manage your
            projects.
          </li>
          <li>Edit your current workflow in the "Workflow" panel.</li>
          <li>
            Save your workflows using the save button.
            <br />
            Any changes to the Name, Description, and Tooltip will be saved
            automatically.
          </li>
          <li>
            Explore the pre-built examples in the "Workflow" menu to get started
            quickly.
          </li>
        </ul>
        <Typography>
          Run your workflows by clicking the Play Button in the bottom panel to
          see the results.
          <br />
          Please be patient, as some processes may take a little time to start
          up or complete.
          <br />
          The node currently being processed will be indicated by an animation
          in the node header.
          <br />
          For longer-running nodes, you can expand the Log at the bottom to see
          more details.
          <br />
        </Typography>
      </>
    )
  },
  {
    id: "panel3",
    title: "Using the Node Menu",
    content: (
      <>
        <Typography>Open the Node Menu in three ways:</Typography>
        <ul>
          <li>Double-click the canvas</li>
          <li>Press CTRL+Space</li>
          <li>Click the Nodes Button (circle icon) in the top panel</li>
        </ul>
        <Typography>
          Inside the Node Menu, read the description to learn how to browse and
          create nodes.
        </Typography>
        <Typography>
          Click on the namespace.name at the bottom of every node to find the
          node in the NodeMenu - this can be useful to quickly find similar
          nodes.
        </Typography>
      </>
    )
  },
  {
    id: "panel4",
    title: "Working with Nodes",
    content: (
      <>
        <ul>
          <li>Connect nodes to create data flows</li>
          <li>Compatible connections are highlighted while connecting</li>
          <li>Delete connections by right-clicking them</li>
          <li>Change node values with left-click</li>
          <li>Changed values appear highlighted</li>
          <li>Reset values to default with CTRL+Right-click</li>
          <li>Adjust number values by dragging horizontally or clicking</li>
        </ul>
        <Typography variant="h3">Connection Menu</Typography>
        <Box sx={{ textAlign: "center", margin: "16px 0" }}>
          <img
            src="/images/help/connection_menu.png"
            alt="Connection Menu"
            style={{
              maxWidth: "100%",
              height: "auto",
              borderRadius: "4px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
            }}
          />
        </Box>
        <ul>
          <li>
            Drag a connection from any input or output and release it on the
            empty canvas for useful options:
            <ul>
              <li>Create a Preview node</li>
              <li>
                Create a new input or output node.
                <br /> These nodes will be exposed to the outside world when
                running nodetool workflows from other applications like
                websites, mobile apps or vvvv.
              </li>
              <li>For inputs: Create a constant node</li>
              <li>For outputs: Create a save node</li>
              <li>
                Input or Output: Open the Node Menu with filtered options to
                only see matching nodes
              </li>
            </ul>
          </li>
        </ul>
      </>
    )
  },
  {
    id: "panel5",
    title: "Interface Tips",
    content: (
      <>
        <Typography>
          Try to hover or right-click on elements for more options:
        </Typography>
        <ul>
          <li>Buttons</li>
          <li>Parameters</li>
          <li>Node Header</li>
          <li>Canvas</li>
          <li>Node Selections</li>
          <li>Assets</li>
        </ul>

        <Typography>
          You can discover most of the keyboard shortcuts by hovering over
          buttons and context menu entries.
          <br />
          Go to the Help menu for a complete list of available shortcuts.
        </Typography>
        <Typography>
          Control the left and right panels by clicking, dragging the border, or
          using hotkeys 1 and 2.
        </Typography>
      </>
    )
  },
  {
    id: "panel6",
    title: "Asset Management",
    content: (
      <ul>
        <li>
          Drag assets (from FileExplorer / Finder) onto the Asset tab on the
          right to import them
        </li>
        <li>Drag assets onto the canvas to create constant nodes</li>
        <li>
          Double-click on any asset in a node or inside the ASSETS panel to open
          it in the AssetViewer
        </li>
        <li>
          Right-click on any asset to open the Asset Menu for more options
        </li>
        <li>
          <b>Select</b> multiple assets by holding CTRL or SHIFT
        </li>
        <li>
          <b>Move</b> assets between folders by dragging them onto the desired
          folder,
          <br />
          or use the right click menu for moving them into nested folders
        </li>
        <li>
          <b>Search</b> for assets by typing in the search bar
        </li>
        <li>
          <b>Sort</b> assets by clicking on the name or date buttons
        </li>
        <li>
          <b>Download</b>: select one or more assets and use the right click
          menu
        </li>
        <li>
          <b>Delete</b>: right click menu or X button
        </li>
        <li>
          <b>Rename</b>: right click menu or press F2 key (also works with
          multiple assets)
        </li>
      </ul>
    )
  },
  {
    id: "panel7",
    title: "Settings",
    content: (
      <Typography variant="body1">
        Open the SettingsMenu in the top right corner to adjust the interface.
        <br />
        <b>Note:</b> The settings are only saved in your browser.
      </Typography>
    )
  },
  {
    id: "panel8",
    title: "Help and Resources",
    content: (
      <ul>
        <li>
          Open the HelpMenu in the top right corner for more explanations and
          Keyboard Shortcuts
        </li>
        <li>
          Visit the{" "}
          <a href="https://forum.nodetool.ai" target="_blank" rel="noreferrer">
            {" "}
            NodeTool forum
          </a>{" "}
          to ask questions and connect with others
        </li>
        <li>
          Click the NodeTool icon in the top left corner to open this menu again
        </li>
      </ul>
    )
  }
];
