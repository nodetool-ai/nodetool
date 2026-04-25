import {
  StreamRunnerBase,
  type StreamRunnerOptions
} from "./stream-runner-base.js";

/**
 * Docker-backed command runner.
 *
 * Splits user_code on spaces and executes the resulting argument vector
 * directly inside the container.
 */
export class CommandDockerRunner extends StreamRunnerBase {
  constructor(options?: { image?: string } & StreamRunnerOptions) {
    super({ image: options?.image ?? "bash:5.2", ...options });
  }

  override buildContainerCommand(
    userCode: string,
    _envLocals: Record<string, unknown>
  ): string[] {
    return userCode.split(" ");
  }

  /**
   * Run shell commands through the OS shell when executed locally so that
   * built-ins (`echo` on Windows), pipes, redirects and quoting work as
   * users expect. Docker mode is unaffected and continues to use the
   * argv-style command vector inside the container.
   */
  override subprocessUseShell(): boolean {
    return true;
  }
}
