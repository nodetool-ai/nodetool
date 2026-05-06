// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// SandboxShell — nodetool.sandbox.SandboxShell
export interface SandboxShellInputs {
  workspace_dir?: Connectable<string>;
  command?: Connectable<string>;
  wait_seconds?: Connectable<number>;
}

export interface SandboxShellOutputs {
  output: string;
  running: boolean;
  exit_code: number | unknown;
  timed_out: boolean;
}

export function sandboxShell(inputs: SandboxShellInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SandboxShellOutputs> {
  return createNode("nodetool.sandbox.SandboxShell", inputs as Record<string, unknown>, { outputNames: ["output", "running", "exit_code", "timed_out"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// SandboxFile — nodetool.sandbox.SandboxFile
export interface SandboxFileInputs {
  workspace_dir?: Connectable<string>;
  action?: Connectable<"read" | "write" | "str_replace" | "find_in_content" | "find_by_name">;
  params?: Connectable<Record<string, unknown>>;
}

export interface SandboxFileOutputs {
  output: Record<string, unknown>;
}

export function sandboxFile(inputs: SandboxFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SandboxFileOutputs, "output"> {
  return createNode("nodetool.sandbox.SandboxFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
