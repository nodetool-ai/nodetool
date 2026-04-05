/**
 * HTTP tools for downloading files and making HTTP requests.
 *
 * Port of src/nodetool/agents/tools/http_tools.py
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9"
};

export class DownloadFileTool extends Tool {
  readonly name = "download_file";
  readonly description =
    "Download a text or binary file from a URL and save it to disk";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      url: {
        type: "string" as const,
        description: "URL of the file to download"
      },
      output_file: {
        type: "string" as const,
        description: "Workspace relative path where to save the file"
      }
    },
    required: ["url", "output_file"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    try {
      const url = params["url"];
      const outputFile = params["output_file"];

      if (typeof url !== "string" || !url) {
        return { error: "URL is required" };
      }
      if (typeof outputFile !== "string" || !outputFile) {
        return { error: "Output file is required" };
      }

      const customHeaders =
        params["headers"] && typeof params["headers"] === "object"
          ? (params["headers"] as Record<string, string>)
          : {};
      const mergedHeaders = { ...DEFAULT_HEADERS, ...customHeaders };

      const timeoutMs =
        typeof params["timeout"] === "number"
          ? params["timeout"] * 1000
          : 60_000;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          headers: mergedHeaders,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        return {
          url,
          output_file: outputFile,
          success: false,
          error: `HTTP request failed with status ${response.status}`,
          status_code: response.status
        };
      }

      const contentType = response.headers.get("Content-Type") ?? "unknown";
      const contentLength = response.headers.get("Content-Length");
      const fileSizeBytes = contentLength ? parseInt(contentLength, 10) : null;

      const fullPath = context.resolveWorkspacePath(outputFile);
      const parentDir = dirname(fullPath);
      await mkdir(parentDir, { recursive: true });

      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(fullPath, buffer);

      return {
        url,
        output_file: outputFile,
        success: true,
        content_type: contentType,
        file_size_bytes: fileSizeBytes
      };
    } catch (e) {
      return { error: `Error in download process: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const url = String(params["url"] ?? "a URL");
    const output = String(params["output_file"] ?? "a file");
    let msg = `Downloading from ${url} to ${output}...`;
    if (msg.length > 80) {
      msg = `Downloading file to ${output}...`;
    }
    if (msg.length > 80) {
      msg = "Downloading a file...";
    }
    return msg;
  }
}

export class HttpRequestTool extends Tool {
  readonly name = "http_request";
  readonly description =
    "Make an HTTP request and return the response body as text";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      url: {
        type: "string" as const,
        description: "URL to send the request to"
      },
      method: {
        type: "string" as const,
        description:
          "HTTP method (GET, POST, PUT, DELETE, PATCH). Defaults to GET."
      },
      headers: {
        type: "object" as const,
        description: "Optional HTTP headers"
      },
      body: {
        type: "string" as const,
        description: "Optional request body (for POST/PUT/PATCH)"
      }
    },
    required: ["url"]
  };

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    try {
      const url = params["url"];
      if (typeof url !== "string" || !url) {
        return { error: "URL is required" };
      }

      const method = (
        typeof params["method"] === "string" ? params["method"] : "GET"
      ).toUpperCase();

      const customHeaders =
        params["headers"] && typeof params["headers"] === "object"
          ? (params["headers"] as Record<string, string>)
          : {};
      const mergedHeaders = { ...DEFAULT_HEADERS, ...customHeaders };

      const body =
        typeof params["body"] === "string" ? params["body"] : undefined;

      const timeoutMs =
        typeof params["timeout"] === "number"
          ? params["timeout"] * 1000
          : 60_000;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: mergedHeaders,
          body: ["POST", "PUT", "PATCH"].includes(method) ? body : undefined,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }

      const contentType = response.headers.get("Content-Type") ?? "unknown";
      const text = await response.text();

      return {
        url,
        status_code: response.status,
        success: response.ok,
        content_type: contentType,
        body: text
      };
    } catch (e) {
      return { error: `Error in HTTP request: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const method = String(params["method"] ?? "GET").toUpperCase();
    const url = String(params["url"] ?? "a URL");
    let msg = `${method} ${url}`;
    if (msg.length > 80) {
      msg = `${method} request...`;
    }
    return msg;
  }
}
