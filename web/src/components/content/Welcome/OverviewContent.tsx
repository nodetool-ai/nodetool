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
        NodeTool is a no-code AI development environment that simplifies
        creating and integrating AI workflows. With its node-based interface,
        you can build complex applications without programming. NodeTool enables
        seamless integration of advanced AI models, allowing the generation and
        editing of multimedia content like images, text, audio, and video in one
        workflow.
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
        <Typography variant="h6">Connection Menu</Typography>
        <ul>
          <li>
            Drag a connection from any input or output and release it on the
            empty canvas for useful options
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
          Drag assets (from your File Explorer / Finder) onto the Asset tab on
          the right to import them
        </li>
        <li>Drag and drop assets onto the canvas to create nodes</li>
        <li>
          Double-click on any asset in a node or inside the AssetBrowser to open
          the gallery
        </li>
      </ul>
    )
  },
  {
    id: "panel7",
    title: "Help and Resources",
    content: (
      <ul>
        <li>
          Open the Help Menu in the top right corner for more explanations and
          Keyboard Shortcuts
        </li>
        <li>
          Visit the NodeTool forum to ask questions and connect with others
        </li>
        <li>
          Click the NodeTool icon in the top left corner to open this menu again
        </li>
      </ul>
    )
  }
];
