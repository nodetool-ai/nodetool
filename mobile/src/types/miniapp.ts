export type { Workflow } from "./workflow";

export type MiniAppInputKind = "string" | "integer" | "float" | "boolean" | "image" | "audio" | "file_path";

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
