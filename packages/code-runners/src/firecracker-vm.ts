/**
 * firecracker-vm.ts
 *
 * Manages the lifecycle of a single Firecracker microVM: spawn the process,
 * configure it via the REST API, boot the guest, establish vsock communication,
 * and tear everything down cleanly.
 *
 * Each VM gets its own temporary directory for the API socket and vsock UDS.
 */

import { spawn, type ChildProcess } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  accessSync,
  constants as fsConstants
} from "node:fs";
import { join as pathJoin } from "node:path";
import { tmpdir } from "node:os";
import { createConnection, type Socket } from "node:net";
import { FirecrackerClient } from "./firecracker-client.js";
import type { FirecrackerVMConfig } from "./firecracker-types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default kernel boot args for a minimal serial-console guest. */
const DEFAULT_BOOT_ARGS =
  "console=ttyS0 reboot=k panic=1 pci=off i8042.noaux i8042.nomux i8042.nopnp i8042.dumbkbd";

/** How long to wait for the API socket to appear after spawning (ms). */
const SOCKET_READY_TIMEOUT_MS = 10_000;

/** How long to wait for vsock connection (ms). */
const VSOCK_CONNECT_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// CID allocator
// ---------------------------------------------------------------------------

let nextCid = 3; // CID 0 = hypervisor, 1 = reserved, 2 = host

function allocateCid(): number {
  const cid = nextCid;
  nextCid++;
  // Wrap around at a safe upper bound (Firecracker supports up to 2^32 - 1)
  if (nextCid > 0xffff_fffe) {
    nextCid = 3;
  }
  return cid;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a Unix socket file to appear on disk (Firecracker creates it
 * after startup).
 */
async function waitForSocket(
  socketPath: string,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(socketPath)) {
      try {
        accessSync(socketPath, fsConstants.R_OK | fsConstants.W_OK);
        return;
      } catch {
        // not yet writable
      }
    }
    await sleep(50);
  }
  throw new Error(
    `Firecracker API socket did not appear at ${socketPath} within ${timeoutMs}ms`
  );
}

/**
 * Connect to a Unix domain socket with a timeout.
 */
function connectUnix(socketPath: string, timeoutMs: number): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error(`Vsock connection timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const sock = createConnection({ path: socketPath }, () => {
      clearTimeout(timer);
      resolve(sock);
    });

    sock.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// FirecrackerVM
// ---------------------------------------------------------------------------

/**
 * Represents a single Firecracker microVM instance.
 *
 * Lifecycle: `new` → {@link boot} → {@link connectVsock} → {@link destroy}.
 */
export class FirecrackerVM {
  public readonly config: Readonly<FirecrackerVMConfig>;
  public readonly firecrackerBin: string;
  public readonly cid: number;

  private _tmpDir: string | null = null;
  private _apiSocketPath: string | null = null;
  private _vsockUdsPath: string | null = null;
  private _process: ChildProcess | null = null;
  private _client: FirecrackerClient | null = null;
  private _booted = false;
  private _destroyed = false;

  constructor(config: FirecrackerVMConfig, firecrackerBin?: string) {
    this.config = Object.freeze({ ...config });
    this.firecrackerBin = firecrackerBin ?? "firecracker";
    this.cid = allocateCid();
  }

  /** The API socket path. Only available after {@link boot}. */
  get apiSocketPath(): string {
    if (!this._apiSocketPath) {
      throw new Error("VM has not been booted");
    }
    return this._apiSocketPath;
  }

  /** The vsock UDS base path. Only available after {@link boot}. */
  get vsockUdsPath(): string {
    if (!this._vsockUdsPath) {
      throw new Error("VM has not been booted");
    }
    return this._vsockUdsPath;
  }

  get isBooted(): boolean {
    return this._booted;
  }

  get isDestroyed(): boolean {
    return this._destroyed;
  }

  /** Whether the Firecracker process is still running. */
  get isRunning(): boolean {
    return this._process !== null && this._process.exitCode === null;
  }

  // ---- Lifecycle ---------------------------------------------------------

  /**
   * Spawn the Firecracker process, configure the VM, and boot the guest.
   *
   * After this method resolves the guest is running and vsock is available.
   */
  async boot(): Promise<void> {
    if (this._booted) {
      throw new Error("VM already booted");
    }
    if (this._destroyed) {
      throw new Error("VM has been destroyed");
    }

    // Create temp directory for sockets
    this._tmpDir = mkdtempSync(pathJoin(tmpdir(), "fc-vm-"));
    this._apiSocketPath = pathJoin(this._tmpDir, "api.sock");
    this._vsockUdsPath = pathJoin(this._tmpDir, "vsock.sock");

    // Spawn Firecracker
    this._process = spawn(
      this.firecrackerBin,
      ["--api-sock", this._apiSocketPath],
      {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false
      }
    );

    // Fail fast if the process dies or fails to spawn
    const earlyExitPromise = new Promise<never>((_, reject) => {
      this._process!.once("error", (err) => {
        reject(
          new Error(`Firecracker process failed to start: ${err.message}`)
        );
      });
      this._process!.once("exit", (code, signal) => {
        reject(
          new Error(
            `Firecracker process exited early (code=${code}, signal=${signal})`
          )
        );
      });
    });

    try {
      // Wait for API socket
      await Promise.race([
        waitForSocket(this._apiSocketPath, SOCKET_READY_TIMEOUT_MS),
        earlyExitPromise
      ]);

      this._client = new FirecrackerClient(this._apiSocketPath);

      // Configure the VM
      await this._configure();

      // Boot
      await this._client.startInstance();
      this._booted = true;
    } catch (err) {
      // Clean up on failure
      await this.destroy();
      throw err;
    }
  }

  /**
   * Connect to the guest agent via vsock.
   *
   * Firecracker proxies guest vsock connections through Unix sockets at
   * `<vsockUdsPath>_<port>`. The host connects to that path and performs
   * the vsock handshake (`CONNECT <port>\n` / `OK <port>\n`).
   *
   * @param port The vsock port the guest agent is listening on.
   * @returns A connected socket ready for bidirectional communication.
   */
  async connectVsock(port: number): Promise<Socket> {
    if (!this._booted || this._destroyed) {
      throw new Error("VM is not in a connectable state");
    }

    const udsPath = `${this._vsockUdsPath}_${port}`;

    // Retry connection — the guest agent may not be ready immediately after boot
    const deadline = Date.now() + VSOCK_CONNECT_TIMEOUT_MS;
    let lastError: Error | null = null;

    while (Date.now() < deadline) {
      try {
        const sock = await connectUnix(udsPath, 2_000);

        // Perform vsock handshake
        await this._vsockHandshake(sock, port);

        return sock;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await sleep(100);
      }
    }

    throw new Error(
      `Failed to connect to guest vsock port ${port}: ${lastError?.message ?? "timeout"}`
    );
  }

  /**
   * Destroy the VM: kill the Firecracker process and clean up temp files.
   * Safe to call multiple times.
   */
  async destroy(): Promise<void> {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    this._booted = false;

    // Kill the Firecracker process
    const proc = this._process;
    if (proc && proc.exitCode === null) {
      try {
        proc.kill("SIGTERM");
      } catch {
        // ignore
      }
      // Give it a moment, then force kill
      await sleep(500);
      if (proc.exitCode === null) {
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    }
    this._process = null;
    this._client = null;

    // Remove temp directory
    if (this._tmpDir) {
      try {
        rmSync(this._tmpDir, { recursive: true, force: true });
      } catch {
        // best effort
      }
      this._tmpDir = null;
    }
  }

  // ---- Private -----------------------------------------------------------

  /**
   * Apply all VM configuration through the Firecracker API.
   * Must be called before InstanceStart.
   */
  private async _configure(): Promise<void> {
    const client = this._client!;
    const cfg = this.config;

    // Machine config
    await client.setMachineConfig({
      vcpu_count: cfg.vcpuCount ?? 1,
      mem_size_mib: cfg.memSizeMib ?? 128
    });

    // Boot source
    await client.setBootSource({
      kernel_image_path: cfg.kernelImagePath,
      boot_args: cfg.bootArgs ?? DEFAULT_BOOT_ARGS
    });

    // Root drive
    await client.addDrive({
      drive_id: "rootfs",
      path_on_host: cfg.rootfsPath,
      is_root_device: true,
      is_read_only: cfg.rootfsReadOnly ?? false
    });

    // Vsock device
    await client.setVsock({
      guest_cid: this.cid,
      uds_path: this._vsockUdsPath!
    });

    // Network interface (optional)
    if (cfg.networkInterface) {
      await client.addNetworkInterface({
        iface_id: "eth0",
        host_dev_name: cfg.networkInterface.hostDevName,
        guest_mac: cfg.networkInterface.guestMac
      });
    }
  }

  /**
   * Perform the Firecracker vsock handshake.
   *
   * Protocol: host sends `CONNECT <port>\n`, guest responds `OK <port>\n`.
   */
  private _vsockHandshake(sock: Socket, port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Vsock handshake timed out"));
      }, 3_000);

      let buf = "";

      const onData = (chunk: Buffer): void => {
        buf += chunk.toString("utf-8");
        if (buf.includes("\n")) {
          clearTimeout(timer);
          sock.removeListener("data", onData);

          const line = buf.split("\n")[0].trim();
          if (line === `OK ${port}`) {
            resolve();
          } else {
            reject(new Error(`Unexpected vsock handshake response: ${line}`));
          }
        }
      };

      sock.on("data", onData);
      sock.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      // Send connect request
      sock.write(`CONNECT ${port}\n`);
    });
  }
}
