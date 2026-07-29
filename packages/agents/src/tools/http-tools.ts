/**
 * HTTP tools for downloading files and making HTTP requests.
 *
 * Port of src/nodetool/agents/tools/http_tools.py
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { safeFetch } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
import { persistBinaryOutput } from "./binary-output.js";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9"
};

export class DownloadFileTool extends Tool {
  readonly name = "download_file";
  readonly description =
    "Download a text or binary file from a URL and save it to the workspace. " +
    "For images / audio / video / pdf, the result includes a `display_markdown` " +
    "field with a ready-to-paste markdown snippet that embeds the asset via a " +
    "UI-fetchable URL (`asset_url`). When narrating the result to the user, " +
    "include `display_markdown` verbatim — never construct your own markdown " +
    "from `output_file`, which is a workspace storage key, not a URL.";
  readonly jsonSchema = {
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
        // safeFetch gates the URL (and every redirect hop) against SSRF: no
        // http:// downgrade, no loopback/link-local/RFC1918 targets. The URL is
        // model/attacker-influenceable via prompt injection, so it must not be
        // able to reach the host's metadata service or internal APIs.
        response = await safeFetch(url, {
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
      const parsedLength = contentLength ? parseInt(contentLength, 10) : NaN;
      const fileSizeBytes = Number.isFinite(parsedLength) ? parsedLength : null;

      const bytes = new Uint8Array(await response.arrayBuffer());
      const persisted = await persistBinaryOutput(context, bytes, {
        outputFile,
        contentType,
        uiPrefix: "downloads"
      });

      return {
        url,
        success: true,
        content_type: contentType,
        file_size_bytes: fileSizeBytes,
        ...persisted
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
  readonly jsonSchema = {
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
        // safeFetch gates the URL (and redirects) against SSRF — the URL is
        // model/attacker-influenceable via prompt injection, so it must not be
        // able to reach loopback/link-local/internal hosts or downgrade to http.
        response = await safeFetch(url, {
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
