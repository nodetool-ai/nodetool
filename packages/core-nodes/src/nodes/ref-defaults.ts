import type { PropOptions } from "@nodetool-ai/node-sdk";

export const NAME_PROP: PropOptions = {
  type: "str",
  default: "",
  title: "Name",
  description: "The parameter name for the workflow."
};

export const INPUT_DESCRIPTION_PROP: PropOptions = {
  type: "str",
  default: "",
  title: "Description",
  description: "The description of the input for the workflow."
};

export const imageRefDefault = {
  type: "image",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
};

export const audioRefDefault = {
  type: "audio",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
};

export const videoRefDefault = {
  type: "video",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null,
  duration: null,
  format: null
};

export const documentRefDefault = {
  type: "document",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
};

export const dataframeRefDefault = {
  type: "dataframe",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null,
  columns: null
};

export const model3DRefDefault = {
  type: "model_3d",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null,
  format: null,
  material_file: null,
  texture_files: []
};

export const folderRefDefault = {
  type: "folder",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
};

export const colorDefault = {
  type: "color",
  value: null
};

export const jsonRefDefault = {
  type: "json",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
};

export const sketchRefDefault = {
  type: "sketch",
  id: null,
  data: null
};

export const timelineRefDefault = {
  type: "timeline",
  id: null,
  data: null
};

export const scriptRefDefault = {
  type: "script",
  id: null,
  data: null
};

export const hfModelDefault = {
  type: "hf.model",
  repo_id: "",
  path: null,
  variant: null,
  allow_patterns: null,
  ignore_patterns: null
};

const standardModelDefault = (type: string) => ({
  type,
  provider: "empty",
  id: "",
  name: "",
  path: null,
  supported_tasks: []
});

export const languageModelDefault = standardModelDefault("language_model");
export const imageModelDefault = standardModelDefault("image_model");
export const videoModelDefault = standardModelDefault("video_model");

export const ttsModelDefault = {
  type: "tts_model",
  provider: "empty",
  id: "",
  name: "",
  path: null,
  voices: [],
  selected_voice: ""
};

export const asrModelDefault = {
  type: "asr_model",
  provider: "empty",
  id: "",
  name: "",
  path: null
};

export const embeddingModelDefault = {
  type: "embedding_model",
  provider: "empty",
  id: "",
  name: "",
  dimensions: 0
};

export const messageRefDefault = {
  type: "message",
  id: null,
  workflow_id: null,
  graph: null,
  thread_id: null,
  tools: null,
  tool_call_id: null,
  role: "",
  name: null,
  content: null,
  tool_calls: null,
  collections: null,
  input_files: null,
  created_at: null,
  provider: null,
  model: null,

  agent_execution_id: null,
  execution_event_type: null,
  workflow_target: null,
  workflow_message_input_name: null,
  workflow_messages_input_name: null
};
