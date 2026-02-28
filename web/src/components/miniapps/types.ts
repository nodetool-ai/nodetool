import {
  AudioRef,
  DataframeRef,
  DocumentRef,
  FolderRef,
  ImageRef,
  VideoRef
} from "../../stores/ApiTypes";

export type MiniAppInputKind =
  | "string"
  | "integer"
  | "float"
  | "boolean"
  | "color"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "dataframe"
  | "file_path"
  | "folder_path"
  | "folder"
  | "select"
  | "language_model"
  | "image_model"
  | "video_model"
  | "tts_model"
  | "asr_model"
  | "embedding_model"
  | "image_list"
  | "video_list"
  | "audio_list"
  | "text_list";

export interface InputNodeData {
  name: string;
  label: string;
  description: string;
  min?: number;
  max?: number;
  /** StringInput: 0 = unlimited */
  max_length?: number;
  /** StringInput: preferred UI rendering */
  line_mode?: "single_line" | "multi_line" | "multiline";
  /** Backwards/compat: some graphs may store boolean instead of enum */
  multiline?: boolean;
  value?: unknown;
  /** SelectInput: available options for the dropdown */
  options?: string[];
  /** SelectInput: enum type name for type matching */
  enum_type_name?: string;
}

export interface MiniAppInputDefinition {
  nodeId: string;
  nodeType: string;
  kind: MiniAppInputKind;
  data: InputNodeData;
  defaultValue?: unknown;
}

export interface MiniAppResult {
  id: string;
  nodeId: string;
  nodeName: string;
  outputName: string;
  outputType: string;
  value: unknown;
  metadata?: Record<string, unknown>;
  receivedAt: number;
}

export interface MiniAppProgress {
  current: number;
  total: number;
}

export type RunnerMessage = { type?: string } & Record<string, unknown>;

export type MiniAppInputValues = Record<
  string,
  | unknown
  | ImageRef
  | AudioRef
  | VideoRef
  | DocumentRef
  | DataframeRef
  | FolderRef
  | undefined
>;
