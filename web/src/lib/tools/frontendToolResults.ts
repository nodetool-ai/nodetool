import type { Model3DToolHandler } from "../../components/model_editor/model3DToolBridge";
import type {
  SketchAgentHandler,
  SketchRenderedAssetResult,
  SketchSnapshot
} from "../../components/sketch/sketchAgentBridge";
import type {
  ScriptAgentHandler,
  ScriptSnapshot
} from "../../components/script/scriptAgentBridge";
import type {
  StoryboardAgentHandler,
  StoryboardSnapshot
} from "../../components/storyboard/storyboardAgentBridge";
import type {
  TimelineAgentHandler,
  TimelineSnapshot
} from "../../components/timeline/timelineAgentBridge";
import type {
  JsScriptAgentHandler,
  JsScriptSnapshot
} from "../../components/jsScript/jsScriptAgentBridge";
import type { CodeAssistantState } from "../../components/node_types/code_assistant/codeAssistantBridge";
import type { AddNodeResult } from "./builtin/addNode";
import type { GetGraphResult } from "./builtin/getGraph";
import type { SearchNodesResult } from "./builtin/searchNodes";
import type { SearchModelsResult } from "./builtin/searchModels";
import type { OpenDocumentResult } from "./builtin/openDocument";
import type { EntityApplyResult, EntityListResult } from "./builtin/entities";
import type { StoryboardPersistence } from "./builtin/storyboard";
import type { ANIMATION_PRESETS } from "@nodetool-ai/timeline";
import type { PuckAgentHandler } from "../../components/appbuilder/puck/puckAgentBridge";

/**
 * What a document bridge's handler method resolves to, whether it answers
 * synchronously or with a promise. The editor bridges own these shapes, so the
 * tool results below read them off the handler rather than restating them.
 */
type Yields<Handler, Key extends keyof Handler> = Handler[Key] extends (
  ...args: never[]
) => infer Result
  ? Awaited<Result>
  : never;

/**
 * Every storyboard tool that writes one shot answers the same way, so the shot
 * type is read off `addShot` on behalf of all of them.
 */
type StoryboardShotResult = {
  ok: boolean;
  shot: Yields<StoryboardAgentHandler, "addShot">;
  url: string;
} & StoryboardPersistence;

/** What `extract_script` and `relink_script` both answer with. */
type StoryboardScriptLinkResult = {
  ok: boolean;
  url: string;
} & Yields<StoryboardAgentHandler, "extractScript"> &
  StoryboardPersistence;

type TimelineClipResult = {
  ok: boolean;
  clip: Yields<TimelineAgentHandler, "trimClip">;
  url: string;
};

type SketchLayerResult = {
  ok: boolean;
  layer: Yields<SketchAgentHandler, "addLayer">;
  url: string;
};

type Model3DObject = Yields<Model3DToolHandler, "addPrimitive">;

/**
 * The result each `ui_*` tool resolves to, keyed by tool name.
 *
 * The registry dispatches on a name it only has at runtime, so it cannot infer
 * what a given call returns — this table is where that is written down.
 * `FrontendToolRegistry.register` checks a tool's `execute` against its entry
 * here and `FrontendToolRegistry.call("<name>", …)` reads the same entry, so
 * the table cannot drift from the tool it describes.
 *
 * It is deliberately partial: a tool with no entry resolves to `unknown`, and
 * entries are added as callers need to read that tool's result.
 */
export interface FrontendToolResults {
  // Graph editing.
  ui_add_node: AddNodeResult;
  ui_connect_nodes: { ok: boolean; edge_id: string; note?: string };
  ui_delete_edge: { ok: boolean; edge_id: string };
  ui_delete_node: { ok: boolean; node_id: string };
  ui_move_node: {
    ok: boolean;
    node_id: string;
    position: { x: number; y: number };
  };
  ui_set_node_title: { ok: boolean; node_id: string; title: string };
  ui_update_node_data: { ok: boolean; node_id: string };
  ui_get_graph: GetGraphResult;
  ui_search_nodes: SearchNodesResult;
  ui_search_models: SearchModelsResult;

  // Workspace and clipboard.
  ui_open_document: OpenDocumentResult;
  ui_open_workflow: { ok: boolean; workflow_id: string };
  ui_run_workflow: { ok: boolean; workflow_id: string };
  ui_switch_tab: { ok: boolean; tab_index: number; workflow_id: string };
  ui_copy: { ok: boolean; text_length: number };
  ui_paste: { ok: boolean; text: string };

  // Entity library.
  ui_entity_list: EntityListResult;
  ui_entity_apply: EntityApplyResult;

  // Text/code editor assistant.
  ui_editor_get_content: { content: string; language: string };
  ui_editor_get_selection: { selection: string };
  ui_editor_replace_all: { ok: boolean; chars: number };
  ui_editor_replace_selection: { ok: boolean; replaced_selection: boolean };
  ui_editor_insert: { ok: boolean; chars: number };

  // Code node assistant dialog.
  ui_code_get_state: { ok: boolean } & CodeAssistantState;
  ui_code_set_code: { ok: boolean; chars: number };
  ui_code_set_ports: {
    ok: boolean;
    inputs: CodeAssistantState["inputs"];
    outputs: CodeAssistantState["outputs"];
  };

  // JS script editor.
  ui_jsscript_get_state: { ok: boolean } & JsScriptSnapshot;
  ui_jsscript_set_code: {
    ok: boolean;
    chars: number;
    issues: JsScriptSnapshot["issues"];
  };
  ui_jsscript_set_ports: {
    ok: boolean;
    inputs: JsScriptSnapshot["document"]["inputs"];
    outputs: JsScriptSnapshot["document"]["outputs"];
    issues: JsScriptSnapshot["issues"];
  };
  ui_jsscript_set_meta: {
    ok: boolean;
    name: JsScriptSnapshot["name"];
    description: JsScriptSnapshot["document"]["description"];
    secrets: JsScriptSnapshot["document"]["secrets"];
    timeoutSeconds: JsScriptSnapshot["document"]["timeoutSeconds"];
    palette: JsScriptSnapshot["document"]["palette"] | null;
    issues: JsScriptSnapshot["issues"];
  };
  ui_jsscript_set_tests: {
    ok: boolean;
    tests: JsScriptSnapshot["document"]["tests"];
    issues: JsScriptSnapshot["issues"];
  };
  ui_jsscript_run: { ok: boolean; run: Yields<JsScriptAgentHandler, "run"> };
  ui_jsscript_test: { ok: boolean } & Yields<JsScriptAgentHandler, "test">;

  // 3D model editor.
  ui_3d_list_scene: { ok: boolean; count: number; objects: Model3DObject[] };
  ui_3d_add_object: { ok: boolean; object: Model3DObject };
  ui_3d_select_object: { ok: boolean; selected: Model3DObject | null };
  ui_3d_delete_object: { ok: boolean; deleted: Model3DObject };
  ui_3d_set_transform: { ok: boolean; object: Model3DObject };
  ui_3d_set_visibility: { ok: boolean; object: Model3DObject };
  ui_3d_rename_object: { ok: boolean; object: Model3DObject };
  ui_3d_set_material_color: { ok: boolean; object: Model3DObject };
  ui_3d_frame_scene: { ok: boolean };
  ui_3d_capture_view: {
    ok: boolean;
    note: string;
    image_content: { data: string; mimeType: string };
  };

  // Image / sketch editor.
  ui_sketch_get_state: { ok: boolean } & SketchSnapshot;
  ui_sketch_add_layer: SketchLayerResult;
  ui_sketch_set_layer_props: SketchLayerResult;
  ui_sketch_generate: {
    ok: boolean;
    url: string;
  } & Yields<SketchAgentHandler, "generate">;
  ui_sketch_set_color: {
    ok: boolean;
    foreground?: string;
    background?: string;
    url: string;
  };
  ui_sketch_pick_color: {
    ok: boolean;
    url: string;
  } & Yields<SketchAgentHandler, "pickColor">;
  ui_sketch_set_tool: {
    ok: boolean;
    activeTool: Yields<SketchAgentHandler, "setActiveTool">;
  };
  ui_sketch_resize_canvas: {
    ok: boolean;
    url: string;
  } & Yields<SketchAgentHandler, "resizeCanvas">;
  ui_sketch_fill: {
    ok: boolean;
    url: string;
  } & Yields<SketchAgentHandler, "fill">;
  ui_sketch_get_layer_image: {
    ok: boolean;
    note: string;
    /** The PNG travels as a handle, not inline base64 — see the tool. */
    image_content: { uri: string; mimeType: string };
  } & Omit<Yields<SketchAgentHandler, "getLayerImage">, "dataUrl">;
  ui_sketch_render_to_asset: {
    ok: boolean;
    assets: Array<
      SketchRenderedAssetResult & { url: string; asset_url: string }
    >;
  };

  // Script editor.
  ui_script_get_state: { ok: boolean } & ScriptSnapshot;
  ui_script_add_speaker: {
    ok: boolean;
    speaker: Yields<ScriptAgentHandler, "addSpeaker">;
    url: string;
  };
  ui_script_set_speaker_voice: {
    ok: boolean;
    speaker: Yields<ScriptAgentHandler, "addSpeaker">;
    url: string;
  };
  ui_script_add_line: {
    ok: boolean;
    line: Yields<ScriptAgentHandler, "addLine">;
    url: string;
  };
  ui_script_set_line_text: {
    ok: boolean;
    line: Yields<ScriptAgentHandler, "addLine">;
    url: string;
  };
  ui_script_set_speaker: {
    ok: boolean;
    line: Yields<ScriptAgentHandler, "addLine">;
    url: string;
  };
  ui_script_voice_line: {
    ok: boolean;
    line: Yields<ScriptAgentHandler, "addLine">;
    url: string;
  };
  ui_script_voice_all: {
    ok: boolean;
    url: string;
  } & Yields<ScriptAgentHandler, "voiceAll">;
  ui_script_export_subtitles: {
    ok: boolean;
  } & Yields<ScriptAgentHandler, "exportSubtitles">;
  ui_script_derive_storyboard: {
    ok: boolean;
    url: string;
  } & Yields<ScriptAgentHandler, "deriveStoryboard">;
  ui_script_send_to_timeline: {
    ok: boolean;
    url: string;
  } & Yields<ScriptAgentHandler, "sendToTimeline">;

  // Mini-app (Puck) editor.
  ui_app_add_component: {
    ok: boolean;
    id: string;
    type: Yields<PuckAgentHandler, "addComponent">["type"];
    parent_id: string | null;
    slot: string | null;
    component: Yields<PuckAgentHandler, "addComponent">;
    url: string;
  };

  // Storyboard editor.
  ui_storyboard_get_state: { ok: boolean } & StoryboardSnapshot;
  ui_storyboard_add_shot: StoryboardShotResult;
  ui_storyboard_update_shot: StoryboardShotResult;
  ui_storyboard_generate_keyframe: StoryboardShotResult;
  ui_storyboard_generate_clip: StoryboardShotResult;
  ui_storyboard_revise_shot: StoryboardShotResult;
  ui_storyboard_select_shot: {
    ok: boolean;
    selected: Yields<StoryboardAgentHandler, "selectShot">;
  };
  ui_storyboard_assemble_timeline: {
    ok: boolean;
    url: string;
  } & Yields<StoryboardAgentHandler, "assembleTimeline">;
  ui_storyboard_set_screenplay: {
    ok: boolean;
    url: string;
  } & Yields<StoryboardAgentHandler, "setScreenplay"> &
    StoryboardPersistence;
  ui_storyboard_set_duration_source: {
    ok: boolean;
    source: "audio" | "manual";
    shots: Array<Yields<StoryboardAgentHandler, "updateShot">>;
  } & StoryboardPersistence;
  ui_storyboard_reproject_shots: {
    ok: boolean;
    url: string;
  } & Yields<StoryboardAgentHandler, "reprojectShots"> &
    StoryboardPersistence;
  ui_storyboard_extract_script: StoryboardScriptLinkResult;
  ui_storyboard_relink_script: StoryboardScriptLinkResult;

  // Timeline editor.
  ui_timeline_get_state: { ok: boolean } & TimelineSnapshot;
  ui_timeline_add_track: {
    ok: boolean;
    track: Yields<TimelineAgentHandler, "addTrack">;
    url: string;
  };
  ui_timeline_add_media_clip: TimelineClipResult;
  ui_timeline_add_text_clip: TimelineClipResult;
  ui_timeline_add_shape_clip: TimelineClipResult;
  ui_timeline_trim_clip: TimelineClipResult;
  ui_timeline_move_clip: TimelineClipResult;
  ui_timeline_duplicate_clip: TimelineClipResult;
  ui_timeline_set_clip_params: TimelineClipResult;
  ui_timeline_set_clip_binding: TimelineClipResult;
  ui_timeline_animate_clip: TimelineClipResult;
  ui_timeline_clear_animations: TimelineClipResult;
  ui_timeline_generate_clip: {
    ok: boolean;
    url: string;
  } & Yields<TimelineAgentHandler, "generateClip">;
  ui_timeline_split_clip: {
    ok: boolean;
    clips: Array<Yields<TimelineAgentHandler, "trimClip">>;
    url: string;
  };
  ui_timeline_delete_clip: {
    ok: boolean;
    deleted: Yields<TimelineAgentHandler, "trimClip">;
    url: string;
  };
  ui_timeline_select_clip: {
    ok: boolean;
    selected: Yields<TimelineAgentHandler, "selectClip">;
  };
  ui_timeline_seek: { ok: boolean; playheadMs: number };
  ui_timeline_list_animation_presets: {
    ok: boolean;
    presets: Array<
      Pick<
        (typeof ANIMATION_PRESETS)[number],
        "id" | "roles" | "defaultDurationMs" | "defaultEasing" | "params" | "describe"
      >
    >;
  };
  ui_timeline_get_clip_frames: {
    ok: boolean;
  } & Yields<TimelineAgentHandler, "getClipFrames">;
}
