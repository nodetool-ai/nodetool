/**
 * Contract tests for API entity types.
 *
 * Since api-types.ts contains only interfaces and type aliases,
 * these tests verify structural correctness by constructing valid
 * instances and checking that required fields are present.
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
  FontRef,
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
  AssetUpdateRequest,
  WorkflowGraph,
  Workflow,
  WorkflowList,
  WorkflowRequest,
  WorkflowTool,
  WorkflowToolList,
  Thread,
  ThreadList,
  ThreadCreateRequest,
  ThreadUpdateRequest,
  ThreadSummarizeRequest,
  MessageImageUrlContent,
  MessageTextContent,
  MessageImageContent,
  MessageVideoContent,
  MessageAudioContent,
  MessageDocumentContent,
  MessageThoughtContent,
  MessageContent,
  ToolCall,
  Message,
  MessageCreateRequest,
  MessageList,
  PropertyTypeMetadata,
  Property,
  OutputSlot,
  NodeMetadata,
  IndexResponse,
  Node,
  Graph,
  JobResponse,
  JobListResponse,
  RunJobRequest,
  ResourceLimits,
  Provider,
  InferenceProvider,
  ProviderInfo,
  LanguageModel,
  UnifiedModel,
  ModelPack,
  SystemStats,
  SecretResponse,
  Task,
  TaskPlan,
  Step,
  FileInfo,
  WorkspaceFileInfo,
  CollectionResponse,
  CollectionList,
  CollectionCreate,
  WorkspaceResponse,
  WorkspaceListResponse,
  WorkspaceCreateRequest,
  WorkspaceUpdateRequest,
  WorkflowVersion,
  WorkflowVersionList,
  CreateWorkflowVersionRequest,
  AutosaveWorkflowRequest,
  AutosaveResponse,
  SettingWithValue,
  SettingsResponse,
  SettingsUpdateRequest,
} from "../src/api-types.js";

// ---------------------------------------------------------------------------
// Media Refs
// ---------------------------------------------------------------------------

describe("Media Ref types", () => {
  it("ImageRef has required fields", () => {
    const ref: ImageRef = { type: "image", uri: "https://example.com/img.png" };
    expect(ref.type).toBe("image");
    expect(ref.uri).toBeDefined();
  });

  it("AudioRef has required fields", () => {
    const ref: AudioRef = { type: "audio", uri: "audio.mp3" };
    expect(ref.type).toBe("audio");
    expect(ref.duration).toBeUndefined();
  });

  it("VideoRef supports optional format", () => {
    const ref: VideoRef = {
      type: "video",
      uri: "video.mp4",
      format: "mp4",
      duration: 120,
    };
    expect(ref.format).toBe("mp4");
    expect(ref.duration).toBe(120);
  });

  it("TextRef has required fields", () => {
    const ref: TextRef = { type: "text", uri: "text.txt" };
    expect(ref.type).toBe("text");
  });

  it("DataframeRef supports optional columns and data", () => {
    const col: ColumnDef = { name: "col1", data_type: "string" };
    const ref: DataframeRef = {
      type: "dataframe",
      uri: "data.csv",
      columns: [col],
      data: [["val1"]],
    };
    expect(ref.columns).toHaveLength(1);
    expect(ref.data).toHaveLength(1);
  });

  it("Model3DRef has required fields", () => {
    const ref: Model3DRef = { type: "model_3d", uri: "model.glb" };
    expect(ref.type).toBe("model_3d");
  });

  it("DocumentRef has required fields", () => {
    const ref: DocumentRef = { type: "document", uri: "doc.pdf" };
    expect(ref.type).toBe("document");
  });

  it("FolderRef has required fields", () => {
    const ref: FolderRef = { type: "folder", uri: "folder/" };
    expect(ref.type).toBe("folder");
  });

  it("FontRef has required fields", () => {
    const ref: FontRef = { type: "font", uri: "font.ttf" };
    expect(ref.type).toBe("font");
  });

  it("AssetRef type accepts multiple media types", () => {
    const ref: AssetRef = { type: "image", uri: "img.png" };
    expect(ref.type).toBe("image");
  });

  it("WorkflowRef has required fields", () => {
    const ref: WorkflowRef = { type: "workflow_ref", id: "wf1" };
    expect(ref.type).toBe("workflow_ref");
    expect(ref.id).toBe("wf1");
  });

  it("NodeRef has required fields", () => {
    const ref: NodeRef = { type: "node_ref", id: "n1" };
    expect(ref.type).toBe("node_ref");
  });

  it("NPArray supports optional value and shape", () => {
    const arr: NPArray = {
      type: "np_array",
      uri: "arr.npy",
      dtype: "float32",
      shape: [3, 3],
      value: [1, 2, 3],
    };
    expect(arr.shape).toEqual([3, 3]);
  });

  it("SVGElement supports children", () => {
    const el: SVGElement = {
      type: "svg",
      name: "root",
      children: [{ type: "svg_element", name: "circle" }],
    };
    expect(el.children).toHaveLength(1);
  });

  it("PlotlyConfig has required data field", () => {
    const config: PlotlyConfig = {
      type: "plotly_config",
      data: [{ x: [1], y: [2] }],
    };
    expect(config.data).toHaveLength(1);
  });

  it("Datetime has required date fields", () => {
    const dt: Datetime = {
      type: "datetime",
      year: 2024,
      month: 6,
      day: 15,
    };
    expect(dt.year).toBe(2024);
    expect(dt.hour).toBeUndefined();
  });

  it("CalendarEvent has required title", () => {
    const ev: CalendarEvent = {
      type: "calendar_event",
      title: "Meeting",
    };
    expect(ev.title).toBe("Meeting");
    expect(ev.start).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Asset
// ---------------------------------------------------------------------------

describe("Asset types", () => {
  it("Asset has all required fields", () => {
    const asset: Asset = {
      id: "a1",
      user_id: "u1",
      parent_id: "root",
      name: "photo.jpg",
      content_type: "image/jpeg",
      workflow_id: null,
      created_at: "2024-01-01T00:00:00Z",
      get_url: null,
      thumb_url: null,
    };
    expect(asset.id).toBe("a1");
    expect(asset.size).toBeUndefined();
  });

  it("AssetList has assets array", () => {
    const list: AssetList = { next: null, assets: [] };
    expect(list.assets).toEqual([]);
  });

  it("AssetUpdateRequest allows partial updates", () => {
    const req: AssetUpdateRequest = { name: "renamed.jpg" };
    expect(req.name).toBe("renamed.jpg");
    expect(req.parent_id).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

describe("Workflow types", () => {
  it("WorkflowGraph has nodes and edges", () => {
    const graph: WorkflowGraph = { nodes: [], edges: [] };
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("Workflow has all required fields", () => {
    const wf: Workflow = {
      id: "wf1",
      name: "My Workflow",
      description: "A test workflow",
      graph: { nodes: [], edges: [] },
      access: "private",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    expect(wf.id).toBe("wf1");
    expect(wf.tags).toBeUndefined();
  });

  it("WorkflowList has workflows array", () => {
    const list: WorkflowList = { next: null, workflows: [] };
    expect(list.workflows).toEqual([]);
  });

  it("WorkflowRequest has required fields", () => {
    const req: WorkflowRequest = { name: "New WF", access: "private" };
    expect(req.name).toBe("New WF");
  });

  it("WorkflowTool has all required fields", () => {
    const tool: WorkflowTool = {
      id: "t1",
      name: "Tool",
      tool_name: "my_tool",
      description: "A tool",
    };
    expect(tool.tool_name).toBe("my_tool");
  });

  it("WorkflowToolList has tools array", () => {
    const list: WorkflowToolList = { tools: [] };
    expect(list.tools).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Thread & Message
// ---------------------------------------------------------------------------

describe("Thread & Message types", () => {
  it("Thread has all required fields", () => {
    const thread: Thread = {
      id: "t1",
      user_id: "u1",
      title: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    expect(thread.id).toBe("t1");
  });

  it("ThreadList has threads array", () => {
    const list: ThreadList = { threads: [] };
    expect(list.threads).toEqual([]);
  });

  it("ThreadCreateRequest allows optional title", () => {
    const req: ThreadCreateRequest = {};
    expect(req.title).toBeUndefined();
  });

  it("ThreadUpdateRequest requires title", () => {
    const req: ThreadUpdateRequest = { title: "New Title" };
    expect(req.title).toBe("New Title");
  });

  it("ThreadSummarizeRequest has all required fields", () => {
    const req: ThreadSummarizeRequest = {
      provider: "openai",
      model: "gpt-4",
      content: "Summarize this",
    };
    expect(req.provider).toBe("openai");
  });

  it("MessageContent union covers all content types", () => {
    const textContent: MessageTextContent = { type: "text", text: "hello" };
    const imageContent: MessageImageContent = {
      type: "image",
      image: { type: "image", uri: "img.png" },
    };
    const imageUrlContent: MessageImageUrlContent = {
      type: "image_url",
      image: { type: "image", uri: "img.png" },
    };
    const videoContent: MessageVideoContent = {
      type: "video",
      video: { type: "video", uri: "vid.mp4" },
    };
    const audioContent: MessageAudioContent = {
      type: "audio",
      audio: { type: "audio", uri: "audio.mp3" },
    };
    const docContent: MessageDocumentContent = {
      type: "document",
      document: { type: "document", uri: "doc.pdf" },
    };
    const thoughtContent: MessageThoughtContent = {
      type: "thought",
      text: "thinking...",
    };

    // All should be assignable to MessageContent
    const allContent: MessageContent[] = [
      textContent,
      imageContent,
      imageUrlContent,
      videoContent,
      audioContent,
      docContent,
      thoughtContent,
    ];
    expect(allContent).toHaveLength(7);
  });

  it("ToolCall has required fields", () => {
    const tc: ToolCall = { id: "tc1", name: "search", args: { q: "hello" } };
    expect(tc.id).toBe("tc1");
    expect(tc.result).toBeUndefined();
  });

  it("Message has minimal required fields", () => {
    const msg: Message = { role: "user" };
    expect(msg.role).toBe("user");
    expect(msg.content).toBeUndefined();
  });

  it("MessageCreateRequest has required fields", () => {
    const req: MessageCreateRequest = { thread_id: "t1" };
    expect(req.thread_id).toBe("t1");
  });

  it("MessageList has messages array", () => {
    const list: MessageList = { messages: [] };
    expect(list.messages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Node Metadata
// ---------------------------------------------------------------------------

describe("Node Metadata types", () => {
  it("PropertyTypeMetadata has required fields", () => {
    const ptm: PropertyTypeMetadata = {
      type: "int",
      optional: false,
      type_args: [],
    };
    expect(ptm.type).toBe("int");
    expect(ptm.optional).toBe(false);
  });

  it("Property has required fields", () => {
    const prop: Property = {
      name: "value",
      type: { type: "int", optional: false, type_args: [] },
      required: true,
    };
    expect(prop.name).toBe("value");
    expect(prop.required).toBe(true);
  });

  it("OutputSlot has required fields", () => {
    const slot: OutputSlot = {
      type: { type: "float", optional: false, type_args: [] },
      name: "result",
      stream: false,
    };
    expect(slot.name).toBe("result");
  });

  it("NodeMetadata has all required fields", () => {
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
      supports_dynamic_outputs: false,
    };
    expect(meta.node_type).toBe("math.Add");
  });

  it("IndexResponse has node_metadata array", () => {
    const resp: IndexResponse = { node_metadata: [] };
    expect(resp.node_metadata).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Node (API transport)
// ---------------------------------------------------------------------------

describe("Node transport types", () => {
  it("Node has required fields", () => {
    const node: Node = { id: "n1", type: "math.Add", sync_mode: "on_any" };
    expect(node.id).toBe("n1");
    expect(node.data).toBeUndefined();
  });

  it("Graph has nodes and edges", () => {
    const graph: Graph = { nodes: [], edges: [] };
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

describe("Job types", () => {
  it("JobResponse has required fields", () => {
    const job: JobResponse = {
      id: "j1",
      user_id: "u1",
      job_type: "workflow",
      workflow_id: "wf1",
      status: "running",
    };
    expect(job.id).toBe("j1");
    expect(job.error).toBeUndefined();
  });

  it("JobListResponse has jobs array", () => {
    const list: JobListResponse = { jobs: [] };
    expect(list.jobs).toEqual([]);
  });

  it("RunJobRequest has required fields", () => {
    const req: RunJobRequest = { workflow_id: "wf1", env: {} };
    expect(req.workflow_id).toBe("wf1");
  });

  it("ResourceLimits allows optional fields", () => {
    const limits: ResourceLimits = { max_jobs: 5 };
    expect(limits.max_jobs).toBe(5);
    expect(limits.max_duration_seconds).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

describe("Model types", () => {
  it("Provider accepts known providers", () => {
    const p: Provider = "openai";
    expect(p).toBe("openai");
  });

  it("Provider accepts arbitrary string", () => {
    const p: Provider = "custom_provider";
    expect(p).toBe("custom_provider");
  });

  it("InferenceProvider has required fields", () => {
    const ip: InferenceProvider = { name: "OpenAI", is_available: true };
    expect(ip.is_available).toBe(true);
  });

  it("ProviderInfo has required fields", () => {
    const pi: ProviderInfo = {
      provider: "openai",
      capabilities: ["generate_message"],
    };
    expect(pi.capabilities).toHaveLength(1);
  });

  it("LanguageModel has required fields", () => {
    const model: LanguageModel = {
      type: "language",
      id: "gpt-4",
      name: "GPT-4",
      provider: "openai",
    };
    expect(model.id).toBe("gpt-4");
  });

  it("UnifiedModel has required fields", () => {
    const model: UnifiedModel = { id: "m1", name: "Model 1" };
    expect(model.id).toBe("m1");
    expect(model.provider).toBeUndefined();
  });

  it("ModelPack has required models array", () => {
    const pack: ModelPack = { models: [] };
    expect(pack.models).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

describe("System types", () => {
  it("SystemStats has required fields", () => {
    const stats: SystemStats = { cpu_percent: 50, memory_percent: 60 };
    expect(stats.cpu_percent).toBe(50);
    expect(stats.gpu_percent).toBeUndefined();
  });

  it("SecretResponse has required fields", () => {
    const secret: SecretResponse = { key: "OPENAI_API_KEY", is_configured: true };
    expect(secret.key).toBe("OPENAI_API_KEY");
  });
});

// ---------------------------------------------------------------------------
// Task / Agent
// ---------------------------------------------------------------------------

describe("Task types", () => {
  it("Task allows optional fields", () => {
    const task: Task = {};
    expect(task.id).toBeUndefined();
  });

  it("TaskPlan supports tasks array", () => {
    const plan: TaskPlan = { tasks: [{ name: "step1" }] };
    expect(plan.tasks).toHaveLength(1);
  });

  it("Step allows optional fields", () => {
    const step: Step = { id: "s1", name: "Step 1" };
    expect(step.name).toBe("Step 1");
    expect(step.completed).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Files & Workspace
// ---------------------------------------------------------------------------

describe("File types", () => {
  it("FileInfo has required fields", () => {
    const fi: FileInfo = {
      name: "test.txt",
      path: "/home/test.txt",
      is_dir: false,
      size: 100,
      modified_at: "2024-01-01T00:00:00Z",
    };
    expect(fi.name).toBe("test.txt");
  });

  it("WorkspaceFileInfo has same structure as FileInfo", () => {
    const wfi: WorkspaceFileInfo = {
      name: "workspace.txt",
      path: "/workspace/workspace.txt",
      is_dir: false,
      size: 200,
      modified_at: "2024-01-01T00:00:00Z",
    };
    expect(wfi.path).toContain("workspace");
  });
});

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

describe("Collection types", () => {
  it("CollectionResponse has required fields", () => {
    const col: CollectionResponse = { name: "my_collection", count: 10 };
    expect(col.name).toBe("my_collection");
  });

  it("CollectionList has collections array", () => {
    const list: CollectionList = { collections: [] };
    expect(list.collections).toEqual([]);
  });

  it("CollectionCreate has required fields", () => {
    const create: CollectionCreate = {
      name: "new_collection",
      embedding_model: "text-embedding-ada-002",
    };
    expect(create.embedding_model).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

describe("Workspace types", () => {
  it("WorkspaceResponse has required fields", () => {
    const ws: WorkspaceResponse = {
      id: "ws1",
      user_id: "u1",
      name: "My Workspace",
      path: "/home/user/workspace",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    expect(ws.id).toBe("ws1");
  });

  it("WorkspaceListResponse has workspaces array", () => {
    const list: WorkspaceListResponse = { workspaces: [] };
    expect(list.workspaces).toEqual([]);
  });

  it("WorkspaceCreateRequest has required fields", () => {
    const req: WorkspaceCreateRequest = { name: "New Workspace" };
    expect(req.name).toBe("New Workspace");
  });

  it("WorkspaceUpdateRequest allows partial updates", () => {
    const req: WorkspaceUpdateRequest = { name: "Updated Name" };
    expect(req.name).toBe("Updated Name");
    expect(req.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Workflow Version
// ---------------------------------------------------------------------------

describe("Workflow Version types", () => {
  it("WorkflowVersion has required fields", () => {
    const ver: WorkflowVersion = {
      id: "v1",
      workflow_id: "wf1",
      version: 1,
      created_at: "2024-01-01T00:00:00Z",
      name: "v1",
      description: "Initial version",
      save_type: "manual",
      graph: { nodes: [], edges: [] },
    };
    expect(ver.version).toBe(1);
  });

  it("WorkflowVersionList has versions array", () => {
    const list: WorkflowVersionList = { next: null, versions: [] };
    expect(list.versions).toEqual([]);
  });

  it("CreateWorkflowVersionRequest allows optional fields", () => {
    const req: CreateWorkflowVersionRequest = {};
    expect(req.name).toBeUndefined();
  });

  it("AutosaveWorkflowRequest allows optional fields", () => {
    const req: AutosaveWorkflowRequest = {};
    expect(req.save_type).toBeUndefined();
  });

  it("AutosaveResponse has required message", () => {
    const resp: AutosaveResponse = { message: "Saved" };
    expect(resp.message).toBe("Saved");
  });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

describe("Settings types", () => {
  it("SettingWithValue has required fields", () => {
    const setting: SettingWithValue = {
      package_name: "core",
      env_var: "OPENAI_API_KEY",
      group: "api_keys",
      description: "OpenAI API Key",
      is_secret: true,
    };
    expect(setting.is_secret).toBe(true);
  });

  it("SettingsResponse has settings array", () => {
    const resp: SettingsResponse = { settings: [] };
    expect(resp.settings).toEqual([]);
  });

  it("SettingsUpdateRequest has required fields", () => {
    const req: SettingsUpdateRequest = { settings: { key: "value" } };
    expect(req.settings).toBeDefined();
    expect(req.secrets).toBeUndefined();
  });
});
