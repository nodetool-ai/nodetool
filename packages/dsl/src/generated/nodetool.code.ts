// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";

// Execute Python — nodetool.code.ExecutePython
export interface ExecutePythonInputs {
  code?: Connectable<string>;
  image?: Connectable<unknown>;
  execution_mode?: Connectable<unknown>;
  stdin?: Connectable<string>;
}

export interface ExecutePythonOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function executePython(inputs: ExecutePythonInputs): DslNode<ExecutePythonOutputs> {
  return createNode("nodetool.code.ExecutePython", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Execute Java Script — nodetool.code.ExecuteJavaScript
export interface ExecuteJavaScriptInputs {
  code?: Connectable<string>;
  image?: Connectable<unknown>;
  execution_mode?: Connectable<unknown>;
  stdin?: Connectable<string>;
}

export interface ExecuteJavaScriptOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function executeJavaScript(inputs: ExecuteJavaScriptInputs): DslNode<ExecuteJavaScriptOutputs> {
  return createNode("nodetool.code.ExecuteJavaScript", inputs as Record<string, unknown>, { multiOutput: true });
}

// Execute Bash — nodetool.code.ExecuteBash
export interface ExecuteBashInputs {
  code?: Connectable<string>;
  image?: Connectable<unknown>;
  execution_mode?: Connectable<unknown>;
  stdin?: Connectable<string>;
}

export interface ExecuteBashOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function executeBash(inputs: ExecuteBashInputs): DslNode<ExecuteBashOutputs> {
  return createNode("nodetool.code.ExecuteBash", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Execute Ruby — nodetool.code.ExecuteRuby
export interface ExecuteRubyInputs {
  code?: Connectable<string>;
  image?: Connectable<unknown>;
  execution_mode?: Connectable<unknown>;
  stdin?: Connectable<string>;
}

export interface ExecuteRubyOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function executeRuby(inputs: ExecuteRubyInputs): DslNode<ExecuteRubyOutputs> {
  return createNode("nodetool.code.ExecuteRuby", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Execute Lua — nodetool.code.ExecuteLua
export interface ExecuteLuaInputs {
  code?: Connectable<string>;
  executable?: Connectable<unknown>;
  execution_mode?: Connectable<unknown>;
  timeout_seconds?: Connectable<number>;
  stdin?: Connectable<string>;
}

export interface ExecuteLuaOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function executeLua(inputs: ExecuteLuaInputs): DslNode<ExecuteLuaOutputs> {
  return createNode("nodetool.code.ExecuteLua", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Execute Command — nodetool.code.ExecuteCommand
export interface ExecuteCommandInputs {
  command?: Connectable<string>;
  image?: Connectable<unknown>;
  execution_mode?: Connectable<unknown>;
  stdin?: Connectable<string>;
}

export interface ExecuteCommandOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function executeCommand(inputs: ExecuteCommandInputs): DslNode<ExecuteCommandOutputs> {
  return createNode("nodetool.code.ExecuteCommand", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Run Python Command — nodetool.code.RunPythonCommand
export interface RunPythonCommandInputs {
  command?: Connectable<string>;
}

export interface RunPythonCommandOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function runPythonCommand(inputs: RunPythonCommandInputs): DslNode<RunPythonCommandOutputs> {
  return createNode("nodetool.code.RunPythonCommand", inputs as Record<string, unknown>, { multiOutput: true });
}

// Run Java Script Command — nodetool.code.RunJavaScriptCommand
export interface RunJavaScriptCommandInputs {
  command?: Connectable<string>;
}

export interface RunJavaScriptCommandOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function runJavaScriptCommand(inputs: RunJavaScriptCommandInputs): DslNode<RunJavaScriptCommandOutputs> {
  return createNode("nodetool.code.RunJavaScriptCommand", inputs as Record<string, unknown>, { multiOutput: true });
}

// Run Bash Command — nodetool.code.RunBashCommand
export interface RunBashCommandInputs {
  command?: Connectable<string>;
}

export interface RunBashCommandOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function runBashCommand(inputs: RunBashCommandInputs): DslNode<RunBashCommandOutputs> {
  return createNode("nodetool.code.RunBashCommand", inputs as Record<string, unknown>, { multiOutput: true });
}

// Run Ruby Command — nodetool.code.RunRubyCommand
export interface RunRubyCommandInputs {
  command?: Connectable<string>;
}

export interface RunRubyCommandOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function runRubyCommand(inputs: RunRubyCommandInputs): DslNode<RunRubyCommandOutputs> {
  return createNode("nodetool.code.RunRubyCommand", inputs as Record<string, unknown>, { multiOutput: true });
}

// Run Lua Command — nodetool.code.RunLuaCommand
export interface RunLuaCommandInputs {
  command?: Connectable<string>;
  executable?: Connectable<unknown>;
  timeout_seconds?: Connectable<number>;
}

export interface RunLuaCommandOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function runLuaCommand(inputs: RunLuaCommandInputs): DslNode<RunLuaCommandOutputs> {
  return createNode("nodetool.code.RunLuaCommand", inputs as Record<string, unknown>, { multiOutput: true });
}

// Run Lua Command Docker — nodetool.code.RunLuaCommandDocker
export interface RunLuaCommandDockerInputs {
  command?: Connectable<string>;
  image?: Connectable<unknown>;
  timeout_seconds?: Connectable<number>;
}

export interface RunLuaCommandDockerOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function runLuaCommandDocker(inputs: RunLuaCommandDockerInputs): DslNode<RunLuaCommandDockerOutputs> {
  return createNode("nodetool.code.RunLuaCommandDocker", inputs as Record<string, unknown>, { multiOutput: true });
}

// Run Shell Command — nodetool.code.RunShellCommand
export interface RunShellCommandInputs {
  command?: Connectable<string>;
}

export interface RunShellCommandOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function runShellCommand(inputs: RunShellCommandInputs): DslNode<RunShellCommandOutputs> {
  return createNode("nodetool.code.RunShellCommand", inputs as Record<string, unknown>, { multiOutput: true });
}

// Run Python Command Docker — nodetool.code.RunPythonCommandDocker
export interface RunPythonCommandDockerInputs {
  command?: Connectable<string>;
  image?: Connectable<unknown>;
}

export interface RunPythonCommandDockerOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function runPythonCommandDocker(inputs: RunPythonCommandDockerInputs): DslNode<RunPythonCommandDockerOutputs> {
  return createNode("nodetool.code.RunPythonCommandDocker", inputs as Record<string, unknown>, { multiOutput: true });
}

// Run Java Script Command Docker — nodetool.code.RunJavaScriptCommandDocker
export interface RunJavaScriptCommandDockerInputs {
  command?: Connectable<string>;
  image?: Connectable<unknown>;
}

export interface RunJavaScriptCommandDockerOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function runJavaScriptCommandDocker(inputs: RunJavaScriptCommandDockerInputs): DslNode<RunJavaScriptCommandDockerOutputs> {
  return createNode("nodetool.code.RunJavaScriptCommandDocker", inputs as Record<string, unknown>, { multiOutput: true });
}

// Run Bash Command Docker — nodetool.code.RunBashCommandDocker
export interface RunBashCommandDockerInputs {
  command?: Connectable<string>;
  image?: Connectable<unknown>;
}

export interface RunBashCommandDockerOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function runBashCommandDocker(inputs: RunBashCommandDockerInputs): DslNode<RunBashCommandDockerOutputs> {
  return createNode("nodetool.code.RunBashCommandDocker", inputs as Record<string, unknown>, { multiOutput: true });
}

// Run Ruby Command Docker — nodetool.code.RunRubyCommandDocker
export interface RunRubyCommandDockerInputs {
  command?: Connectable<string>;
  image?: Connectable<unknown>;
}

export interface RunRubyCommandDockerOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function runRubyCommandDocker(inputs: RunRubyCommandDockerInputs): DslNode<RunRubyCommandDockerOutputs> {
  return createNode("nodetool.code.RunRubyCommandDocker", inputs as Record<string, unknown>, { multiOutput: true });
}

// Run Shell Command Docker — nodetool.code.RunShellCommandDocker
export interface RunShellCommandDockerInputs {
  command?: Connectable<string>;
  image?: Connectable<unknown>;
}

export interface RunShellCommandDockerOutputs {
  stdout: OutputHandle<string>;
  stderr: OutputHandle<string>;
}

export function runShellCommandDocker(inputs: RunShellCommandDockerInputs): DslNode<RunShellCommandDockerOutputs> {
  return createNode("nodetool.code.RunShellCommandDocker", inputs as Record<string, unknown>, { multiOutput: true });
}

// Code — nodetool.code.Code
export interface CodeInputs {
  code?: Connectable<string>;
  timeout?: Connectable<number>;
}

export function code(inputs: CodeInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.code.Code", inputs as Record<string, unknown>, { streaming: true });
}
