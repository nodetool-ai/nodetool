/**
 * firecracker-runner.ts
 *
 * Code execution runner that boots Firecracker microVMs for each execution.
 * Provides the same `stream()` async-generator interface as the Docker-based
 * runners, yielding `[Slot, string]` tuples for stdout/stderr lines.
 *
 * Communication with the guest happens over vsock using a JSON-line protocol.
 * The guest rootfs must contain a guest agent that speaks this protocol
 * (see guest-agent.sh for a reference implementation).
 */

import { createInterface } from "node:readline";
import type { Socket } from "node:net";
import { ContainerFailureError } from "./stream-runner-base.js";
import { FirecrackerVM } from "./firecracker-vm.js";
import type { FirecrackerPool } from "./firecracker-pool.js";
import type {
  FirecrackerRunnerOptions,
  FirecrackerStreamOptions,
  GuestExecRequest,
  GuestMessage,
  Slot
} from "./firecracker-types.js";

// ---------------------------------------------------------------------------
// FirecrackerRunner
// ---------------------------------------------------------------------------

/**
 * Execute code inside Firecracker microVMs with strong isolation.
 *
 * Each call to {@link stream} boots a fresh VM (or acquires one from a pool),
 * sends the code to the guest agent over vsock, streams the output back, and
 * tears down the VM.
 *
 * @example
 * ```ts
 * const runner = new FirecrackerRunner({
 *   kernelImagePath: "/opt/fc/vmlinux",
 *   rootfsImages: {
 *     python: "/opt/fc/rootfs-python.ext4",
 *     javascript: "/opt/fc/rootfs-node.ext4",
 *     bash: "/opt/fc/rootfs-alpine.ext4",
 *   },
 * });
 *
 * for await (const [slot, line] of runner.stream("print('hello')", {}, { language: "python" })) {
 *   process.stdout.write(`${slot}: ${line}`);
 * }
 * ```
 */
export class FirecrackerRunner {
  public readonly kernelImagePath: string;
  public readonly rootfsImages: Readonly<Record<string, string>>;
  public readonly defaultRootfs: string | null;
  public readonly firecrackerBin: string;
  public readonly vcpuCount: number;
  public readonly memSizeMib: number;
  public readonly timeoutSeconds: number;
  public readonly guestAgentPort: number;
  public readonly bootArgs: string | undefined;
  public readonly networkInterface: FirecrackerRunnerOptions["networkInterface"];

  private _pool: FirecrackerPool | null = null;
  private _activeVm: FirecrackerVM | null = null;
  private _activeSock: Socket | null = null;
  private _stopped = false;

  constructor(options: FirecrackerRunnerOptions) {
    this.kernelImagePath = options.kernelImagePath;
    this.rootfsImages = Object.freeze({ ...options.rootfsImages });
    this.defaultRootfs = options.defaultRootfs ?? null;
    this.firecrackerBin = options.firecrackerBin ?? "firecracker";
    this.vcpuCount = options.vcpuCount ?? 1;
    this.memSizeMib = options.memSizeMib ?? 128;
    this.timeoutSeconds = options.timeoutSeconds ?? 10;
    this.guestAgentPort = options.guestAgentPort ?? 1024;
    this.bootArgs = options.bootArgs;
    this.networkInterface = options.networkInterface ?? null;
  }

  /**
   * Attach a {@link FirecrackerPool} for VM reuse.
   * When a pool is attached, VMs are acquired from (and released back to)
   * the pool instead of being created and destroyed per-execution.
   */
  setPool(pool: FirecrackerPool): void {
    this._pool = pool;
  }

  /**
   * Run code and stream output lines.
   *
   * @param userCode   Source code to execute inside the VM.
   * @param envLocals  Variables to inject into the execution environment.
   * @param options    Language override and other per-call options.
   * @yields `[slot, line]` tuples — slot is "stdout" or "stderr".
   */
  async *stream(
    userCode: string,
    envLocals: Record<string, unknown>,
    options?: FirecrackerStreamOptions
  ): AsyncGenerator<[Slot, string], void> {
    this._stopped = false;

    const language = options?.language ?? this._inferLanguage();
    const rootfs = this._resolveRootfs(language);

    let vm: FirecrackerVM | null = null;
    let fromPool = false;

    try {
      // Acquire or create a VM
      if (this._pool) {
        vm = await this._pool.acquire();
        fromPool = true;
      } else {
        vm = new FirecrackerVM(
          {
            kernelImagePath: this.kernelImagePath,
            rootfsPath: rootfs,
            vcpuCount: this.vcpuCount,
            memSizeMib: this.memSizeMib,
            bootArgs: this.bootArgs,
            networkInterface: this.networkInterface
          },
          this.firecrackerBin
        );
        await vm.boot();
      }

      this._activeVm = vm;

      // Connect to guest agent
      const sock = await vm.connectVsock(this.guestAgentPort);
      this._activeSock = sock;

      if (this._stopped) {
        return;
      }

      // Send execution request
      const request: GuestExecRequest = {
        action: "exec",
        language,
        code: userCode,
        env: envLocals,
        timeout: this.timeoutSeconds
      };
      sock.write(JSON.stringify(request) + "\n");

      // Stream responses
      yield* this._readResponses(sock);
    } finally {
      // Cleanup
      this._activeSock = null;
      this._activeVm = null;

      if (vm) {
        if (fromPool && this._pool) {
          this._pool.release(vm);
        } else {
          await vm.destroy();
        }
      }
    }
  }

  /**
   * Cooperatively stop the current execution.
   * Safe to call multiple times.
   */
  stop(): void {
    this._stopped = true;

    // Close the vsock connection to signal the guest
    if (this._activeSock) {
      try {
        this._activeSock.destroy();
      } catch {
        // ignore
      }
    }

    // If not using a pool, destroy the VM immediately
    if (this._activeVm && !this._pool) {
      void this._activeVm.destroy();
    }
  }

  // ---- Private -----------------------------------------------------------

  /**
   * Read JSON-line messages from the guest agent and yield output tuples.
   * Completes when the guest sends an "exit" message or the socket closes.
   */
  private async *_readResponses(
    sock: Socket
  ): AsyncGenerator<[Slot, string], void> {
    const rl = createInterface({ input: sock, crlfDelay: Infinity });

    let exitCode: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
      // Set up execution timeout
      if (this.timeoutSeconds > 0) {
        timeoutHandle = setTimeout(() => {
          this._stopped = true;
          try {
            sock.destroy();
          } catch {
            // ignore
          }
        }, this.timeoutSeconds * 1000);
      }

      for await (const line of rl) {
        if (this._stopped) {
          break;
        }

        if (!line.trim()) {
          continue;
        }

        let msg: GuestMessage;
        try {
          msg = JSON.parse(line) as GuestMessage;
        } catch {
          // Non-JSON output — treat as raw stdout
          yield ["stdout", line.endsWith("\n") ? line : line + "\n"];
          continue;
        }

        if (msg.type === "stdout" || msg.type === "stderr") {
          const data = msg.data;
          // Emit each line individually
          const lines = data.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const segment = lines[i];
            if (i < lines.length - 1) {
              // All segments except the last get a newline (they were split on \n)
              yield [msg.type, segment + "\n"];
            } else if (segment.length > 0) {
              // Last segment (no trailing \n in original) — still add \n for consistency
              yield [msg.type, segment + "\n"];
            }
          }
        } else if (msg.type === "exit") {
          exitCode = msg.code;
          break;
        }
      }
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
      rl.close();
    }

    // Check exit code
    if (exitCode !== null && exitCode !== 0 && !this._stopped) {
      throw new ContainerFailureError(
        `Guest process exited with code ${exitCode}`,
        exitCode
      );
    }
  }

  /**
   * Resolve the rootfs path for a given language.
   */
  private _resolveRootfs(language: string): string {
    const rootfs = this.rootfsImages[language] ?? this.defaultRootfs;
    if (!rootfs) {
      throw new Error(
        `No rootfs image configured for language "${language}" and no defaultRootfs set`
      );
    }
    return rootfs;
  }

  /**
   * Infer the default language when none is specified.
   * Falls back to the first key in rootfsImages, or "bash".
   */
  private _inferLanguage(): string {
    const keys = Object.keys(this.rootfsImages);
    return keys.length > 0 ? keys[0] : "bash";
  }
}
