// Research inventory. Evidence status describes inspection, not runtime certification.
window.FEATURE_INTERPLAY_DATA = {
  "groups": [
    "Workflow & code",
    "Data & interchange",
    "Creative documents",
    "Realtime & sound",
    "Game engine",
    "Agents & knowledge",
    "Resources & execution",
    "Apps & integration",
    "Proposed connections"
  ],
  "states": {
    "S": "Source-backed",
    "D": "Documented",
    "L": "Known limit",
    "Q": "Needs checking",
    "P": "Proposed"
  },
  "nodes": [
    {
      "id": "workflow",
      "g": 0,
      "label": "Workflows",
      "description": "Typed operations connected into reusable runs. Graph and Chain are views over the same workflow format.",
      "path": "docs/chain-editor.md",
      "status": "D"
    },
    {
      "id": "control",
      "g": 0,
      "label": "Flow & iteration",
      "description": "Branch, iterate, collect, zip, filter, handle errors and stream values. Loop feedback is iteration, not an unrestricted signal cycle.",
      "path": "packages/core-nodes/src/nodes/control.ts",
      "status": "S"
    },
    {
      "id": "code",
      "g": 0,
      "label": "Code nodes",
      "description": "Sandboxed JavaScript with declared inputs, streamed outputs, media helpers and authorized host capabilities.",
      "path": "docs/javascript-sandbox.md",
      "status": "D"
    },
    {
      "id": "js",
      "g": 0,
      "label": "Saved JS scripts",
      "description": "Reusable script documents with typed ports, tests and explicit version updates. Distinct from screenplay scripts and game behavior scripts.",
      "path": "docs/js-scripts.md",
      "status": "D"
    },
    {
      "id": "nested",
      "g": 0,
      "label": "Nested workflows",
      "description": "A Workflow node executes an embedded graph. Its editor synchronizes from the selected workflow store when available.",
      "path": "packages/core-nodes/src/nodes/workflow.ts",
      "status": "S"
    },
    {
      "id": "variables",
      "g": 0,
      "label": "Workflow variables",
      "description": "SetVariable and GetVariable share values within workflow execution. This does not establish a universal reactive state system.",
      "path": "packages/core-nodes/src/nodes/variable.ts",
      "status": "S"
    },
    {
      "id": "scalars",
      "g": 1,
      "label": "Scalar & text values",
      "description": "str, text, int, float, bool, date, datetime and enum are named in the frontend type registry. Registry presence alone does not prove every conversion. ",
      "path": "web/src/config/data_types.ts",
      "status": "S"
    },
    {
      "id": "structured",
      "g": 1,
      "label": "Lists, JSON & tables",
      "description": "list, dict, object, json and dataframe. Typed collection wiring and row iteration support batch data work.",
      "path": "web/src/config/data_types.ts",
      "status": "S"
    },
    {
      "id": "media",
      "g": 1,
      "label": "Media & file refs",
      "description": "image, audio, video, model_3d, document, asset, file, folder, bytes and font. A reference is not necessarily loaded bytes.",
      "path": "web/src/config/data_types.ts",
      "status": "S"
    },
    {
      "id": "docrefs",
      "g": 1,
      "label": "Creative document refs",
      "description": "sketch, timeline, script, storyboard, entity and workflow. These retain document identity beyond rendered media.",
      "path": "web/src/config/data_types.ts",
      "status": "S"
    },
    {
      "id": "generationtypes",
      "g": 1,
      "label": "Generation structures",
      "description": "keyframe, video_element and shot describe timed or identity-aware generation inputs.",
      "path": "web/src/config/data_types.ts",
      "status": "S"
    },
    {
      "id": "modelrefs",
      "g": 1,
      "label": "Model references",
      "description": "Language, image, video, embedding, ASR, TTS, rerank, music and other model-reference types are registered.",
      "path": "web/src/config/data_types.ts",
      "status": "S"
    },
    {
      "id": "tensors",
      "g": 1,
      "label": "Arrays & tensors",
      "description": "tensor, torch_tensor, np_array and tjs.cached appear in type metadata. Cross-runtime conversions need explicit verification.",
      "path": "web/src/config/data_types.ts",
      "status": "S"
    },
    {
      "id": "data",
      "g": 1,
      "label": "Data processing",
      "description": "CSV and table shaping use sandbox libraries. Dataframe iteration and chart rendering also have node surfaces.",
      "path": "packages/data-nodes/README.md",
      "status": "D"
    },
    {
      "id": "documents",
      "g": 1,
      "label": "Documents & extraction",
      "description": "PDF text, tables, OCR and page images plus document IO. Office/HTML/XML processing is also exposed through sandbox packs.",
      "path": "packages/document-nodes/README.md",
      "status": "D"
    },
    {
      "id": "typing",
      "g": 1,
      "label": "Type compatibility",
      "description": "any, union and none join concrete types. Socket compatibility describes wiring, not every semantic or runtime constraint.",
      "path": "docs/data-types.md",
      "status": "D"
    },
    {
      "id": "entities",
      "g": 2,
      "label": "Entities",
      "description": "Reusable characters, products, places and styles. Distinct from game scene entities.",
      "path": "docs/entities.md",
      "status": "D"
    },
    {
      "id": "script",
      "g": 2,
      "label": "Script & voice takes",
      "description": "Screenplay lines, speakers and chosen audio takes connect writing to shots and timeline timing.",
      "path": "docs/script-storyboard-link/design.md",
      "status": "D"
    },
    {
      "id": "board",
      "g": 2,
      "label": "Storyboards",
      "description": "Shot planning and selected takes. Semantic shot identity supports timeline reconciliation.",
      "path": "packages/video-nodes/src/nodes/storyboard.ts",
      "status": "S"
    },
    {
      "id": "sketch",
      "g": 2,
      "label": "Sketches",
      "description": "Layers, masks and workflow-generated images retain editable source bindings.",
      "path": "packages/websocket/src/trpc/routers/sketch.ts",
      "status": "S"
    },
    {
      "id": "timeline",
      "g": 2,
      "label": "Timelines",
      "description": "Video, audio, overlays, subtitles and MIDI. Generated clips bind a source workflow and local overrides.",
      "path": "packages/websocket/src/trpc/routers/timeline.ts",
      "status": "S"
    },
    {
      "id": "model3d",
      "g": 2,
      "label": "3D editor",
      "description": "Editable GLB/glTF assets, scene transforms and rendered shot references. Saving keeps asset identity.",
      "path": "docs/3d-editor.md",
      "status": "D"
    },
    {
      "id": "audioedit",
      "g": 2,
      "label": "Audio editor",
      "description": "Waveform editing saves back to an audio asset. This differs from keeping a procedural effect chain.",
      "path": "docs/audio-editor.md",
      "status": "D"
    },
    {
      "id": "textsvg",
      "g": 2,
      "label": "Text, tables & SVG",
      "description": "Text/code, table and SVG editing over stored assets.",
      "path": "docs/text-and-svg-documents.md",
      "status": "D"
    },
    {
      "id": "presets",
      "g": 2,
      "label": "Generation presets",
      "description": "Camera moves, looks and effects compile into model-family prompts and a restricted settings set.",
      "path": "packages/presets/src/compile.ts",
      "status": "S"
    },
    {
      "id": "motion",
      "g": 2,
      "label": "Motion & compositing",
      "description": "Timeline property links, animation curves and effects. Sketch, timeline and compositor share blend-mode math.",
      "path": "docs/timeline-motion-design.md",
      "status": "D"
    },
    {
      "id": "mic",
      "g": 3,
      "label": "Live microphone",
      "description": "Browser microphone capture emits PCM16LE chunks to a workflow input during execution.",
      "path": "web/src/hooks/useRealtimeAudioStream.ts",
      "status": "S"
    },
    {
      "id": "chunks",
      "g": 3,
      "label": "Chunk streams",
      "description": "Chunks carry incremental audio or other results. Audio format metadata and end-of-stream have specific contracts.",
      "path": "packages/audio-nodes/src/nodes/realtime-audio.ts",
      "status": "S"
    },
    {
      "id": "synth",
      "g": 3,
      "label": "CV & modular synth",
      "description": "Oscillators, LFO, ADSR, gate, VCA, VCF and mixer. Sample timing differs from game ticks and document time.",
      "path": "packages/audio-nodes/src/nodes/synthesis.ts",
      "status": "S"
    },
    {
      "id": "dsp",
      "g": 3,
      "label": "Streaming DSP",
      "description": "Gain and filters operate on chunks, retaining filter state between chunks.",
      "path": "packages/audio-nodes/src/nodes/realtime-audio.ts",
      "status": "S"
    },
    {
      "id": "playback",
      "g": 3,
      "label": "Live audio output",
      "description": "AudioOutput exposes chunks for browser playback. A direct bus keeps delivery independent of React rendering.",
      "path": "web/src/lib/audio/realtimeAudioChunkBus.ts",
      "status": "S"
    },
    {
      "id": "speech",
      "g": 3,
      "label": "Streaming speech",
      "description": "OpenAI realtime nodes and ElevenLabs streaming STT/TTS implementations exist. This is not the proposed Assistants product.",
      "path": "packages/llm-nodes/src/nodes/openai.ts",
      "status": "S"
    },
    {
      "id": "midi",
      "g": 3,
      "label": "MIDI & instruments",
      "description": "Timeline MIDI editing, tempo, synth, sampler and VST rendering. Live hardware MIDI input is a separate question.",
      "path": "packages/timeline/src/midi/index.ts",
      "status": "S"
    },
    {
      "id": "hardware",
      "g": 3,
      "label": "MIDI / OSC devices?",
      "description": "Live hardware MIDI and Open Sound Control integration remain unverified. Synth “OSC” labels mean oscillator, not a network protocol.",
      "path": "packages/audio-nodes/src/nodes/synthesis.ts",
      "status": "Q"
    },
    {
      "id": "game",
      "g": 4,
      "label": "Native games",
      "description": "2D and 3D game documents use fixed-step simulation and separate rendering/audio presentation.",
      "path": "docs/game-engine/index.md",
      "status": "D"
    },
    {
      "id": "scene",
      "g": 4,
      "label": "Scenes & prefabs",
      "description": "Scene entities, components, tags, properties, hierarchy and prefab instances.",
      "path": "docs/game-engine/scenes.md",
      "status": "D"
    },
    {
      "id": "physics",
      "g": 4,
      "label": "Physics & input",
      "description": "2D static/kinematic bodies, 3D Rapier, controllers, actions, axes, gamepad and touch.",
      "path": "docs/game-engine/physics.md",
      "status": "D"
    },
    {
      "id": "behavior",
      "g": 4,
      "label": "Behaviors & events",
      "description": "Synchronous game scripts return state and commands. Events, parameters and tick timers participate in simulation.",
      "path": "docs/game-engine/scripts.md",
      "status": "D"
    },
    {
      "id": "retained",
      "g": 4,
      "label": "Retained construction",
      "description": "Keep source and inputs, preview a rebuild, resolve conflicts, and preserve overrides or detach generated content.",
      "path": "web/src/components/game/panels/authoring/GameAuthoringPreview.tsx",
      "status": "S"
    },
    {
      "id": "slots",
      "g": 4,
      "label": "Game asset pipeline",
      "description": "game_slot → generated/checked slot_fill → staged asset bindings → authorized installation. Staging does not edit behaviors.",
      "path": "packages/game-nodes/src/nodes/game.ts",
      "status": "S"
    },
    {
      "id": "gamerender",
      "g": 4,
      "label": "Rendering & animation",
      "description": "2D Canvas2D/WebGPU and 3D WebGL2, model/sprite animations, lighting, particles and post-processing.",
      "path": "docs/game-engine/index.md",
      "status": "D"
    },
    {
      "id": "gameaudio",
      "g": 4,
      "label": "Game audio",
      "description": "Asset-bound sound, mixers and spatial audio. Distinct from a continuously connected workflow synth.",
      "path": "docs/game-engine/audio.md",
      "status": "D"
    },
    {
      "id": "replay",
      "g": 4,
      "label": "Saves & replay",
      "description": "Snapshots, restoration, recorded input and deterministic replay support reproducible playtests.",
      "path": "docs/game-engine/saves-replay.md",
      "status": "D"
    },
    {
      "id": "gamelimits",
      "g": 4,
      "label": "Schema-only game paths",
      "description": "Named/separate material textures and document menu-screen fields do not imply a complete shipped renderer or host. Embedded GLB textures are a separate path.",
      "path": "docs/game-engine/coverage.md",
      "status": "L"
    },
    {
      "id": "agent",
      "g": 5,
      "label": "Agents & tools",
      "description": "Agents operate workflows and documents using authorized tools and sandbox code actions.",
      "path": "docs/AGENTS.md",
      "status": "D"
    },
    {
      "id": "skills",
      "g": 5,
      "label": "Skills & templates",
      "description": "Saved instructions and starter documents shape repeated tasks. They are not executable dependencies by themselves.",
      "path": "docs/skills.md",
      "status": "D"
    },
    {
      "id": "collections",
      "g": 5,
      "label": "Collections & RAG",
      "description": "Index and retrieve material. Text uploads attach the configured embedding function in the inspected handler.",
      "path": "packages/websocket/src/collection-api.ts",
      "status": "S"
    },
    {
      "id": "providers",
      "g": 5,
      "label": "Models & providers",
      "description": "Local and remote models supply language, image, video and audio operations. Availability depends on configuration.",
      "path": "docs/models-and-providers.md",
      "status": "D"
    },
    {
      "id": "memory",
      "g": 5,
      "label": "Agent memory",
      "description": "Saved context supports future agent work. Distinct from workflow variables, app variables and game state.",
      "path": "docs/agent-memory.md",
      "status": "D"
    },
    {
      "id": "assets",
      "g": 6,
      "label": "Assets & provenance",
      "description": "Stored results carry identity and optional source workflow/node/job/sketch/timeline fields. Provenance is not automatically a live dependency.",
      "path": "packages/models-core/src/schema/assets.ts",
      "status": "S"
    },
    {
      "id": "projects",
      "g": 6,
      "label": "Projects",
      "description": "Project ownership groups documents, assets and related work. Export/import remaps supported references.",
      "path": "docs/projects.md",
      "status": "D"
    },
    {
      "id": "workspace",
      "g": 6,
      "label": "Workspace files",
      "description": "Run file operations use a local/cloud workspace abstraction. This is separate from project organization.",
      "path": "docs/workspaces.md",
      "status": "D"
    },
    {
      "id": "runs",
      "g": 6,
      "label": "Runs & inspection",
      "description": "Execution sessions, progress, cancellation, result history and cost records. Host capabilities vary.",
      "path": "docs/execution-lifecycle.md",
      "status": "D"
    },
    {
      "id": "apps",
      "g": 7,
      "label": "Mini Apps",
      "description": "Widgets and remembered variables drive workflow or script operations with a simpler interface.",
      "path": "docs/mini-apps.md",
      "status": "D"
    },
    {
      "id": "triggers",
      "g": 7,
      "label": "Triggers",
      "description": "Armed interval, webhook, file-watch or manual registrations start workflow runs.",
      "path": "docs/triggers.md",
      "status": "D"
    },
    {
      "id": "api",
      "g": 7,
      "label": "API, MCP & CLI",
      "description": "External programs and agents can operate NodeTool through service and command surfaces.",
      "path": "docs/api-reference.md",
      "status": "D"
    },
    {
      "id": "packs",
      "g": 7,
      "label": "Packs & libraries",
      "description": "Host nodes and sandbox libraries extend authoring. CSV, Office, OCR, HTML and service adapters often live here.",
      "path": "packages/sandbox-packs/README.md",
      "status": "D"
    },
    {
      "id": "external",
      "g": 7,
      "label": "External systems",
      "description": "ComfyUI, browser automation, messaging triggers and HTTP integrations connect external services to runs.",
      "path": "packages/integration-nodes/README.md",
      "status": "D"
    },
    {
      "id": "export",
      "g": 7,
      "label": "Players & exports",
      "description": "Game players, app delivery, rendered media and project archives have separate packaging contracts.",
      "path": "docs/game-engine/publishing.md",
      "status": "D"
    },
    {
      "id": "assistant",
      "g": 8,
      "label": "Assistant runtime",
      "description": "Proposed multimodal assistant profiles, session coordination, interruption and presentation. Do not infer shipped support from existing speech nodes.",
      "path": "docs/plans/realtime-virtual-agents.md",
      "status": "P"
    },
    {
      "id": "impact",
      "g": 8,
      "label": "Dependency impact view",
      "description": "Candidate view of what follows, pins or copies a source, and which outputs become stale. Existing local links do not prove a global view.",
      "path": "docs/research/feature-interplay.md",
      "status": "P"
    },
    {
      "id": "binding",
      "g": 8,
      "label": "Common binding controls",
      "description": "Candidate shared UI for source, local overrides, revision policy and result history. Build from existing clip/layer and retained-game patterns.",
      "path": "docs/research/feature-interplay.md",
      "status": "P"
    },
    {
      "id": "gamebridge",
      "g": 8,
      "label": "Async game / AI bridge",
      "description": "Candidate host-level request/result adapter outside deterministic ticks. Define ordering, cancellation, recording and replay before implementation.",
      "path": "docs/game-engine/scripts.md",
      "status": "P"
    },
    {
      "id": "sourcefollow",
      "g": 8,
      "label": "Follow semantic source",
      "description": "Candidate alternative to sending current media: retain the selected shot/take or source-document relationship.",
      "path": "docs/research/feature-interplay.md",
      "status": "P"
    }
  ],
  "edges": [
    {
      "id": "e0",
      "a": "scalars",
      "b": "workflow",
      "label": "Typed sockets",
      "status": "D",
      "detail": "Typed constants and inputs enter the graph. int and float do not automatically connect under the documented editor rules.",
      "path": "docs/data-types.md"
    },
    {
      "id": "e1",
      "a": "structured",
      "b": "workflow",
      "label": "Batch values",
      "status": "D",
      "detail": "Lists, dictionaries and dataframes connect through typed inputs and control operators. List-to-item execution requires explicit iteration.",
      "path": "docs/data-types.md"
    },
    {
      "id": "e2",
      "a": "media",
      "b": "workflow",
      "label": "Media references",
      "status": "D",
      "detail": "Media references are typed graph inputs and outputs. Read bytes through media/context helpers.",
      "path": "docs/javascript-sandbox.md"
    },
    {
      "id": "e3",
      "a": "docrefs",
      "b": "workflow",
      "label": "Document identities",
      "status": "S",
      "detail": "The type registry includes editable document references, distinct from a current rendered asset.",
      "path": "web/src/config/data_types.ts"
    },
    {
      "id": "e4",
      "a": "generationtypes",
      "b": "providers",
      "label": "Generation inputs",
      "status": "D",
      "detail": "Keyframe, video element and shot types describe generation data. Exact model support still requires endpoint-specific checks.",
      "path": "docs/data-types.md"
    },
    {
      "id": "e5",
      "a": "modelrefs",
      "b": "workflow",
      "label": "Model selectors",
      "status": "S",
      "detail": "Core inputs declare model selectors that can be supplied to workflow nodes.",
      "path": "packages/core-nodes/src/nodes/input.ts"
    },
    {
      "id": "e6",
      "a": "tensors",
      "b": "code",
      "label": "Conversion boundary",
      "status": "Q",
      "detail": "Named array/tensor types exist. A portable conversion contract across Python, JS and model adapters was not established in this inspection.",
      "path": "web/src/config/data_types.ts"
    },
    {
      "id": "e7",
      "a": "typing",
      "b": "workflow",
      "label": "Connection checks",
      "status": "D",
      "detail": "Editor rules handle list collection, unions and any. They do not certify semantic or execution-host compatibility.",
      "path": "docs/data-types.md"
    },
    {
      "id": "e8",
      "a": "structured",
      "b": "data",
      "label": "Rows and tables",
      "status": "D",
      "detail": "Dataframe row iteration is a node surface. CSV parsing and shaping use sandbox-csv.",
      "path": "packages/data-nodes/README.md"
    },
    {
      "id": "e9",
      "a": "data",
      "b": "media",
      "label": "Charts as images",
      "status": "D",
      "detail": "ChartRenderer turns a chart definition into a PNG image.",
      "path": "packages/data-nodes/README.md"
    },
    {
      "id": "e10",
      "a": "packs",
      "b": "data",
      "label": "CSV / XLSX libraries",
      "status": "D",
      "detail": "Installed sandbox packs expose table parsing and spreadsheet processing to code.",
      "path": "packages/sandbox-packs/README.md"
    },
    {
      "id": "e11",
      "a": "documents",
      "b": "collections",
      "label": "Extract then index",
      "status": "D",
      "detail": "PDF and Office inputs need extraction before collection text ingestion or vector indexing.",
      "path": "packages/document-nodes/README.md"
    },
    {
      "id": "e12",
      "a": "documents",
      "b": "media",
      "label": "PDF page images",
      "status": "D",
      "detail": "PDF rasterization produces images usable by downstream image operations.",
      "path": "packages/document-nodes/README.md"
    },
    {
      "id": "e13",
      "a": "packs",
      "b": "documents",
      "label": "Office, OCR, HTML",
      "status": "D",
      "detail": "Sandbox libraries cover document extraction and creation beyond dedicated PDF nodes.",
      "path": "packages/sandbox-packs/README.md"
    },
    {
      "id": "e14",
      "a": "code",
      "b": "workflow",
      "label": "Custom operation",
      "status": "D",
      "detail": "Declared inputs and emitted outputs make code part of the graph. Async emit can respect backpressure.",
      "path": "docs/javascript-sandbox.md"
    },
    {
      "id": "e15",
      "a": "js",
      "b": "code",
      "label": "Versioned reuse",
      "status": "D",
      "detail": "Saved JS scripts are reused by Code nodes with explicit version-update behavior.",
      "path": "docs/js-scripts.md"
    },
    {
      "id": "e16",
      "a": "nested",
      "b": "workflow",
      "label": "Reusable graph",
      "status": "S",
      "detail": "WorkflowNode executes the stored workflow_json graph using dynamic inputs and collected outputs.",
      "path": "packages/core-nodes/src/nodes/workflow.ts"
    },
    {
      "id": "e17",
      "a": "workflow",
      "b": "nested",
      "label": "Editor synchronization",
      "status": "S",
      "detail": "WorkflowLoader copies graph/ports and subscribes to changes when the selected source store is available.",
      "path": "web/src/components/node/WorkflowNode/WorkflowLoader.tsx"
    },
    {
      "id": "e18",
      "a": "nested",
      "b": "runs",
      "label": "Headless freshness?",
      "status": "Q",
      "detail": "Compare a run with the source editor open and closed. Embedded graph execution does not itself guarantee a latest-source fetch.",
      "path": "packages/core-nodes/src/nodes/workflow.ts"
    },
    {
      "id": "e19",
      "a": "control",
      "b": "workflow",
      "label": "Iteration and branching",
      "status": "S",
      "detail": "Control nodes implement graph flow and streamed item operations.",
      "path": "packages/core-nodes/src/nodes/control.ts"
    },
    {
      "id": "e20",
      "a": "variables",
      "b": "workflow",
      "label": "Execution values",
      "status": "S",
      "detail": "SetVariable/GetVariable are workflow operations. Cross-document reactive propagation is not established.",
      "path": "packages/core-nodes/src/nodes/variable.ts"
    },
    {
      "id": "e21",
      "a": "packs",
      "b": "code",
      "label": "Import libraries",
      "status": "D",
      "detail": "Installed, declared sandbox modules add processing and authorized service helpers.",
      "path": "packages/sandbox-packs/README.md"
    },
    {
      "id": "e22",
      "a": "code",
      "b": "workspace",
      "label": "Read/write run files",
      "status": "D",
      "detail": "Workspace bridges expose file operations within the run context.",
      "path": "docs/javascript-sandbox.md"
    },
    {
      "id": "e23",
      "a": "workflow",
      "b": "runs",
      "label": "Execute and inspect",
      "status": "D",
      "detail": "The execution lifecycle provides validation, cancellation and optional persistence/tracking by host.",
      "path": "docs/execution-lifecycle.md"
    },
    {
      "id": "e24",
      "a": "providers",
      "b": "workflow",
      "label": "Model operations",
      "status": "D",
      "detail": "Workflows can combine local and remote models when their providers and runtimes are configured.",
      "path": "docs/key-concepts.md"
    },
    {
      "id": "e25",
      "a": "workflow",
      "b": "sketch",
      "label": "Generated layer",
      "status": "S",
      "detail": "Source workflow ID + selected image output + local overrides + dependency hash + versions.",
      "path": "packages/websocket/src/trpc/routers/sketch.ts"
    },
    {
      "id": "e26",
      "a": "workflow",
      "b": "timeline",
      "label": "Generated clip",
      "status": "S",
      "detail": "Source workflow ID is retained. This path does not create the private workflow clone described by an older guide.",
      "path": "packages/websocket/src/trpc/routers/timeline.ts"
    },
    {
      "id": "e27",
      "a": "entities",
      "b": "board",
      "label": "Cast and references",
      "status": "D",
      "detail": "Reusable descriptors and reference images guide storyboard generation.",
      "path": "docs/entities.md"
    },
    {
      "id": "e28",
      "a": "script",
      "b": "board",
      "label": "Linked lines",
      "status": "D",
      "detail": "Line IDs link script text/takes to shots while manual timing can remain an override.",
      "path": "docs/script-storyboard-link/design.md"
    },
    {
      "id": "e29",
      "a": "script",
      "b": "timeline",
      "label": "Voice assembly",
      "status": "D",
      "detail": "Script takes and line identity support timeline assembly.",
      "path": "docs/script-storyboard-link/design.md"
    },
    {
      "id": "e30",
      "a": "board",
      "b": "timeline",
      "label": "Reconcile shots",
      "status": "S",
      "detail": "Refill preserves existing shot placement and trims. Foreign clips survive. Finished semantic layers require the reconciliation path.",
      "path": "packages/timeline/src/reassemble.ts"
    },
    {
      "id": "e31",
      "a": "sketch",
      "b": "assets",
      "label": "Flatten image",
      "status": "D",
      "detail": "A sketch can become an image asset for other surfaces. Flattening is not an editable layer transfer.",
      "path": "docs/key-concepts.md"
    },
    {
      "id": "e32",
      "a": "timeline",
      "b": "assets",
      "label": "Render sequence",
      "status": "D",
      "detail": "Export produces a media asset. Rendered media and editable clip structure remain distinct.",
      "path": "docs/video-editor.md"
    },
    {
      "id": "e33",
      "a": "assets",
      "b": "workflow",
      "label": "Send current media",
      "status": "S",
      "detail": "Send to workflow creates media constants with asset references.",
      "path": "web/src/hooks/useSendMediaToWorkflow.ts"
    },
    {
      "id": "e34",
      "a": "board",
      "b": "workflow",
      "label": "Take link is not carried",
      "status": "L",
      "detail": "The inspected Send to workflow payload transfers current media, not “follow this shot’s selected take.” Typed document nodes are a separate path.",
      "path": "web/src/hooks/handlers/useGenerationToCanvas.ts"
    },
    {
      "id": "e35",
      "a": "model3d",
      "b": "assets",
      "label": "Save / render",
      "status": "D",
      "detail": "Saving preserves GLB asset identity. Rendering uses the saved model, not unsaved viewport edits.",
      "path": "docs/3d-editor.md"
    },
    {
      "id": "e36",
      "a": "model3d",
      "b": "board",
      "label": "Rendered image bridge",
      "status": "D",
      "detail": "A scene render can become shot reference media. The guide does not describe a direct storyboard binding.",
      "path": "docs/3d-editor.md"
    },
    {
      "id": "e37",
      "a": "audioedit",
      "b": "assets",
      "label": "Save edited audio",
      "status": "D",
      "detail": "Waveform edits save back as WAV to the audio asset.",
      "path": "docs/audio-editor.md"
    },
    {
      "id": "e38",
      "a": "textsvg",
      "b": "assets",
      "label": "Editable file",
      "status": "D",
      "detail": "Text, table and SVG editors work with stored file assets.",
      "path": "docs/text-and-svg-documents.md"
    },
    {
      "id": "e39",
      "a": "presets",
      "b": "providers",
      "label": "Compile direction",
      "status": "S",
      "detail": "Preset compiler chooses prompt fragments and accepted generation settings.",
      "path": "packages/presets/src/compile.ts"
    },
    {
      "id": "e40",
      "a": "presets",
      "b": "providers",
      "label": "Restricted settings",
      "status": "L",
      "detail": "The generic allowlist excludes fps and negative_prompt. Unsupported keys generate warnings rather than reaching the provider.",
      "path": "packages/presets/src/params.ts"
    },
    {
      "id": "e41",
      "a": "motion",
      "b": "timeline",
      "label": "Curves and links",
      "status": "D",
      "detail": "Timeline motion tools describe property animation, links, transforms and compositing.",
      "path": "docs/timeline-motion-design.md"
    },
    {
      "id": "e42",
      "a": "motion",
      "b": "sketch",
      "label": "Shared blend math",
      "status": "D",
      "detail": "Sketch, timeline and compositor share a canonical blend-mode catalog and WGSL math. This is shared behavior, not a shared document.",
      "path": "packages/gpu/README.md"
    },
    {
      "id": "e43",
      "a": "mic",
      "b": "chunks",
      "label": "Capture PCM",
      "status": "S",
      "detail": "Browser capture sends PCM16LE chunks through the workflow input stream.",
      "path": "web/src/hooks/useRealtimeAudioStream.ts"
    },
    {
      "id": "e44",
      "a": "chunks",
      "b": "workflow",
      "label": "Streaming input",
      "status": "S",
      "detail": "RealtimeAudioInput participates in the continuing buffered input stream.",
      "path": "packages/core-nodes/src/nodes/input.ts"
    },
    {
      "id": "e45",
      "a": "chunks",
      "b": "speech",
      "label": "Streaming recognition",
      "status": "S",
      "detail": "ElevenLabs realtime STT consumes the streaming speech path. Provider configuration is required.",
      "path": "packages/elevenlabs-nodes/src/nodes/realtime-stt.ts"
    },
    {
      "id": "e46",
      "a": "speech",
      "b": "chunks",
      "label": "Streaming synthesis",
      "status": "S",
      "detail": "ElevenLabs realtime TTS produces stream output. End-to-end interruption semantics are a separate concern.",
      "path": "packages/elevenlabs-nodes/src/nodes/realtime-tts.ts"
    },
    {
      "id": "e47",
      "a": "synth",
      "b": "chunks",
      "label": "CV / audio signal",
      "status": "S",
      "detail": "CV uses float32 signal chunks and shares stream machinery with audio. Timing follows samples.",
      "path": "packages/audio-nodes/src/nodes/synthesis.ts"
    },
    {
      "id": "e48",
      "a": "chunks",
      "b": "dsp",
      "label": "Stateful filtering",
      "status": "S",
      "detail": "Streaming filters retain state across chunk boundaries.",
      "path": "packages/audio-nodes/src/nodes/realtime-audio.ts"
    },
    {
      "id": "e49",
      "a": "dsp",
      "b": "playback",
      "label": "AudioOutput",
      "status": "S",
      "detail": "AudioOutput forwards chunks while exposing live UI output for playback.",
      "path": "packages/audio-nodes/src/nodes/realtime-audio.ts"
    },
    {
      "id": "e50",
      "a": "chunks",
      "b": "assets",
      "label": "Record to WAV",
      "status": "S",
      "detail": "ChunksToAudio accumulates a stream into an audio reference for persistence/use.",
      "path": "packages/audio-nodes/src/nodes/realtime-audio.ts"
    },
    {
      "id": "e51",
      "a": "assets",
      "b": "chunks",
      "label": "File to stream",
      "status": "S",
      "detail": "AudioToChunks slices WAV audio into timed PCM chunks.",
      "path": "packages/audio-nodes/src/nodes/realtime-audio.ts"
    },
    {
      "id": "e52",
      "a": "synth",
      "b": "control",
      "label": "No audio-rate feedback",
      "status": "L",
      "detail": "The implementation explicitly excludes arbitrary audio feedback loops. Workflow Loop iterations are a different mechanism.",
      "path": "packages/audio-nodes/src/nodes/synthesis.ts"
    },
    {
      "id": "e53",
      "a": "hardware",
      "b": "midi",
      "label": "Live MIDI input?",
      "status": "Q",
      "detail": "Timeline sequencing is present. Targeted searches did not establish browser MIDI-device input. This is not a repository-wide absence claim.",
      "path": "packages/timeline/src/midi/index.ts"
    },
    {
      "id": "e54",
      "a": "hardware",
      "b": "synth",
      "label": "OSC / control bridge?",
      "status": "Q",
      "detail": "No verified Open Sound Control or hardware CV bridge is mapped. Oscillator names must not be mistaken for OSC protocol support.",
      "path": "packages/audio-nodes/src/nodes/synthesis.ts"
    },
    {
      "id": "e55",
      "a": "midi",
      "b": "timeline",
      "label": "Sequencing and mix",
      "status": "D",
      "detail": "MIDI tracks mix with audio tracks. Notes, tempo, synth and sampler paths are separate from live microphone input.",
      "path": "docs/video-editor.md"
    },
    {
      "id": "e56",
      "a": "assets",
      "b": "midi",
      "label": "Sampler recordings",
      "status": "S",
      "detail": "Sampler instruments use audio asset zones and note ranges.",
      "path": "packages/timeline/src/midi/sampler.ts"
    },
    {
      "id": "e57",
      "a": "game",
      "b": "scene",
      "label": "Document composition",
      "status": "D",
      "detail": "Game documents contain scenes, entities/components, asset bindings and input actions.",
      "path": "docs/game-engine/index.md"
    },
    {
      "id": "e58",
      "a": "scene",
      "b": "physics",
      "label": "Bodies and controllers",
      "status": "D",
      "detail": "Physics support depends on dimension. 2D and 3D do not have identical body models.",
      "path": "docs/game-engine/physics.md"
    },
    {
      "id": "e59",
      "a": "physics",
      "b": "behavior",
      "label": "Input and contacts",
      "status": "D",
      "detail": "Game scripts see tick-start world state, input and previous-tick events/contacts.",
      "path": "docs/game-engine/scripts.md"
    },
    {
      "id": "e60",
      "a": "behavior",
      "b": "game",
      "label": "State and commands",
      "status": "D",
      "detail": "Synchronous bounded scripts return state and commands for fixed-step simulation.",
      "path": "docs/game-engine/scripts.md"
    },
    {
      "id": "e61",
      "a": "behavior",
      "b": "workflow",
      "label": "No direct async tick call",
      "status": "L",
      "detail": "Game scripts reject async functions/generators and have no host network/filesystem. A direct per-tick workflow or LLM call is not this script contract.",
      "path": "docs/game-engine/scripts.md"
    },
    {
      "id": "e62",
      "a": "retained",
      "b": "game",
      "label": "Preview / apply rebuild",
      "status": "S",
      "detail": "Authoring preview checks stale/conflict state and applies a reviewed construction candidate.",
      "path": "web/src/components/game/panels/authoring/GameAuthoringPreview.tsx"
    },
    {
      "id": "e63",
      "a": "retained",
      "b": "scene",
      "label": "Overrides and detach",
      "status": "D",
      "detail": "Stable generated identity preserves property overrides, suppression and detachment during rebuild.",
      "path": "docs/game-engine/construction.md"
    },
    {
      "id": "e64",
      "a": "workflow",
      "b": "slots",
      "label": "Generate checked fills",
      "status": "S",
      "detail": "Game nodes load slot requirements, build prompts and stage checked asset candidates.",
      "path": "packages/game-nodes/src/nodes/game.ts"
    },
    {
      "id": "e65",
      "a": "media",
      "b": "slots",
      "label": "game_slot / slot_fill",
      "status": "S",
      "detail": "Typed game-slot requirements and fills connect image/audio generation to staging.",
      "path": "packages/audio-nodes/src/nodes/game.ts"
    },
    {
      "id": "e66",
      "a": "slots",
      "b": "game",
      "label": "Stage then install",
      "status": "D",
      "detail": "Staging prepares candidate bindings. Installation is an explicit authorized game revision operation, not a behavior rewrite.",
      "path": "packages/game-nodes/README.md"
    },
    {
      "id": "e67",
      "a": "model3d",
      "b": "slots",
      "label": "Prepare model again",
      "status": "D",
      "detail": "Game asset slots offer Edit model. Changed models must be prepared/installed again.",
      "path": "docs/game-editor.md"
    },
    {
      "id": "e68",
      "a": "game",
      "b": "gamerender",
      "label": "Present simulation",
      "status": "D",
      "detail": "Renderer presents simulation state. 2D and 3D use different rendering backends.",
      "path": "docs/game-engine/index.md"
    },
    {
      "id": "e69",
      "a": "game",
      "b": "gameaudio",
      "label": "Audio presentation",
      "status": "D",
      "detail": "Game audio sources and mixers consume asset bindings and spatial state.",
      "path": "docs/game-engine/audio.md"
    },
    {
      "id": "e70",
      "a": "assets",
      "b": "gameaudio",
      "label": "Sound bindings",
      "status": "D",
      "detail": "Stored sound media supplies effects and scene audio. A workflow synth is not thereby a live game audio graph.",
      "path": "docs/game-engine/audio.md"
    },
    {
      "id": "e71",
      "a": "game",
      "b": "replay",
      "label": "Snapshots and inputs",
      "status": "D",
      "detail": "Replay and restoration are part of game testing and deterministic state management.",
      "path": "docs/game-engine/saves-replay.md"
    },
    {
      "id": "e72",
      "a": "gamelimits",
      "b": "gamerender",
      "label": "Schema ≠ renderer",
      "status": "L",
      "detail": "The guide identifies incomplete separate material texture/named material paths and unimplemented menu-screen host paths. Supported embedded GLB textures are different.",
      "path": "docs/game-engine/coverage.md"
    },
    {
      "id": "e73",
      "a": "game",
      "b": "export",
      "label": "Publish / build player",
      "status": "D",
      "detail": "A published game revision and exported player are distinct from the editable draft.",
      "path": "docs/game-engine/publishing.md"
    },
    {
      "id": "e74",
      "a": "agent",
      "b": "game",
      "label": "Author and playtest",
      "status": "D",
      "detail": "Agent tools create/edit game documents and run validation, simulation and capture.",
      "path": "docs/game-engine/agent-authoring.md"
    },
    {
      "id": "e75",
      "a": "agent",
      "b": "workflow",
      "label": "Build and operate",
      "status": "D",
      "detail": "Agent capabilities author and run workflows under the session’s tool permissions.",
      "path": "docs/AGENTS.md"
    },
    {
      "id": "e76",
      "a": "agent",
      "b": "board",
      "label": "Direct editable work",
      "status": "D",
      "detail": "Agents operate creative documents rather than only returning media files.",
      "path": "docs/key-concepts.md"
    },
    {
      "id": "e77",
      "a": "skills",
      "b": "agent",
      "label": "Task instructions",
      "status": "D",
      "detail": "Skills supply reusable task instructions. Templates provide starting content.",
      "path": "docs/skills.md"
    },
    {
      "id": "e78",
      "a": "memory",
      "b": "agent",
      "label": "Retained context",
      "status": "D",
      "detail": "Agent memory supports continuity, with its own persistence scope.",
      "path": "docs/agent-memory.md"
    },
    {
      "id": "e79",
      "a": "collections",
      "b": "workflow",
      "label": "Index and retrieve",
      "status": "S",
      "detail": "Vector nodes implement collection, indexing and query operations.",
      "path": "packages/core-nodes/src/nodes/vector.ts"
    },
    {
      "id": "e80",
      "a": "collections",
      "b": "agent",
      "label": "Retrieval tools",
      "status": "S",
      "detail": "Collection capabilities expose retrieval to agents.",
      "path": "packages/agents/src/capabilities/collections.ts"
    },
    {
      "id": "e81",
      "a": "collections",
      "b": "workflow",
      "label": "Link does not run ingestion",
      "status": "L",
      "detail": "The collection upload handler chunks/embeds text directly. Its linked workflow metadata is not invoked by this upload path.",
      "path": "packages/websocket/src/collection-api.ts"
    },
    {
      "id": "e82",
      "a": "projects",
      "b": "assets",
      "label": "Ownership and archive",
      "status": "D",
      "detail": "Projects scope resources and export/import supported documents with rewritten references.",
      "path": "docs/projects.md"
    },
    {
      "id": "e83",
      "a": "projects",
      "b": "game",
      "label": "Project document",
      "status": "D",
      "detail": "New games belong to the selected project and appear as editable documents.",
      "path": "docs/game-editor.md"
    },
    {
      "id": "e84",
      "a": "workspace",
      "b": "runs",
      "label": "Run file access",
      "status": "D",
      "detail": "Workspaces abstract files read and written by runs across local/cloud storage.",
      "path": "docs/workspaces.md"
    },
    {
      "id": "e85",
      "a": "runs",
      "b": "assets",
      "label": "Result provenance",
      "status": "S",
      "detail": "Asset metadata can carry workflow/node/job and document source identifiers.",
      "path": "packages/models-core/src/schema/assets.ts"
    },
    {
      "id": "e86",
      "a": "apps",
      "b": "workflow",
      "label": "Bound operations",
      "status": "D",
      "detail": "App widgets supply workflow inputs and show declared outputs.",
      "path": "docs/mini-apps.md"
    },
    {
      "id": "e87",
      "a": "js",
      "b": "apps",
      "label": "Script operation",
      "status": "D",
      "detail": "Mini App operations can use saved scripts with versioned execution.",
      "path": "docs/mini-apps.md"
    },
    {
      "id": "e88",
      "a": "triggers",
      "b": "workflow",
      "label": "Start a run",
      "status": "D",
      "detail": "Armed triggers start separate headless runs. Saving alone does not arm them.",
      "path": "docs/triggers.md"
    },
    {
      "id": "e89",
      "a": "api",
      "b": "runs",
      "label": "External execution",
      "status": "D",
      "detail": "API and command surfaces drive workflows and expose execution results.",
      "path": "docs/execution-lifecycle.md"
    },
    {
      "id": "e90",
      "a": "external",
      "b": "workflow",
      "label": "External operations",
      "status": "D",
      "detail": "ComfyUI nodes derive typed inputs/outputs. Other integrations use long-lived triggers or sandbox HTTP adapters.",
      "path": "packages/integration-nodes/README.md"
    },
    {
      "id": "e91",
      "a": "packs",
      "b": "external",
      "label": "Service adapters",
      "status": "D",
      "detail": "Sandbox libraries and capability modules provide service access with scoped host credentials.",
      "path": "packages/integration-nodes/README.md"
    },
    {
      "id": "e92",
      "a": "apps",
      "b": "export",
      "label": "Release an interface",
      "status": "D",
      "detail": "Mini Apps have their own versions/releases and operation contracts.",
      "path": "docs/mini-apps.md"
    },
    {
      "id": "e93",
      "a": "speech",
      "b": "assistant",
      "label": "Session coordination",
      "status": "P",
      "detail": "Proposed runtime combines speech, tools and presentation with explicit interruption and lifecycle semantics.",
      "path": "docs/plans/realtime-virtual-agents.md"
    },
    {
      "id": "e94",
      "a": "collections",
      "b": "assistant",
      "label": "Knowledge policy",
      "status": "P",
      "detail": "Proposed assistant profiles select authorized knowledge and retrieval policies.",
      "path": "docs/plans/realtime-virtual-agents.md"
    },
    {
      "id": "e95",
      "a": "agent",
      "b": "assistant",
      "label": "Background work",
      "status": "P",
      "detail": "Proposed assistant coordination reuses execution services rather than adding another workflow executor.",
      "path": "docs/plans/realtime-virtual-agents.md"
    },
    {
      "id": "e96",
      "a": "game",
      "b": "gamebridge",
      "label": "Async request boundary",
      "status": "P",
      "detail": "Place asynchronous model requests outside the fixed-tick sandbox. Record accepted results as explicit game events for replay.",
      "path": "docs/game-engine/scripts.md"
    },
    {
      "id": "e97",
      "a": "gamebridge",
      "b": "agent",
      "label": "Request / result adapter",
      "status": "P",
      "detail": "A candidate bridge must specify stale responses, cancellation, budgets and deterministic replay. No shipped bridge is claimed.",
      "path": "docs/game-engine/scripts.md"
    },
    {
      "id": "e98",
      "a": "retained",
      "b": "binding",
      "label": "Reuse override model",
      "status": "P",
      "detail": "Existing retained construction offers a precedent for source ownership, local overrides and conflict review across editors.",
      "path": "docs/game-engine/construction.md"
    },
    {
      "id": "e99",
      "a": "binding",
      "b": "timeline",
      "label": "Consistent source controls",
      "status": "P",
      "detail": "Expose source, local parameters, follow/pin policy and generation history consistently without changing timeline semantics.",
      "path": "docs/research/feature-interplay.md"
    },
    {
      "id": "e100",
      "a": "binding",
      "b": "sketch",
      "label": "Consistent source controls",
      "status": "P",
      "detail": "Reuse the same vocabulary for the already-existing generated-layer operation binding.",
      "path": "docs/research/feature-interplay.md"
    },
    {
      "id": "e101",
      "a": "assets",
      "b": "impact",
      "label": "Trace affected work",
      "status": "P",
      "detail": "Candidate impact view would explain downstream users and stale results. Provenance fields are a starting point, not proof of complete dependency tracking.",
      "path": "docs/research/feature-interplay.md"
    },
    {
      "id": "e102",
      "a": "entities",
      "b": "impact",
      "label": "Cross-document freshness?",
      "status": "Q",
      "detail": "Test whether replacing an entity reference exposes affected shots, cuts and workflows. No global absence claim is made.",
      "path": "docs/research/feature-interplay.md"
    },
    {
      "id": "e103",
      "a": "board",
      "b": "sourcefollow",
      "label": "Preserve shot identity",
      "status": "P",
      "detail": "Offer a semantic source binding alongside “use current media,” using existing typed documents where possible.",
      "path": "docs/research/feature-interplay.md"
    },
    {
      "id": "e104",
      "a": "sourcefollow",
      "b": "workflow",
      "label": "Follow selected take",
      "status": "P",
      "detail": "Candidate contract resolves the selected take with visible follow/pin rules instead of freezing only the transferred media reference.",
      "path": "docs/research/feature-interplay.md"
    }
  ]
};
