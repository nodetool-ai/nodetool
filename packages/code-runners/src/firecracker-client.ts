/**
 * firecracker-client.ts
 *
 * HTTP client for the Firecracker REST API exposed over a Unix domain socket.
 * Wraps every configuration and action endpoint needed to create, configure,
 * boot, and destroy a microVM.
 *
 * @see https://github.com/firecracker-microvm/firecracker/blob/main/src/firecracker/swagger/firecracker.yaml
 */

import { request as httpRequest, type IncomingMessage } from "node:http";

// ---------------------------------------------------------------------------
// Types for API request/response bodies
// ---------------------------------------------------------------------------

export interface BootSourceBody {
  kernel_image_path: string;
  boot_args?: string;
}

export interface MachineConfigBody {
  vcpu_count: number;
  mem_size_mib: number;
}

export interface DriveBody {
  drive_id: string;
  path_on_host: string;
  is_root_device: boolean;
  is_read_only: boolean;
}

export interface VsockBody {
  guest_cid: number;
  uds_path: string;
}

export interface NetworkInterfaceBody {
  iface_id: string;
  host_dev_name: string;
  guest_mac?: string;
}

export interface ActionBody {
  action_type: "InstanceStart" | "SendCtrlAltDel" | "FlushMetrics";
}

// ---------------------------------------------------------------------------
// FirecrackerClient
// ---------------------------------------------------------------------------

/**
 * Low-level HTTP client for the Firecracker microVM API.
 *
 * All methods return a Promise that resolves when the API responds with a 2xx
 * status code and rejects otherwise. The Firecracker process must already be
 * running and listening on `socketPath`.
 */
export class FirecrackerClient {
  public readonly socketPath: string;

  constructor(socketPath: string) {
    this.socketPath = socketPath;
  }

  // ---- Configuration endpoints -------------------------------------------

  /** PUT /boot-source */
  async setBootSource(body: BootSourceBody): Promise<void> {
    await this._put("/boot-source", body);
  }

  /** PUT /machine-config */
  async setMachineConfig(body: MachineConfigBody): Promise<void> {
    await this._put("/machine-config", body);
  }

  /** PUT /drives/{drive_id} */
  async addDrive(body: DriveBody): Promise<void> {
    await this._put(`/drives/${body.drive_id}`, body);
  }

  /** PUT /vsock */
  async setVsock(body: VsockBody): Promise<void> {
    await this._put("/vsock", body);
  }

  /** PUT /network-interfaces/{iface_id} */
  async addNetworkInterface(body: NetworkInterfaceBody): Promise<void> {
    await this._put(`/network-interfaces/${body.iface_id}`, body);
  }

  // ---- Actions -----------------------------------------------------------

  /** PUT /actions — trigger an instance action. */
  async instanceAction(actionType: ActionBody["action_type"]): Promise<void> {
    await this._put("/actions", { action_type: actionType });
  }

  /** Convenience: boot the microVM. */
  async startInstance(): Promise<void> {
    await this.instanceAction("InstanceStart");
  }

  // ---- Info --------------------------------------------------------------

  /** GET / — returns instance information. */
  async getInstanceInfo(): Promise<Record<string, unknown>> {
    return (await this._request("GET", "/")) as Record<string, unknown>;
  }

  // ---- Private transport -------------------------------------------------

  private async _put(path: string, body: unknown): Promise<unknown> {
    return this._request("PUT", path, body);
  }

  /**
   * Send an HTTP request over the Unix socket and return the parsed JSON
   * response body (or `undefined` for 204 No Content).
   */
  private _request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const payload = body !== undefined ? JSON.stringify(body) : undefined;

      const req = httpRequest(
        {
          socketPath: this.socketPath,
          method,
          path,
          headers: {
            Accept: "application/json",
            ...(payload !== undefined
              ? {
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(payload)
                }
              : {})
          }
        },
        (res: IncomingMessage) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const status = res.statusCode ?? 0;
            const responseBody = Buffer.concat(chunks).toString("utf-8");

            if (status >= 200 && status < 300) {
              if (responseBody.length === 0 || status === 204) {
                resolve(undefined);
              } else {
                try {
                  resolve(JSON.parse(responseBody));
                } catch {
                  resolve(responseBody);
                }
              }
            } else {
              reject(
                new Error(
                  `Firecracker API ${method} ${path} returned ${status}: ${responseBody}`
                )
              );
            }
          });
          res.on("error", reject);
        }
      );

      req.on("error", reject);

      if (payload !== undefined) {
        req.write(payload);
      }
      req.end();
    });
  }
}
