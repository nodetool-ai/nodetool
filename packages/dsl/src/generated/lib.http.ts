// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// HTTP GET Text — lib.http.GetText
export interface GetTextInputs {
  url?: Connectable<string>;
  headers?: Connectable<string>;
}

export interface GetTextOutputs {
  output: string;
  status: number;
}

export function getText(inputs: GetTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetTextOutputs> {
  return createNode("lib.http.GetText", inputs as Record<string, unknown>, { outputNames: ["output", "status"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// HTTP GET JSON — lib.http.GetJSON
export interface GetJSONInputs {
  url?: Connectable<string>;
  headers?: Connectable<string>;
}

export interface GetJSONOutputs {
  output: unknown;
  status: number;
}

export function getJSON(inputs: GetJSONInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetJSONOutputs> {
  return createNode("lib.http.GetJSON", inputs as Record<string, unknown>, { outputNames: ["output", "status"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// HTTP GET Bytes — lib.http.GetBytes
export interface GetBytesInputs {
  url?: Connectable<string>;
  headers?: Connectable<string>;
}

export interface GetBytesOutputs {
  output: unknown;
  status: number;
}

export function getBytes(inputs: GetBytesInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetBytesOutputs> {
  return createNode("lib.http.GetBytes", inputs as Record<string, unknown>, { outputNames: ["output", "status"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// HTTP POST — lib.http.Post
export interface PostInputs {
  url?: Connectable<string>;
  body?: Connectable<unknown>;
  headers?: Connectable<string>;
}

export interface PostOutputs {
  output: unknown;
  status: number;
}

export function post(inputs: PostInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PostOutputs> {
  return createNode("lib.http.Post", inputs as Record<string, unknown>, { outputNames: ["output", "status"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// HTTP PUT — lib.http.Put
export interface PutInputs {
  url?: Connectable<string>;
  body?: Connectable<unknown>;
  headers?: Connectable<string>;
}

export interface PutOutputs {
  output: unknown;
  status: number;
}

export function put(inputs: PutInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PutOutputs> {
  return createNode("lib.http.Put", inputs as Record<string, unknown>, { outputNames: ["output", "status"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// HTTP PATCH — lib.http.Patch
export interface PatchInputs {
  url?: Connectable<string>;
  body?: Connectable<unknown>;
  headers?: Connectable<string>;
}

export interface PatchOutputs {
  output: unknown;
  status: number;
}

export function patch(inputs: PatchInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PatchOutputs> {
  return createNode("lib.http.Patch", inputs as Record<string, unknown>, { outputNames: ["output", "status"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// HTTP DELETE — lib.http.Delete
export interface DeleteInputs {
  url?: Connectable<string>;
  headers?: Connectable<string>;
}

export interface DeleteOutputs {
  output: boolean;
  status: number;
}

export function delete_(inputs: DeleteInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DeleteOutputs> {
  return createNode("lib.http.Delete", inputs as Record<string, unknown>, { outputNames: ["output", "status"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
