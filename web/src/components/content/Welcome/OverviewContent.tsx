import React, { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import ExamplesIcon from "@mui/icons-material/Fluorescent";
import SettingsIcon from "@mui/icons-material/Settings";
import QuestionMarkIcon from "@mui/icons-material/QuestionMark";

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
    title: "Welcome to NodeTool",
    defaultExpanded: true,
    content: (
      <Typography>
        <b>NodeTool – Visual AI Prototyping Studio</b>
        <br />
        Design, build, and run advanced AI agent systems—right on your own
        computer.
        <br />
        <br />
        <ul>
          <li>
            <b>🔒 Privacy-First & Fully Local:</b> Run all AI models locally for
            complete privacy and zero data transmission.
          </li>
          <li>
            <b>⚡ Visual Workflow Editor:</b> Prototype complex AI workflows
            with drag-and-drop simplicity—no coding required.
          </li>
          <li>
            <b>🤖 Advanced Agent Design:</b> Build multi-agent systems that
            plan, reason, and use tools like web browsing, file operations, and
            the tools you build in NodeTool.
          </li>
          <li>
            <b>💻 System Integration:</b> Control apps, clipboard, and browser
            with AI. Access your knowledge base and local files.
          </li>
          <li>
            <b>🌩️ Hybrid Cloud Integration:</b> Connect to OpenAI, Anthropic,
            Replicate, and other providers when needed—control what data is
            shared.
          </li>
        </ul>
        <b>
          Explore pre-built <ExamplesIcon /> Examples to get started.
        </b>
      </Typography>
    )
  },
  {
    id: "panel2",
    title: "Creating Workflows",
    content: (
      <>
        <Typography>
          Start building by creating a new workflow or exploring templates:
        </Typography>
        <ul>
          <li>
            Click <b>Workflows</b> in the top panel to browse and manage your
            projects.
          </li>
          <li>
            Use <b>New Workflow</b> to start from scratch or select a template
            for common AI tasks.
          </li>
        </ul>
        <Typography>
          Run your workflow by clicking the <b>Play</b> button. The active node
          is highlighted, and you can view detailed logs for longer processes.
        </Typography>
      </>
    )
  },
  {
    id: "panel3",
    title: "Using the Node Menu",
    content: (
      <>
        <Typography>Open the Node Menu in several ways:</Typography>
        <ul>
          <li>Double-click on the canvas</li>
          <li>
            Press <b>Space</b>
          </li>
          <li>Click the Node Menu button in the top panel</li>
          <li>
            Start a connection and release it on the canvas to filter node
            options
          </li>
        </ul>
        <Typography>
          Browse, search, and read descriptions to find the right node. Click a
          node&apos;s namespace to quickly find related nodes.
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
          <li>
            Connect nodes to create data flows—compatible connections are
            highlighted.
          </li>
          <li>Delete connections by right-clicking them.</li>
          <li>
            Change node values with left-click; changed values are highlighted.
          </li>
          <li>
            Reset values to default with <b>CTRL/⌘+right-click</b>.
          </li>
          <li>Adjust numbers by dragging horizontally or clicking.</li>
        </ul>
        <Typography variant="h3">Connection Menu</Typography>
        <Box sx={{ margin: "16px 0" }}>
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
            canvas for quick options:
            <ul>
              <li>Create a Preview node</li>
              <li>Create new input/output nodes (exposed to external apps)</li>
              <li>
                Create a constant node (for inputs) or save node (for outputs)
              </li>
              <li>
                Open the Node Menu with filtered options for compatible nodes
              </li>
            </ul>
          </li>
        </ul>
        <Typography variant="h3">Quick Connection</Typography>
        <Typography variant="body1">
          Drag a connection and drop it inside another node to auto-connect the
          first compatible input/output. Fastest way to link nodes.
        </Typography>
      </>
    )
  },
  {
    id: "panel5",
    title: "Interface Tips",
    content: (
      <>
        <Typography>
          Hover or right-click on elements for more options:
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
          Discover keyboard shortcuts by hovering over buttons and menu entries.
          See the <QuestionMarkIcon /> Help menu for a full list.
        </Typography>
        <Typography>
          Control the left panel menus by clicking or using hotkeys <kbd>1</kbd>{" "}
          to <kbd>5</kbd>.
        </Typography>
      </>
    )
  },
  {
    id: "panel6",
    title: "Asset Management",
    content: (
      <>
        <Typography>
          Manage your images, audio, video, and other media assets:
        </Typography>
        <ul>
          <li>
            Drag assets from your file explorer onto the Asset tab to import
          </li>
          <li>Drag assets onto the canvas to create constant nodes</li>
          <li>Double-click any asset to open it in the AssetViewer</li>
          <li>
            Right-click assets for more options (move, rename, delete, download,
            etc.)
          </li>
          <li>Select multiple assets with CTRL or SHIFT</li>
          <li>
            Move assets between folders by dragging or using the right-click
            menu
          </li>
          <li>Search and sort assets by name or date</li>
          <li>Rename assets with F2 (works with multiple selections)</li>
        </ul>
      </>
    )
  },
  {
    id: "panel7",
    title: "Advanced Features",
    content: (
      <>
        <ul>
          <li>
            <b>Vector Storage & RAG:</b> Built-in ChromaDB for storing/querying
            embeddings and building Retrieval-Augmented Generation workflows.
          </li>
          <li>
            <b>Global Chat Overlay:</b> Access and trigger AI workflows from
            anywhere on your desktop.
          </li>
          <li>
            <b>Mini-App Builder:</b> Turn workflows into desktop apps.
          </li>
          <li>
            <b>API Access:</b> Integrate NodeTool with external apps and
            services.
          </li>
          <li>
            <b>ComfyUI Integration (beta):</b> Import and run ComfyUI workflows
            directly in NodeTool.
          </li>
        </ul>
      </>
    )
  },
  {
    id: "panel8",
    title: "Settings",
    content: (
      <Typography variant="body1">
        Open the <SettingsIcon /> Settings menu (top right) to adjust the
        interface, set API keys and folder paths.
        <br />
      </Typography>
    )
  },
  {
    id: "panel9",
    title: "Help and Resources",
    content: (
      <ul>
        <li>
          Open the Help menu (top right) for more explanations and keyboard
          shortcuts
        </li>
        <li>
          Visit the{" "}
          <a href="https://forum.nodetool.ai" target="_blank" rel="noreferrer">
            NodeTool forum
          </a>{" "}
          to ask questions and connect with others
        </li>
        <li>
          Join our{" "}
          <a
            href="https://discord.gg/26m5xBwe"
            target="_blank"
            rel="noreferrer"
          >
            Discord Community
          </a>{" "}
          for support and sharing workflows
        </li>
        <li>Click the NodeTool icon (top left) to reopen this menu anytime</li>
      </ul>
    )
  }
];
