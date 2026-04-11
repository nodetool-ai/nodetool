/**
 * Tests for FirecrackerClient.
 *
 * Since we can't spin up a real Firecracker daemon in unit tests,
 * these tests verify the client's request construction and response handling
 * using a mock HTTP server on a Unix socket.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FirecrackerClient } from "../src/firecracker-client.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface RecordedRequest {
  method: string;
  url: string;
  body: string;
}

function createMockServer(
  socketPath: string,
  handler?: (req: IncomingMessage, res: ServerResponse) => void
): { server: Server; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];

  const defaultHandler = (req: IncomingMessage, res: ServerResponse): void => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      requests.push({
        method: req.method ?? "",
        url: req.url ?? "",
        body: Buffer.concat(chunks).toString("utf-8")
      });
      res.writeHead(204);
      res.end();
    });
  };

  const server = createServer(handler ?? defaultHandler);
  server.listen(socketPath);
  return { server, requests };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FirecrackerClient", () => {
  let tmpDir: string;
  let socketPath: string;
  let server: Server;
  let requests: RecordedRequest[];
  let client: FirecrackerClient;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "fc-test-"));
    socketPath = join(tmpDir, "api.sock");
    const mock = createMockServer(socketPath);
    server = mock.server;
    requests = mock.requests;
    client = new FirecrackerClient(socketPath);
  });

  afterEach(() => {
    server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("constructor", () => {
    it("stores the socket path", () => {
      expect(client.socketPath).toBe(socketPath);
    });
  });

  describe("setBootSource", () => {
    it("sends PUT /boot-source with kernel path", async () => {
      await client.setBootSource({
        kernel_image_path: "/opt/vmlinux",
        boot_args: "console=ttyS0"
      });
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe("PUT");
      expect(requests[0].url).toBe("/boot-source");
      const body = JSON.parse(requests[0].body);
      expect(body.kernel_image_path).toBe("/opt/vmlinux");
      expect(body.boot_args).toBe("console=ttyS0");
    });
  });

  describe("setMachineConfig", () => {
    it("sends PUT /machine-config", async () => {
      await client.setMachineConfig({ vcpu_count: 2, mem_size_mib: 256 });
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe("PUT");
      expect(requests[0].url).toBe("/machine-config");
      const body = JSON.parse(requests[0].body);
      expect(body.vcpu_count).toBe(2);
      expect(body.mem_size_mib).toBe(256);
    });
  });

  describe("addDrive", () => {
    it("sends PUT /drives/{drive_id}", async () => {
      await client.addDrive({
        drive_id: "rootfs",
        path_on_host: "/opt/rootfs.ext4",
        is_root_device: true,
        is_read_only: false
      });
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe("PUT");
      expect(requests[0].url).toBe("/drives/rootfs");
      const body = JSON.parse(requests[0].body);
      expect(body.drive_id).toBe("rootfs");
      expect(body.path_on_host).toBe("/opt/rootfs.ext4");
      expect(body.is_root_device).toBe(true);
      expect(body.is_read_only).toBe(false);
    });
  });

  describe("setVsock", () => {
    it("sends PUT /vsock", async () => {
      await client.setVsock({
        guest_cid: 3,
        uds_path: "/tmp/vsock.sock"
      });
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe("PUT");
      expect(requests[0].url).toBe("/vsock");
      const body = JSON.parse(requests[0].body);
      expect(body.guest_cid).toBe(3);
      expect(body.uds_path).toBe("/tmp/vsock.sock");
    });
  });

  describe("addNetworkInterface", () => {
    it("sends PUT /network-interfaces/{iface_id}", async () => {
      await client.addNetworkInterface({
        iface_id: "eth0",
        host_dev_name: "tap0",
        guest_mac: "AA:BB:CC:DD:EE:FF"
      });
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe("PUT");
      expect(requests[0].url).toBe("/network-interfaces/eth0");
      const body = JSON.parse(requests[0].body);
      expect(body.iface_id).toBe("eth0");
      expect(body.host_dev_name).toBe("tap0");
      expect(body.guest_mac).toBe("AA:BB:CC:DD:EE:FF");
    });
  });

  describe("startInstance", () => {
    it("sends PUT /actions with InstanceStart", async () => {
      await client.startInstance();
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe("PUT");
      expect(requests[0].url).toBe("/actions");
      const body = JSON.parse(requests[0].body);
      expect(body.action_type).toBe("InstanceStart");
    });
  });

  describe("getInstanceInfo", () => {
    it("sends GET / and parses response", async () => {
      // Need a custom server that returns JSON
      server.close();
      const customSocket = join(tmpDir, "api2.sock");
      const customServer = createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "test-vm", state: "Running" }));
      });
      customServer.listen(customSocket);

      const customClient = new FirecrackerClient(customSocket);
      const info = await customClient.getInstanceInfo();
      expect(info).toEqual({ id: "test-vm", state: "Running" });

      customServer.close();
    });
  });

  describe("error handling", () => {
    it("rejects on non-2xx status", async () => {
      server.close();
      const errSocket = join(tmpDir, "err.sock");
      const errServer = createServer((_req, res) => {
        res.writeHead(400);
        res.end(JSON.stringify({ fault_message: "Invalid config" }));
      });
      errServer.listen(errSocket);

      const errClient = new FirecrackerClient(errSocket);
      await expect(errClient.startInstance()).rejects.toThrow(
        /Firecracker API PUT \/actions returned 400/
      );

      errServer.close();
    });
  });
});
