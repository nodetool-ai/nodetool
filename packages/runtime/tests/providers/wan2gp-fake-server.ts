/**
 * A fake Wan2GP MCP server on a loopback port.
 *
 * It answers the MCP streamable-HTTP handshake, the tools the client calls and
 * the `/wangp_api` transfer routes, and records every call. The response
 * shapes are the nodetool-wan2gp pack's recorded fixtures, copied from
 * nodetool-wan2gp@bc05871 tests/fixtures into tests/fixtures/wan2gp.
 */
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "wan2gp");

export function wan2gpFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), "utf8")) as Record<string, unknown>;
}

export function wan2gpFixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(FIXTURES, name)));
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

type Handler = (args: Record<string, unknown>) => unknown;

export class FakeWan2GP {
  server!: Server;
  url = "";
  /** Respond to requests with an SSE stream instead of a JSON body. */
  sse = false;
  /** Advertise only MCP API v1 tools. */
  legacy = false;
  calls: ToolCall[] = [];
  methods: string[] = [];
  uploads: Array<{ path: string; body: Buffer }> = [];
  deletes = 0;
  /** When set, every request must carry `Authorization: Bearer <token>`. */
  token: string | null = null;
  /** The Authorization header of every request, in arrival order. */
  authorizations: Array<string | undefined> = [];
  sessionHeaders: Array<string | undefined> = [];
  /** Job snapshots returned by successive get_job calls; the last one repeats. */
  jobs: Array<Record<string, unknown>> = [wan2gpFixture("job_running"), wan2gpFixture("job_done")];
  /** Overrides per tool name or per `wangp_session` action. */
  handlers: Record<string, Handler> = {};
  downloadBody: Uint8Array = wan2gpFixtureBytes("tiny.mp4");
  downloadTicket: Record<string, unknown> = wan2gpFixture("gallery_download_ticket");
  uploadTicket: Record<string, unknown> = wan2gpFixture("gallery_upload_ticket");
  fileUploadTicket: Record<string, unknown> = {
    upload_url: "/wangp_api/files/upload/6c5d4e3f2a1b0c9d",
    method: "PUT",
    max_bytes: 1024
  };
  capabilities: Record<string, Record<string, unknown>> = {
    ti2v_2_2_fastwan: wan2gpFixture("model_capabilities_ti2v_2_2_fastwan"),
    flux: wan2gpFixture("model_capabilities_flux"),
    qwen_image_edit_20B: wan2gpFixture("model_capabilities_qwen_image_edit_20B"),
    wanmove: wan2gpFixture("model_capabilities_wanmove")
  };
  modelPages: Array<Record<string, unknown>> = (
    wan2gpFixture("models_search_v2_pages").pages as Array<Record<string, unknown>>
  );
  private pageIndex = 0;
  private jobIndex = 0;

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    const { port } = this.server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${port}/mcp`;
    return this;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  toolNames(): string[] {
    return this.calls.map((call) =>
      call.name === "wangp_session" ? `wangp_session:${String(call.args.action)}` : call.name
    );
  }

  private async body(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  private tool(name: string, args: Record<string, unknown>): unknown {
    this.calls.push({ name, args });
    if (name === "wangp_session") {
      const action = String(args.action);
      const inner = (args.arguments ?? {}) as Record<string, unknown>;
      const override = this.handlers[action];
      if (override) return override(inner);
      switch (action) {
        case "get_job": {
          const job = this.jobs[Math.min(this.jobIndex, this.jobs.length - 1)];
          this.jobIndex += 1;
          return job;
        }
        case "cancel_job":
          return { job_id: inner.job_id, cancel_requested: true };
        case "create_gallery_upload":
          return { ...this.uploadTicket, filename: inner.filename };
        case "create_file_upload":
          return this.fileUploadTicket;
        case "create_gallery_download":
          return this.downloadTicket;
        default:
          throw new Error(`unknown action ${action}`);
      }
    }
    const override = this.handlers[name];
    if (override) return override(args);
    switch (name) {
      case "wangp_models": {
        // The recorded pages come from a longer listing, so the last one
        // served here ends it.
        const last = this.pageIndex >= this.modelPages.length - 1;
        const page = this.modelPages[Math.min(this.pageIndex, this.modelPages.length - 1)];
        this.pageIndex += 1;
        return last ? { ...page, has_more: false } : page;
      }
      case "wangp_model": {
        const modelType = String(args.model_type);
        if (args.action === "capabilities") {
          const metadata = this.capabilities[modelType];
          if (!metadata) throw new Error(`Unknown model_type: ${modelType}`);
          return metadata;
        }
        return { model_type: modelType, prompt: "", num_inference_steps: 30 };
      }
      case "wangp_generate":
        return wan2gpFixture("job_submitted");
      default:
        throw new Error(`unknown tool ${name}`);
    }
  }

  private send(res: ServerResponse, message: Record<string, unknown>): void {
    res.setHeader("Mcp-Session-Id", "session-1");
    if (this.sse) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: {} })}\n\n`);
      res.end(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(message));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    this.authorizations.push(req.headers.authorization);
    if (this.token !== null && req.headers.authorization !== `Bearer ${this.token}`) {
      res.writeHead(401, { "WWW-Authenticate": "Bearer" }).end("Unauthorized");
      return;
    }
    if (url.pathname === "/mcp" && req.method === "DELETE") {
      this.deletes += 1;
      res.writeHead(200).end();
      return;
    }
    if (url.pathname === "/mcp" && req.method === "POST") {
      const message = JSON.parse((await this.body(req)).toString("utf8")) as Record<string, unknown>;
      const method = String(message.method);
      this.methods.push(method);
      this.sessionHeaders.push(req.headers["mcp-session-id"] as string | undefined);
      if (message.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      const reply = (result: unknown): void => this.send(res, { jsonrpc: "2.0", id: message.id, result });
      const params = (message.params ?? {}) as Record<string, unknown>;
      if (method === "initialize") {
        reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "WanGP", version: "test" } });
      } else if (method === "tools/list") {
        const names = this.legacy
          ? ["wangp_models", "wangp_model", "wangp_generate", "wangp_get_job"]
          : ["wangp_models", "wangp_model", "wangp_generate", "wangp_validate", "wangp_session"];
        reply({ tools: names.map((name) => ({ name, inputSchema: { type: "object" } })) });
      } else if (method === "tools/call") {
        try {
          const value = this.tool(String(params.name), (params.arguments ?? {}) as Record<string, unknown>);
          const structured = typeof value === "object" && value !== null && !Array.isArray(value) ? value : { result: value };
          reply({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: structured, isError: false });
        } catch (error) {
          reply({ content: [{ type: "text", text: (error as Error).message }], isError: true });
        }
      } else {
        this.send(res, { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
      }
      return;
    }
    if (req.method === "PUT" && url.pathname.startsWith("/wangp_api/")) {
      const body = await this.body(req);
      this.uploads.push({ path: url.pathname, body });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          url.pathname.startsWith("/wangp_api/files/")
            ? { status: "done", path: "@documents/uploads/abc/trajectory.npy" }
            : wan2gpFixture("gallery_upload_result")
        )
      );
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/wangp_api/gallery/download/")) {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(Buffer.from(this.downloadBody));
      return;
    }
    res.writeHead(404).end("not found");
  }
}
