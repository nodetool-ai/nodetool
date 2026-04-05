/**
 * Contract tests for api-types.ts – API entity type structures.
 *
 * Since these are TypeScript interface definitions (no runtime logic),
 * tests verify:
 *  1. Object shapes can be created that satisfy each interface.
 *  2. Discriminated unions narrow correctly at runtime.
 *  3. Optional fields behave as expected.
 */

import { describe, it, expect } from "vitest";
import type {
  ImageRef,
  AudioRef,
  VideoRef,
  TextRef,
  DataframeRef,
  ColumnDef,
  Model3DRef,
  DocumentRef,
  FolderRef,
  AssetRef,
  WorkflowRef,
  NodeRef,
  NPArray,
  SVGElement,
  PlotlyConfig,
  Datetime,
  CalendarEvent,
  Asset,
  AssetList,
  Workflow,
  WorkflowGraph,
  WorkflowRequest,
  WorkflowTool,
  Thread,
  Message,
  MessageTextContent,
  MessageImageContent,
  MessageVideoContent,
  MessageAudioContent,
  MessageDocumentContent,
  MessageThoughtContent,
  MessageContent,
  ToolCall,
  PropertyTypeMetadata,
  Property,
  OutputSlot,
  NodeMetadata,
  Node,
  Graph,
  JobResponse,
  RunJobRequest,
  ResourceLimits,
  LanguageModel,
  EmbeddingModel,
  ImageModel,
  UnifiedModel,
  ModelPack,
  SystemStats,
  SecretResponse,
  Task,
  Step,
  TaskPlan,
  FileInfo,
  CollectionResponse,
  CollectionList,
  WorkspaceResponse,
  WorkflowVersion,
  WorkflowVersionSaveType,
  SettingWithValue,
  SettingsResponse
} from "../src/api-types.js";

// ---------------------------------------------------------------------------
// Media Refs
// ---------------------------------------------------------------------------

describe("Media Refs", () => {
  it("ImageRef has required type and uri", () => {
    const ref: ImageRef = { type: "image", uri: "https://example.com/img.png" };
    expect(ref.type).toBe("image");
    expect(ref.uri).toBe("https://example.com/img.png");
    expect(ref.asset_id).toBeUndefined();
  });

  it("AudioRef has optional duration", () => {
    const ref: AudioRef = {
      type: "audio",
      uri: "s3://bucket/audio.mp3",
      duration: 3.5
    };
    expect(ref.type).toBe("audio");
    expect(ref.duration).toBe(3.5);
  });

  it("VideoRef has optional format and duration", () => {
    const ref: VideoRef = {
      type: "video",
      uri: "s3://bucket/video.mp4",
      format: "mp4"
    };
    expect(ref.format).toBe("mp4");
    expect(ref.duration).toBeUndefined();
  });

  it("TextRef minimal fields", () => {
    const ref: TextRef = { type: "text", uri: "s3://bucket/file.txt" };
    expect(ref.type).toBe("text");
  });

  it("DataframeRef with columns and data", () => {
    const col: ColumnDef = { name: "age", data_type: "int" };
    const ref: DataframeRef = {
      type: "dataframe",
      uri: "s3://bucket/data.csv",
      columns: [col],
      data: [[1], [2]]
    };
    expect(ref.columns).toHaveLength(1);
    expect(ref.columns![0].name).toBe("age");
    expect(ref.data).toHaveLength(2);
  });

  it("Model3DRef minimal", () => {
    const ref: Model3DRef = { type: "model_3d", uri: "s3://bucket/model.glb" };
    expect(ref.type).toBe("model_3d");
  });

  it("DocumentRef minimal", () => {
    const ref: DocumentRef = { type: "document", uri: "s3://bucket/doc.pdf" };
    expect(ref.type).toBe("document");
  });

  it("FolderRef minimal", () => {
    const ref: FolderRef = { type: "folder", uri: "s3://bucket/folder/" };
    expect(ref.type).toBe("folder");
  });

  it("AssetRef union of types", () => {
    const ref: AssetRef = { type: "image", uri: "s3://bucket/img.png" };
    expect(ref.type).toBe("image");
  });

  it("WorkflowRef has id", () => {
    const ref: WorkflowRef = { type: "workflow_ref", id: "wf-1" };
    expect(ref.id).toBe("wf-1");
  });

  it("NodeRef has id", () => {
    const ref: NodeRef = { type: "node_ref", id: "n1" };
    expect(ref.id).toBe("n1");
  });

  it("NPArray with shape and dtype", () => {
    const arr: NPArray = {
      type: "np_array",
      uri: "s3://bucket/tensor.npy",
      dtype: "float32",
      shape: [3, 224, 224]
    };
    expect(arr.shape).toEqual([3, 224, 224]);
    expect(arr.dtype).toBe("float32");
  });

  it("SVGElement with children", () => {
    const child: SVGElement = { type: "svg_element", name: "rect" };
    const root: SVGElement = {
      type: "svg",
      name: "svg",
      children: [child],
      attributes: { width: "100", height: "100" }
    };
    expect(root.children).toHaveLength(1);
    expect(root.attributes?.width).toBe("100");
  });

  it("PlotlyConfig has data array", () => {
    const config: PlotlyConfig = {
      type: "plotly_config",
      data: [{ type: "scatter", x: [1, 2], y: [3, 4] }],
      layout: { title: "My Chart" }
    };
    expect(config.data).toHaveLength(1);
    expect(config.layout?.title).toBe("My Chart");
  });
});

// ---------------------------------------------------------------------------
// Datetime / CalendarEvent
// ---------------------------------------------------------------------------

describe("Datetime", () => {
  it("requires year/month/day", () => {
    const dt: Datetime = { type: "datetime", year: 2024, month: 1, day: 15 };
    expect(dt.year).toBe(2024);
    expect(dt.hour).toBeUndefined();
  });

  it("accepts full datetime with timezone", () => {
    const dt: Datetime = {
      type: "datetime",
      year: 2024,
      month: 6,
      day: 21,
      hour: 12,
      minute: 30,
      second: 0,
      tzinfo: "UTC"
    };
    expect(dt.tzinfo).toBe("UTC");
  });
});

describe("CalendarEvent", () => {
  it("requires title", () => {
    const evt: CalendarEvent = { type: "calendar_event", title: "Meeting" };
    expect(evt.title).toBe("Meeting");
    expect(evt.all_day).toBeUndefined();
  });

  it("supports all-day events", () => {
    const evt: CalendarEvent = {
      type: "calendar_event",
      title: "Holiday",
      all_day: true,
      location: "Office"
    };
    expect(evt.all_day).toBe(true);
    expect(evt.location).toBe("Office");
  });
});

// ---------------------------------------------------------------------------
// Asset
// ---------------------------------------------------------------------------

describe("Asset", () => {
  it("has all required fields", () => {
    const asset: Asset = {
      id: "a1",
      user_id: "u1",
      parent_id: "root",
      name: "photo.jpg",
      content_type: "image/jpeg",
      workflow_id: null,
      created_at: "2024-01-01T00:00:00Z",
      get_url: "https://cdn.example.com/photo.jpg",
      thumb_url: "https://cdn.example.com/thumb.jpg"
    };
    expect(asset.id).toBe("a1");
    expect(asset.content_type).toBe("image/jpeg");
    expect(asset.get_url).toBeDefined();
  });

  it("supports optional size and duration", () => {
    const asset: Asset = {
      id: "a2",
      user_id: "u1",
      parent_id: "root",
      name: "audio.mp3",
      content_type: "audio/mpeg",
      size: 1024000,
      duration: 120.5,
      workflow_id: null,
      created_at: "2024-01-01T00:00:00Z",
      get_url: null,
      thumb_url: null
    };
    expect(asset.size).toBe(1024000);
    expect(asset.duration).toBe(120.5);
  });

  it("AssetList wraps assets array with cursor", () => {
    const list: AssetList = {
      next: "cursor-token",
      assets: []
    };
    expect(list.assets).toHaveLength(0);
    expect(list.next).toBe("cursor-token");
  });
});

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

describe("Workflow", () => {
  it("minimal workflow object", () => {
    const wf: Workflow = {
      id: "wf-1",
      name: "My Workflow",
      description: "A test workflow",
      graph: { nodes: [], edges: [] },
      access: "private",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z"
    };
    expect(wf.id).toBe("wf-1");
    expect(wf.graph.nodes).toHaveLength(0);
    expect(wf.tags).toBeUndefined();
  });

  it("WorkflowGraph with nodes and edges", () => {
    const node: Node = {
      id: "n1",
      type: "math.Add",
      sync_mode: "on_any"
    };
    const graph: WorkflowGraph = {
      nodes: [node],
      edges: []
    };
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].type).toBe("math.Add");
  });

  it("WorkflowRequest with required access field", () => {
    const req: WorkflowRequest = {
      name: "New Workflow",
      access: "public"
    };
    expect(req.access).toBe("public");
    expect(req.tags).toBeUndefined();
  });

  it("WorkflowTool has id, name, tool_name, description", () => {
    const tool: WorkflowTool = {
      id: "wf-1",
      name: "My Tool",
      tool_name: "my_tool",
      description: "Does something useful"
    };
    expect(tool.tool_name).toBe("my_tool");
  });
});

// ---------------------------------------------------------------------------
// Thread & Message
// ---------------------------------------------------------------------------

describe("Thread", () => {
  it("has required fields", () => {
    const thread: Thread = {
      id: "t1",
      user_id: "u1",
      title: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z"
    };
    expect(thread.id).toBe("t1");
    expect(thread.title).toBeNull();
  });
});

describe("MessageContent discriminated union", () => {
  it("MessageTextContent", () => {
    const content: MessageTextContent = { type: "text", text: "Hello" };
    expect(content.type).toBe("text");
    expect(content.text).toBe("Hello");
  });

  it("MessageImageContent", () => {
    const content: MessageImageContent = {
      type: "image",
      image: { type: "image", uri: "s3://bucket/img.png" }
    };
    expect(content.type).toBe("image");
    expect(content.image.uri).toBe("s3://bucket/img.png");
  });

  it("MessageVideoContent", () => {
    const content: MessageVideoContent = {
      type: "video",
      video: { type: "video", uri: "s3://bucket/video.mp4" }
    };
    expect(content.type).toBe("video");
  });

  it("MessageAudioContent", () => {
    const content: MessageAudioContent = {
      type: "audio",
      audio: { type: "audio", uri: "s3://bucket/audio.mp3" }
    };
    expect(content.type).toBe("audio");
  });

  it("MessageDocumentContent", () => {
    const content: MessageDocumentContent = {
      type: "document",
      document: { type: "document", uri: "s3://bucket/doc.pdf" }
    };
    expect(content.type).toBe("document");
  });

  it("MessageThoughtContent", () => {
    const content: MessageThoughtContent = {
      type: "thought",
      text: "I am thinking...",
      thought_signature: "sig123"
    };
    expect(content.type).toBe("thought");
    expect(content.thought_signature).toBe("sig123");
  });

  it("MessageContent union narrows correctly", () => {
    const contents: MessageContent[] = [
      { type: "text", text: "hello" },
      { type: "thought", text: "thinking" }
    ];
    for (const c of contents) {
      if (c.type === "text") {
        expect(c.text).toBe("hello");
      } else if (c.type === "thought") {
        expect(c.text).toBe("thinking");
      }
    }
  });
});

describe("Message", () => {
  it("minimal message with role", () => {
    const msg: Message = { role: "user", content: "Hello!" };
    expect(msg.role).toBe("user");
    expect(msg.type).toBeUndefined();
  });

  it("assistant message with tool_calls", () => {
    const toolCall: ToolCall = {
      id: "tc1",
      name: "search",
      args: { query: "cats" },
      result: "Found cats"
    };
    const msg: Message = {
      role: "assistant",
      tool_calls: [toolCall]
    };
    expect(msg.tool_calls).toHaveLength(1);
    expect(msg.tool_calls![0].name).toBe("search");
  });

  it("message with array content (multi-modal)", () => {
    const content: MessageContent[] = [
      { type: "text", text: "Look at this image:" },
      { type: "image", image: { type: "image", uri: "s3://bucket/img.png" } }
    ];
    const msg: Message = { role: "user", content };
    expect(Array.isArray(msg.content)).toBe(true);
    if (Array.isArray(msg.content)) {
      expect(msg.content.length).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Node Metadata
// ---------------------------------------------------------------------------

describe("PropertyTypeMetadata", () => {
  it("has required type, optional flag, and type_args", () => {
    const meta: PropertyTypeMetadata = {
      type: "list",
      optional: false,
      type_args: [{ type: "int", optional: false, type_args: [] }]
    };
    expect(meta.type).toBe("list");
    expect(meta.type_args).toHaveLength(1);
    expect(meta.type_args[0].type).toBe("int");
  });
});

describe("Property", () => {
  it("has required name, type, and required flag", () => {
    const prop: Property = {
      name: "value",
      type: { type: "int", optional: false, type_args: [] },
      required: true
    };
    expect(prop.name).toBe("value");
    expect(prop.required).toBe(true);
  });

  it("supports min/max/default", () => {
    const prop: Property = {
      name: "count",
      type: { type: "int", optional: false, type_args: [] },
      required: false,
      default: 0,
      min: 0,
      max: 100
    };
    expect(prop.min).toBe(0);
    expect(prop.max).toBe(100);
    expect(prop.default).toBe(0);
  });
});

describe("NodeMetadata", () => {
  it("has required fields", () => {
    const meta: NodeMetadata = {
      title: "Add",
      description: "Adds two numbers",
      namespace: "math",
      node_type: "math.Add",
      layout: "default",
      properties: [],
      outputs: [],
      recommended_models: [],
      basic_fields: [],
      required_settings: [],
      is_dynamic: false,
      is_streaming_output: false,
      expose_as_tool: false,
      supports_dynamic_outputs: false
    };
    expect(meta.node_type).toBe("math.Add");
    expect(meta.is_dynamic).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

describe("JobResponse", () => {
  it("has required fields", () => {
    const job: JobResponse = {
      id: "j1",
      user_id: "u1",
      job_type: "workflow",
      workflow_id: "wf-1",
      status: "running"
    };
    expect(job.id).toBe("j1");
    expect(job.status).toBe("running");
    expect(job.error).toBeUndefined();
  });

  it("has optional resumable fields", () => {
    const job: JobResponse = {
      id: "j2",
      user_id: "u1",
      job_type: "workflow",
      workflow_id: "wf-1",
      status: "failed",
      is_resumable: true,
      suspension_reason: "user_input_required"
    };
    expect(job.is_resumable).toBe(true);
    expect(job.suspension_reason).toBe("user_input_required");
  });
});

describe("RunJobRequest", () => {
  it("requires workflow_id", () => {
    const req: RunJobRequest = { workflow_id: "wf-1" };
    expect(req.workflow_id).toBe("wf-1");
    expect(req.params).toBeUndefined();
  });

  it("supports resource limits", () => {
    const limits: ResourceLimits = { max_jobs: 5, max_duration_seconds: 3600 };
    const req: RunJobRequest = {
      workflow_id: "wf-1",
      resource_limits: limits
    };
    expect(req.resource_limits?.max_jobs).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

describe("Model types", () => {
  it("LanguageModel has id, name, provider", () => {
    const model: LanguageModel = {
      type: "language_model",
      id: "gpt-4",
      name: "GPT-4",
      provider: "openai"
    };
    expect(model.provider).toBe("openai");
  });

  it("EmbeddingModel has optional dimensions", () => {
    const model: EmbeddingModel = {
      type: "embedding",
      id: "text-embedding-3-small",
      name: "Text Embedding",
      provider: "openai",
      dimensions: 1536
    };
    expect(model.dimensions).toBe(1536);
  });

  it("UnifiedModel has all optional metadata", () => {
    const model: UnifiedModel = {
      id: "llama-3",
      name: "LLaMA 3",
      provider: "huggingface",
      downloaded: false,
      size_on_disk: null
    };
    expect(model.downloaded).toBe(false);
    expect(model.size_on_disk).toBeNull();
    expect(model.tags).toBeUndefined();
  });

  it("ModelPack wraps a list of models", () => {
    const pack: ModelPack = {
      id: "pack-1",
      name: "Vision Pack",
      models: [
        { id: "model-1", name: "CLIP" },
        { id: "model-2", name: "BLIP" }
      ]
    };
    expect(pack.models).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

describe("SystemStats", () => {
  it("has required cpu and memory fields", () => {
    const stats: SystemStats = {
      cpu_percent: 45.2,
      memory_percent: 70.1
    };
    expect(stats.cpu_percent).toBe(45.2);
    expect(stats.gpu_percent).toBeUndefined();
  });

  it("supports optional GPU fields", () => {
    const stats: SystemStats = {
      cpu_percent: 30,
      memory_percent: 60,
      gpu_percent: 85,
      vram_total_gb: 8,
      vram_used_gb: 4.2,
      vram_percent: 52.5
    };
    expect(stats.vram_total_gb).toBe(8);
    expect(stats.vram_percent).toBeCloseTo(52.5);
  });
});

describe("SecretResponse", () => {
  it("has required key and is_configured fields", () => {
    const secret: SecretResponse = {
      key: "OPENAI_API_KEY",
      is_configured: true
    };
    expect(secret.key).toBe("OPENAI_API_KEY");
    expect(secret.is_configured).toBe(true);
    expect(secret.id).toBeUndefined();
    expect(secret.is_unreadable).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Task / Agent
// ---------------------------------------------------------------------------

describe("Task and Step", () => {
  it("Task has optional steps and result", () => {
    const step: Step = {
      id: "s1",
      name: "fetch_data",
      status: "completed",
      result: { rows: 42 }
    };
    const task: Task = {
      id: "t1",
      name: "process",
      steps: [step],
      status: "running"
    };
    expect(task.steps).toHaveLength(1);
    expect(task.steps![0].result).toEqual({ rows: 42 });
  });

  it("Step supports open-ended extra properties via index signature [key: string]: unknown", () => {
    const step: Step = {
      id: "s2",
      completed: true,
      start_time: 1700000000,
      // The index signature allows arbitrary extra properties, e.g. metadata from the agent layer
      agent_context: { session: "abc" }
    };
    expect(step.agent_context).toEqual({ session: "abc" });
  });

  it("TaskPlan wraps tasks and steps", () => {
    const plan: TaskPlan = {
      type: "task_plan",
      title: "My Plan",
      tasks: [{ id: "t1", name: "task1" }]
    };
    expect(plan.tasks).toHaveLength(1);
    expect(plan.title).toBe("My Plan");
  });
});

// ---------------------------------------------------------------------------
// Files & Workspace
// ---------------------------------------------------------------------------

describe("FileInfo", () => {
  it("represents a file correctly", () => {
    const file: FileInfo = {
      name: "README.md",
      path: "/workspace/README.md",
      is_dir: false,
      size: 2048,
      modified_at: "2024-01-01T00:00:00Z"
    };
    expect(file.is_dir).toBe(false);
    expect(file.size).toBe(2048);
  });
});

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

describe("CollectionResponse", () => {
  it("has name and count", () => {
    const col: CollectionResponse = { name: "documents", count: 150 };
    expect(col.count).toBe(150);
  });

  it("CollectionList wraps collections", () => {
    const list: CollectionList = {
      collections: [{ name: "col1", count: 10 }],
      count: 1
    };
    expect(list.collections).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// WorkflowVersion
// ---------------------------------------------------------------------------

describe("WorkflowVersion", () => {
  it("has all required fields", () => {
    const version: WorkflowVersion = {
      id: "v1",
      workflow_id: "wf-1",
      version: 1,
      created_at: "2024-01-01T00:00:00Z",
      name: "Initial version",
      description: "First save",
      save_type: "manual",
      graph: { nodes: [], edges: [] }
    };
    expect(version.version).toBe(1);
    expect(version.save_type).toBe("manual");
  });

  it("WorkflowVersionSaveType covers all valid types", () => {
    const types: WorkflowVersionSaveType[] = [
      "manual",
      "autosave",
      "checkpoint",
      "restore"
    ];
    expect(types).toHaveLength(4);
    expect(types).toContain("manual");
    expect(types).toContain("autosave");
    expect(types).toContain("checkpoint");
    expect(types).toContain("restore");
  });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

describe("SettingWithValue", () => {
  it("has required fields", () => {
    const setting: SettingWithValue = {
      package_name: "nodetool-base",
      env_var: "OPENAI_API_KEY",
      group: "api_keys",
      description: "OpenAI API key",
      is_secret: true
    };
    expect(setting.env_var).toBe("OPENAI_API_KEY");
    expect(setting.is_secret).toBe(true);
  });

  it("SettingsResponse wraps settings list", () => {
    const response: SettingsResponse = {
      settings: [
        {
          package_name: "base",
          env_var: "KEY",
          group: "auth",
          description: "A key",
          is_secret: false
        }
      ]
    };
    expect(response.settings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// WorkspaceResponse
// ---------------------------------------------------------------------------

describe("WorkspaceResponse", () => {
  it("has required id/name/path fields", () => {
    const ws: WorkspaceResponse = {
      id: "ws-1",
      user_id: "u1",
      name: "My Workspace",
      path: "/home/user/workspace",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z"
    };
    expect(ws.name).toBe("My Workspace");
    expect(ws.is_default).toBeUndefined();
  });
});
