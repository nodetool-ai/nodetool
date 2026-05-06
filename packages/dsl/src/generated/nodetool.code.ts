// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Execute Python — nodetool.code.ExecutePython
export interface ExecutePythonInputs {
  code?: Connectable<string>;
  image?: Connectable<"python:3.11-slim" | "jupyter/scipy-notebook:latest">;
  execution_mode?: Connectable<"docker" | "subprocess">;
  stdin?: Connectable<string>;
}

export interface ExecutePythonOutputs {
  stdout: string;
  stderr: string;
}

export function executePython(inputs: ExecutePythonInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExecutePythonOutputs> {
  return createNode("nodetool.code.ExecutePython", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Execute Java Script — nodetool.code.ExecuteJavaScript
export interface ExecuteJavaScriptInputs {
  code?: Connectable<string>;
  image?: Connectable<"node:22-alpine">;
  execution_mode?: Connectable<"docker" | "subprocess">;
  stdin?: Connectable<string>;
}

export interface ExecuteJavaScriptOutputs {
  stdout: string;
  stderr: string;
}

export function executeJavaScript(inputs: ExecuteJavaScriptInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExecuteJavaScriptOutputs> {
  return createNode("nodetool.code.ExecuteJavaScript", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Execute Bash — nodetool.code.ExecuteBash
export interface ExecuteBashInputs {
  code?: Connectable<string>;
  image?: Connectable<"bash:5.2" | "debian:12" | "ubuntu:22.04" | "ubuntu:24.04" | "jupyter/scipy-notebook:latest">;
  execution_mode?: Connectable<"docker" | "subprocess">;
  stdin?: Connectable<string>;
}

export interface ExecuteBashOutputs {
  stdout: string;
  stderr: string;
}

export function executeBash(inputs: ExecuteBashInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExecuteBashOutputs> {
  return createNode("nodetool.code.ExecuteBash", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Execute Ruby — nodetool.code.ExecuteRuby
export interface ExecuteRubyInputs {
  code?: Connectable<string>;
  image?: Connectable<"ruby:3.3-alpine">;
  execution_mode?: Connectable<"docker" | "subprocess">;
  stdin?: Connectable<string>;
}

export interface ExecuteRubyOutputs {
  stdout: string;
  stderr: string;
}

export function executeRuby(inputs: ExecuteRubyInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExecuteRubyOutputs> {
  return createNode("nodetool.code.ExecuteRuby", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Execute Lua — nodetool.code.ExecuteLua
export interface ExecuteLuaInputs {
  code?: Connectable<string>;
  executable?: Connectable<"lua" | "luajit">;
  execution_mode?: Connectable<"docker" | "subprocess">;
  timeout_seconds?: Connectable<number>;
  stdin?: Connectable<string>;
}

export interface ExecuteLuaOutputs {
  stdout: string;
  stderr: string;
}

export function executeLua(inputs: ExecuteLuaInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExecuteLuaOutputs> {
  return createNode("nodetool.code.ExecuteLua", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Execute Command — nodetool.code.ExecuteCommand
export interface ExecuteCommandInputs {
  command?: Connectable<string>;
  image?: Connectable<"bash:5.2" | "alpine:3" | "ubuntu:22.04" | "ubuntu:24.04">;
  execution_mode?: Connectable<"docker" | "subprocess">;
  stdin?: Connectable<string>;
}

export interface ExecuteCommandOutputs {
  stdout: string;
  stderr: string;
}

export function executeCommand(inputs: ExecuteCommandInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExecuteCommandOutputs> {
  return createNode("nodetool.code.ExecuteCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Run Python Command — nodetool.code.RunPythonCommand
export interface RunPythonCommandInputs {
  command?: Connectable<string>;
}

export interface RunPythonCommandOutputs {
  stdout: string;
  stderr: string;
}

export function runPythonCommand(inputs: RunPythonCommandInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RunPythonCommandOutputs> {
  return createNode("nodetool.code.RunPythonCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Run Java Script Command — nodetool.code.RunJavaScriptCommand
export interface RunJavaScriptCommandInputs {
  command?: Connectable<string>;
}

export interface RunJavaScriptCommandOutputs {
  stdout: string;
  stderr: string;
}

export function runJavaScriptCommand(inputs: RunJavaScriptCommandInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RunJavaScriptCommandOutputs> {
  return createNode("nodetool.code.RunJavaScriptCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Run Bash Command — nodetool.code.RunBashCommand
export interface RunBashCommandInputs {
  command?: Connectable<string>;
}

export interface RunBashCommandOutputs {
  stdout: string;
  stderr: string;
}

export function runBashCommand(inputs: RunBashCommandInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RunBashCommandOutputs> {
  return createNode("nodetool.code.RunBashCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Run Ruby Command — nodetool.code.RunRubyCommand
export interface RunRubyCommandInputs {
  command?: Connectable<string>;
}

export interface RunRubyCommandOutputs {
  stdout: string;
  stderr: string;
}

export function runRubyCommand(inputs: RunRubyCommandInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RunRubyCommandOutputs> {
  return createNode("nodetool.code.RunRubyCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Run Lua Command — nodetool.code.RunLuaCommand
export interface RunLuaCommandInputs {
  command?: Connectable<string>;
  executable?: Connectable<"lua" | "luajit">;
  timeout_seconds?: Connectable<number>;
}

export interface RunLuaCommandOutputs {
  stdout: string;
  stderr: string;
}

export function runLuaCommand(inputs: RunLuaCommandInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RunLuaCommandOutputs> {
  return createNode("nodetool.code.RunLuaCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Run Lua Command Docker — nodetool.code.RunLuaCommandDocker
export interface RunLuaCommandDockerInputs {
  command?: Connectable<string>;
  image?: Connectable<"nickblah/lua:5.2.4-luarocks-ubuntu">;
  timeout_seconds?: Connectable<number>;
}

export interface RunLuaCommandDockerOutputs {
  stdout: string;
  stderr: string;
}

export function runLuaCommandDocker(inputs: RunLuaCommandDockerInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RunLuaCommandDockerOutputs> {
  return createNode("nodetool.code.RunLuaCommandDocker", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Run Shell Command — nodetool.code.RunShellCommand
export interface RunShellCommandInputs {
  command?: Connectable<string>;
}

export interface RunShellCommandOutputs {
  stdout: string;
  stderr: string;
}

export function runShellCommand(inputs: RunShellCommandInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RunShellCommandOutputs> {
  return createNode("nodetool.code.RunShellCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Run Python Command Docker — nodetool.code.RunPythonCommandDocker
export interface RunPythonCommandDockerInputs {
  command?: Connectable<string>;
  image?: Connectable<"python:3.11-slim" | "jupyter/scipy-notebook:latest">;
}

export interface RunPythonCommandDockerOutputs {
  stdout: string;
  stderr: string;
}

export function runPythonCommandDocker(inputs: RunPythonCommandDockerInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RunPythonCommandDockerOutputs> {
  return createNode("nodetool.code.RunPythonCommandDocker", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Run Java Script Command Docker — nodetool.code.RunJavaScriptCommandDocker
export interface RunJavaScriptCommandDockerInputs {
  command?: Connectable<string>;
  image?: Connectable<"node:22-alpine">;
}

export interface RunJavaScriptCommandDockerOutputs {
  stdout: string;
  stderr: string;
}

export function runJavaScriptCommandDocker(inputs: RunJavaScriptCommandDockerInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RunJavaScriptCommandDockerOutputs> {
  return createNode("nodetool.code.RunJavaScriptCommandDocker", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Run Bash Command Docker — nodetool.code.RunBashCommandDocker
export interface RunBashCommandDockerInputs {
  command?: Connectable<string>;
  image?: Connectable<"bash:5.2" | "debian:12" | "ubuntu:22.04" | "ubuntu:24.04" | "jupyter/scipy-notebook:latest">;
}

export interface RunBashCommandDockerOutputs {
  stdout: string;
  stderr: string;
}

export function runBashCommandDocker(inputs: RunBashCommandDockerInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RunBashCommandDockerOutputs> {
  return createNode("nodetool.code.RunBashCommandDocker", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Run Ruby Command Docker — nodetool.code.RunRubyCommandDocker
export interface RunRubyCommandDockerInputs {
  command?: Connectable<string>;
  image?: Connectable<"ruby:3.3-alpine">;
}

export interface RunRubyCommandDockerOutputs {
  stdout: string;
  stderr: string;
}

export function runRubyCommandDocker(inputs: RunRubyCommandDockerInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RunRubyCommandDockerOutputs> {
  return createNode("nodetool.code.RunRubyCommandDocker", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Run Shell Command Docker — nodetool.code.RunShellCommandDocker
export interface RunShellCommandDockerInputs {
  command?: Connectable<string>;
  image?: Connectable<"bash:5.2" | "alpine:3" | "ubuntu:22.04" | "ubuntu:24.04">;
}

export interface RunShellCommandDockerOutputs {
  stdout: string;
  stderr: string;
}

export function runShellCommandDocker(inputs: RunShellCommandDockerInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RunShellCommandDockerOutputs> {
  return createNode("nodetool.code.RunShellCommandDocker", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Code — nodetool.code.Code
export interface CodeInputs {
  code?: Connectable<string>;
  timeout?: Connectable<number>;
}

export interface CodeOutputs {
}

export function code(inputs: CodeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CodeOutputs> {
  return createNode("nodetool.code.Code", inputs as Record<string, unknown>, { outputNames: [], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
