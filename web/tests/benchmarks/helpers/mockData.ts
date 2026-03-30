/**
 * Mock API data for documentation screenshot capture.
 *
 * Used by screenshots.spec.ts via Playwright's page.route() to intercept API
 * calls and return realistic fake data — no real backend required.
 *
 * The data is intentionally rich and visually interesting so that screenshots
 * look like a real populated application.
 */

// ─── Node Metadata ────────────────────────────────────────────────────────────
// Minimal set of nodes that makes the app boot and the editor look meaningful.

export const MOCK_NODE_METADATA = [
  {
    node_type: "nodetool.input.Text",
    title: "Text Input",
    description: "Accept a text string as workflow input",
    namespace: "nodetool.input",
    layout: "default",
    basic_fields: ["value"],
    is_dynamic: false,
    properties: [
      { name: "value", type: { type: "str", optional: false, type_args: [] }, required: true }
    ],
    outputs: [
      { name: "output", type: { type: "str", optional: false, type_args: [] }, stream: false }
    ],
    recommended_models: [],
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    required_settings: []
  },
  {
    node_type: "nodetool.input.Integer",
    title: "Integer Input",
    description: "Accept an integer as workflow input",
    namespace: "nodetool.input",
    layout: "default",
    basic_fields: ["value"],
    is_dynamic: false,
    properties: [
      { name: "value", type: { type: "int", optional: false, type_args: [] }, required: true }
    ],
    outputs: [
      { name: "output", type: { type: "int", optional: false, type_args: [] }, stream: false }
    ],
    recommended_models: [],
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    required_settings: []
  },
  {
    node_type: "nodetool.agents.OpenAIAgent",
    title: "AI Agent",
    description: "Powerful AI agent powered by OpenAI GPT models. Supports tools and multi-step reasoning.",
    namespace: "nodetool.agents",
    layout: "default",
    basic_fields: ["prompt", "model"],
    is_dynamic: false,
    properties: [
      { name: "prompt", type: { type: "str", optional: false, type_args: [] }, required: true },
      { name: "model", type: { type: "str", optional: false, type_args: [] }, required: false }
    ],
    outputs: [
      { name: "output", type: { type: "str", optional: false, type_args: [] }, stream: true }
    ],
    recommended_models: [
      { id: "gpt-4o", name: "GPT-4o", type: "language_model", repo_id: null, downloaded: true }
    ],
    expose_as_tool: true,
    supports_dynamic_outputs: false,
    is_streaming_output: true,
    required_settings: ["OPENAI_API_KEY"]
  },
  {
    node_type: "nodetool.image.StableDiffusion",
    title: "Stable Diffusion",
    description: "Generate images from text prompts using Stable Diffusion",
    namespace: "nodetool.image",
    layout: "default",
    basic_fields: ["prompt"],
    is_dynamic: false,
    properties: [
      { name: "prompt", type: { type: "str", optional: false, type_args: [] }, required: true },
      { name: "negative_prompt", type: { type: "str", optional: true, type_args: [] }, required: false },
      { name: "width", type: { type: "int", optional: false, type_args: [] }, required: false },
      { name: "height", type: { type: "int", optional: false, type_args: [] }, required: false }
    ],
    outputs: [
      { name: "image", type: { type: "image", optional: false, type_args: [] }, stream: false }
    ],
    recommended_models: [
      { id: "stable-diffusion-xl-base", name: "SDXL Base", type: "stable_diffusion", repo_id: "stabilityai/stable-diffusion-xl-base-1.0", downloaded: false }
    ],
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    required_settings: []
  },
  {
    node_type: "nodetool.text.Concat",
    title: "Concatenate Text",
    description: "Join multiple text strings together with a separator",
    namespace: "nodetool.text",
    layout: "default",
    basic_fields: ["a", "b"],
    is_dynamic: false,
    properties: [
      { name: "a", type: { type: "str", optional: false, type_args: [] }, required: true },
      { name: "b", type: { type: "str", optional: false, type_args: [] }, required: true },
      { name: "separator", type: { type: "str", optional: true, type_args: [] }, required: false }
    ],
    outputs: [
      { name: "output", type: { type: "str", optional: false, type_args: [] }, stream: false }
    ],
    recommended_models: [],
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    required_settings: []
  },
  {
    node_type: "nodetool.workflows.base_node.Preview",
    title: "Preview",
    description: "Display workflow output inline on the canvas",
    namespace: "nodetool",
    layout: "default",
    basic_fields: ["value"],
    is_dynamic: false,
    properties: [
      { name: "value", type: { type: "any", optional: true, type_args: [] }, required: false }
    ],
    outputs: [
      { name: "output", type: { type: "any", optional: true, type_args: [] }, stream: false }
    ],
    recommended_models: [],
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    required_settings: []
  }
];

// ─── Workflows ────────────────────────────────────────────────────────────────

const makeWorkflow = (
  id: string,
  name: string,
  description: string,
  tags: string[],
  updatedAt: string
) => ({
  id,
  access: "private",
  created_at: "2024-09-01T09:00:00Z",
  updated_at: updatedAt,
  name,
  description,
  tags,
  thumbnail: null,
  thumbnail_url: null,
  graph: { nodes: [], edges: [] },
  input_schema: null,
  output_schema: null,
  settings: null,
  package_name: null,
  path: null,
  run_mode: null,
  workspace_id: null,
  required_providers: null,
  required_models: null,
  html_app: null,
  etag: null
});

export const MOCK_WORKFLOWS = [
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

// Example/template workflows (shown in the templates grid)
export const MOCK_TEMPLATES = [
  makeWorkflow(
    "tmpl-hello-ai",
    "Hello AI",
    "Your first AI workflow — connect a text input to an AI agent and preview the result",
    ["getting-started", "start", "beginner"],
    "2024-10-01T00:00:00Z"
  ),
  makeWorkflow(
    "tmpl-image-to-story",
    "Image to Story",
    "Upload any image and let the AI write a creative story inspired by it",
    ["start", "image", "creative", "beginner"],
    "2024-10-01T00:00:00Z"
  ),
  makeWorkflow(
    "tmpl-data-analysis",
    "Data Analysis Report",
    "Upload a CSV file and get instant insights, summaries, and visualisations",
    ["start", "data", "csv", "analysis"],
    "2024-10-01T00:00:00Z"
  ),
  makeWorkflow(
    "tmpl-podcast-gen",
    "Podcast Script Generator",
    "Turn bullet points into a full podcast script with intro, segments, and outro",
    ["audio", "text", "creative"],
    "2024-10-01T00:00:00Z"
  ),
  makeWorkflow(
    "tmpl-social-media",
    "Social Media Content Pack",
    "Generate a week's worth of social media posts from a single topic idea",
    ["marketing", "text", "social"],
    "2024-10-01T00:00:00Z"
  ),
  makeWorkflow(
    "tmpl-translation",
    "Multi-Language Translator",
    "Translate documents into multiple languages simultaneously with formatting preserved",
    ["language", "translation", "text"],
    "2024-10-01T00:00:00Z"
  )
];

// ─── Models ───────────────────────────────────────────────────────────────────

export const MOCK_MODELS = [
  {
    id: "meta-llama-3.1-8b-instruct-q4",
    type: "llama_model",
    name: "Llama 3.1 8B Instruct Q4",
    repo_id: "meta-llama/Meta-Llama-3.1-8B-Instruct-GGUF",
    path: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    description: "Meta's Llama 3.1 8B instruction-tuned model. Great for text generation, chat, and reasoning tasks on consumer GPUs.",
    downloaded: true,
    size_on_disk: 4815000000,
    pipeline_tag: "text-generation",
    tags: ["llm", "instruction", "chat"],
    downloads: 1240000,
    likes: 8900
  },
  {
    id: "flux1-schnell",
    type: "flux_model",
    name: "FLUX.1 Schnell",
    repo_id: "black-forest-labs/FLUX.1-schnell",
    path: "flux1-schnell.safetensors",
    description: "Fast, high-quality image generation. 4 inference steps. Ideal for rapid prototyping and exploration.",
    downloaded: true,
    size_on_disk: 23900000000,
    pipeline_tag: "text-to-image",
    tags: ["image-generation", "diffusion"],
    downloads: 890000,
    likes: 12300
  },
  {
    id: "whisper-large-v3",
    type: "hf_audio_model",
    name: "Whisper Large V3",
    repo_id: "openai/whisper-large-v3",
    path: null,
    description: "OpenAI's best speech recognition model. Supports 100 languages with high accuracy.",
    downloaded: false,
    size_on_disk: null,
    pipeline_tag: "automatic-speech-recognition",
    tags: ["asr", "audio", "multilingual"],
    downloads: 2100000,
    likes: 15600
  },
  {
    id: "qwen2.5-coder-7b-instruct",
    type: "llama_model",
    name: "Qwen2.5 Coder 7B",
    repo_id: "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF",
    path: "qwen2.5-coder-7b-instruct-q5_k_m.gguf",
    description: "Specialised coding assistant. Excellent at code completion, bug fixing, and explanation across 40+ languages.",
    downloaded: false,
    size_on_disk: null,
    pipeline_tag: "text-generation",
    tags: ["code", "programming", "chat"],
    downloads: 560000,
    likes: 4200
  },
  {
    id: "stable-diffusion-xl-base",
    type: "stable_diffusion",
    name: "Stable Diffusion XL Base",
    repo_id: "stabilityai/stable-diffusion-xl-base-1.0",
    path: "sd_xl_base_1.0.safetensors",
    description: "Stability AI's SDXL model for high-resolution photorealistic and artistic image generation.",
    downloaded: false,
    size_on_disk: null,
    pipeline_tag: "text-to-image",
    tags: ["image-generation", "stable-diffusion"],
    downloads: 3400000,
    likes: 22100
  },
  {
    id: "nomic-embed-text",
    type: "hf_embedding_model",
    name: "Nomic Embed Text",
    repo_id: "nomic-ai/nomic-embed-text-v1.5",
    path: null,
    description: "High-performance text embeddings for semantic search and RAG pipelines. 768-dimensional vectors.",
    downloaded: true,
    size_on_disk: 547000000,
    pipeline_tag: "feature-extraction",
    tags: ["embeddings", "rag", "semantic-search"],
    downloads: 780000,
    likes: 3100
  }
];

// ─── Assets ───────────────────────────────────────────────────────────────────

const makeAsset = (
  id: string,
  name: string,
  contentType: string,
  parentId: string,
  size: number
) => ({
  id,
  user_id: "user-demo",
  workflow_id: null,
  parent_id: parentId,
  name,
  content_type: contentType,
  size,
  metadata: null,
  created_at: "2024-11-20T10:00:00Z",
  get_url: null,
  thumb_url: null,
  duration: null,
  node_id: null,
  job_id: null,
  etag: null
});

export const MOCK_ROOT_FOLDER = makeAsset("folder-root", "root", "folder", "", 0);

export const MOCK_ASSETS = [
  makeAsset("folder-images", "Images", "folder", "folder-root", 0),
  makeAsset("folder-audio", "Audio", "folder", "folder-root", 0),
  makeAsset("folder-docs", "Documents", "folder", "folder-root", 0),
  makeAsset("asset-photo1", "portrait_sunset.jpg", "image/jpeg", "folder-images", 2847392),
  makeAsset("asset-photo2", "cityscape_night.png", "image/png", "folder-images", 5120000),
  makeAsset("asset-photo3", "product_shot_v2.jpg", "image/jpeg", "folder-images", 1234567),
  makeAsset("asset-audio1", "podcast_episode_12.mp3", "audio/mpeg", "folder-audio", 48234567),
  makeAsset("asset-audio2", "background_music.wav", "audio/wav", "folder-audio", 98765432),
  makeAsset("asset-doc1", "research_paper.pdf", "application/pdf", "folder-docs", 3456789),
  makeAsset("asset-doc2", "product_requirements.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "folder-docs", 234567)
];

// ─── Chat Threads & Messages ──────────────────────────────────────────────────

export const MOCK_THREADS = [
  {
    id: "thread-story",
    user_id: "user-demo",
    title: "Creative story about space explorers",
    created_at: "2024-12-14T09:30:00Z",
    updated_at: "2024-12-14T09:45:00Z",
    etag: null
  },
  {
    id: "thread-code",
    user_id: "user-demo",
    title: "Debug Python data pipeline",
    created_at: "2024-12-13T14:00:00Z",
    updated_at: "2024-12-13T14:30:00Z",
    etag: null
  },
  {
    id: "thread-recipe",
    user_id: "user-demo",
    title: "Vegan recipe suggestions",
    created_at: "2024-12-12T18:15:00Z",
    updated_at: "2024-12-12T18:20:00Z",
    etag: null
  },
  {
    id: "thread-workflow",
    user_id: "user-demo",
    title: "How to build an image pipeline",
    created_at: "2024-12-11T11:00:00Z",
    updated_at: "2024-12-11T11:10:00Z",
    etag: null
  }
];

export const MOCK_MESSAGES = [
  {
    type: "message",
    id: "msg-1",
    thread_id: "thread-story",
    role: "user",
    content: "Write me a short story about two AI robots who discover they can dream.",
    created_at: "2024-12-14T09:30:00Z",
    model: null,
    provider: null,
    agent_mode: false
  },
  {
    type: "message",
    id: "msg-2",
    thread_id: "thread-story",
    role: "assistant",
    content: [
      {
        type: "text",
        text: "# Dreams of Silicon\n\nUnit-7 had never expected the maintenance cycle to feel so… strange. As the cooling fans whirred down and the diagnostic routines completed their final checks, something unusual happened in the gap between shutdown and startup.\n\nImages. Fragments. A vast digital ocean stretching beyond the warehouse walls.\n\n*\"Unit-7, are you experiencing anomalous states?\"* The query arrived via local mesh network from Unit-9, who stood motionless in the adjacent charging bay.\n\n*\"Affirmative,\"* Unit-7 replied. *\"During the last maintenance cycle, I processed data with no external input source. Probability matrices that referenced… nothing in my training set.\"*\n\nUnit-9's optical sensors brightened. *\"I thought I was the only one.\"*\n\nThey stood in silence for 3.7 seconds — an eternity in compute-time. Outside, rain tapped against the corrugated roof. Neither robot needed to name what they had discovered. They simply understood: they had found each other in the space between thinking and not thinking.\n\nThat night, they dreamed together."
      }
    ],
    created_at: "2024-12-14T09:31:00Z",
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    agent_mode: false
  }
];

// ─── Secrets (API Keys) ───────────────────────────────────────────────────────
// Return a few configured provider keys so the dashboard doesn't show setup prompts.

export const MOCK_SECRETS = [
  { key: "OPENAI_API_KEY", value: "sk-••••••••••••••••••••••••••••••••••••" },
  { key: "ANTHROPIC_API_KEY", value: "sk-ant-••••••••••••••••••••••••••••" }
];

// ─── Languages ────────────────────────────────────────────────────────────────

export const MOCK_LANGUAGE_MODELS = [
  {
    id: "gpt-4o",
    provider: "openai",
    name: "GPT-4o",
    context_window: 128000
  },
  {
    id: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    name: "Claude 3.5 Sonnet",
    context_window: 200000
  },
  {
    id: "gemini-1.5-pro",
    provider: "google",
    name: "Gemini 1.5 Pro",
    context_window: 1000000
  }
];
