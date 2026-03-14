/**
 * Type definitions for the NodeTool API.
 * These types represent the data structures used in the NodeTool API.
 */

export type Provider = "aime" | "openai" | "openrouter" | "anthropic" | "cerebras" | "groq" | "minimax" | "replicate" | "ollama" | "lmstudio" | "kie" | "together" | "comfy_local" | "comfy_runpod" | "local" | "llama_cpp" | "gemini" | "vllm" | "zai" | "mistral" | "empty" | "mlx" | "fal_ai" | "fake" | "huggingface" | "huggingface_cohere" | "huggingface_fal_ai" | "huggingface_featherless_ai" | "huggingface_fireworks_ai" | "huggingface_groq" | "huggingface_cerebras" | "huggingface_hf_inference" | "huggingface_hyperbolic" | "huggingface_nebius" | "huggingface_novita" | "huggingface_nscale" | "huggingface_openai" | "huggingface_replicate" | "huggingface_sambanova" | "huggingface_scaleway" | "huggingface_together" | "huggingface_zai" | "meshy" | "rodin";

export type ASRModel = {
    /**
     * Type
     * @default asr_model
     * @constant
     */
    type: "asr_model";
    /** @default empty */
    provider: Provider;
    /**
     * Id
     * @default
     */
    id: string;
    /**
     * Name
     * @default
     */
    name: string;
    /** Path */
    path?: string | null;
};

export type Asset = {
    /** Id */
    id: string;
    /** User Id */
    user_id: string;
    /** Workflow Id */
    workflow_id: string | null;
    /** Parent Id */
    parent_id: string;
    /** Name */
    name: string;
    /** Content Type */
    content_type: string;
    /** Size */
    size?: number | null;
    /** Metadata */
    metadata?: {
        [key: string]: unknown;
    } | null;
    /** Created At */
    created_at: string;
    /** Get Url */
    get_url: string | null;
    /** Thumb Url */
    thumb_url: string | null;
    /** Duration */
    duration?: number | null;
    /** Node Id */
    node_id?: string | null;
    /** Job Id */
    job_id?: string | null;
    /** Etag */
    etag?: string | null;
};

export type AssetList = {
    /** Next */
    next: string | null;
    /** Assets */
    assets: Asset[];
};

export type AssetRef = {
    /**
     * Type
     * @default asset
     */
    type: unknown;
    /**
     * Uri
     * @default
     */
    uri: string;
    /** Asset Id */
    asset_id?: string | null;
    /** Data */
    data?: unknown;
    /** Metadata */
    metadata?: {
        [key: string]: unknown;
    } | null;
};

export type AssetUpdateRequest = {
    /** Name */
    name?: string | null;
    /** Parent Id */
    parent_id?: string | null;
    /** Content Type */
    content_type?: string | null;
    /** Data */
    data?: string | null;
    /** Data Encoding */
    data_encoding?: "base64" | null;
    /** Metadata */
    metadata?: {
        [key: string]: unknown;
    } | null;
    /** Duration */
    duration?: number | null;
    /** Size */
    size?: number | null;
};

export type AudioRef = {
    /**
     * Type
     * @default audio
     * @constant
     */
    type: "audio";
    /**
     * Uri
     * @default
     */
    uri: string;
    /** Asset Id */
    asset_id?: string | null;
    /** Data */
    data?: unknown;
    /** Metadata */
    metadata?: {
        [key: string]: unknown;
    } | null;
};

export type Body_create_api_assets__post = {
    /** File */
    file?: string | null;
    /** Json */
    json?: string | null;
};

export type Datetime = {
    /**
     * Type
     * @default datetime
     * @constant
     */
    type: "datetime";
    /**
     * Year
     * @default 0
     */
    year: number;
    /**
     * Month
     * @default 0
     */
    month: number;
    /**
     * Day
     * @default 0
     */
    day: number;
    /**
     * Hour
     * @default 0
     */
    hour: number;
    /**
     * Minute
     * @default 0
     */
    minute: number;
    /**
     * Second
     * @default 0
     */
    second: number;
    /**
     * Microsecond
     * @default 0
     */
    microsecond: number;
    /**
     * Tzinfo
     * @default UTC
     */
    tzinfo: string;
    /**
     * Utc Offset
     * @default 0
     */
    utc_offset: number;
};

export type CalendarEvent = {
    /**
     * Type
     * @default calendar_event
     * @constant
     */
    type: "calendar_event";
    /**
     * Title
     * @default
     */
    title: string;
    /** @default {
     *       "type": "datetime",
     *       "year": 0,
     *       "month": 0,
     *       "day": 0,
     *       "hour": 0,
     *       "minute": 0,
     *       "second": 0,
     *       "microsecond": 0,
     *       "tzinfo": "UTC",
     *       "utc_offset": 0
     *     } */
    start_date: Datetime;
    /** @default {
     *       "type": "datetime",
     *       "year": 0,
     *       "month": 0,
     *       "day": 0,
     *       "hour": 0,
     *       "minute": 0,
     *       "second": 0,
     *       "microsecond": 0,
     *       "tzinfo": "UTC",
     *       "utc_offset": 0
     *     } */
    end_date: Datetime;
    /**
     * Calendar
     * @default
     */
    calendar: string;
    /**
     * Location
     * @default
     */
    location: string;
    /**
     * Notes
     * @default
     */
    notes: string;
};

export type Chunk = {
    /**
     * Type
     * @default chunk
     * @constant
     */
    type: "chunk";
    /** Node Id */
    node_id?: string | null;
    /** Thread Id */
    thread_id?: string | null;
    /** Workflow Id */
    workflow_id?: string | null;
    /**
     * Content Type
     * @default text
     * @enum {string}
     */
    content_type: "text" | "audio" | "image" | "video" | "document";
    /**
     * Content
     * @default
     */
    content: string;
    /**
     * Content Metadata
     * @default {}
     */
    content_metadata: {
        [key: string]: unknown;
    };
    /**
     * Done
     * @default false
     */
    done: boolean;
    /**
     * Thinking
     * @default false
     */
    thinking: boolean;
};

export type ColumnDef = {
    /** Name */
    name: string;
    /** Data Type */
    data_type: "int" | "float" | "datetime" | "string" | "object";
    /**
     * Description
     * @default
     */
    description: string;
};

export type DataframeRef = {
    /**
     * Type
     * @default dataframe
     * @constant
     */
    type: "dataframe";
    /**
     * Uri
     * @default
     */
    uri: string;
    /** Asset Id */
    asset_id?: string | null;
    /** Data */
    data?: unknown[][] | null;
    /** Metadata */
    metadata?: {
        [key: string]: unknown;
    } | null;
    /** Columns */
    columns?: ColumnDef[] | null;
};

export type DocumentRef = {
    /**
     * Type
     * @default document
     * @constant
     */
    type: "document";
    /**
     * Uri
     * @default
     */
    uri: string;
    /** Asset Id */
    asset_id?: string | null;
    /** Data */
    data?: unknown;
    /** Metadata */
    metadata?: {
        [key: string]: unknown;
    } | null;
};

export type Edge = {
    /** Id */
    id?: string | null;
    /** Source */
    source: string;
    /** Sourcehandle */
    sourceHandle: string;
    /** Target */
    target: string;
    /** Targethandle */
    targetHandle: string;
    /** Ui Properties */
    ui_properties?: {
        [key: string]: string;
    } | null;
    /**
     * Edge Type
     * @default data
     * @enum {string}
     */
    edge_type: "data" | "control";
};

export type EdgeUpdate = {
    /**
     * Type
     * @default edge_update
     * @constant
     */
    type: "edge_update";
    /** Workflow Id */
    workflow_id: string;
    /** Edge Id */
    edge_id: string;
    /** Status */
    status: string;
    /** Counter */
    counter?: number | null;
};

export type EmbeddingModel = {
    /**
     * Type
     * @default embedding_model
     * @constant
     */
    type: "embedding_model";
    /** @default empty */
    provider: Provider;
    /**
     * Id
     * @default
     */
    id: string;
    /**
     * Name
     * @default
     */
    name: string;
    /**
     * Dimensions
     * @default 0
     */
    dimensions: number;
};

export type Error = {
    /**
     * Type
     * @default error
     * @constant
     */
    type: "error";
    /** Message */
    message: string;
    /** Thread Id */
    thread_id?: string | null;
    /** Workflow Id */
    workflow_id?: string | null;
};

export type ExecutionStrategy = "threaded" | "subprocess" | "docker";

export type FolderRef = {
    /**
     * Type
     * @default folder
     * @constant
     */
    type: "folder";
    /**
     * Uri
     * @default
     */
    uri: string;
    /** Asset Id */
    asset_id?: string | null;
    /** Data */
    data?: unknown;
    /** Metadata */
    metadata?: {
        [key: string]: unknown;
    } | null;
};

export type FontSource = "system" | "google_fonts" | "url";

export type FontRef = {
    /**
     * Type
     * @default font
     * @constant
     */
    type: "font";
    /**
     * Name
     * @default
     */
    name: string;
    /** @default system */
    source: FontSource;
    /**
     * Url
     * @default
     */
    url: string;
    /**
     * Weight
     * @default regular
     */
    weight: string;
};

export type TypeMetadata_Input = {
    /** Type */
    type: string;
    /**
     * Optional
     * @default false
     */
    optional: boolean;
    /** Values */
    values?: (string | number)[] | null;
    /**
     * Type Args
     * @default []
     */
    type_args: TypeMetadata_Input[];
    /** Type Name */
    type_name?: string | null;
};

export type Node_Input = {
    /** Id */
    id: string;
    /** Parent Id */
    parent_id?: string | null;
    /**
     * Type
     * @default default
     */
    type: string;
    /** Data */
    data?: unknown;
    /** Ui Properties */
    ui_properties?: unknown;
    /** Dynamic Properties */
    dynamic_properties?: {
        [key: string]: unknown;
    };
    /** Dynamic Outputs */
    dynamic_outputs?: {
        [key: string]: TypeMetadata_Input;
    };
    /**
     * Sync Mode
     * @default on_any
     */
    sync_mode: string;
};

export type Graph_Input = {
    /** Nodes */
    nodes: Node_Input[];
    /** Edges */
    edges: Edge[];
};

export type TypeMetadata_Output = {
    /** Type */
    type: string;
    /**
     * Optional
     * @default false
     */
    optional: boolean;
    /** Values */
    values?: (string | number)[] | null;
    /**
     * Type Args
     * @default []
     */
    type_args: TypeMetadata_Output[];
    /** Type Name */
    type_name?: string | null;
};

export type Node_Output = {
    /** Id */
    id: string;
    /** Parent Id */
    parent_id?: string | null;
    /**
     * Type
     * @default default
     */
    type: string;
    /** Data */
    data?: unknown;
    /** Ui Properties */
    ui_properties?: unknown;
    /** Dynamic Properties */
    dynamic_properties?: {
        [key: string]: unknown;
    };
    /** Dynamic Outputs */
    dynamic_outputs?: {
        [key: string]: TypeMetadata_Output;
    };
    /**
     * Sync Mode
     * @default on_any
     */
    sync_mode: string;
};

export type Graph_Output = {
    /** Nodes */
    nodes: Node_Output[];
    /** Edges */
    edges: Edge[];
};

export type HuggingFaceModel = {
    /**
     * Type
     * @default hf.model
     */
    type: unknown;
    /**
     * Repo Id
     * @default
     */
    repo_id: string;
    /** Path */
    path?: string | null;
    /** Variant */
    variant?: string | null;
    /** Allow Patterns */
    allow_patterns?: string[] | null;
    /** Ignore Patterns */
    ignore_patterns?: string[] | null;
};

export type ImageModel = {
    /**
     * Type
     * @default image_model
     * @constant
     */
    type: "image_model";
    /** @default empty */
    provider: Provider;
    /**
     * Id
     * @default
     */
    id: string;
    /**
     * Name
     * @default
     */
    name: string;
    /** Path */
    path?: string | null;
    /** Supported Tasks */
    supported_tasks?: string[];
};

export type ImageRef = {
    /**
     * Type
     * @default image
     * @constant
     */
    type: "image";
    /**
     * Uri
     * @default
     */
    uri: string;
    /** Asset Id */
    asset_id?: string | null;
    /** Data */
    data?: unknown;
    /** Metadata */
    metadata?: {
        [key: string]: unknown;
    } | null;
};

export type IndexResponse = {
    /** Path */
    path: string;
    /** Error */
    error?: string | null;
};

export type InferenceProvider = "cerebras" | "cohere" | "fal-ai" | "featherless-ai" | "fireworks-ai" | "groq" | "hf-inference" | "hyperbolic" | "nebius" | "novita" | "nscale" | "openai" | "replicate" | "sambanova" | "scaleway" | "together" | "zai-org";

export type JobResponse = {
    /** Id */
    id: string;
    /** User Id */
    user_id: string;
    /** Job Type */
    job_type: string;
    /** Status */
    status: string | null;
    /** Workflow Id */
    workflow_id: string;
    /** Started At */
    started_at?: string | null;
    /** Finished At */
    finished_at?: string | null;
    /** Error */
    error?: string | null;
    /** Cost */
    cost?: number | null;
    /** Suspended Node Id */
    suspended_node_id?: string | null;
    /** Suspension Reason */
    suspension_reason?: string | null;
    /** Error Message */
    error_message?: string | null;
    /** Execution Strategy */
    execution_strategy?: string | null;
    /**
     * Is Resumable
     * @default false
     */
    is_resumable: boolean;
    /** Etag */
    etag?: string | null;
};

export type JobListResponse = {
    /** Jobs */
    jobs: JobResponse[];
    /** Next Start Key */
    next_start_key?: string | null;
};

export type RunStateInfo = {
    /** Status */
    status: string;
    /** Suspended Node Id */
    suspended_node_id?: string | null;
    /** Suspension Reason */
    suspension_reason?: string | null;
    /** Error Message */
    error_message?: string | null;
    /** Execution Strategy */
    execution_strategy?: string | null;
    /**
     * Is Resumable
     * @default false
     */
    is_resumable: boolean;
};

export type JobUpdate = {
    /**
     * Type
     * @default job_update
     * @constant
     */
    type: "job_update";
    /** Status */
    status: string;
    /** Job Id */
    job_id?: string | null;
    /** Workflow Id */
    workflow_id?: string | null;
    /** Message */
    message?: string | null;
    /** Result */
    result?: {
        [key: string]: unknown;
    } | null;
    /** Error */
    error?: string | null;
    /** Traceback */
    traceback?: string | null;
    run_state?: RunStateInfo | null;
    /** Duration */
    duration?: number | null;
};

export type LanguageModel = {
    /**
     * Type
     * @default language_model
     * @constant
     */
    type: "language_model";
    /** @default empty */
    provider: Provider;
    /**
     * Id
     * @default
     */
    id: string;
    /**
     * Name
     * @default
     */
    name: string;
    /** Path */
    path?: string | null;
    /** Supported Tasks */
    supported_tasks?: string[];
};

export type LlamaModel = {
    /**
     * Type
     * @default llama_model
     * @constant
     */
    type: "llama_model";
    /**
     * Name
     * @default
     */
    name: string;
    /**
     * Repo Id
     * @default
     */
    repo_id: string;
    /**
     * Modified At
     * @default
     */
    modified_at: string;
    /**
     * Size
     * @default 0
     */
    size: number;
    /**
     * Digest
     * @default
     */
    digest: string;
    /** Details */
    details?: {
        [key: string]: unknown;
    };
};

export type LogEntry = {
    /**
     * Type
     * @default log_entry
     * @constant
     */
    type: "log_entry";
    /**
     * Message
     * @description The message of the log entry
     * @default
     */
    message: string;
    /**
     * Level
     * @description The level of the log entry
     * @default info
     * @enum {string}
     */
    level: "debug" | "info" | "warning" | "error";
    /**
     * Timestamp
     * @description The timestamp of the log entry
     * @default 0
     */
    timestamp: number;
};

export type LogUpdate = {
    /**
     * Type
     * @default log_update
     * @constant
     */
    type: "log_update";
    /** Node Id */
    node_id: string;
    /** Node Name */
    node_name: string;
    /** Content */
    content: string;
    /**
     * Severity
     * @enum {string}
     */
    severity: "info" | "warning" | "error";
    /** Workflow Id */
    workflow_id?: string | null;
};

export type MessageAudioContent = {
    /**
     * Type
     * @default audio
     * @constant
     */
    type: "audio";
    /** @default {
     *       "type": "audio",
     *       "uri": ""
     *     } */
    audio: AudioRef;
};

export type MessageDocumentContent = {
    /**
     * Type
     * @default document
     * @constant
     */
    type: "document";
    /** @default {
     *       "type": "document",
     *       "uri": ""
     *     } */
    document: DocumentRef;
};

export type MessageFile = {
    /**
     * Type
     * @default file
     * @constant
     */
    type: "file";
    /**
     * Content
     * Format: binary
     */
    content: string;
    /** Mime Type */
    mime_type: string;
};

export type MessageImageContent = {
    /**
     * Type
     * @default image_url
     * @constant
     */
    type: "image_url";
    /** @default {
     *       "type": "image",
     *       "uri": ""
     *     } */
    image: ImageRef;
};

export type MessageTextContent = {
    /**
     * Type
     * @default text
     * @constant
     */
    type: "text";
    /**
     * Text
     * @default
     */
    text: string;
};

export type MessageThoughtContent = {
    /**
     * Type
     * @default thought
     * @constant
     */
    type: "thought";
    /**
     * Text
     * @default
     */
    text: string;
    /** Thought Signature */
    thought_signature?: string | null;
};

export type VideoRef = {
    /**
     * Type
     * @default video
     * @constant
     */
    type: "video";
    /**
     * Uri
     * @default
     */
    uri: string;
    /** Asset Id */
    asset_id?: string | null;
    /** Data */
    data?: unknown;
    /** Metadata */
    metadata?: {
        [key: string]: unknown;
    } | null;
    /** Duration */
    duration?: number | null;
    /** Format */
    format?: string | null;
};

export type MessageVideoContent = {
    /**
     * Type
     * @default video
     * @constant
     */
    type: "video";
    /** @default {
     *       "type": "video",
     *       "uri": ""
     *     } */
    video: VideoRef;
};

export type ToolCall = {
    /**
     * Id
     * @default
     */
    id: string;
    /**
     * Name
     * @default
     */
    name: string;
    /**
     * Args
     * @default {}
     */
    args: {
        [key: string]: unknown;
    };
    /** Result */
    result?: unknown;
    /** Step Id */
    step_id?: string | null;
    /** Message */
    message?: string | null;
};

export type Message = {
    /**
     * Type
     * @default message
     * @constant
     */
    type: "message";
    /** Id */
    id?: string | null;
    /** Workflow Id */
    workflow_id?: string | null;
    graph?: Graph_Output | null;
    /** Thread Id */
    thread_id?: string | null;
    /** Tools */
    tools?: string[] | null;
    /** Tool Call Id */
    tool_call_id?: string | null;
    /**
     * Role
     * @default
     */
    role: string;
    /** Name */
    name?: string | null;
    /** Content */
    content?: string | {
        [key: string]: unknown;
    } | (MessageTextContent | MessageImageContent | MessageAudioContent | MessageVideoContent | MessageDocumentContent | MessageThoughtContent)[] | null;
    /** Tool Calls */
    tool_calls?: ToolCall[] | null;
    /** Collections */
    collections?: string[] | null;
    /** Input Files */
    input_files?: MessageFile[] | null;
    /** Created At */
    created_at?: string | null;
    provider?: Provider | null;
    /** Model */
    model?: string | null;
    /** Agent Mode */
    agent_mode?: boolean | null;
    /** Help Mode */
    help_mode?: boolean | null;
    /** Agent Execution Id */
    agent_execution_id?: string | null;
    /** Execution Event Type */
    execution_event_type?: string | null;
    /** Workflow Target */
    workflow_target?: string | null;
};

export type MessageCreateRequest = {
    /** Thread Id */
    thread_id?: string | null;
    /** User Id */
    user_id?: string | null;
    /** Tool Call Id */
    tool_call_id?: string | null;
    /**
     * Role
     * @default
     */
    role: string;
    /** Name */
    name?: string | null;
    /** Content */
    content?: string | {
        [key: string]: unknown;
    } | (MessageTextContent | MessageImageContent | MessageAudioContent | MessageVideoContent | MessageDocumentContent | MessageThoughtContent)[] | null;
    /** Tool Calls */
    tool_calls?: ToolCall[] | null;
    /** Created At */
    created_at?: string | null;
};

export type MessageList = {
    /** Next */
    next: string | null;
    /** Messages */
    messages: Message[];
};

export type Model3DRef = {
    /**
     * Type
     * @default model_3d
     * @constant
     */
    type: "model_3d";
    /**
     * Uri
     * @default
     */
    uri: string;
    /** Asset Id */
    asset_id?: string | null;
    /** Data */
    data?: unknown;
    /** Metadata */
    metadata?: {
        [key: string]: unknown;
    } | null;
    /** Format */
    format?: string | null;
    material_file?: AssetRef | null;
    /** Texture Files */
    texture_files?: ImageRef[];
};

export type UnifiedModel = {
    /** Id */
    id: string;
    /** Type */
    type: string | null;
    /** Name */
    name: string;
    /** Repo Id */
    repo_id: string | null;
    /** Path */
    path?: string | null;
    /** Artifact Family */
    artifact_family?: string | null;
    /** Artifact Component */
    artifact_component?: string | null;
    /** Artifact Confidence */
    artifact_confidence?: number | null;
    /** Artifact Evidence */
    artifact_evidence?: string[] | null;
    /** Cache Path */
    cache_path?: string | null;
    /** Allow Patterns */
    allow_patterns?: string[] | null;
    /** Ignore Patterns */
    ignore_patterns?: string[] | null;
    /** Description */
    description?: string | null;
    /** Readme */
    readme?: string | null;
    /** Downloaded */
    downloaded?: boolean | null;
    /** Size On Disk */
    size_on_disk?: number | null;
    /** Pipeline Tag */
    pipeline_tag?: string | null;
    /** Tags */
    tags?: string[] | null;
    /** Has Model Index */
    has_model_index?: boolean | null;
    /** Downloads */
    downloads?: number | null;
    /** Likes */
    likes?: number | null;
    /** Trending Score */
    trending_score?: number | null;
};

export type ModelPack = {
    /** Id */
    id: string;
    /** Title */
    title: string;
    /** Description */
    description: string;
    /**
     * Category
     * @default image_generation
     */
    category: string;
    /**
     * Tags
     * @default []
     */
    tags: string[];
    /**
     * Models
     * @default []
     */
    models: UnifiedModel[];
    /** Total Size */
    total_size?: number | null;
};

export type NPArray = {
    /**
     * Type
     * @default np_array
     * @constant
     */
    type: "np_array";
    /** Value */
    value?: string | null;
    /**
     * Dtype
     * @default <i8
     */
    dtype: string;
    /**
     * Shape
     * @default [
     *       1
     *     ]
     */
    shape: number[];
};

export type OutputSlot = {
    type: TypeMetadata_Output;
    /** Name */
    name: string;
    /**
     * Stream
     * @default false
     */
    stream: boolean;
};

export type Property = {
    /** Name */
    name: string;
    type: TypeMetadata_Output;
    /** Default */
    default?: unknown;
    /** Title */
    title?: string | null;
    /** Description */
    description?: string | null;
    /** Min */
    min?: number | null;
    /** Max */
    max?: number | null;
    /** Json Schema Extra */
    json_schema_extra?: {
        [key: string]: unknown;
    } | null;
    /**
     * Required
     * @default false
     */
    required: boolean;
};

export type NodeMetadata = {
    /**
     * Title
     * @description UI Title of the node
     */
    title: string;
    /**
     * Description
     * @description UI Description of the node
     */
    description: string;
    /**
     * Namespace
     * @description Namespace of the node
     */
    namespace: string;
    /**
     * Node Type
     * @description Fully qualified type of the node
     */
    node_type: string;
    /**
     * Layout
     * @description UI Layout of the node
     * @default default
     */
    layout: string;
    /**
     * Properties
     * @description Properties of the node
     */
    properties: Property[];
    /**
     * Outputs
     * @description Outputs of the node
     */
    outputs: OutputSlot[];
    /**
     * The Model Info
     * @description HF Model info for the node
     */
    the_model_info: {
        [key: string]: unknown;
    };
    /**
     * Recommended Models
     * @description Recommended models for the node
     */
    recommended_models: UnifiedModel[];
    /**
     * Basic Fields
     * @description Basic fields of the node
     */
    basic_fields: string[];
    /**
     * Required Settings
     * @description Environment setting/secret keys required to run the node
     */
    required_settings: string[];
    /**
     * Is Dynamic
     * @description Whether the node is dynamic
     * @default false
     */
    is_dynamic: boolean;
    /**
     * Is Streaming Output
     * @description Whether the node can stream output
     * @default false
     */
    is_streaming_output: boolean;
    /**
     * Expose As Tool
     * @description Whether the node is exposed as a tool
     * @default false
     */
    expose_as_tool: boolean;
    /**
     * Supports Dynamic Outputs
     * @description Whether the node can declare outputs dynamically at runtime (only for dynamic nodes)
     * @default false
     */
    supports_dynamic_outputs: boolean;
    /**
     * Model Packs
     * @description Model packs associated with this node
     */
    model_packs?: ModelPack[];
};

export type NodeProgress = {
    /**
     * Type
     * @default node_progress
     * @constant
     */
    type: "node_progress";
    /** Node Id */
    node_id: string;
    /** Progress */
    progress: number;
    /** Total */
    total: number;
    /**
     * Chunk
     * @default
     */
    chunk: string;
    /** Workflow Id */
    workflow_id?: string | null;
};

export type NodeRef = {
    /**
     * Type
     * @default node
     * @constant
     */
    type: "node";
    /**
     * Id
     * @default
     */
    id: string;
};

export type NodeUpdate = {
    /**
     * Type
     * @default node_update
     * @constant
     */
    type: "node_update";
    /** Node Id */
    node_id: string;
    /** Node Name */
    node_name: string;
    /** Node Type */
    node_type: string;
    /** Status */
    status: string;
    /** Error */
    error?: string | null;
    /** Result */
    result?: {
        [key: string]: unknown;
    } | null;
    /** Properties */
    properties?: {
        [key: string]: unknown;
    } | null;
    /** Workflow Id */
    workflow_id?: string | null;
};

export type Notification = {
    /**
     * Type
     * @default notification
     * @constant
     */
    type: "notification";
    /** Node Id */
    node_id: string;
    /** Content */
    content: string;
    /**
     * Severity
     * @enum {string}
     */
    severity: "info" | "warning" | "error";
    /** Workflow Id */
    workflow_id?: string | null;
};

export type OutputUpdate = {
    /**
     * Type
     * @default output_update
     * @constant
     */
    type: "output_update";
    /** Node Id */
    node_id: string;
    /** Node Name */
    node_name: string;
    /** Output Name */
    output_name: string;
    /** Value */
    value: unknown;
    /** Output Type */
    output_type: string;
    /** Metadata */
    metadata?: {
        [key: string]: unknown;
    };
    /** Workflow Id */
    workflow_id?: string | null;
};

export type PlanningUpdate = {
    /**
     * Type
     * @default planning_update
     * @constant
     */
    type: "planning_update";
    /** Node Id */
    node_id?: string | null;
    /** Thread Id */
    thread_id?: string | null;
    /** Workflow Id */
    workflow_id?: string | null;
    /** Phase */
    phase: string;
    /** Status */
    status: string;
    /** Content */
    content?: string | null;
};

export type PlotlyConfig = {
    /**
     * Type
     * @default plotly_config
     * @constant
     */
    type: "plotly_config";
    /**
     * Config
     * @default {}
     */
    config: {
        [key: string]: unknown;
    };
};

export type Prediction = {
    /**
     * Type
     * @default prediction
     * @constant
     */
    type: "prediction";
    /** Id */
    id: string;
    /** User Id */
    user_id: string;
    /** Node Id */
    node_id: string;
    /** Workflow Id */
    workflow_id?: string | null;
    /** Provider */
    provider?: string | null;
    /** Model */
    model?: string | null;
    /** Version */
    version?: string | null;
    /** Node Type */
    node_type?: string | null;
    /** Status */
    status: string;
    /** Params */
    params?: {
        [key: string]: unknown;
    };
    /** Data */
    data?: unknown | null;
    /** Cost */
    cost?: number | null;
    /** Logs */
    logs?: string | null;
    /** Error */
    error?: string | null;
    /** Duration */
    duration?: number | null;
    /** Created At */
    created_at?: string | null;
    /** Started At */
    started_at?: string | null;
    /** Completed At */
    completed_at?: string | null;
};

export type PreviewUpdate = {
    /**
     * Type
     * @default preview_update
     * @constant
     */
    type: "preview_update";
    /** Node Id */
    node_id: string;
    /** Value */
    value: unknown;
};

export type ProviderInfo = {
    provider: Provider;
    /** Capabilities */
    capabilities: string[];
};

export type RepoPath = {
    /** Repo Id */
    repo_id: string;
    /** Path */
    path: string;
    /**
     * Downloaded
     * @default false
     */
    downloaded: boolean;
};

export type ResourceLimits = {
    /** Cpu Percent */
    cpu_percent?: number | null;
    /** Memory Mb */
    memory_mb?: number | null;
    /** Time Seconds */
    time_seconds?: number | null;
    /** File Size Mb */
    file_size_mb?: number | null;
    /** Open Files */
    open_files?: number | null;
    /** Max Processes */
    max_processes?: number | null;
};

export type RunJobRequest = {
    /**
     * Type
     * @default run_job_request
     * @constant
     */
    type: "run_job_request";
    /** Job Id */
    job_id?: string | null;
    /**
     * Job Type
     * @default workflow
     */
    job_type: string;
    /** @default threaded */
    execution_strategy: ExecutionStrategy;
    /** Params */
    params?: unknown | null;
    /** Messages */
    messages?: Message[] | null;
    /**
     * Workflow Id
     * @default
     */
    workflow_id: string;
    /**
     * User Id
     * @default
     */
    user_id: string;
    /**
     * Auth Token
     * @default
     */
    auth_token: string;
    /** Api Url */
    api_url?: string | null;
    /** Env */
    env?: {
        [key: string]: unknown;
    } | null;
    graph?: Graph_Output | null;
    /**
     * Explicit Types
     * @default false
     */
    explicit_types: boolean | null;
    resource_limits?: ResourceLimits | null;
};

export type SVGElement = {
    /**
     * Type
     * @default svg_element
     * @constant
     */
    type: "svg_element";
    /**
     * Name
     * @default
     */
    name: string;
    /**
     * Attributes
     * @default {}
     */
    attributes: {
        [key: string]: string;
    };
    /** Content */
    content?: string | null;
    /** Children */
    children?: SVGElement[];
};

export type SecretResponse = {
    /** Id */
    id?: string | null;
    /** User Id */
    user_id?: string | null;
    /** Key */
    key: string;
    /** Description */
    description?: string | null;
    /** Created At */
    created_at?: string | null;
    /** Updated At */
    updated_at?: string | null;
    /**
     * Is Configured
     * @default false
     */
    is_configured: boolean;
};

export type SettingWithValue = {
    /** Package Name */
    package_name: string;
    /** Env Var */
    env_var: string;
    /** Group */
    group: string;
    /** Description */
    description: string;
    /** Enum */
    enum?: string[] | null;
    /** Value */
    value?: unknown | null;
    /**
     * Is Secret
     * @default false
     */
    is_secret: boolean;
};

export type Step = {
    /**
     * Type
     * @default step
     * @constant
     */
    type: "step";
    /**
     * Id
     * @description Unique identifier for the step
     * @default
     */
    id: string;
    /**
     * Instructions
     * @description Instructions for the step to execute
     */
    instructions: string;
    /**
     * Logs
     * @description The logs of the step
     * @default []
     */
    logs: LogEntry[];
    /**
     * Completed
     * @description Whether the step is completed
     * @default false
     */
    completed: boolean;
    /**
     * Start Time
     * @description The start time of the step
     * @default 0
     */
    start_time: number;
    /**
     * End Time
     * @description The end time of the step
     * @default 0
     */
    end_time: number;
    /**
     * Depends On
     * @description The IDs of steps this step depends on
     * @default []
     */
    depends_on: string[];
    /**
     * Tools
     * @description Optional list of allowed tool names for this step (None = no restriction).
     */
    tools?: string[] | null;
    /**
     * Tool Name
     * @description Optional deterministic tool name for tool-only steps.
     */
    tool_name?: string | null;
    /**
     * Output Schema
     * @description The JSON schema of the output of the step
     * @default
     */
    output_schema: string;
};

export type StepResult = {
    /**
     * Type
     * @default step_result
     * @constant
     */
    type: "step_result";
    step: Step;
    /** Result */
    result: unknown;
    /** Error */
    error?: string | null;
    /**
     * Is Task Result
     * @default false
     */
    is_task_result: boolean;
    /** Thread Id */
    thread_id?: string | null;
    /** Workflow Id */
    workflow_id?: string | null;
};

export type SystemStats = {
    /**
     * Cpu Percent
     * @description CPU usage percentage
     */
    cpu_percent: number;
    /**
     * Memory Total Gb
     * @description Total memory in GB
     */
    memory_total_gb: number;
    /**
     * Memory Used Gb
     * @description Used memory in GB
     */
    memory_used_gb: number;
    /**
     * Memory Percent
     * @description Memory usage percentage
     */
    memory_percent: number;
    /**
     * Vram Total Gb
     * @description Total VRAM in GB
     */
    vram_total_gb?: number | null;
    /**
     * Vram Used Gb
     * @description Used VRAM in GB
     */
    vram_used_gb?: number | null;
    /**
     * Vram Percent
     * @description VRAM usage percentage
     */
    vram_percent?: number | null;
};

export type TTSModel = {
    /**
     * Type
     * @default tts_model
     * @constant
     */
    type: "tts_model";
    /** @default empty */
    provider: Provider;
    /**
     * Id
     * @default
     */
    id: string;
    /**
     * Name
     * @default
     */
    name: string;
    /** Path */
    path?: string | null;
    /** Voices */
    voices?: string[];
    /**
     * Selected Voice
     * @default
     */
    selected_voice: string;
};

export type Task = {
    /**
     * Type
     * @default task
     * @constant
     */
    type: "task";
    /**
     * Id
     * @description Unique identifier for the task
     * @default
     */
    id: string;
    /**
     * Title
     * @description The title of the task
     * @default
     */
    title: string;
    /**
     * Description
     * @description A description of the task, not used for execution
     * @default
     */
    description: string;
    /**
     * Steps
     * @description The steps of the task, a list of step IDs
     * @default []
     */
    steps: Step[];
};

export type TaskPlan = {
    /**
     * Type
     * @default task_plan
     * @constant
     */
    type: "task_plan";
    /**
     * Title
     * @description The title of the task list
     * @default
     */
    title: string;
    /**
     * Tasks
     * @description The tasks of the task list
     * @default []
     */
    tasks: Task[];
};

export type TaskUpdateEvent = "task_created" | "step_started" | "entered_conclusion_stage" | "step_completed" | "step_failed" | "task_completed";

export type TaskUpdate = {
    /**
     * Type
     * @default task_update
     * @constant
     */
    type: "task_update";
    /** Node Id */
    node_id?: string | null;
    /** Thread Id */
    thread_id?: string | null;
    /** Workflow Id */
    workflow_id?: string | null;
    task: Task;
    step?: Step | null;
    event: TaskUpdateEvent;
};

export type TextRef = {
    /**
     * Type
     * @default text
     * @constant
     */
    type: "text";
    /**
     * Uri
     * @default
     */
    uri: string;
    /** Asset Id */
    asset_id?: string | null;
    /** Data */
    data?: unknown;
    /** Metadata */
    metadata?: {
        [key: string]: unknown;
    } | null;
};

export type Thread = {
    /** Id */
    id: string;
    /** User Id */
    user_id: string;
    /** Title */
    title: string | null;
    /**
     * Created At
     * Format: date-time
     */
    created_at: string;
    /**
     * Updated At
     * Format: date-time
     */
    updated_at: string;
    /** Etag */
    etag?: string | null;
};

export type ThreadCreateRequest = {
    /** Title */
    title?: string | null;
};

export type ThreadList = {
    /** Next */
    next?: string | null;
    /** Threads */
    threads: Thread[];
};

export type ThreadSummarizeRequest = {
    /** Provider */
    provider: string;
    /** Model */
    model: string;
    /** Content */
    content: string;
};

export type ThreadUpdateRequest = {
    /** Title */
    title: string;
};

export type ToolCallUpdate = {
    /**
     * Type
     * @default tool_call_update
     * @constant
     */
    type: "tool_call_update";
    /** Node Id */
    node_id?: string | null;
    /** Thread Id */
    thread_id?: string | null;
    /** Workflow Id */
    workflow_id?: string | null;
    /** Tool Call Id */
    tool_call_id?: string | null;
    /** Name */
    name: string;
    /** Args */
    args: {
        [key: string]: unknown;
    };
    /** Message */
    message?: string | null;
    /** Step Id */
    step_id?: string | null;
    /** Agent Execution Id */
    agent_execution_id?: string | null;
};

export type ToolResultUpdate = {
    /**
     * Type
     * @default tool_result_update
     * @constant
     */
    type: "tool_result_update";
    /** Node Id */
    node_id: string;
    /** Thread Id */
    thread_id?: string | null;
    /** Workflow Id */
    workflow_id?: string | null;
    /** Result */
    result: {
        [key: string]: unknown;
    };
};

export type VideoModel = {
    /**
     * Type
     * @default video_model
     * @constant
     */
    type: "video_model";
    /** @default empty */
    provider: Provider;
    /**
     * Id
     * @default
     */
    id: string;
    /**
     * Name
     * @default
     */
    name: string;
    /** Path */
    path?: string | null;
    /** Supported Tasks */
    supported_tasks?: string[];
};

export type Workflow = {
    /** Id */
    id: string;
    /** Access */
    access: string;
    /** Created At */
    created_at: string;
    /** Updated At */
    updated_at: string;
    /** Name */
    name: string;
    /** Tool Name */
    tool_name?: string | null;
    /** Description */
    description: string;
    /** Tags */
    tags?: string[] | null;
    /** Thumbnail */
    thumbnail?: string | null;
    /** Thumbnail Url */
    thumbnail_url?: string | null;
    graph: Graph_Output;
    /** Input Schema */
    input_schema?: {
        [key: string]: unknown;
    } | null;
    /** Output Schema */
    output_schema?: {
        [key: string]: unknown;
    } | null;
    /** Settings */
    settings?: {
        [key: string]: string | boolean | number | null;
    } | null;
    /** Package Name */
    package_name?: string | null;
    /** Path */
    path?: string | null;
    /** Run Mode */
    run_mode?: string | null;
    /** Workspace Id */
    workspace_id?: string | null;
    /** Required Providers */
    required_providers?: string[] | null;
    /** Required Models */
    required_models?: string[] | null;
    /** Html App */
    html_app?: string | null;
    /** Etag */
    etag?: string | null;
};

export type WorkflowList = {
    /** Next */
    next: string | null;
    /** Workflows */
    workflows: Workflow[];
};

export type WorkflowRef = {
    /**
     * Type
     * @default workflow
     * @constant
     */
    type: "workflow";
    /**
     * Id
     * @default
     */
    id: string;
};

export type WorkflowRequest = {
    /** Name */
    name: string;
    /** Tool Name */
    tool_name?: string | null;
    /** Package Name */
    package_name?: string | null;
    /** Path */
    path?: string | null;
    /** Tags */
    tags?: string[] | null;
    /** Description */
    description?: string | null;
    /** Thumbnail */
    thumbnail?: string | null;
    /** Thumbnail Url */
    thumbnail_url?: string | null;
    /** Access */
    access: string;
    graph?: Graph_Input | null;
    /** Comfy Workflow */
    comfy_workflow?: {
        [key: string]: unknown;
    } | null;
    /** Settings */
    settings?: {
        [key: string]: string | boolean | number | null;
    } | null;
    /** Run Mode */
    run_mode?: string | null;
    /** Workspace Id */
    workspace_id?: string | null;
    /** Html App */
    html_app?: string | null;
};

export type WorkflowTool = {
    /** Name */
    name: string;
    /** Tool Name */
    tool_name?: string | null;
    /** Description */
    description?: string | null;
};

export type WorkflowToolList = {
    /** Next */
    next: string | null;
    /** Workflows */
    workflows: WorkflowTool[];
};

export type WorkspaceCreateRequest = {
    /**
     * Name
     * @description Display name for the workspace
     */
    name: string;
    /**
     * Path
     * @description Absolute path to the workspace directory
     */
    path: string;
    /**
     * Is Default
     * @description Set as default workspace
     * @default false
     */
    is_default: boolean;
};

export type WorkspaceResponse = {
    /** Id */
    id: string;
    /** User Id */
    user_id: string;
    /** Name */
    name: string;
    /** Path */
    path: string;
    /** Is Default */
    is_default: boolean;
    /**
     * Is Accessible
     * @description Whether the path exists and is writable
     */
    is_accessible: boolean;
    /** Created At */
    created_at: string;
    /** Updated At */
    updated_at: string;
};

export type WorkspaceListResponse = {
    /** Workspaces */
    workspaces: WorkspaceResponse[];
    /**
     * Next Cursor
     * @default
     */
    next_cursor: string;
};

export type WorkspaceUpdateRequest = {
    /**
     * Name
     * @description Display name for the workspace
     */
    name?: string | null;
    /**
     * Path
     * @description Absolute path to the workspace directory
     */
    path?: string | null;
    /**
     * Is Default
     * @description Set as default workspace
     */
    is_default?: boolean | null;
};

export type NodetoolApiCollectionCollectionCreate = {
    /** Name */
    name: string;
    /**
     * Embedding Model
     * @default all-minilm:latest
     */
    embedding_model: string;
    /** Embedding Provider */
    embedding_provider?: string | null;
};

export type NodetoolApiCollectionCollectionResponse = {
    /** Name */
    name: string;
    /** Count */
    count: number;
    /** Metadata */
    metadata: {
        [key: string]: unknown;
    };
    /** Workflow Name */
    workflow_name?: string | null;
};

export type NodetoolApiCollectionCollectionList = {
    /** Collections */
    collections: NodetoolApiCollectionCollectionResponse[];
    /** Count */
    count: number;
};

export type NodetoolApiFileFileInfo = {
    /** Name */
    name: string;
    /** Path */
    path: string;
    /** Size */
    size: number;
    /** Is Dir */
    is_dir: boolean;
    /** Modified At */
    modified_at: string;
};

export type NodetoolApiWorkspaceFileInfo = {
    /** Name */
    name: string;
    /** Path */
    path: string;
    /** Size */
    size: number;
    /** Is Dir */
    is_dir: boolean;
    /** Modified At */
    modified_at: string;
};

