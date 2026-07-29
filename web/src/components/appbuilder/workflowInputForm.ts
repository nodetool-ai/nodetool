/**
 * Shared types for rendering a workflow's InputNodes as a plain edit form
 * (used by the sketch/timeline "generated" inspector panels, which bind
 * overrides directly to a workflow rather than going through an app_doc).
 */
import {
  AudioRef,
  DataframeRef,
  DocumentRef,
  FolderRef,
  ImageRef,
  VideoRef
} from "../../stores/ApiTypes";
import { WorkflowInputKind } from "./inputKinds";

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

export interface WorkflowInputDefinition {
  nodeId: string;
  nodeType: string;
  kind: WorkflowInputKind;
  data: InputNodeData;
  defaultValue?: unknown;
}

export type WorkflowInputFormValues = Record<
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
