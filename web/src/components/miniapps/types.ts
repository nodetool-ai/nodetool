import { ImageRef } from "../../stores/ApiTypes";

export type MiniAppInputKind = "string" | "integer" | "float" | "boolean" | "image" | "audio" | "file_path";

export interface InputNodeData {
  name: string;
  label: string;
  description: string;
  min?: number;
  max?: number;
  /** StringInput: 0 = unlimited */
  max_length?: number;
  /** StringInput: preferred UI rendering */
  line_mode?: "single_line" | "multiline";
  /** Backwards/compat: some graphs may store boolean instead of enum */
  multiline?: boolean;
  value?: unknown;
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

export type MiniAppInputValues = Record<string, unknown | ImageRef | undefined>;
