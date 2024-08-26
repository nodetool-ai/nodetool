import React, { ReactNode } from "react";
import { Typography } from "@mui/material";

export interface Section {
  id: string;
  title: string;
  content: ReactNode;
  originalContent?: ReactNode;
}

export const overviewContents: Section[] = [
  {
    id: "panel1",
    title: "What is NodeTool?",
    content: (
      <Typography>
        NodeTool is a no-code development environment that simplifies creating
        AI workflows. With its node-based interface, you can build complex
        applications without programming.
        <br />
        <br />
        NodeTool enables seamless integration of advanced AI models, allowing
        the generation and editing of multimedia content including images, text,
        audio, and video - all in one workflow.
        <br />
        <br />
        NodeTool is designed to be user-friendly, but does not hide the
        complexity of AI models.
        <br />
        It provides a visual representation of the data flow, making it easy to
        understand and modify.
        <br />
        <br />
        <b>
          Try some of the pre-built examples in the Workflow menu to get
          inspired.
        </b>
      </Typography>
    ),
  },
  {
    id: "panel2",
    title: "Creating Workflows",
    content: (
      <>
        <ul>
          <li>
            Click Workflows in the top panel to browse and manage projects
          </li>
          <li>Edit the current workflow in the left panel</li>
          <li>Save workflows using the save button in the left panel</li>
          <li>Explore pre-built examples in the Workflow menu</li>
        </ul>
        <Typography>
          Run workflows with the Play Button in the bottom panel to see results.
          Note that some processes may take time to complete.
        </Typography>
      </>
    ),
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
      </>
    ),
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
        <Typography variant="h6">Connection Menu</Typography>
        <ul>
          <li>
            Drag a connection from any input or output and release it on the
            empty canvas for useful options
          </li>
        </ul>
      </>
    ),
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
          Control the left and right panels by clicking, dragging the border, or
          using hotkeys 1 and 2.
        </Typography>
      </>
    ),
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
    ),
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
    ),
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
    ),
  },
];
