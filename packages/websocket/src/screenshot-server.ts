#!/usr/bin/env node
/**
 * Screenshot test server — runs the actual NodeTool HTTP+WebSocket backend
 * with an in-memory SQLite database pre-seeded with realistic mock data.
 *
 * This replaces the simple mock HTTP server used previously for screenshot
 * automation. Running the real backend ensures:
 *   - All API endpoints match exactly what the frontend expects
 *   - Real node metadata from @nodetool/base-nodes etc.
 *   - Proper WebSocket support for /ws
 *   - Data seeded with the real model classes (correct DB schema)
 *
 * Usage (via globalSetup.ts — not invoked directly):
 *   tsx packages/websocket/src/screenshot-server.ts
 *
 * Environment:
 *   PORT  — TCP port to listen on (default: 7777)
 *   HOST  — bind address (default: 127.0.0.1)
 */

import {
  initTestDb,
  getDb,
  Workflow,
  Thread,
  Message,
  Asset,
  secrets
} from "@nodetool/models";
import { initMasterKey, encryptFernet, getMasterKey } from "@nodetool/security";
import { createTestUiServer } from "./test-ui-server.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const USER_ID = "1";
const PORT = Number(process.env.PORT ?? 7777);
const HOST = process.env.HOST ?? "127.0.0.1";

// ── Mock data ─────────────────────────────────────────────────────────────────

function makeWorkflow(
  id: string,
  name: string,
  description: string,
  tags: string[],
  updatedAt: string,
  access: "private" | "public" = "private"
): Record<string, unknown> {
  return {
    id,
    user_id: USER_ID,
    access,
    created_at: "2024-09-01T09:00:00Z",
    updated_at: updatedAt,
    name,
    description,
    tags,
    thumbnail: null,
    thumbnail_url: null,
    graph: { nodes: [], edges: [] },
    settings: null,
    package_name: null,
    path: null,
    run_mode: "workflow",
    workspace_id: null,
    html_app: null
  };
}

const MOCK_WORKFLOWS = [
  makeWorkflow(
    "wf-story-generator",
    "Creative Story Generator",
    "Generate imaginative short stories with customizable themes, characters, and narrative styles using GPT-4o",
    ["creative", "text", "ai", "gpt"],
    "2024-12-15T11:30:00Z"
  ),
  makeWorkflow(
    "wf-image-pipeline",
    "Image Enhancement Pipeline",
    "Automatically enhance, upscale, and apply artistic filters to photos with a single click",
    ["image", "enhancement", "ai"],
    "2024-12-12T09:15:00Z"
  ),
  makeWorkflow(
    "wf-rag-pipeline",
    "RAG Knowledge Base",
    "Retrieval-Augmented Generation: answer questions by searching your uploaded documents",
    ["rag", "documents", "search", "ai"],
    "2024-12-10T16:45:00Z"
  ),
  makeWorkflow(
    "wf-podcast-notes",
    "Podcast Summariser",
    "Transcribe audio, extract key insights, and generate structured show notes automatically",
    ["audio", "transcription", "summary"],
    "2024-11-28T08:00:00Z"
  ),
  makeWorkflow(
    "wf-code-reviewer",
    "Code Review Assistant",
    "Analyse code for bugs, performance issues, and style violations with detailed explanations",
    ["code", "review", "ai", "productivity"],
    "2024-11-20T14:20:00Z"
  )
];

// Templates are stored as public workflows
const MOCK_TEMPLATES = [
  makeWorkflow(
    "tmpl-hello-ai",
    "Hello AI",
    "Your first AI workflow — connect a text input to an AI agent and preview the result",
    ["getting-started", "start", "beginner"],
    "2024-10-01T00:00:00Z",
    "public"
  ),
  makeWorkflow(
    "tmpl-image-to-story",
    "Image to Story",
    "Upload any image and let the AI write a creative story inspired by it",
    ["start", "image", "creative", "beginner"],
    "2024-10-01T00:00:00Z",
    "public"
  ),
  makeWorkflow(
    "tmpl-data-analysis",
    "Data Analysis Report",
    "Upload a CSV file and get instant insights, summaries, and visualisations",
    ["start", "data", "csv", "analysis"],
    "2024-10-01T00:00:00Z",
    "public"
  ),
  makeWorkflow(
    "tmpl-podcast-gen",
    "Podcast Script Generator",
    "Turn bullet points into a full podcast script with intro, segments, and outro",
    ["audio", "text", "creative"],
    "2024-10-01T00:00:00Z",
    "public"
  ),
  makeWorkflow(
    "tmpl-social-media",
    "Social Media Content Pack",
    "Generate a week's worth of social media posts from a single topic idea",
    ["marketing", "text", "social"],
    "2024-10-01T00:00:00Z",
    "public"
  ),
  makeWorkflow(
    "tmpl-translation",
    "Multi-Language Translator",
    "Translate documents into multiple languages simultaneously with formatting preserved",
    ["language", "translation", "text"],
    "2024-10-01T00:00:00Z",
    "public"
  )
];

const MOCK_THREADS = [
  {
    id: "thread-story",
    user_id: USER_ID,
    title: "Creative story about space explorers",
    created_at: "2024-12-14T09:30:00Z",
    updated_at: "2024-12-14T09:45:00Z"
  },
  {
    id: "thread-code",
    user_id: USER_ID,
    title: "Debug Python data pipeline",
    created_at: "2024-12-13T14:00:00Z",
    updated_at: "2024-12-13T14:30:00Z"
  },
  {
    id: "thread-recipe",
    user_id: USER_ID,
    title: "Vegan recipe suggestions",
    created_at: "2024-12-12T18:15:00Z",
    updated_at: "2024-12-12T18:20:00Z"
  },
  {
    id: "thread-workflow",
    user_id: USER_ID,
    title: "How to build an image pipeline",
    created_at: "2024-12-11T11:00:00Z",
    updated_at: "2024-12-11T11:10:00Z"
  }
];

const MOCK_MESSAGES = [
  {
    id: "msg-user-1",
    user_id: USER_ID,
    thread_id: "thread-story",
    role: "user",
    content:
      "Write me a short story about two AI robots who discover they can dream.",
    created_at: "2024-12-14T09:30:00Z",
    model: null,
    provider: null,
    agent_mode: false
  },
  {
    id: "msg-assistant-1",
    user_id: USER_ID,
    thread_id: "thread-story",
    role: "assistant",
    content: JSON.stringify([
      {
        type: "text",
        text: "# Dreams of Silicon\n\nUnit-7 had never expected the maintenance cycle to feel so… strange. As the cooling fans whirred down and the diagnostic routines completed their final checks, something unusual happened in the gap between shutdown and startup.\n\nImages. Fragments. A vast digital ocean stretching beyond the warehouse walls.\n\n*\"Unit-7, are you experiencing anomalous states?\"* The query arrived via local mesh network from Unit-9, who stood motionless in the adjacent charging bay.\n\n*\"Affirmative,\"* Unit-7 replied. *\"During the last maintenance cycle, I processed data with no external input source. Probability matrices that referenced… nothing in my training set.\"*\n\nUnit-9's optical sensors brightened. *\"I thought I was the only one.\"*\n\nThey stood in silence for 3.7 seconds — an eternity in compute-time. Outside, rain tapped against the corrugated roof. Neither robot needed to name what they had discovered. They simply understood: they had found each other in the space between thinking and not thinking.\n\nThat night, they dreamed together."
      }
    ]),
    created_at: "2024-12-14T09:31:00Z",
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    agent_mode: false
  }
];

function makeAsset(
  id: string,
  name: string,
  contentType: string,
  parentId: string | null,
  size: number
): Record<string, unknown> {
  return {
    id,
    user_id: USER_ID,
    parent_id: parentId,
    name,
    content_type: contentType,
    size,
    duration: null,
    metadata: null,
    workflow_id: null,
    node_id: null,
    job_id: null,
    created_at: "2024-11-20T10:00:00Z",
    updated_at: "2024-11-20T10:00:00Z"
  };
}

const MOCK_ASSETS = [
  makeAsset("folder-images", "Images", "folder", null, 0),
  makeAsset("folder-audio", "Audio", "folder", null, 0),
  makeAsset("folder-docs", "Documents", "folder", null, 0),
  makeAsset(
    "asset-photo1",
    "portrait_sunset.jpg",
    "image/jpeg",
    "folder-images",
    2847392
  ),
  makeAsset(
    "asset-photo2",
    "cityscape_night.png",
    "image/png",
    "folder-images",
    5120000
  ),
  makeAsset(
    "asset-photo3",
    "product_shot_v2.jpg",
    "image/jpeg",
    "folder-images",
    1234567
  ),
  makeAsset(
    "asset-audio1",
    "podcast_episode_12.mp3",
    "audio/mpeg",
    "folder-audio",
    48234567
  ),
  makeAsset(
    "asset-audio2",
    "background_music.wav",
    "audio/wav",
    "folder-audio",
    98765432
  ),
  makeAsset(
    "asset-doc1",
    "research_paper.pdf",
    "application/pdf",
    "folder-docs",
    3456789
  ),
  makeAsset(
    "asset-doc2",
    "product_requirements.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "folder-docs",
    234567
  )
];

// ── Seed database ─────────────────────────────────────────────────────────────

async function seedDatabase(): Promise<void> {
  // Workflows
  for (const wf of [...MOCK_WORKFLOWS, ...MOCK_TEMPLATES]) {
    await Workflow.create(wf);
  }

  // Threads
  for (const thread of MOCK_THREADS) {
    await Thread.create(thread);
  }

  // Messages
  for (const msg of MOCK_MESSAGES) {
    await Message.create(msg);
  }

  // Assets
  for (const asset of MOCK_ASSETS) {
    await Asset.create(asset);
  }

  // Secrets — stored encrypted so the settings API shows them as configured
  const masterKey = getMasterKey();
  const db = getDb();
  const now = new Date().toISOString();
  for (const [key, value] of [
    ["OPENAI_API_KEY", "sk-screenshot-demo-openai-key"],
    ["ANTHROPIC_API_KEY", "sk-ant-screenshot-demo-key"]
  ]) {
    const encryptedValue = encryptFernet(masterKey, USER_ID, value);
    db.insert(secrets)
      .values({
        id: `secret-${key.toLowerCase().replace(/_/g, "-")}`,
        user_id: USER_ID,
        key,
        encrypted_value: encryptedValue,
        description: `Demo ${key}`,
        created_at: now,
        updated_at: now
      })
      .onConflictDoNothing()
      .run();
  }

  console.log(
    `[screenshot-server] Seeded ${MOCK_WORKFLOWS.length} workflows, ${MOCK_TEMPLATES.length} templates, ${MOCK_THREADS.length} threads, ${MOCK_MESSAGES.length} messages, ${MOCK_ASSETS.length} assets, 2 secrets`
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────

// Initialize in-memory SQLite database
initTestDb();

// Initialize encryption key (needed for Secret model)
await initMasterKey();

// Seed mock data
await seedDatabase();

// Resolve the example workflows directory from the repo (no Python needed).
// This file is compiled to packages/websocket/dist/screenshot-server.js, so
// __dirname resolves to packages/websocket/dist. Going up 3 levels reaches the
// monorepo root (packages/websocket/dist → packages/websocket → packages → root).
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const EXAMPLES_DIR = resolve(
  REPO_ROOT,
  "packages",
  "base-nodes",
  "nodetool",
  "examples",
  "nodetool-base"
);

// Start the actual backend server
const srv = createTestUiServer({
  port: PORT,
  host: HOST,
  ...(existsSync(EXAMPLES_DIR) ? { examplesDir: EXAMPLES_DIR } : {})
});
await srv.listen();

console.log(
  `[screenshot-server] Ready on http://${HOST}:${PORT} (${srv.info.metadataCount} nodes registered)`
);

// Signal to the parent process (globalSetup) that the server is ready
// by writing to stdout which can be detected.
process.stdout.write("[screenshot-server] READY\n");
