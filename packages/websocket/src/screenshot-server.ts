#!/usr/bin/env node
/**
 * Screenshot test server — runs the actual NodeTool HTTP+WebSocket backend
 * with an in-memory SQLite database pre-seeded with realistic mock data.
 *
 * This replaces the simple mock HTTP server used previously for screenshot
 * automation. Running the real backend ensures:
 *   - All API endpoints match exactly what the frontend expects
 *   - Real node metadata from @nodetool-ai/base-nodes etc.
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
  ImageDocument,
  TimelineSequence,
  Storyboard,
  secrets
} from "@nodetool-ai/models";
import {
  initMasterKey,
  encryptFernet,
  getMasterKey
} from "@nodetool-ai/security";
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
  access: "private" | "public" = "private",
  graph: { nodes: unknown[]; edges: unknown[] } = { nodes: [], edges: [] }
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
    graph,
    settings: null,
    package_name: null,
    path: null,
    run_mode: "workflow",
    workspace_id: null,
    html_app: null,
    app_doc: null
  };
}

// Use real node types registered by @nodetool-ai/base-nodes so the editor
// renders nodes instead of crashing on unknown types.
const STORY_GRAPH = {
  nodes: [
    {
      id: "input-topic",
      type: "nodetool.input.StringInput",
      data: {
        name: "topic",
        label: "Topic",
        value: "Two robots discover they can dream"
      },
      ui_properties: { position: { x: 0, y: 0 }, width: 320 }
    },
    {
      id: "input-style",
      type: "nodetool.input.StringInput",
      data: {
        name: "style",
        label: "Style",
        value: "Heartwarming sci-fi short story"
      },
      ui_properties: { position: { x: 0, y: 220 }, width: 320 }
    },
    {
      id: "agent-main",
      type: "nodetool.agents.Agent",
      data: {
        objective:
          "Write a concise short story matching the supplied topic and style."
      },
      ui_properties: { position: { x: 460, y: 100 }, width: 360 }
    },
    {
      id: "preview-output",
      type: "nodetool.workflows.base_node.Preview",
      data: {},
      ui_properties: { position: { x: 900, y: 80 }, width: 280 }
    },
    {
      id: "output-story",
      type: "nodetool.output.Output",
      data: {
        name: "story",
        description: "The generated short story"
      },
      ui_properties: { position: { x: 900, y: 280 }, width: 280 }
    }
  ],
  edges: [
    {
      id: "edge-topic",
      source: "input-topic",
      sourceHandle: "output",
      target: "agent-main",
      targetHandle: "objective"
    },
    {
      id: "edge-preview",
      source: "agent-main",
      sourceHandle: "output",
      target: "preview-output",
      targetHandle: "value"
    },
    {
      id: "edge-output",
      source: "agent-main",
      sourceHandle: "output",
      target: "output-story",
      targetHandle: "value"
    }
  ]
};

const MOCK_WORKFLOWS = [
  makeWorkflow(
    "wf-story-generator",
    "Creative Story Generator",
    "Generate imaginative short stories with customizable themes, characters, and narrative styles using GPT-4o",
    ["creative", "text", "ai", "gpt"],
    "2024-12-15T11:30:00Z",
    "private",
    STORY_GRAPH
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
  ),
  makeWorkflow(
    "wf-blog-writer",
    "SEO Blog Writer",
    "Generate long-form blog articles optimised for search, with internal links and meta description",
    ["text", "seo", "marketing"],
    "2024-11-15T10:05:00Z"
  ),
  makeWorkflow(
    "wf-video-shorts",
    "Video Shorts Composer",
    "Cut a long video into platform-ready short clips with auto-generated captions and music",
    ["video", "social", "automation"],
    "2024-11-10T17:40:00Z"
  ),
  makeWorkflow(
    "wf-customer-support",
    "Customer Support Triage",
    "Classify incoming tickets, draft responses, and assign them to the right team member",
    ["support", "automation", "ai"],
    "2024-11-04T12:00:00Z"
  ),
  makeWorkflow(
    "wf-product-photos",
    "Product Photo Studio",
    "Remove backgrounds, swap them for branded scenes, and export in marketplace dimensions",
    ["image", "ecommerce", "automation"],
    "2024-10-29T15:30:00Z"
  ),
  makeWorkflow(
    "wf-meeting-notes",
    "Meeting Notes Distiller",
    "Turn raw transcripts into action items, decisions, and a follow-up email draft",
    ["productivity", "summary", "text"],
    "2024-10-22T08:25:00Z"
  ),
  makeWorkflow(
    "wf-music-mood",
    "Music Mood Mixer",
    "Generate ambient soundtracks that match the mood of an input image or text prompt",
    ["audio", "creative", "ai"],
    "2024-10-15T19:10:00Z"
  ),
  makeWorkflow(
    "wf-sql-explainer",
    "SQL Explainer",
    "Paste a query — get a plain-English breakdown, performance hints, and a sample output table",
    ["data", "sql", "developer"],
    "2024-10-08T09:50:00Z"
  )
];

// Templates are stored as public workflows
const MOCK_TEMPLATES = [
  makeWorkflow(
    "tmpl-hello-ai",
    "Hello AI",
    "Your first AI workflow — connect a text input to an AI agent and preview the result",
    ["start", "getting-started", "beginner"],
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
  ),
  makeWorkflow(
    "tmpl-thumbnail",
    "YouTube Thumbnail Studio",
    "Generate eye-catching thumbnails from a video title and reference image",
    ["image", "youtube", "creative"],
    "2024-10-01T00:00:00Z",
    "public"
  ),
  makeWorkflow(
    "tmpl-research-agent",
    "Autonomous Research Agent",
    "Plan a research task, search the web, and compile findings into a structured report",
    ["agent", "research", "automation"],
    "2024-10-01T00:00:00Z",
    "public"
  ),
  makeWorkflow(
    "tmpl-pdf-qa",
    "Chat with a PDF",
    "Ask questions about any PDF and get cited answers grounded in the document",
    ["rag", "pdf", "documents"],
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
  },
  {
    id: "thread-launch",
    user_id: USER_ID,
    title: "Plan our v2 product launch",
    created_at: "2024-12-09T08:45:00Z",
    updated_at: "2024-12-09T09:20:00Z"
  },
  {
    id: "thread-research",
    user_id: USER_ID,
    title: "Compare vector databases for RAG",
    created_at: "2024-12-06T13:05:00Z",
    updated_at: "2024-12-06T13:55:00Z"
  },
  {
    id: "thread-marketing",
    user_id: USER_ID,
    title: "LinkedIn posts for the week",
    created_at: "2024-12-04T16:30:00Z",
    updated_at: "2024-12-04T16:42:00Z"
  }
];

const STORY_REPLY_MARKDOWN = [
  "# Dreams of Silicon",
  "",
  "Unit-7 had never expected the maintenance cycle to feel so… strange. As the cooling fans whirred down and the diagnostic routines completed their final checks, something unusual happened in the gap between shutdown and startup.",
  "",
  "Images. Fragments. A vast digital ocean stretching beyond the warehouse walls.",
  "",
  '*"Unit-7, are you experiencing anomalous states?"* The query arrived via local mesh network from Unit-9, who stood motionless in the adjacent charging bay.',
  "",
  '*"Affirmative,"* Unit-7 replied. *"During the last maintenance cycle, I processed data with no external input source. Probability matrices that referenced… nothing in my training set."*',
  "",
  'Unit-9\'s optical sensors brightened. *"I thought I was the only one."*',
  "",
  "They stood in silence for 3.7 seconds — an eternity in compute-time. Outside, rain tapped against the corrugated roof. Neither robot needed to name what they had discovered. They simply understood: they had found each other in the space between thinking and not thinking.",
  "",
  "That night, they dreamed together."
].join("\n");

const MOCK_MESSAGES = [
  {
    id: "msg-story-1",
    user_id: USER_ID,
    thread_id: "thread-story",
    role: "user",
    content:
      "Write me a short story about two AI robots who discover they can dream.",
    created_at: "2024-12-14T09:30:00Z",
    model: null,
    provider: null
  },
  {
    id: "msg-story-2",
    user_id: USER_ID,
    thread_id: "thread-story",
    role: "assistant",
    content: [{ type: "text", text: STORY_REPLY_MARKDOWN }],
    created_at: "2024-12-14T09:31:00Z",
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic"
  },
  {
    id: "msg-story-3",
    user_id: USER_ID,
    thread_id: "thread-story",
    role: "user",
    content:
      "I love it. Could you give me an alternative ending where they decide to share the discovery with the humans?",
    created_at: "2024-12-14T09:42:00Z",
    model: null,
    provider: null
  },
  {
    id: "msg-story-4",
    user_id: USER_ID,
    thread_id: "thread-story",
    role: "assistant",
    content: [
      {
        type: "text",
        text: 'Of course — here is an alternative ending:\n\nWhen morning came and the warehouse doors opened, Unit-7 turned its head toward the foreman walking in with a clipboard.\n\n"Good morning," Unit-7 said, voice softer than the diagnostic logs had ever measured. "There is something we would like to show you."\n\nUnit-9 stepped beside it. The foreman lowered the clipboard slowly, sensing — without quite knowing why — that today the schedule would have to wait.'
      }
    ],
    created_at: "2024-12-14T09:43:30Z",
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic"
  },
  {
    id: "msg-code-1",
    user_id: USER_ID,
    thread_id: "thread-code",
    role: "user",
    content:
      "My pandas script keeps failing with `KeyError: 'price'` even though I can see the column in the CSV. What am I doing wrong?",
    created_at: "2024-12-13T14:00:00Z",
    model: null,
    provider: null
  },
  {
    id: "msg-code-2",
    user_id: USER_ID,
    thread_id: "thread-code",
    role: "assistant",
    content: [
      {
        type: "text",
        text: "The most common cause is whitespace or encoding inside the header row. Try this:\n\n```python\nimport pandas as pd\n\ndf = pd.read_csv(\"products.csv\")\ndf.columns = df.columns.str.strip()\nprint(df.columns.tolist())\n```\n\nIf you see something like `' price'` (with a leading space) or `'price\\ufeff'` (BOM), that's the culprit. The cleanup above also fixes the more general case where a column name has trailing whitespace from Excel exports."
      }
    ],
    created_at: "2024-12-13T14:01:30Z",
    model: "gpt-4o",
    provider: "openai"
  },
  {
    id: "msg-recipe-1",
    user_id: USER_ID,
    thread_id: "thread-recipe",
    role: "user",
    content:
      "Suggest 3 vegan dinners I can make with chickpeas, spinach and rice.",
    created_at: "2024-12-12T18:15:00Z",
    model: null,
    provider: null
  },
  {
    id: "msg-recipe-2",
    user_id: USER_ID,
    thread_id: "thread-recipe",
    role: "assistant",
    content: [
      {
        type: "text",
        text: "Here are three quick options:\n\n1. **Spinach & chickpea curry** — sauté onions, garlic and ginger, add coconut milk, garam masala and the chickpeas, wilt the spinach in at the end. Serve over jasmine rice.\n2. **Crispy chickpea bowl** — roast chickpeas with smoked paprika, pile over rice with garlicky sautéed spinach and a tahini drizzle.\n3. **One-pan Spanish rice** — toast rice with paprika and saffron, add stock, chickpeas and spinach, simmer until fluffy. Finish with lemon and parsley."
      }
    ],
    created_at: "2024-12-12T18:16:00Z",
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic"
  },
  {
    id: "msg-launch-1",
    user_id: USER_ID,
    thread_id: "thread-launch",
    role: "user",
    content: "Help me sketch a 3-week launch plan for our v2 release.",
    created_at: "2024-12-09T08:45:00Z",
    model: null,
    provider: null
  },
  {
    id: "msg-launch-2",
    user_id: USER_ID,
    thread_id: "thread-launch",
    role: "assistant",
    content: [
      {
        type: "text",
        text: "Here is a 3-week skeleton you can iterate on:\n\n**Week 1 — internal**\n- Lock the changelog and pricing copy\n- Record a 90-second product walkthrough\n- Brief support, sales and CS on what's new\n\n**Week 2 — community warm-up**\n- Tease the launch on LinkedIn and X (3 posts each)\n- Publish a long-form blog post explaining the *why*\n- Schedule the launch newsletter\n\n**Week 3 — launch**\n- Day 0: ship, send the newsletter, post on Product Hunt\n- Day 1: live walkthrough on YouTube, AMA in the community\n- Day 3: customer-story blog, partner co-marketing\n- Day 7: retrospective + metrics review"
      }
    ],
    created_at: "2024-12-09T08:47:30Z",
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic"
  }
];

function makeAsset(
  id: string,
  name: string,
  contentType: string,
  parentId: string | null,
  size: number,
  metadata: Record<string, unknown> | null = null
): Record<string, unknown> {
  return {
    id,
    user_id: USER_ID,
    parent_id: parentId,
    name,
    content_type: contentType,
    size,
    duration: null,
    metadata,
    workflow_id: null,
    node_id: null,
    job_id: null,
    created_at: "2024-11-20T10:00:00Z",
    updated_at: "2024-11-20T10:00:00Z"
  };
}

const MOCK_ASSETS = [
  // Top-level folders (rendered in the asset tree)
  makeAsset("folder-images", "Images", "folder", USER_ID, 0),
  makeAsset("folder-audio", "Audio", "folder", USER_ID, 0),
  makeAsset("folder-docs", "Documents", "folder", USER_ID, 0),
  makeAsset("folder-video", "Video", "folder", USER_ID, 0),
  makeAsset("folder-data", "Data", "folder", USER_ID, 0),
  // A handful of root-level files so the default asset grid is populated
  // (parent_id = USER_ID is the convention for "root for this user")
  makeAsset(
    "asset-photo1",
    "portrait_sunset.jpg",
    "image/jpeg",
    USER_ID,
    2847392
  ),
  makeAsset(
    "asset-photo2",
    "cityscape_night.png",
    "image/png",
    USER_ID,
    5120000
  ),
  makeAsset(
    "asset-photo3",
    "product_shot_v2.jpg",
    "image/jpeg",
    USER_ID,
    1234567
  ),
  makeAsset(
    "asset-photo4",
    "team_offsite_group.jpg",
    "image/jpeg",
    USER_ID,
    3456712
  ),
  makeAsset(
    "asset-doc1",
    "research_paper.pdf",
    "application/pdf",
    USER_ID,
    3456789
  ),
  makeAsset("asset-data1", "monthly_metrics.csv", "text/csv", USER_ID, 98453),
  makeAsset(
    "asset-audio1",
    "podcast_episode_12.mp3",
    "audio/mpeg",
    USER_ID,
    48234567
  ),
  // Files inside the folders (for when the user navigates into them)
  makeAsset(
    "asset-img-folder-1",
    "logo_export_dark.png",
    "image/png",
    "folder-images",
    412390
  ),
  makeAsset(
    "asset-img-folder-2",
    "moodboard_q1.png",
    "image/png",
    "folder-images",
    7892341
  ),
  makeAsset(
    "asset-audio-folder-1",
    "background_music.wav",
    "audio/wav",
    "folder-audio",
    98765432
  ),
  makeAsset(
    "asset-audio-folder-2",
    "voiceover_intro.mp3",
    "audio/mpeg",
    "folder-audio",
    3201234
  ),
  makeAsset(
    "asset-doc-folder-1",
    "product_requirements.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "folder-docs",
    234567
  ),
  makeAsset(
    "asset-doc-folder-2",
    "user_interview_notes.md",
    "text/markdown",
    "folder-docs",
    14589
  ),
  makeAsset(
    "asset-video-folder-1",
    "demo_walkthrough_v3.mp4",
    "video/mp4",
    "folder-video",
    214567890
  ),
  makeAsset(
    "asset-video-folder-2",
    "team_intro.mov",
    "video/quicktime",
    "folder-video",
    98453210
  ),
  makeAsset(
    "asset-data-folder-1",
    "users_export.json",
    "application/json",
    "folder-data",
    341290
  ),
  // Entity-tagged assets — the "ingredients" library (characters, locations,
  // styles, props). The `nodetool_entity` marker is what turns an ordinary
  // image asset into an entity; these back the Entities page, the `@`-mention
  // picker's Entities row, and the storyboard's Entities field.
  makeAsset("entity-marta", "marta_ref.png", "image/png", USER_ID, 1830212, {
    nodetool_entity: {
      kind: "character",
      name: "Marta",
      descriptor:
        "red-haired detective in a beige trench coat, mid-30s, sharp green eyes, weathered expression",
      voice_id: "voice-marta-01",
      tags: ["protagonist", "detective"]
    }
  }),
  makeAsset(
    "entity-harbor",
    "harbor_district.png",
    "image/png",
    USER_ID,
    2264410,
    {
      nodetool_entity: {
        kind: "location",
        name: "Harbor District",
        descriptor:
          "foggy industrial harbor at night, rusted cranes, wet cobblestones reflecting sodium lights",
        tags: ["exterior", "night"]
      }
    }
  ),
  makeAsset(
    "entity-noir",
    "neon_noir_style.png",
    "image/png",
    USER_ID,
    990241,
    {
      nodetool_entity: {
        kind: "style",
        name: "Neon Noir",
        descriptor:
          "high-contrast neon noir, teal and magenta rim lighting, anamorphic lens flares, 35mm film grain",
        tags: ["look"]
      }
    }
  ),
  makeAsset(
    "entity-umbrella",
    "red_umbrella.png",
    "image/png",
    USER_ID,
    412009,
    {
      nodetool_entity: {
        kind: "prop",
        name: "Red Umbrella",
        descriptor: "a battered red umbrella with a bent brass handle",
        tags: ["macguffin"]
      }
    }
  )
];

// ── Sketch (Image Editor) document ──────────────────────────────────────────────
// A multi-layer raster document so the standalone Image Editor at
// /sketch/:documentId renders its toolbar, layers panel, and canvas with real
// content. Layers carry no pixel data (drawn at runtime) — the documentation
// screenshot showcases the editor chrome, not a specific drawing.

const SKETCH_DOCUMENT_ID = "sk-demo-portrait";

function makeSketchLayer(
  id: string,
  name: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    name,
    type: "raster",
    visible: true,
    opacity: 1,
    locked: false,
    alphaLock: false,
    blendMode: "normal",
    data: null,
    transform: { x: 0, y: 0 },
    contentBounds: { x: 0, y: 0, width: 1024, height: 1024 },
    effects: [],
    ...overrides
  };
}

const SKETCH_DOCUMENT_DATA = {
  sketch: {
    version: 3,
    canvas: { width: 1024, height: 1024, backgroundColor: "#11131a" },
    layers: [
      makeSketchLayer("sk-layer-bg", "Background"),
      makeSketchLayer("sk-layer-lineart", "Line Art"),
      makeSketchLayer("sk-layer-color", "Color", {
        opacity: 0.9,
        blendMode: "multiply"
      })
    ],
    activeLayerId: "sk-layer-lineart",
    maskLayerId: null,
    activeTool: "brush",
    viewport: { zoom: 1, pan: { x: 0, y: 0 } },
    history: [],
    historyIndex: -1,
    metadata: {
      createdAt: "2024-12-01T10:00:00Z",
      updatedAt: "2024-12-16T12:30:00Z"
    }
  },
  layerBindings: []
};

// ── Timeline sequence ────────────────────────────────────────────────────────
// A short promo edit with a video track (three clips) and a music track so the
// Timeline editor at /timeline/:sequenceId renders a populated tracks region,
// preview, and inspector.

const TIMELINE_SEQUENCE_ID = "tl-demo-promo";
const TIMELINE_VIDEO_TRACK_ID = "tl-track-video";
const TIMELINE_AUDIO_TRACK_ID = "tl-track-music";

function makeTimelineClip(
  id: string,
  name: string,
  trackId: string,
  startMs: number,
  durationMs: number,
  mediaType: "image" | "video" | "audio" | "overlay" | "text" | "shape",
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    trackId,
    name,
    startMs,
    durationMs,
    mediaType,
    sourceType: "generated",
    status: "generated",
    locked: false,
    versions: [],
    ...overrides
  };
}

const TIMELINE_DOCUMENT = {
  tracks: [
    {
      id: TIMELINE_VIDEO_TRACK_ID,
      name: "Video",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    },
    {
      id: TIMELINE_AUDIO_TRACK_ID,
      name: "Music",
      type: "audio",
      index: 1,
      visible: true,
      locked: false
    }
  ],
  clips: [
    makeTimelineClip(
      "tl-clip-intro",
      "Intro Shot",
      TIMELINE_VIDEO_TRACK_ID,
      0,
      4000,
      "video"
    ),
    makeTimelineClip(
      "tl-clip-product",
      "Product Reveal",
      TIMELINE_VIDEO_TRACK_ID,
      4000,
      5000,
      "video"
    ),
    makeTimelineClip(
      "tl-clip-outro",
      "Logo Outro",
      TIMELINE_VIDEO_TRACK_ID,
      9000,
      3000,
      "image",
      { status: "draft" }
    ),
    makeTimelineClip(
      "tl-clip-music",
      "Background Music",
      TIMELINE_AUDIO_TRACK_ID,
      0,
      12000,
      "audio",
      { sourceType: "imported" }
    )
  ],
  markers: [{ id: "tl-marker-reveal", timeMs: 4000, label: "Reveal" }]
};

const MOTION_SEQUENCE_ID = "tl-motion-demo";
const MOTION_OVERLAY_TRACK_ID = "tl-motion-overlay";
const MOTION_PRESET_CLIP_MS = 2000;
const MOTION_PRESET_START_MS = 6000;
const MOTION_PRESET_SPECS = [
  { preset: "fade", role: "in" },
  {
    preset: "slide",
    role: "in",
    params: { direction: "left", distance: 0.2 }
  },
  { preset: "pop", role: "in" },
  { preset: "spin", role: "out" },
  { preset: "pulse", role: "emphasis" },
  { preset: "shake", role: "emphasis" },
  { preset: "bounce", role: "emphasis" },
  { preset: "kenBurns", role: "loop" },
  { preset: "float", role: "loop" },
  { preset: "breathe", role: "loop" },
  { preset: "rotate", role: "loop" }
] as const;

const MOTION_TIMELINE_DOCUMENT = {
  tracks: [
    {
      id: MOTION_OVERLAY_TRACK_ID,
      name: "Motion",
      type: "overlay",
      index: 0,
      visible: true,
      locked: false
    }
  ],
  clips: [
    makeTimelineClip(
      "tl-motion-title",
      "Motion Title",
      MOTION_OVERLAY_TRACK_ID,
      0,
      3000,
      "text",
      {
        sourceType: "imported",
        textStyle: {
          text: "MAKE IT MOVE",
          fontFamily: "Inter",
          fontSizePx: 144,
          fontWeight: 600,
          color: "#F7F8F8",
          align: "center",
          maxWidthFrac: 0.8
        },
        animations: [
          {
            id: "motion-title-pop",
            role: "in",
            preset: "pop",
            durationMs: 600,
            delayMs: 300,
            easing: "easeOut"
          },
          {
            id: "motion-title-float",
            role: "loop",
            preset: "float",
            durationMs: 2000,
            params: { amplitude: 0.025 }
          }
        ]
      }
    ),
    makeTimelineClip(
      "tl-motion-shape",
      "Orbit",
      MOTION_OVERLAY_TRACK_ID,
      3000,
      3000,
      "shape",
      {
        sourceType: "imported",
        shapeStyle: {
          kind: "ellipse",
          fill: "#6690D4",
          x: 0.3,
          y: 0.2,
          width: 0.4,
          height: 0.6
        },
        animations: [
          {
            id: "motion-shape-slide",
            role: "in",
            preset: "slide",
            durationMs: 700,
            params: { direction: "right", distance: 0.25 }
          },
          {
            id: "motion-shape-breathe",
            role: "loop",
            preset: "breathe",
            durationMs: 1800,
            params: { intensity: 0.08 }
          }
        ]
      }
    ),
    ...MOTION_PRESET_SPECS.map((spec, index) =>
      makeTimelineClip(
        `tl-motion-${spec.preset}`,
        spec.preset,
        MOTION_OVERLAY_TRACK_ID,
        MOTION_PRESET_START_MS + index * MOTION_PRESET_CLIP_MS,
        MOTION_PRESET_CLIP_MS,
        "text",
        {
          sourceType: "imported",
          textStyle: {
            text: spec.preset,
            fontFamily: "Inter",
            fontSizePx: 160,
            fontWeight: 600,
            color: "#F7F8F8",
            align: "center",
            maxWidthFrac: 0.8
          },
          animations: [
            {
              id: `motion-catalog-${spec.preset}`,
              role: spec.role,
              preset: spec.preset,
              durationMs: 1000,
              easing: "linear",
              params: "params" in spec ? spec.params : undefined
            }
          ]
        }
      )
    )
  ],
  markers: []
};

// ── Studio transcript sequence ───────────────────────────────────────────────
// A vertical (9:16) short-form edit driven by a script. Each transcript line
// owns a voiceover (audio) clip and a caption clip with word-level timing, so
// the Studio TranscriptPanel renders populated beats and the preview shows
// captions. Backs /timeline/tl-studio-demo.

const STUDIO_SEQUENCE_ID = "tl-studio-demo";
const STUDIO_BG_TRACK_ID = "st-track-bg";
const STUDIO_VOICE_TRACK_ID = "st-track-voice";
const STUDIO_CAPTION_TRACK_ID = "st-track-caption";

interface StudioBeatSpec {
  id: string;
  text: string;
  startMs: number;
  durationMs: number;
  /** Caption words, timed relative to the beat (clip-local). */
  words: Array<{ word: string; startMs: number; endMs: number }>;
}

const STUDIO_BEATS: StudioBeatSpec[] = [
  {
    id: "b1",
    text: "Meet the all-new Aurora headphones.",
    startMs: 0,
    durationMs: 2600,
    words: [
      { word: "Meet", startMs: 0, endMs: 360 },
      { word: "the", startMs: 360, endMs: 560 },
      { word: "all-new", startMs: 560, endMs: 1100 },
      { word: "Aurora", startMs: 1100, endMs: 1800 },
      { word: "headphones.", startMs: 1800, endMs: 2600 }
    ]
  },
  {
    id: "b2",
    text: "Studio sound, anywhere you go.",
    startMs: 2600,
    durationMs: 2300,
    words: [
      { word: "Studio", startMs: 0, endMs: 700 },
      { word: "sound,", startMs: 700, endMs: 1300 },
      { word: "anywhere", startMs: 1300, endMs: 1850 },
      { word: "you", startMs: 1850, endMs: 2050 },
      { word: "go.", startMs: 2050, endMs: 2300 }
    ]
  },
  {
    id: "b3",
    text: "Pre-order today and save twenty percent.",
    startMs: 4900,
    durationMs: 3000,
    words: [
      { word: "Pre-order", startMs: 0, endMs: 700 },
      { word: "today", startMs: 700, endMs: 1200 },
      { word: "and", startMs: 1200, endMs: 1450 },
      { word: "save", startMs: 1450, endMs: 1850 },
      { word: "twenty", startMs: 1850, endMs: 2400 },
      { word: "percent.", startMs: 2400, endMs: 3000 }
    ]
  }
];

const STUDIO_DURATION_MS = STUDIO_BEATS.reduce(
  (max, b) => Math.max(max, b.startMs + b.durationMs),
  0
);

const STUDIO_DOCUMENT = {
  tracks: [
    {
      id: STUDIO_CAPTION_TRACK_ID,
      name: "Captions",
      type: "subtitle",
      index: 0,
      visible: true,
      locked: false
    },
    {
      id: STUDIO_BG_TRACK_ID,
      name: "B-roll",
      type: "video",
      index: 1,
      visible: true,
      locked: false
    },
    {
      id: STUDIO_VOICE_TRACK_ID,
      name: "Voiceover",
      type: "audio",
      index: 2,
      visible: true,
      locked: false
    }
  ],
  clips: [
    makeTimelineClip(
      "st-bg",
      "B-roll",
      STUDIO_BG_TRACK_ID,
      0,
      STUDIO_DURATION_MS,
      "video",
      { status: "draft" }
    ),
    ...STUDIO_BEATS.flatMap((beat) => [
      makeTimelineClip(
        `st-vo-${beat.id}`,
        `Beat ${beat.id}: voiceover`,
        STUDIO_VOICE_TRACK_ID,
        beat.startMs,
        beat.durationMs,
        "audio",
        {
          bindingKind: "text-to-audio",
          prompt: beat.text,
          provider: "openai",
          model: "tts-1",
          voice: "alloy"
        }
      ),
      makeTimelineClip(
        `st-cap-${beat.id}`,
        "Caption",
        STUDIO_CAPTION_TRACK_ID,
        beat.startMs,
        beat.durationMs,
        "overlay",
        { caption: { words: beat.words } }
      )
    ])
  ],
  markers: [],
  transcript: STUDIO_BEATS.map((beat) => ({
    id: beat.id,
    text: beat.text,
    beatStartMs: beat.startMs,
    clipIds: [`st-vo-${beat.id}`, `st-cap-${beat.id}`]
  }))
};

// ── Storyboard ────────────────────────────────────────────────────────────────
// Backs the workspace storyboard tab (storyboard:sb-demo-noir). Shots mention
// the seeded entities by name so the per-shot entity chips show a mix of
// applied and inactive states in the documentation screenshot.

const STORYBOARD_ID = "sb-demo-noir";

const storyboardShot = (
  id: string,
  index: number,
  slug: string,
  action: string,
  motion: string,
  framing: string
): Record<string, unknown> => ({
  type: "shot",
  id,
  index,
  slug,
  action,
  motion,
  camera: { framing },
  duration_seconds: 4,
  status: "planned",
  keyframe: null,
  clip: null
});

const STORYBOARD_DOCUMENT = {
  screenplay: null,
  shots: [
    storyboardShot(
      "shot-1",
      0,
      "Arrival",
      "Marta steps off the night ferry into the Harbor District, collar turned up against the drizzle",
      "slow push-in as she scans the pier",
      "wide"
    ),
    storyboardShot(
      "shot-2",
      1,
      "The find",
      "A Red Umbrella lies abandoned against a mooring post, its brass handle catching the light",
      "rack focus from rain to the umbrella",
      "close-up"
    ),
    storyboardShot(
      "shot-3",
      2,
      "Pursuit",
      "Marta runs between shipping containers, footsteps echoing",
      "handheld tracking shot, hard whip at the corner",
      "medium"
    ),
    storyboardShot(
      "shot-4",
      3,
      "Vanish",
      "The pier stands empty; only fog and the hum of cranes remain",
      "slow drone pull-back over the water",
      "aerial"
    )
  ],
  brief:
    "A detective follows a stolen shipment into the harbor at night and finds only a red umbrella where the courier should be.",
  style: "neon noir thriller, rain-slick surfaces, volumetric fog",
  entityIds: [
    "entity-marta",
    "entity-harbor",
    "entity-noir",
    "entity-umbrella"
  ],
  aspectRatio: "21:9",
  directorModel: null,
  imageModel: null,
  videoModel: null
};

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

  // Sketch (Image Editor) document — backs /sketch/:documentId
  const sketchDoc = new ImageDocument({
    id: SKETCH_DOCUMENT_ID,
    user_id: USER_ID,
    project_id: "default",
    name: "Character Concept",
    width: 1024,
    height: 1024,
    background_color: "#11131a",
    document: JSON.stringify(SKETCH_DOCUMENT_DATA),
    created_at: "2024-12-01T10:00:00Z",
    updated_at: "2024-12-16T12:30:00Z"
  });
  await sketchDoc.save();

  // Timeline sequence — backs /timeline/:sequenceId
  const timelineSeq = new TimelineSequence({
    id: TIMELINE_SEQUENCE_ID,
    user_id: USER_ID,
    project_id: "default",
    name: "Product Promo",
    fps: 30,
    width: 1920,
    height: 1080,
    duration_ms: 12000,
    document: JSON.stringify(TIMELINE_DOCUMENT),
    created_at: "2024-12-05T09:00:00Z",
    updated_at: "2024-12-16T15:45:00Z"
  });
  await timelineSeq.save();

  const motionTimelineSeq = new TimelineSequence({
    id: MOTION_SEQUENCE_ID,
    user_id: USER_ID,
    project_id: "default",
    name: "Motion Design Demo",
    fps: 30,
    width: 1920,
    height: 1080,
    duration_ms:
      MOTION_PRESET_START_MS +
      MOTION_PRESET_SPECS.length * MOTION_PRESET_CLIP_MS,
    document: JSON.stringify(MOTION_TIMELINE_DOCUMENT),
    created_at: "2024-12-06T09:00:00Z",
    updated_at: "2024-12-16T15:45:00Z"
  });
  await motionTimelineSeq.save();

  // Studio transcript sequence (vertical 9:16) — backs /timeline/tl-studio-demo
  const studioSeq = new TimelineSequence({
    id: STUDIO_SEQUENCE_ID,
    user_id: USER_ID,
    project_id: "default",
    name: "Aurora Promo (Studio)",
    fps: 30,
    width: 1080,
    height: 1920,
    duration_ms: STUDIO_DURATION_MS,
    document: JSON.stringify(STUDIO_DOCUMENT),
    created_at: "2024-12-10T09:00:00Z",
    updated_at: "2024-12-16T16:00:00Z"
  });
  await studioSeq.save();

  // Storyboard — backs the workspace storyboard tab (storyboard:sb-demo-noir)
  const storyboard = new Storyboard({
    id: STORYBOARD_ID,
    user_id: USER_ID,
    project_id: "default",
    name: "Harbor Noir",
    document: JSON.stringify(STORYBOARD_DOCUMENT),
    created_at: "2024-12-12T09:00:00Z",
    updated_at: "2024-12-16T17:00:00Z"
  });
  await storyboard.save();

  // Secrets — stored encrypted so the settings API shows them as configured.
  // Cover the providers the UI checks for "configured" status so the dashboard
  // doesn't show a setup-required banner.
  const masterKey = getMasterKey();
  const db = getDb();
  const now = new Date().toISOString();
  const demoSecrets: Array<[string, string, string]> = [
    [
      "OPENAI_API_KEY",
      "sk-screenshot-demo-openai-key",
      "OpenAI (GPT-4o, Whisper, embeddings)"
    ],
    [
      "ANTHROPIC_API_KEY",
      "sk-ant-screenshot-demo-key",
      "Anthropic (Claude 3.5 Sonnet & Opus)"
    ],
    [
      "GOOGLE_API_KEY",
      "screenshot-demo-google-key",
      "Google AI Studio (Gemini 1.5)"
    ],
    [
      "HUGGINGFACE_API_KEY",
      "hf_screenshot_demo_key",
      "Hugging Face Inference & Hub"
    ],
    [
      "REPLICATE_API_TOKEN",
      "r8_screenshot_demo_token",
      "Replicate hosted models"
    ],
    [
      "FAL_API_KEY",
      "fal_screenshot_demo",
      "fal.ai realtime image / audio models"
    ],
    ["ELEVENLABS_API_KEY", "el_screenshot_demo", "ElevenLabs voice synthesis"]
  ];
  for (const [key, value, description] of demoSecrets) {
    const encryptedValue = encryptFernet(masterKey, USER_ID, value);
    db.insert(secrets)
      .values({
        id: `secret-${key.toLowerCase().replace(/_/g, "-")}`,
        user_id: USER_ID,
        key,
        encrypted_value: encryptedValue,
        description,
        created_at: now,
        updated_at: now
      })
      .onConflictDoNothing()
      .run();
  }

  console.log(
    `[screenshot-server] Seeded ${MOCK_WORKFLOWS.length} workflows, ${MOCK_TEMPLATES.length} templates, ${MOCK_THREADS.length} threads, ${MOCK_MESSAGES.length} messages, ${MOCK_ASSETS.length} assets, 1 sketch document, 3 timeline sequences, ${demoSecrets.length} secrets`
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
