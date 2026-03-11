import { BaseNode, prop } from "@nodetool/node-sdk";
import { spawn } from "node:child_process";

type RunResult = {
  stdout: string;
  stderr: string;
  exit_code: number;
};

async function runProcess(args: {
  cmd: string;
  argv?: string[];
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}): Promise<RunResult> {
  const timeoutMs = args.timeoutMs ?? 30000;
  return new Promise((resolve, reject) => {
    const child = spawn(args.cmd, args.argv ?? [], {
      cwd: args.cwd,
      env: { ...process.env, ...(args.env ?? {}) },
      stdio: "pipe",
      // Create a new process group so we can kill all children on timeout
      detached: true,
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try {
        // Kill the entire process group (pid < 0 = process group)
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // Fallback: kill just the direct child
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) {
        resolve({ stdout, stderr: `${stderr}\nProcess timed out`, exit_code: 124 });
        return;
      }
      resolve({ stdout, stderr, exit_code: code ?? 0 });
    });

    if (typeof args.stdin === "string" && args.stdin.length > 0) {
      child.stdin.write(args.stdin);
    }
    child.stdin.end();
  });
}

abstract class ScriptExecNode extends BaseNode {
  static readonly defaultCommand: string = "sh";
  static readonly defaultArgs: string[] = [];

  protected command(): { cmd: string; argv: string[] } {
    const cls = this.constructor as typeof ScriptExecNode;
    return {
      cmd: cls.defaultCommand,
      argv: [...cls.defaultArgs],
    };
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const codeSource = Object.prototype.hasOwnProperty.call(inputs, "code")
      ? inputs.code
      : Object.prototype.hasOwnProperty.call(inputs, "script")
        ? inputs.script
        : this.code ?? this.script ?? "";
    const code = String(codeSource ?? "");
    const stdin = String(inputs.stdin ?? this.stdin ?? "");
    const cwdRaw = String(inputs.cwd ?? this.cwd ?? "");
    const cwd = cwdRaw || undefined;
    const timeoutSeconds = Number(inputs.timeout_seconds ?? this.timeout_seconds ?? 0);
    const timeoutMs = Number(inputs.timeout_ms ?? this.timeout_ms ?? (timeoutSeconds > 0 ? timeoutSeconds * 1000 : 30000));
    const env = (inputs.env ?? this.env ?? {}) as Record<string, string>;
    const { cmd, argv } = this.command();
    const result = await runProcess({
      cmd,
      argv: [...argv, code],
      stdin,
      cwd,
      env,
      timeoutMs,
    });
    return {
      ...result,
      output: result.stdout,
      success: result.exit_code === 0,
    };
  }
}

export class ExecutePythonNode extends ScriptExecNode {
  static readonly nodeType = "nodetool.code.ExecutePython";
      static readonly title = "Execute Python";
      static readonly description = "Executes Python code with safety restrictions.\n    python, code, execute\n\n    Use cases:\n    - Run custom data transformations\n    - Prototype node functionality\n    - Debug and testing workflows\n\n    IMPORTANT: Only enabled in non-production environments";
    static readonly isStreamingOutput = true;
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly defaultCommand = "python3";
  static readonly defaultArgs = ["-c"];
  @prop({ type: "str", default: "", title: "Code", description: "Python code to execute as-is. Dynamic inputs are provided as local vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'." })
  declare code: any;

  @prop({ type: "enum", default: "python:3.11-slim", title: "Image", description: "Docker image to use for execution", values: [
  "python:3.11-slim",
  "jupyter/scipy-notebook:latest"
] })
  declare image: any;

  @prop({ type: "enum", default: "docker", title: "Execution Mode", description: "Execution mode: 'docker' or 'subprocess'", values: [
  "docker",
  "subprocess"
] })
  declare execution_mode: any;

  @prop({ type: "str", default: "", title: "Stdin", description: "String to write to process stdin before any streaming input. Use newlines to separate lines." })
  declare stdin: any;

}

export class ExecuteJavaScriptNode extends ScriptExecNode {
  static readonly nodeType = "nodetool.code.ExecuteJavaScript";
      static readonly title = "Execute Java Script";
      static readonly description = "Executes JavaScript (Node.js) code with safety restrictions.\n    javascript, nodejs, code, execute";
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly defaultCommand = "node";
  static readonly defaultArgs = ["-e"];
  @prop({ type: "str", default: "", title: "Code", description: "JavaScript code to execute as-is under Node.js. Dynamic inputs are provided as local vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'." })
  declare code: any;

  @prop({ type: "enum", default: "node:22-alpine", title: "Image", description: "Docker image to use for execution", values: [
  "node:22-alpine"
] })
  declare image: any;

  @prop({ type: "enum", default: "docker", title: "Execution Mode", description: "Execution mode: 'docker' or 'subprocess'", values: [
  "docker",
  "subprocess"
] })
  declare execution_mode: any;

  @prop({ type: "str", default: "", title: "Stdin", description: "String to write to process stdin before any streaming input. Use newlines to separate lines." })
  declare stdin: any;

}

export class ExecuteBashNode extends ScriptExecNode {
  static readonly nodeType = "nodetool.code.ExecuteBash";
      static readonly title = "Execute Bash";
      static readonly description = "Executes Bash script with safety restrictions.\n    bash, shell, code, execute";
    static readonly isStreamingOutput = true;
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly defaultCommand = "bash";
  static readonly defaultArgs = ["-c"];
  @prop({ type: "str", default: "", title: "Code", description: "Bash script to execute as-is. Dynamic inputs are provided as env vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'." })
  declare code: any;

  @prop({ type: "enum", default: "ubuntu:22.04", title: "Image", description: "Docker image to use for execution", values: [
  "bash:5.2",
  "debian:12",
  "ubuntu:22.04",
  "ubuntu:24.04",
  "jupyter/scipy-notebook:latest"
] })
  declare image: any;

  @prop({ type: "enum", default: "docker", title: "Execution Mode", description: "Execution mode: 'docker' or 'subprocess'", values: [
  "docker",
  "subprocess"
] })
  declare execution_mode: any;

  @prop({ type: "str", default: "", title: "Stdin", description: "String to write to process stdin before any streaming input. Use newlines to separate lines." })
  declare stdin: any;

}

export class ExecuteRubyNode extends ScriptExecNode {
  static readonly nodeType = "nodetool.code.ExecuteRuby";
      static readonly title = "Execute Ruby";
      static readonly description = "Executes Ruby code with safety restrictions.\n    ruby, code, execute";
    static readonly isStreamingOutput = true;
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly defaultCommand = "ruby";
  static readonly defaultArgs = ["-e"];
  @prop({ type: "str", default: "", title: "Code", description: "Ruby code to execute as-is. Dynamic inputs are provided as env vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'." })
  declare code: any;

  @prop({ type: "enum", default: "ruby:3.3-alpine", title: "Image", description: "Docker image to use for execution", values: [
  "ruby:3.3-alpine"
] })
  declare image: any;

  @prop({ type: "enum", default: "docker", title: "Execution Mode", description: "Execution mode: 'docker' or 'subprocess'", values: [
  "docker",
  "subprocess"
] })
  declare execution_mode: any;

  @prop({ type: "str", default: "", title: "Stdin", description: "String to write to process stdin before any streaming input. Use newlines to separate lines." })
  declare stdin: any;

}

export class ExecuteLuaNode extends ScriptExecNode {
  static readonly nodeType = "nodetool.code.ExecuteLua";
      static readonly title = "Execute Lua";
      static readonly description = "Executes Lua code with a local sandbox (no Docker).\n    lua, code, execute, sandbox";
    static readonly isStreamingOutput = true;
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly defaultCommand = "lua";
  static readonly defaultArgs = ["-e"];
  @prop({ type: "str", default: "", title: "Code", description: "Lua code to execute as-is in a restricted environment. Dynamic inputs are provided as variables. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'." })
  declare code: any;

  @prop({ type: "enum", default: "lua", title: "Executable", description: "Lua executable to use", values: [
  "lua",
  "luajit"
] })
  declare executable: any;

  @prop({ type: "enum", default: "subprocess", title: "Execution Mode", description: "Execution mode: 'docker' or 'subprocess'", values: [
  "docker",
  "subprocess"
] })
  declare execution_mode: any;

  @prop({ type: "int", default: 10, title: "Timeout Seconds", description: "Max seconds to allow execution before forced stop" })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Stdin", description: "String to write to process stdin before any streaming input. Use newlines to separate lines." })
  declare stdin: any;

}

export class ExecuteCommandNode extends BaseNode {
  static readonly nodeType = "nodetool.code.ExecuteCommand";
            static readonly title = "Execute Command";
            static readonly description = "Executes a single shell command inside a Docker container.\n    command, execute, shell, bash, sh\n\n    IMPORTANT: Only enabled in non-production environments";
        static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
          static readonly isDynamic = true;
          static readonly supportsDynamicOutputs = true;
  
          static readonly isStreamingOutput = true;
  @prop({ type: "str", default: "", title: "Command", description: "Single command to run via the selected shell. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'." })
  declare command: any;

  @prop({ type: "enum", default: "bash:5.2", title: "Image", description: "Docker image to use for execution", values: [
  "bash:5.2",
  "alpine:3",
  "ubuntu:22.04",
  "ubuntu:24.04"
] })
  declare image: any;

  @prop({ type: "enum", default: "docker", title: "Execution Mode", description: "Execution mode: 'docker' or 'subprocess'", values: [
  "docker",
  "subprocess"
] })
  declare execution_mode: any;

  @prop({ type: "str", default: "", title: "Stdin", description: "String to write to process stdin before any streaming input. Use newlines to separate lines." })
  declare stdin: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const command = String(inputs.command ?? this.command ?? "");
    const cwdRaw = String(inputs.cwd ?? this.cwd ?? "");
    const cwd = cwdRaw || undefined;
    const timeoutMs = Number(inputs.timeout_ms ?? this.timeout_ms ?? 30000);
    const env = (inputs.env ?? this.env ?? {}) as Record<string, string>;

    const result = await runProcess({
      cmd: "sh",
      argv: ["-c", command],
      cwd,
      env,
      timeoutMs,
    });

    return {
      ...result,
      output: result.stdout,
      success: result.exit_code === 0,
    };
  }
}

abstract class RunCommandNode extends BaseNode {
  static readonly runtime: string = "sh";
  static readonly runtimeArgs: string[] = ["-c"];

  protected runtimeConfig(): { cmd: string; args: string[] } {
    const cls = this.constructor as typeof RunCommandNode;
    return { cmd: cls.runtime, args: [...cls.runtimeArgs] };
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const command = String(inputs.command ?? this.command ?? "");
    const cwdRaw = String(inputs.cwd ?? this.cwd ?? "");
    const cwd = cwdRaw || undefined;
    const timeoutSeconds = Number(inputs.timeout_seconds ?? this.timeout_seconds ?? 0);
    const timeoutMs = Number(inputs.timeout_ms ?? this.timeout_ms ?? (timeoutSeconds > 0 ? timeoutSeconds * 1000 : 30000));
    const env = (inputs.env ?? this.env ?? {}) as Record<string, string>;
    const stdin = typeof (inputs.stdin ?? this.stdin) === "string" ? String(inputs.stdin ?? this.stdin ?? "") : undefined;
    const { cmd, args } = this.runtimeConfig();
    const result = await runProcess({
      cmd,
      argv: [...args, command],
      stdin,
      cwd,
      env,
      timeoutMs,
    });
    return {
      ...result,
      output: result.stdout,
      success: result.exit_code === 0,
    };
  }
}

export class RunPythonCommandNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunPythonCommand";
      static readonly title = "Run Python Command";
      static readonly description = "Executes a single Python command and buffers the output.\n    python, code, execute, command\n\n    Use cases:\n    - Run a single Python script or command\n    - Execute Python code with buffered stdout/stderr output\n    - One-shot Python execution without streaming\n\n    The command is executed once and the complete output is returned.\n    IMPORTANT: Only enabled in non-production environments";
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly runtime = "python3";
  static readonly runtimeArgs = ["-c"];
  @prop({ type: "str", default: "", title: "Command", description: "Python command to execute" })
  declare command: any;

}

export class RunJavaScriptCommandNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunJavaScriptCommand";
      static readonly title = "Run Java Script Command";
      static readonly description = "Executes a single JavaScript command and buffers the output.\n    javascript, nodejs, code, execute, command\n\n    Use cases:\n    - Run a single JavaScript script or command\n    - Execute JavaScript code with buffered stdout/stderr output\n    - One-shot JavaScript execution without streaming\n\n    The command is executed once and the complete output is returned.";
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly runtime = "node";
  static readonly runtimeArgs = ["-e"];
  @prop({ type: "str", default: "", title: "Command", description: "JavaScript command to execute" })
  declare command: any;

}

export class RunBashCommandNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunBashCommand";
      static readonly title = "Run Bash Command";
      static readonly description = "Executes a single Bash command and buffers the output.\n    bash, shell, code, execute, command\n\n    Use cases:\n    - Run a single Bash script or command\n    - Execute shell commands with buffered stdout/stderr output\n    - One-shot Bash execution without streaming\n\n    The command is executed once and the complete output is returned.";
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly runtime = "bash";
  static readonly runtimeArgs = ["-c"];
  @prop({ type: "str", default: "", title: "Command", description: "Bash command to execute" })
  declare command: any;

}

export class RunRubyCommandNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunRubyCommand";
      static readonly title = "Run Ruby Command";
      static readonly description = "Executes a single Ruby command and buffers the output.\n    ruby, code, execute, command\n\n    Use cases:\n    - Run a single Ruby script or command\n    - Execute Ruby code with buffered stdout/stderr output\n    - One-shot Ruby execution without streaming\n\n    The command is executed once and the complete output is returned.";
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly runtime = "ruby";
  static readonly runtimeArgs = ["-e"];
  @prop({ type: "str", default: "", title: "Command", description: "Ruby command to execute" })
  declare command: any;

}

export class RunLuaCommandNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunLuaCommand";
      static readonly title = "Run Lua Command";
      static readonly description = "Executes a single Lua command and buffers the output.\n    lua, code, execute, command, sandbox\n\n    Use cases:\n    - Run a single Lua script or command\n    - Execute Lua code with buffered stdout/stderr output\n    - One-shot Lua execution without streaming\n\n    The command is executed once and the complete output is returned.";
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly runtime = "lua";
  static readonly runtimeArgs = ["-e"];
  @prop({ type: "str", default: "", title: "Command", description: "Lua command to execute" })
  declare command: any;

  @prop({ type: "enum", default: "lua", title: "Executable", description: "Lua executable to use", values: [
  "lua",
  "luajit"
] })
  declare executable: any;

  @prop({ type: "int", default: 10, title: "Timeout Seconds", description: "Max seconds to allow execution before forced stop" })
  declare timeout_seconds: any;

}

export class RunLuaCommandDockerNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunLuaCommandDocker";
      static readonly title = "Run Lua Command Docker";
      static readonly description = "Executes a single Lua command in Docker and buffers the output.\n    lua, code, execute, command, sandbox, docker";
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly runtime = "lua";
  static readonly runtimeArgs = ["-e"];
  @prop({ type: "str", default: "", title: "Command", description: "Lua command to execute" })
  declare command: any;

  @prop({ type: "enum", default: "nickblah/lua:5.2.4-luarocks-ubuntu", title: "Image", description: "Docker image to use for execution", values: [
  "nickblah/lua:5.2.4-luarocks-ubuntu"
] })
  declare image: any;

  @prop({ type: "int", default: 10, title: "Timeout Seconds", description: "Max seconds to allow execution before forced stop" })
  declare timeout_seconds: any;

}

export class RunPythonCommandDockerNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunPythonCommandDocker";
      static readonly title = "Run Python Command Docker";
      static readonly description = "Executes a single Python command in Docker and buffers the output.\n    python, code, execute, command, docker";
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly runtime = "python3";
  static readonly runtimeArgs = ["-c"];
  @prop({ type: "str", default: "", title: "Command", description: "Python command to execute" })
  declare command: any;

  @prop({ type: "enum", default: "python:3.11-slim", title: "Image", description: "Docker image to use for execution", values: [
  "python:3.11-slim",
  "jupyter/scipy-notebook:latest"
] })
  declare image: any;

}

export class RunJavaScriptCommandDockerNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunJavaScriptCommandDocker";
      static readonly title = "Run Java Script Command Docker";
      static readonly description = "Executes a single JavaScript command in Docker and buffers the output.\n    javascript, nodejs, code, execute, command, docker";
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly runtime = "node";
  static readonly runtimeArgs = ["-e"];
  @prop({ type: "str", default: "", title: "Command", description: "JavaScript command to execute" })
  declare command: any;

  @prop({ type: "enum", default: "node:22-alpine", title: "Image", description: "Docker image to use for execution", values: [
  "node:22-alpine"
] })
  declare image: any;

}

export class RunBashCommandDockerNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunBashCommandDocker";
      static readonly title = "Run Bash Command Docker";
      static readonly description = "Executes a single Bash command in Docker and buffers the output.\n    bash, shell, code, execute, command, docker";
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly runtime = "bash";
  static readonly runtimeArgs = ["-c"];
  @prop({ type: "str", default: "", title: "Command", description: "Bash command to execute" })
  declare command: any;

  @prop({ type: "enum", default: "ubuntu:22.04", title: "Image", description: "Docker image to use for execution", values: [
  "bash:5.2",
  "debian:12",
  "ubuntu:22.04",
  "ubuntu:24.04",
  "jupyter/scipy-notebook:latest"
] })
  declare image: any;

}

export class RunRubyCommandDockerNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunRubyCommandDocker";
      static readonly title = "Run Ruby Command Docker";
      static readonly description = "Executes a single Ruby command in Docker and buffers the output.\n    ruby, code, execute, command, docker";
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly runtime = "ruby";
  static readonly runtimeArgs = ["-e"];
  @prop({ type: "str", default: "", title: "Command", description: "Ruby command to execute" })
  declare command: any;

  @prop({ type: "enum", default: "ruby:3.3-alpine", title: "Image", description: "Docker image to use for execution", values: [
  "ruby:3.3-alpine"
] })
  declare image: any;

}

export class RunShellCommandNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunShellCommand";
      static readonly title = "Run Shell Command";
      static readonly description = "Executes a single shell command and buffers the output.\n    command, execute, shell, bash, sh\n\n    Use cases:\n    - Run a single shell command\n    - Execute shell commands with buffered stdout/stderr output\n    - One-shot command execution without streaming\n\n    The command is executed once and the complete output is returned.\n    IMPORTANT: Only enabled in non-production environments";
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly runtime = "sh";
  static readonly runtimeArgs = ["-c"];
  @prop({ type: "str", default: "", title: "Command", description: "Shell command to execute" })
  declare command: any;

}

export class RunShellCommandDockerNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunShellCommandDocker";
      static readonly title = "Run Shell Command Docker";
      static readonly description = "Executes a single shell command in Docker and buffers the output.\n    command, execute, shell, bash, sh, docker";
    static readonly isDynamic = true;
    static readonly supportsDynamicOutputs = true;
    static readonly metadataOutputTypes = {
    stdout: "str",
    stderr: "str"
  };
  static readonly runtime = "sh";
  static readonly runtimeArgs = ["-c"];
  @prop({ type: "str", default: "", title: "Command", description: "Shell command to execute" })
  declare command: any;

  @prop({ type: "enum", default: "bash:5.2", title: "Image", description: "Docker image to use for execution", values: [
  "bash:5.2",
  "alpine:3",
  "ubuntu:22.04",
  "ubuntu:24.04"
] })
  declare image: any;

}

export const CODE_NODES = [
  ExecutePythonNode,
  ExecuteJavaScriptNode,
  ExecuteBashNode,
  ExecuteRubyNode,
  ExecuteLuaNode,
  ExecuteCommandNode,
  RunPythonCommandNode,
  RunJavaScriptCommandNode,
  RunBashCommandNode,
  RunRubyCommandNode,
  RunLuaCommandNode,
  RunLuaCommandDockerNode,
  RunShellCommandNode,
  RunPythonCommandDockerNode,
  RunJavaScriptCommandDockerNode,
  RunBashCommandDockerNode,
  RunRubyCommandDockerNode,
  RunShellCommandDockerNode,
] as const;
