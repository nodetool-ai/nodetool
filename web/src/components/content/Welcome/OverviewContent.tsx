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
        <ul>
          <li>
            <b>🔒 Privacy by design:</b> Your data stays local unless you opt‑in
            to third‑party nodes.
          </li>
          <li>
            <b>🧰 Own your stack:</b> Open source (AGPL). Fork, customize, and
            deploy your way—no lock‑in.
          </li>
          <li>
            <b>🚀 Production ready:</b> Start local, scale globally. One‑command
            deploys to your cloud.
          </li>
          <li>
            <b>🔌 Bring your own providers:</b> OpenAI, Anthropic, Hugging Face,
            Gemini, Replicate, Groq, Together, Cohere and more.
          </li>
        </ul>
        <b>
          Explore <ExamplesIcon /> Examples to get started fast.
        </b>
      </Typography>
    )
  },
  {
    id: "panel2",
    title: "Creating Workflows",
    content: (
      <>
        <Typography>From idea to production in 3 steps:</Typography>
        <ul>
          <li>
            <b>1. Build:</b> Drag nodes to design workflows—no code.
          </li>
          <li>
            <b>2. Run:</b> Test locally. Data stays on your machine by default.
          </li>
          <li>
            <b>3. Deploy:</b> Deploy with one command to your cloud.
          </li>
        </ul>
        <Typography>Start a new workflow or explore templates:</Typography>
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
    title: "Organize Everything (Assets)",
    content: (
      <>
        <Typography>Built‑in Asset Manager for all your media:</Typography>
        <ul>
          <li>
            <b>Smart Import & Organization:</b> Drag and drop files. Auto‑organized
            by type, project, or tags.
          </li>
          <li>
            <b>Preview Everything:</b> Instant previews for images, audio, video,
            and documents.
          </li>
          <li>
            <b>Workflow Integration:</b> Drag assets onto the canvas to create
            constants or connect them in one click.
          </li>
          <li>
            <b>Manage at scale:</b> Multi‑select, rename (F2), move, search, and
            sort by name or date.
          </li>
          <li>
            <b>Formats:</b> PNG, JPG, GIF, SVG, WebP, MP3, WAV, MP4, MOV, AVI,
            PDF, TXT, JSON, CSV, DOCX
          </li>
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
            <b>Multimodal:</b> Text, image, audio, and video workflows.
          </li>
          <li>
            <b>Built‑in Memory:</b> ChromaDB for RAG—no extra setup.
          </li>
          <li>
            <b>Observability:</b> Logs, traces, and error details to debug fast.
          </li>
          <li>
            <b>API Access:</b> OpenAI‑compatible API for easy integration.
          </li>
          <li>
            <b>Global Chat Overlay:</b> Access and trigger workflows anywhere on
            your desktop.
          </li>
          <li>
            <b>Mini‑App Builder:</b> Turn workflows into desktop apps.
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
    id: "panel7b",
    title: "Deploy Anywhere",
    content: (
      <>
        <Typography>
          Deploy from laptop to production in minutes. One‑command deploys, GPU
          auto‑scaling, and portable workflows across environments.
        </Typography>
        <ul>
          <li>
            <b>Serverless GPUs:</b> Run on providers like RunPod with global
            regions and flexible pricing.
          </li>
          <li>
            <b>Auto‑scaling:</b> Scale to zero when idle; burst to hundreds of
            workers on demand.
          </li>
          <li>
            <b>Enterprise features:</b> Network storage, custom Docker, and fast
            cold starts.
          </li>
        </ul>
      </>
    )
  },
  {
    id: "panel7c",
    title: "Bring Your Own Providers",
    content: (
      <>
        <Typography>
          Connect your own keys and mix providers in one workflow. Switch models
          without code changes.
        </Typography>
        <ul>
          <li>OpenAI, Anthropic, Hugging Face, Gemini</li>
          <li>Replicate, Groq, Together, Cohere</li>
          <li>And more—choose per node where it runs</li>
        </ul>
      </>
    )
  },
  {
    id: "panel7d",
    title: "Agent Tools",
    content: (
      <>
        <Typography>Extensible tools for AI agents to interact with the world:</Typography>
        <ul>
          <li>
            <b>Web & Search:</b> Browser automation, scraping, Google Search,
            SERP API, screenshots, HTTP requests
          </li>
          <li>
            <b>Content Processing:</b> PDF extraction, TTS, image generation,
            email, Markdown
          </li>
          <li>
            <b>Data & Analytics:</b> Vector search, math, statistics, geometry,
            unit conversion, ChromaDB indexing
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
        interface, set API keys and folder paths. Bring your own keys for
        OpenAI, Anthropic, Hugging Face, Replicate, and more.
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
