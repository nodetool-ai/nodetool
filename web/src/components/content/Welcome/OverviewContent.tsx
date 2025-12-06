import React, { ReactNode } from "react";
import { Typography } from "@mui/material";

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
      <>
        <Typography>
          NodeTool is the local-first canvas for building AI workflows. Compose
          text, audio, video, and automation nodes on one graph, run them on
          your machine, then ship the same workflow to RunPod, Cloud Run, or
          your own infrastructure when you need scale.
        </Typography>
        <ul>
          <li>
            <b>Visual first:</b> Drag-and-drop nodes, preview intermediate
            results, and keep your graph as the single source of truth.
          </li>
          <li>
            <b>Local by default:</b> Data stays on your device unless you attach
            a provider. Opt into APIs only when you need them.
          </li>
          <li>
            <b>Deployable:</b> Trigger the same workflow from Global Chat, the
            CLI, APIs, or Mini-Apps without rewrites.
          </li>
        </ul>
      </>
    )
  },
  {
    id: "panel2",
    title: "Start Here",
    content: (
      <>
        <Typography>
          NodeTool is your local-first canvas for building AI workflows that can
          run identically on your laptop or in the cloud.
        </Typography>
        <ul>
          <li>
            <b>Dashboard:</b> Home for workflows, templates, and chats.
          </li>
          <li>
            <b>Workflow Editor:</b> The graph where you connect nodes and run
            them.
          </li>
          <li>
            <b>Global Chat:</b> Full-screen assistant that can trigger
            workflows.
          </li>
          <li>
            <b>Mini-Apps:</b> Form-based UIs generated from your workflow
            inputs.
          </li>
          <li>
            <b>Assets and Models:</b> Manage files and model downloads in one
            place.
          </li>
        </ul>
        <Typography>
          Want a full walkthrough? Read the{" "}
          <a
            href="https://docs.nodetool.ai/user-interface"
            target="_blank"
            rel="noreferrer"
          >
            User Interface tour
          </a>
          .
        </Typography>
      </>
    )
  },
  {
    id: "panel3",
    title: "What you can build right away",
    content: (
      <>
        <Typography>
          The docs highlight four fast-start patterns from the gallery and
          cookbook:
        </Typography>
        <ul>
          <li>
            <b>LLM agents with tool access:</b> Plan, call tools, and stream
            progress updates.{" "}
            <a
              href="https://docs.nodetool.ai/cookbook/patterns#pattern-2-agent-driven-generation"
              target="_blank"
              rel="noreferrer"
            >
              Agent pattern
            </a>{" "}
            ·{" "}
            <a
              href="https://docs.nodetool.ai/workflows/realtime-agent"
              target="_blank"
              rel="noreferrer"
            >
              Realtime Agent example
            </a>
          </li>
          <li>
            <b>Retrieval-augmented generation:</b> Ingest PDFs, chunk text, and
            answer with citations.{" "}
            <a
              href="https://docs.nodetool.ai/cookbook/patterns#pattern-4-rag-retrieval-augmented-generation"
              target="_blank"
              rel="noreferrer"
            >
              RAG pattern
            </a>{" "}
            ·{" "}
            <a
              href="https://docs.nodetool.ai/workflows/chat-with-docs"
              target="_blank"
              rel="noreferrer"
            >
              Chat with Docs example
            </a>
          </li>
          <li>
            <b>Audio and video pipelines:</b> Transcribe, edit, caption, and
            narrate.{" "}
            <a
              href="https://docs.nodetool.ai/workflows/transcribe-audio"
              target="_blank"
              rel="noreferrer"
            >
              Transcribe Audio example
            </a>{" "}
            ·{" "}
            <a
              href="https://docs.nodetool.ai/workflows/story-to-video-generator"
              target="_blank"
              rel="noreferrer"
            >
              Story to Video example
            </a>
          </li>
          <li>
            <b>Data automation and visualization:</b> Fetch, transform, and
            publish dashboards.{" "}
            <a
              href="https://docs.nodetool.ai/workflows/data-visualization-pipeline"
              target="_blank"
              rel="noreferrer"
            >
              Data Viz pipeline
            </a>{" "}
            ·{" "}
            <a
              href="https://docs.nodetool.ai/cookbook/patterns#pattern-10-data-processing-pipeline"
              target="_blank"
              rel="noreferrer"
            >
              Data processing pattern
            </a>
          </li>
        </ul>
      </>
    )
  },
  {
    id: "panel4",
    title: "Your first 10 minutes",
    content: (
      <>
        <Typography>
          Follow the golden path from the docs to get a working workflow in a
          few minutes:
        </Typography>
        <ol>
          <li>
            <a
              href="https://docs.nodetool.ai/installation"
              target="_blank"
              rel="noreferrer"
            >
              Install NodeTool
            </a>{" "}
            and launch it.
          </li>
          <li>
            Open <b>Models → Model Manager</b> and install <b>GPT-OSS</b> plus{" "}
            <b>Flux</b> for fast local runs.
          </li>
          <li>
            From Templates, open <b>Creative Story Ideas</b> and press{" "}
            <b>Run</b> to watch Preview stream results.
          </li>
          <li>
            Save it and trigger the same workflow from <b>Global Chat</b>.
          </li>
          <li>
            Click <b>Mini-App</b> to publish a simple form UI backed by the same
            graph.
          </li>
        </ol>
        <Typography>
          Full walkthrough:{" "}
          <a
            href="https://docs.nodetool.ai/getting-started"
            target="_blank"
            rel="noreferrer"
          >
            Getting Started guide
          </a>
          .
        </Typography>
      </>
    )
  },
  {
    id: "panel5",
    title: "Choose your path",
    content: (
      <>
        <Typography>
          Jump to the doc section that matches what you need:
        </Typography>
        <ul>
          <li>
            <a
              href="https://docs.nodetool.ai/getting-started"
              target="_blank"
              rel="noreferrer"
            >
              Getting Started
            </a>{" "}
            for the full tutorial.
          </li>
          <li>
            <a
              href="https://docs.nodetool.ai/workflows/"
              target="_blank"
              rel="noreferrer"
            >
              Examples gallery
            </a>{" "}
            for ready-made workflows.
          </li>
          <li>
            <a
              href="https://docs.nodetool.ai/cookbook"
              target="_blank"
              rel="noreferrer"
            >
              Workflow cookbook
            </a>{" "}
            for patterns you can remix.
          </li>
          <li>
            <a
              href="https://docs.nodetool.ai/key-concepts"
              target="_blank"
              rel="noreferrer"
            >
              Core concepts
            </a>{" "}
            and{" "}
            <a
              href="https://docs.nodetool.ai/user-interface"
              target="_blank"
              rel="noreferrer"
            >
              UI tour
            </a>{" "}
            to master the editor.
          </li>
          <li>
            <a
              href="https://docs.nodetool.ai/deployment"
              target="_blank"
              rel="noreferrer"
            >
              Deployment
            </a>{" "}
            and{" "}
            <a
              href="https://docs.nodetool.ai/deployment-journeys"
              target="_blank"
              rel="noreferrer"
            >
              deployment journeys
            </a>{" "}
            for shipping to production.
          </li>
        </ul>
      </>
    )
  },
  {
    id: "panel6",
    title: "Local-first or cloud-augmented",
    content: (
      <>
        <Typography variant="subtitle1">Local-only mode</Typography>
        <ul>
          <li>Workflows, assets, and models stay on your machine.</li>
          <li>Use MLX, llama.cpp, Whisper, and Flux locally.</li>
          <li>Disable outbound traffic entirely if needed.</li>
        </ul>
        <Typography variant="subtitle1">Cloud-augmented mode</Typography>
        <ul>
          <li>Mix local nodes with OpenAI, Anthropic, or RunPod workers.</li>
          <li>Configure API keys in <b>Settings → Providers</b>.</li>
          <li>
            Deploy the same workflow to RunPod or Cloud Run when you need
            capacity.
          </li>
        </ul>
        <Typography>
          Learn more in{" "}
          <a
            href="https://docs.nodetool.ai/models-and-providers"
            target="_blank"
            rel="noreferrer"
          >
            Models & Providers
          </a>{" "}
          or the{" "}
          <a
            href="https://docs.nodetool.ai/storage"
            target="_blank"
            rel="noreferrer"
          >
            Storage guide
          </a>
          .
        </Typography>
      </>
    )
  },
  {
    id: "panel7",
    title: "Where you'll spend time",
    content: (
      <>
        <Typography>
          Keep these core surfaces in mind as you move around NodeTool:
        </Typography>
        <ul>
          <li>
            <b>Dashboard:</b> Organize workflows, templates, and chats.
          </li>
          <li>
            <b>Workflow Editor:</b> Build and run graphs with previews.
          </li>
          <li>
            <b>Global Chat:</b> Trigger workflows conversationally and let the
            agent use tools.
          </li>
          <li>
            <b>Mini-Apps:</b> Hand teammates a simple form UI backed by your
            workflow.
          </li>
          <li>
            <b>Assets and Models:</b> Manage files, downloads, and providers.
          </li>
          <li>
            <b>Command Menu:</b> Press Alt+K or Cmd+K to jump anywhere fast.
          </li>
        </ul>
        <Typography>
          See the{" "}
          <a
            href="https://docs.nodetool.ai/user-interface"
            target="_blank"
            rel="noreferrer"
          >
            User Interface guide
          </a>{" "}
          for screenshots and shortcuts.
        </Typography>
      </>
    )
  },
  {
    id: "panel8",
    title: "Build with the community",
    content: (
      <>
        <Typography>
          NodeTool is open source (AGPL-3.0). Share what you build and learn
          from others:
        </Typography>
        <ul>
          <li>
            Join the{" "}
            <a
              href="https://discord.gg/WmQTWZRcYE"
              target="_blank"
              rel="noreferrer"
            >
              Discord community
            </a>{" "}
            for support and showcase sessions.
          </li>
          <li>
            Browse the{" "}
            <a
              href="https://github.com/nodetool-ai/nodetool"
              target="_blank"
              rel="noreferrer"
            >
              GitHub repo
            </a>{" "}
            or contribute docs at{" "}
            <a
              href="https://docs.nodetool.ai"
              target="_blank"
              rel="noreferrer"
            >
              docs.nodetool.ai
            </a>
            .
          </li>
          <li>Click the NodeTool icon (top left) to reopen this menu anytime.</li>
        </ul>
      </>
    )
  }
];
