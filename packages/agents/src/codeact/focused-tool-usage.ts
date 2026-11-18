/**
 * How often the teacher model called each editor tool, for ranking a focused
 * document's tools in the turn block.
 *
 * Counted once from the `execute_code` JavaScript in the teacher validation
 * traces (`nodetool-debug/finetune/teacher-val/val-glm-*.jsonl`) and the
 * `bundle-v3e3` training set: every `ui_<name>(` call site, summed. Only each
 * surface's twelve most called tools are kept, since the turn block gives a
 * one-line purpose to no more than that many. The table is fixed source, so
 * the turn block a focus produces is the same on every turn and every run.
 * Refresh it from newer traces by counting the same way.
 */
export const FOCUSED_TOOL_CALLS: ReadonlyMap<string, number> = new Map([
  // app
  ["ui_app_get_snapshot", 207],
  ["ui_app_add_component", 156],
  ["ui_app_debug", 111],
  ["ui_app_get_binding_targets", 71],
  ["ui_app_list_operations", 67],
  ["ui_app_update_component", 59],
  ["ui_app_list_component_types", 57],
  ["ui_app_list_variables", 41],
  ["ui_app_set_title", 33],
  ["ui_app_list_resources", 22],
  ["ui_app_declare_variable", 12],
  ["ui_app_remove_component", 11],
  // app_run
  ["ui_app_run_get_state", 1],
  // audio
  ["ui_audio_get_state", 131],
  ["ui_audio_edit", 71],
  ["ui_audio_apply_effect", 44],
  ["ui_audio_list_effects", 38],
  ["ui_audio_save", 33],
  // code
  ["ui_code_get_state", 2],
  // jsscript
  ["ui_jsscript_get_state", 113],
  ["ui_jsscript_set_code", 69],
  ["ui_jsscript_run", 57],
  ["ui_jsscript_test", 50],
  ["ui_jsscript_set_ports", 49],
  ["ui_jsscript_set_meta", 44],
  ["ui_jsscript_set_tests", 26],
  // model3d
  ["ui_3d_list_scene", 197],
  ["ui_3d_set_transform", 184],
  ["ui_3d_add_object", 133],
  ["ui_3d_set_material_color", 90],
  ["ui_3d_get_object", 61],
  ["ui_3d_set_visibility", 33],
  ["ui_3d_capture_view", 25],
  ["ui_3d_rename_object", 24],
  ["ui_3d_frame_scene", 23],
  ["ui_3d_delete_object", 15],
  ["ui_3d_select_object", 2],
  ["ui_3d_set_material", 2],
  // script
  ["ui_script_get_state", 135],
  ["ui_script_add_speaker", 64],
  ["ui_script_add_line", 54],
  ["ui_script_set_speaker", 45],
  ["ui_script_set_line_text", 14],
  ["ui_script_set_setup", 13],
  ["ui_script_derive_storyboard", 4],
  ["ui_script_send_to_timeline", 2],
  ["ui_script_voice_all", 2],
  // sketch
  ["ui_sketch_get_state", 286],
  ["ui_sketch_draw_shape", 68],
  ["ui_sketch_add_layer", 64],
  ["ui_sketch_select_layer", 58],
  ["ui_sketch_set_layer_props", 49],
  ["ui_sketch_pick_color", 37],
  ["ui_sketch_get_layer_image", 36],
  ["ui_sketch_remove_layer", 14],
  ["ui_sketch_fill", 13],
  ["ui_sketch_reorder_layer", 13],
  ["ui_sketch_resize_canvas", 12],
  ["ui_sketch_render_to_asset", 11],
  // storyboard
  ["ui_storyboard_get_state", 118],
  ["ui_storyboard_add_shot", 46],
  ["ui_storyboard_update_shot", 35],
  ["ui_storyboard_set_screenplay", 21],
  ["ui_storyboard_select_shot", 11],
  ["ui_storyboard_generate_keyframe", 3],
  ["ui_storyboard_generate_clip", 2],
  ["ui_storyboard_set_setup", 2],
  ["ui_storyboard_assemble_timeline", 1],
  ["ui_storyboard_extract_script", 1],
  // svg
  ["ui_svg_get_state", 87],
  ["ui_svg_replace", 57],
  ["ui_svg_save", 23],
  ["ui_svg_set_markup", 10],
  // timeline
  ["ui_timeline_get_state", 623],
  ["ui_timeline_animate_clip", 82],
  ["ui_timeline_add_text_clip", 76],
  ["ui_timeline_list_animation_presets", 45],
  ["ui_timeline_add_track", 40],
  ["ui_timeline_move_clip", 29],
  ["ui_timeline_delete_clip", 28],
  ["ui_timeline_trim_clip", 28],
  ["ui_timeline_split_clip", 24],
  ["ui_timeline_get_clip_frames", 19],
  ["ui_timeline_set_clip_params", 11],
  ["ui_timeline_edit", 6],
  // workflow
  ["ui_get_graph", 19],
  ["ui_open_workflow", 8],
  ["ui_search_nodes", 2],
  ["ui_update_node_data", 2],
  ["ui_apply_graph_patch", 1],
  ["ui_new_workflow", 1],
]);

/**
 * Split a focused document's tools into those the turn block describes with a
 * one-line purpose (the ones in {@link FOCUSED_TOOL_CALLS}, most called first)
 * and those it lists by name (the rest, in name order). Both orders come from
 * the table and the names alone, so the order the tools arrive in never
 * changes the turn block.
 */
export function rankFocusedTools<T extends { name: string }>(
  tools: readonly T[]
): { described: T[]; named: T[] } {
  const calls = (tool: T) => FOCUSED_TOOL_CALLS.get(tool.name) ?? 0;
  const byName = (a: T, b: T) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const described = tools
    .filter((tool) => calls(tool) > 0)
    .sort((a, b) => calls(b) - calls(a) || byName(a, b));
  const named = tools.filter((tool) => calls(tool) === 0).sort(byName);
  return { described, named };
}
