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

export function executePython(inputs: ExecutePythonInputs): DslNode<ExecutePythonOutputs> {
  return createNode("nodetool.code.ExecutePython", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], streaming: true });
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

export function executeJavaScript(inputs: ExecuteJavaScriptInputs): DslNode<ExecuteJavaScriptOutputs> {
  return createNode("nodetool.code.ExecuteJavaScript", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"] });
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

export function executeBash(inputs: ExecuteBashInputs): DslNode<ExecuteBashOutputs> {
  return createNode("nodetool.code.ExecuteBash", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], streaming: true });
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

export function executeRuby(inputs: ExecuteRubyInputs): DslNode<ExecuteRubyOutputs> {
  return createNode("nodetool.code.ExecuteRuby", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], streaming: true });
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

export function executeLua(inputs: ExecuteLuaInputs): DslNode<ExecuteLuaOutputs> {
  return createNode("nodetool.code.ExecuteLua", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], streaming: true });
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

export function executeCommand(inputs: ExecuteCommandInputs): DslNode<ExecuteCommandOutputs> {
  return createNode("nodetool.code.ExecuteCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"], streaming: true });
}

// Run Python Command — nodetool.code.RunPythonCommand
export interface RunPythonCommandInputs {
  command?: Connectable<string>;
}

export interface RunPythonCommandOutputs {
  stdout: string;
  stderr: string;
}

export function runPythonCommand(inputs: RunPythonCommandInputs): DslNode<RunPythonCommandOutputs> {
  return createNode("nodetool.code.RunPythonCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"] });
}

// Run Java Script Command — nodetool.code.RunJavaScriptCommand
export interface RunJavaScriptCommandInputs {
  command?: Connectable<string>;
}

export interface RunJavaScriptCommandOutputs {
  stdout: string;
  stderr: string;
}

export function runJavaScriptCommand(inputs: RunJavaScriptCommandInputs): DslNode<RunJavaScriptCommandOutputs> {
  return createNode("nodetool.code.RunJavaScriptCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"] });
}

// Run Bash Command — nodetool.code.RunBashCommand
export interface RunBashCommandInputs {
  command?: Connectable<string>;
}

export interface RunBashCommandOutputs {
  stdout: string;
  stderr: string;
}

export function runBashCommand(inputs: RunBashCommandInputs): DslNode<RunBashCommandOutputs> {
  return createNode("nodetool.code.RunBashCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"] });
}

// Run Ruby Command — nodetool.code.RunRubyCommand
export interface RunRubyCommandInputs {
  command?: Connectable<string>;
}

export interface RunRubyCommandOutputs {
  stdout: string;
  stderr: string;
}

export function runRubyCommand(inputs: RunRubyCommandInputs): DslNode<RunRubyCommandOutputs> {
  return createNode("nodetool.code.RunRubyCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"] });
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

export function runLuaCommand(inputs: RunLuaCommandInputs): DslNode<RunLuaCommandOutputs> {
  return createNode("nodetool.code.RunLuaCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"] });
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

export function runLuaCommandDocker(inputs: RunLuaCommandDockerInputs): DslNode<RunLuaCommandDockerOutputs> {
  return createNode("nodetool.code.RunLuaCommandDocker", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"] });
}

// Run Shell Command — nodetool.code.RunShellCommand
export interface RunShellCommandInputs {
  command?: Connectable<string>;
}

export interface RunShellCommandOutputs {
  stdout: string;
  stderr: string;
}

export function runShellCommand(inputs: RunShellCommandInputs): DslNode<RunShellCommandOutputs> {
  return createNode("nodetool.code.RunShellCommand", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"] });
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

export function runPythonCommandDocker(inputs: RunPythonCommandDockerInputs): DslNode<RunPythonCommandDockerOutputs> {
  return createNode("nodetool.code.RunPythonCommandDocker", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"] });
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

export function runJavaScriptCommandDocker(inputs: RunJavaScriptCommandDockerInputs): DslNode<RunJavaScriptCommandDockerOutputs> {
  return createNode("nodetool.code.RunJavaScriptCommandDocker", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"] });
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

export function runBashCommandDocker(inputs: RunBashCommandDockerInputs): DslNode<RunBashCommandDockerOutputs> {
  return createNode("nodetool.code.RunBashCommandDocker", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"] });
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

export function runRubyCommandDocker(inputs: RunRubyCommandDockerInputs): DslNode<RunRubyCommandDockerOutputs> {
  return createNode("nodetool.code.RunRubyCommandDocker", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"] });
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

export function runShellCommandDocker(inputs: RunShellCommandDockerInputs): DslNode<RunShellCommandDockerOutputs> {
  return createNode("nodetool.code.RunShellCommandDocker", inputs as Record<string, unknown>, { outputNames: ["stdout", "stderr"] });
}

// Code — nodetool.code.Code
export interface CodeInputs {
  code?: Connectable<string>;
  timeout?: Connectable<number>;
}

export interface CodeOutputs {
}

export function code(inputs: CodeInputs): DslNode<CodeOutputs> {
  return createNode("nodetool.code.Code", inputs as Record<string, unknown>, { outputNames: [], streaming: true });
}
