import { BaseNode, prop } from "@nodetool/node-sdk";
import {
  PythonDockerRunner,
  JavaScriptDockerRunner,
  BashDockerRunner,
  RubyDockerRunner,
  LuaRunner,
  LuaSubprocessRunner,
  CommandDockerRunner,
  type StreamRunnerBase,
  ContainerFailureError
} from "@nodetool/code-runners";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all streamed output from a runner into buffered stdout/stderr. */
async function collectRunnerOutput(
  runner: StreamRunnerBase,
  userCode: string,
  envLocals: Record<string, unknown>,
  options?: {
    stdinStream?: AsyncIterable<string>;
    workspaceDir?: string;
  }
): Promise<{ stdout: string; stderr: string; exit_code: number }> {
  const stdoutBuf: string[] = [];
  const stderrBuf: string[] = [];
  let exitCode = 0;
  try {
    for await (const [slot, line] of runner.stream(
      userCode,
      envLocals,
      options
    )) {
      if (slot === "stdout") stdoutBuf.push(line);
      else if (slot === "stderr") stderrBuf.push(line);
    }
  } catch (err) {
    if (err instanceof ContainerFailureError) {
      exitCode = err.exitCode;
    } else {
      exitCode = 1;
      stderrBuf.push(String(err));
    }
  }
  return {
    stdout: stdoutBuf.join(""),
    stderr: stderrBuf.join(""),
    exit_code: exitCode
  };
}

/** Build an async stdin iterable from a static string. */
async function* stdinFromString(s: string): AsyncIterable<string> {
  if (s) yield s;
}

// ---------------------------------------------------------------------------
// Execute* nodes — streaming, use runners with execution_mode
// ---------------------------------------------------------------------------

export class ExecutePythonNode extends BaseNode {
  static readonly nodeType = "nodetool.code.ExecutePython";
  static readonly title = "Execute Python";
  static readonly description =
    "Executes Python code with safety restrictions.\n    python, code, execute\n\n    Use cases:\n    - Run custom data transformations\n    - Prototype node functionality\n    - Debug and testing workflows\n\n    IMPORTANT: Only enabled in non-production environments";
  static readonly isStreamingOutput = true;
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly requiredRuntimes = ["python"];

  @prop({
    type: "str",
    default: "",
    title: "Code",
    description:
      "Python code to execute as-is. Dynamic inputs are provided as local vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'."
  })
  declare code: any;

  @prop({
    type: "enum",
    default: "python:3.11-slim",
    title: "Image",
    description: "Docker image to use for execution",
    values: ["python:3.11-slim", "jupyter/scipy-notebook:latest"]
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "docker",
    title: "Execution Mode",
    description: "Execution mode: 'docker' or 'subprocess'",
    values: ["docker", "subprocess"]
  })
  declare execution_mode: any;

  @prop({
    type: "str",
    default: "",
    title: "Stdin",
    description:
      "String to write to process stdin before any streaming input. Use newlines to separate lines."
  })
  declare stdin: any;

  async process(): Promise<Record<string, unknown>> {
    const code = String(this.code ?? this.code ?? "");
    if (!code.trim()) throw new Error("Code is required");
    const mode = String(
      this.execution_mode ?? this.execution_mode ?? "docker"
    ) as "docker" | "subprocess";
    const image = String(this.image ?? this.image ?? "python:3.11-slim");
    const stdinStr = String(this.stdin ?? this.stdin ?? "");
    const runner = new PythonDockerRunner({ image, mode });
    const result = await collectRunnerOutput(
      runner,
      code,
      {},
      {
        stdinStream: stdinStr ? stdinFromString(stdinStr) : undefined
      }
    );
    return {
      ...result,
      output: result.stdout,
      success: result.exit_code === 0
    };
  }
}

export class ExecuteJavaScriptNode extends BaseNode {
  static readonly nodeType = "nodetool.code.ExecuteJavaScript";
  static readonly title = "Execute Java Script";
  static readonly description =
    "Executes JavaScript (Node.js) code with safety restrictions.\n    javascript, nodejs, code, execute";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly requiredRuntimes = ["nodejs"];

  @prop({
    type: "str",
    default: "",
    title: "Code",
    description:
      "JavaScript code to execute as-is under Node.js. Dynamic inputs are provided as local vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'."
  })
  declare code: any;

  @prop({
    type: "enum",
    default: "node:22-alpine",
    title: "Image",
    description: "Docker image to use for execution",
    values: ["node:22-alpine"]
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "docker",
    title: "Execution Mode",
    description: "Execution mode: 'docker' or 'subprocess'",
    values: ["docker", "subprocess"]
  })
  declare execution_mode: any;

  @prop({
    type: "str",
    default: "",
    title: "Stdin",
    description:
      "String to write to process stdin before any streaming input. Use newlines to separate lines."
  })
  declare stdin: any;

  async process(): Promise<Record<string, unknown>> {
    const code = String(this.code ?? this.code ?? "");
    if (!code.trim()) throw new Error("Code is required");
    const mode = String(
      this.execution_mode ?? this.execution_mode ?? "docker"
    ) as "docker" | "subprocess";
    const image = String(this.image ?? this.image ?? "node:22-alpine");
    const stdinStr = String(this.stdin ?? this.stdin ?? "");
    const runner = new JavaScriptDockerRunner({ image, mode });
    const result = await collectRunnerOutput(
      runner,
      code,
      {},
      {
        stdinStream: stdinStr ? stdinFromString(stdinStr) : undefined
      }
    );
    return {
      ...result,
      output: result.stdout,
      success: result.exit_code === 0
    };
  }
}

export class ExecuteBashNode extends BaseNode {
  static readonly nodeType = "nodetool.code.ExecuteBash";
  static readonly title = "Execute Bash";
  static readonly description =
    "Executes Bash script with safety restrictions.\n    bash, shell, code, execute";
  static readonly isStreamingOutput = true;
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly requiredRuntimes = ["bash"];

  @prop({
    type: "str",
    default: "",
    title: "Code",
    description:
      "Bash script to execute as-is. Dynamic inputs are provided as env vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'."
  })
  declare code: any;

  @prop({
    type: "enum",
    default: "ubuntu:22.04",
    title: "Image",
    description: "Docker image to use for execution",
    values: [
      "bash:5.2",
      "debian:12",
      "ubuntu:22.04",
      "ubuntu:24.04",
      "jupyter/scipy-notebook:latest"
    ]
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "docker",
    title: "Execution Mode",
    description: "Execution mode: 'docker' or 'subprocess'",
    values: ["docker", "subprocess"]
  })
  declare execution_mode: any;

  @prop({
    type: "str",
    default: "",
    title: "Stdin",
    description:
      "String to write to process stdin before any streaming input. Use newlines to separate lines."
  })
  declare stdin: any;

  async process(): Promise<Record<string, unknown>> {
    const code = String(this.code ?? this.code ?? "");
    if (!code.trim()) throw new Error("Code is required");
    const mode = String(
      this.execution_mode ?? this.execution_mode ?? "docker"
    ) as "docker" | "subprocess";
    const image = String(this.image ?? this.image ?? "ubuntu:22.04");
    const stdinStr = String(this.stdin ?? this.stdin ?? "");
    const runner = new BashDockerRunner({ image, mode });
    const result = await collectRunnerOutput(
      runner,
      code,
      {},
      {
        stdinStream: stdinStr ? stdinFromString(stdinStr) : undefined
      }
    );
    return {
      ...result,
      output: result.stdout,
      success: result.exit_code === 0
    };
  }
}

export class ExecuteRubyNode extends BaseNode {
  static readonly nodeType = "nodetool.code.ExecuteRuby";
  static readonly title = "Execute Ruby";
  static readonly description =
    "Executes Ruby code with safety restrictions.\n    ruby, code, execute";
  static readonly isStreamingOutput = true;
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly requiredRuntimes = ["ruby"];

  @prop({
    type: "str",
    default: "",
    title: "Code",
    description:
      "Ruby code to execute as-is. Dynamic inputs are provided as env vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'."
  })
  declare code: any;

  @prop({
    type: "enum",
    default: "ruby:3.3-alpine",
    title: "Image",
    description: "Docker image to use for execution",
    values: ["ruby:3.3-alpine"]
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "docker",
    title: "Execution Mode",
    description: "Execution mode: 'docker' or 'subprocess'",
    values: ["docker", "subprocess"]
  })
  declare execution_mode: any;

  @prop({
    type: "str",
    default: "",
    title: "Stdin",
    description:
      "String to write to process stdin before any streaming input. Use newlines to separate lines."
  })
  declare stdin: any;

  async process(): Promise<Record<string, unknown>> {
    const code = String(this.code ?? this.code ?? "");
    if (!code.trim()) throw new Error("Code is required");
    const mode = String(
      this.execution_mode ?? this.execution_mode ?? "docker"
    ) as "docker" | "subprocess";
    const image = String(this.image ?? this.image ?? "ruby:3.3-alpine");
    const stdinStr = String(this.stdin ?? this.stdin ?? "");
    const runner = new RubyDockerRunner({ image, mode });
    const result = await collectRunnerOutput(
      runner,
      code,
      {},
      {
        stdinStream: stdinStr ? stdinFromString(stdinStr) : undefined
      }
    );
    return {
      ...result,
      output: result.stdout,
      success: result.exit_code === 0
    };
  }
}

export class ExecuteLuaNode extends BaseNode {
  static readonly nodeType = "nodetool.code.ExecuteLua";
  static readonly title = "Execute Lua";
  static readonly description =
    "Executes Lua code with a local sandbox (no Docker).\n    lua, code, execute, sandbox";
  static readonly isStreamingOutput = true;
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly requiredRuntimes = ["lua"];

  @prop({
    type: "str",
    default: "",
    title: "Code",
    description:
      "Lua code to execute as-is in a restricted environment. Dynamic inputs are provided as variables. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'."
  })
  declare code: any;

  @prop({
    type: "enum",
    default: "lua",
    title: "Executable",
    description: "Lua executable to use",
    values: ["lua", "luajit"]
  })
  declare executable: any;

  @prop({
    type: "enum",
    default: "subprocess",
    title: "Execution Mode",
    description: "Execution mode: 'docker' or 'subprocess'",
    values: ["docker", "subprocess"]
  })
  declare execution_mode: any;

  @prop({
    type: "int",
    default: 10,
    title: "Timeout Seconds",
    description: "Max seconds to allow execution before forced stop"
  })
  declare timeout_seconds: any;

  @prop({
    type: "str",
    default: "",
    title: "Stdin",
    description:
      "String to write to process stdin before any streaming input. Use newlines to separate lines."
  })
  declare stdin: any;

  async process(): Promise<Record<string, unknown>> {
    const code = String(this.code ?? this.code ?? "");
    if (!code.trim()) throw new Error("Code is required");
    const mode = String(
      this.execution_mode ?? this.execution_mode ?? "subprocess"
    ) as "docker" | "subprocess";
    const executable = String(this.executable ?? this.executable ?? "lua");
    const timeoutSeconds = Number(
      this.timeout_seconds ?? this.timeout_seconds ?? 10
    );
    const stdinStr = String(this.stdin ?? this.stdin ?? "");

    const runner =
      mode === "subprocess"
        ? new LuaSubprocessRunner({ executable, timeoutSeconds })
        : new LuaRunner({
            image: "nickblah/lua:5.2.4-luarocks-ubuntu",
            executable,
            mode,
            timeoutSeconds
          });

    const result = await collectRunnerOutput(
      runner,
      code,
      {},
      {
        stdinStream: stdinStr ? stdinFromString(stdinStr) : undefined
      }
    );
    return {
      ...result,
      output: result.stdout,
      success: result.exit_code === 0
    };
  }
}

export class ExecuteCommandNode extends BaseNode {
  static readonly nodeType = "nodetool.code.ExecuteCommand";
  static readonly title = "Execute Command";
  static readonly description =
    "Executes a single shell command inside a Docker container.\n    command, execute, shell, bash, sh\n\n    IMPORTANT: Only enabled in non-production environments";
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly isStreamingOutput = true;
  @prop({
    type: "str",
    default: "",
    title: "Command",
    description:
      "Single command to run via the selected shell. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'."
  })
  declare command: any;

  @prop({
    type: "enum",
    default: "bash:5.2",
    title: "Image",
    description: "Docker image to use for execution",
    values: ["bash:5.2", "alpine:3", "ubuntu:22.04", "ubuntu:24.04"]
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "docker",
    title: "Execution Mode",
    description: "Execution mode: 'docker' or 'subprocess'",
    values: ["docker", "subprocess"]
  })
  declare execution_mode: any;

  @prop({
    type: "str",
    default: "",
    title: "Stdin",
    description:
      "String to write to process stdin before any streaming input. Use newlines to separate lines."
  })
  declare stdin: any;

  async process(): Promise<Record<string, unknown>> {
    const command = String(this.command ?? this.command ?? "");
    if (!command.trim()) throw new Error("Command is required");
    const mode = String(
      this.execution_mode ?? this.execution_mode ?? "docker"
    ) as "docker" | "subprocess";
    const image = String(this.image ?? this.image ?? "bash:5.2");
    const stdinStr = String(this.stdin ?? this.stdin ?? "");
    const runner = new CommandDockerRunner({ image, mode });
    const result = await collectRunnerOutput(
      runner,
      command,
      {},
      {
        stdinStream: stdinStr ? stdinFromString(stdinStr) : undefined
      }
    );
    return {
      ...result,
      output: result.stdout,
      success: result.exit_code === 0
    };
  }
}

// ---------------------------------------------------------------------------
// RunCommand* nodes — buffered, use runners
// ---------------------------------------------------------------------------

/** Helper: create a runner for a RunCommand node given its language and mode. */
function createRunner(
  lang: "python" | "javascript" | "bash" | "ruby" | "lua" | "command",
  mode: "docker" | "subprocess",
  opts?: { image?: string; executable?: string; timeoutSeconds?: number }
): StreamRunnerBase {
  const m = mode;
  switch (lang) {
    case "python":
      return new PythonDockerRunner({
        image: opts?.image ?? "python:3.11-slim",
        mode: m
      });
    case "javascript":
      return new JavaScriptDockerRunner({
        image: opts?.image ?? "node:22-alpine",
        mode: m
      });
    case "bash":
      return new BashDockerRunner({
        image: opts?.image ?? "bash:5.2",
        mode: m
      });
    case "ruby":
      return new RubyDockerRunner({
        image: opts?.image ?? "ruby:3.3-alpine",
        mode: m
      });
    case "lua":
      if (m === "subprocess")
        return new LuaSubprocessRunner({
          executable: opts?.executable ?? "lua",
          timeoutSeconds: opts?.timeoutSeconds ?? 10
        });
      return new LuaRunner({
        image: opts?.image ?? "nickblah/lua:5.2.4-luarocks-ubuntu",
        executable: opts?.executable ?? "lua",
        mode: m,
        timeoutSeconds: opts?.timeoutSeconds ?? 10
      });
    case "command":
      return new CommandDockerRunner({
        image: opts?.image ?? "bash:5.2",
        mode: m
      });
  }
}

abstract class RunCommandNode extends BaseNode {
  /** Language for creating the runner */
  static readonly lang:
    | "python"
    | "javascript"
    | "bash"
    | "ruby"
    | "lua"
    | "command" = "command";
  /** Default execution mode */
  static readonly defaultMode: "docker" | "subprocess" = "subprocess";

  async process(): Promise<Record<string, unknown>> {
    const command = String((this as any).command ?? "");
    if (!command.trim())
      return {
        stdout: "",
        stderr: "",
        exit_code: 0,
        output: "",
        success: true
      };
    const cls = this.constructor as typeof RunCommandNode;
    const mode = String((this as any).execution_mode ?? cls.defaultMode) as
      | "docker"
      | "subprocess";
    const image = (this as any).image ?? undefined;
    const executable = (this as any).executable ?? undefined;
    const timeoutSeconds = Number((this as any).timeout_seconds ?? 10);
    const stdinStr =
      typeof (this as any).stdin === "string"
        ? String((this as any).stdin ?? "")
        : undefined;
    const runner = createRunner(cls.lang, mode, {
      image,
      executable,
      timeoutSeconds
    });
    const result = await collectRunnerOutput(
      runner,
      command,
      {},
      {
        stdinStream: stdinStr ? stdinFromString(stdinStr) : undefined
      }
    );
    return {
      ...result,
      output: result.stdout,
      success: result.exit_code === 0
    };
  }
}

// --- Subprocess (local) variants ---

export class RunPythonCommandNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunPythonCommand";
  static readonly title = "Run Python Command";
  static readonly description =
    "Executes a single Python command and buffers the output.\n    python, code, execute, command\n\n    Use cases:\n    - Run a single Python script or command\n    - Execute Python code with buffered stdout/stderr output\n    - One-shot Python execution without streaming\n\n    The command is executed once and the complete output is returned.\n    IMPORTANT: Only enabled in non-production environments";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly lang = "python" as const;
  static readonly defaultMode = "subprocess" as const;
  static readonly requiredRuntimes = ["python"];

  @prop({
    type: "str",
    default: "",
    title: "Command",
    description: "Python command to execute"
  })
  declare command: any;
}

export class RunJavaScriptCommandNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunJavaScriptCommand";
  static readonly title = "Run Java Script Command";
  static readonly description =
    "Executes a single JavaScript command and buffers the output.\n    javascript, nodejs, code, execute, command\n\n    Use cases:\n    - Run a single JavaScript script or command\n    - Execute JavaScript code with buffered stdout/stderr output\n    - One-shot JavaScript execution without streaming\n\n    The command is executed once and the complete output is returned.";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly lang = "javascript" as const;
  static readonly defaultMode = "subprocess" as const;
  static readonly requiredRuntimes = ["nodejs"];

  @prop({
    type: "str",
    default: "",
    title: "Command",
    description: "JavaScript command to execute"
  })
  declare command: any;
}

export class RunBashCommandNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunBashCommand";
  static readonly title = "Run Bash Command";
  static readonly description =
    "Executes a single Bash command and buffers the output.\n    bash, shell, code, execute, command\n\n    Use cases:\n    - Run a single Bash script or command\n    - Execute shell commands with buffered stdout/stderr output\n    - One-shot Bash execution without streaming\n\n    The command is executed once and the complete output is returned.";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly lang = "bash" as const;
  static readonly defaultMode = "subprocess" as const;
  static readonly requiredRuntimes = ["bash"];

  @prop({
    type: "str",
    default: "",
    title: "Command",
    description: "Bash command to execute"
  })
  declare command: any;
}

export class RunRubyCommandNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunRubyCommand";
  static readonly title = "Run Ruby Command";
  static readonly description =
    "Executes a single Ruby command and buffers the output.\n    ruby, code, execute, command\n\n    Use cases:\n    - Run a single Ruby script or command\n    - Execute Ruby code with buffered stdout/stderr output\n    - One-shot Ruby execution without streaming\n\n    The command is executed once and the complete output is returned.";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly lang = "ruby" as const;
  static readonly defaultMode = "subprocess" as const;
  static readonly requiredRuntimes = ["ruby"];

  @prop({
    type: "str",
    default: "",
    title: "Command",
    description: "Ruby command to execute"
  })
  declare command: any;
}

export class RunLuaCommandNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunLuaCommand";
  static readonly title = "Run Lua Command";
  static readonly description =
    "Executes a single Lua command and buffers the output.\n    lua, code, execute, command, sandbox\n\n    Use cases:\n    - Run a single Lua script or command\n    - Execute Lua code with buffered stdout/stderr output\n    - One-shot Lua execution without streaming\n\n    The command is executed once and the complete output is returned.";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly lang = "lua" as const;
  static readonly defaultMode = "subprocess" as const;
  static readonly requiredRuntimes = ["lua"];

  @prop({
    type: "str",
    default: "",
    title: "Command",
    description: "Lua command to execute"
  })
  declare command: any;

  @prop({
    type: "enum",
    default: "lua",
    title: "Executable",
    description: "Lua executable to use",
    values: ["lua", "luajit"]
  })
  declare executable: any;

  @prop({
    type: "int",
    default: 10,
    title: "Timeout Seconds",
    description: "Max seconds to allow execution before forced stop"
  })
  declare timeout_seconds: any;
}

export class RunShellCommandNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunShellCommand";
  static readonly title = "Run Shell Command";
  static readonly description =
    "Executes a single shell command and buffers the output.\n    command, execute, shell, bash, sh\n\n    Use cases:\n    - Run a single shell command\n    - Execute shell commands with buffered stdout/stderr output\n    - One-shot command execution without streaming\n\n    The command is executed once and the complete output is returned.\n    IMPORTANT: Only enabled in non-production environments";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly lang = "command" as const;
  static readonly defaultMode = "subprocess" as const;
  static readonly requiredRuntimes = ["bash"];

  @prop({
    type: "str",
    default: "",
    title: "Command",
    description: "Shell command to execute"
  })
  declare command: any;
}

// --- Docker variants ---

export class RunLuaCommandDockerNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunLuaCommandDocker";
  static readonly title = "Run Lua Command Docker";
  static readonly description =
    "Executes a single Lua command in Docker and buffers the output.\n    lua, code, execute, command, sandbox, docker";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly lang = "lua" as const;
  static readonly defaultMode = "docker" as const;

  @prop({
    type: "str",
    default: "",
    title: "Command",
    description: "Lua command to execute"
  })
  declare command: any;

  @prop({
    type: "enum",
    default: "nickblah/lua:5.2.4-luarocks-ubuntu",
    title: "Image",
    description: "Docker image to use for execution",
    values: ["nickblah/lua:5.2.4-luarocks-ubuntu"]
  })
  declare image: any;

  @prop({
    type: "int",
    default: 10,
    title: "Timeout Seconds",
    description: "Max seconds to allow execution before forced stop"
  })
  declare timeout_seconds: any;
}

export class RunPythonCommandDockerNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunPythonCommandDocker";
  static readonly title = "Run Python Command Docker";
  static readonly description =
    "Executes a single Python command in Docker and buffers the output.\n    python, code, execute, command, docker";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly lang = "python" as const;
  static readonly defaultMode = "docker" as const;

  @prop({
    type: "str",
    default: "",
    title: "Command",
    description: "Python command to execute"
  })
  declare command: any;

  @prop({
    type: "enum",
    default: "python:3.11-slim",
    title: "Image",
    description: "Docker image to use for execution",
    values: ["python:3.11-slim", "jupyter/scipy-notebook:latest"]
  })
  declare image: any;
}

export class RunJavaScriptCommandDockerNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunJavaScriptCommandDocker";
  static readonly title = "Run Java Script Command Docker";
  static readonly description =
    "Executes a single JavaScript command in Docker and buffers the output.\n    javascript, nodejs, code, execute, command, docker";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly lang = "javascript" as const;
  static readonly defaultMode = "docker" as const;

  @prop({
    type: "str",
    default: "",
    title: "Command",
    description: "JavaScript command to execute"
  })
  declare command: any;

  @prop({
    type: "enum",
    default: "node:22-alpine",
    title: "Image",
    description: "Docker image to use for execution",
    values: ["node:22-alpine"]
  })
  declare image: any;
}

export class RunBashCommandDockerNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunBashCommandDocker";
  static readonly title = "Run Bash Command Docker";
  static readonly description =
    "Executes a single Bash command in Docker and buffers the output.\n    bash, shell, code, execute, command, docker";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly lang = "bash" as const;
  static readonly defaultMode = "docker" as const;

  @prop({
    type: "str",
    default: "",
    title: "Command",
    description: "Bash command to execute"
  })
  declare command: any;

  @prop({
    type: "enum",
    default: "ubuntu:22.04",
    title: "Image",
    description: "Docker image to use for execution",
    values: [
      "bash:5.2",
      "debian:12",
      "ubuntu:22.04",
      "ubuntu:24.04",
      "jupyter/scipy-notebook:latest"
    ]
  })
  declare image: any;
}

export class RunRubyCommandDockerNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunRubyCommandDocker";
  static readonly title = "Run Ruby Command Docker";
  static readonly description =
    "Executes a single Ruby command in Docker and buffers the output.\n    ruby, code, execute, command, docker";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly lang = "ruby" as const;
  static readonly defaultMode = "docker" as const;

  @prop({
    type: "str",
    default: "",
    title: "Command",
    description: "Ruby command to execute"
  })
  declare command: any;

  @prop({
    type: "enum",
    default: "ruby:3.3-alpine",
    title: "Image",
    description: "Docker image to use for execution",
    values: ["ruby:3.3-alpine"]
  })
  declare image: any;
}

export class RunShellCommandDockerNode extends RunCommandNode {
  static readonly nodeType = "nodetool.code.RunShellCommandDocker";
  static readonly title = "Run Shell Command Docker";
  static readonly description =
    "Executes a single shell command in Docker and buffers the output.\n    command, execute, shell, bash, sh, docker";
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly metadataOutputTypes = { stdout: "str", stderr: "str" };
  static readonly lang = "command" as const;
  static readonly defaultMode = "docker" as const;

  @prop({
    type: "str",
    default: "",
    title: "Command",
    description: "Shell command to execute"
  })
  declare command: any;

  @prop({
    type: "enum",
    default: "bash:5.2",
    title: "Image",
    description: "Docker image to use for execution",
    values: ["bash:5.2", "alpine:3", "ubuntu:22.04", "ubuntu:24.04"]
  })
  declare image: any;
}

// ---------------------------------------------------------------------------
// Export list (same order as before for compatibility)
// ---------------------------------------------------------------------------

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
  RunShellCommandDockerNode
] as const;
