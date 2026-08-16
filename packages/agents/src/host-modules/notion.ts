/**
 * `@nodetool-ai/sandbox-notion` — the Notion API's request shape, on the host.
 *
 * Notion is an ordinary HTTPS API the guest can call. What trips a script up is
 * everything around the call: the `Notion-Version` header nobody remembers,
 * the rich-text arrays every title and paragraph is wrapped in, and the block
 * tree a page's content comes back as. Those three are here. The request goes
 * out through the guest's own `fetch`.
 */

import { optionsOf } from "./limits.js";
import {
  jsonBody,
  methodOf,
  requireString,
  withQuery,
  type PreparedRequest
} from "./prepared-request.js";
import { isObjectLike, isString } from "../utils/type-guards.js";

/** The API version this helper signs requests with unless told otherwise. */
const DEFAULT_NOTION_VERSION = "2022-06-28";

const NOTION_BASE = "https://api.notion.com";

/**
 * Build an authenticated Notion API request.
 *
 * ```js
 * import { request } from "@nodetool-ai/sandbox-notion";
 *
 * const token = await nodetool.secrets.get("NOTION_API_KEY");
 * const req = await request({
 *   token, path: "search", method: "POST",
 *   body: { query: "roadmap", page_size: 10 }
 * });
 * const res = await fetch(req.url, req);
 * ```
 *
 * `path` is relative to `/v1` unless it already starts with `/`.
 */
export async function request(options?: unknown): Promise<PreparedRequest> {
  const where = "notion.request";
  const opts = optionsOf(options);
  const token = requireString(where, opts.token, "token");
  const path = requireString(where, opts.path, "path");
  const method = methodOf(opts.method, "GET");
  const url = withQuery(
    new URL(path.startsWith("/") ? path : `/v1/${path}`, NOTION_BASE),
    opts.query
  );

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": String(opts.version ?? DEFAULT_NOTION_VERSION)
  };
  if (opts.body === undefined || opts.body === null) {
    return { url: url.toString(), method, headers };
  }
  headers["Content-Type"] = "application/json";
  return {
    url: url.toString(),
    method,
    headers,
    body: jsonBody(where, opts.body)
  };
}

interface RichTextEntry {
  readonly plain_text?: unknown;
  readonly text?: { readonly content?: unknown };
}

/**
 * Collapse a Notion rich-text array to its text.
 *
 * Every title, heading and paragraph arrives as an array of annotated spans,
 * and reading one back out is the first thing every Notion script does.
 */
export async function plainText(value?: unknown): Promise<string> {
  if (isString(value)) return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((entry: RichTextEntry) => {
      if (!isObjectLike(entry)) return "";
      const span = entry as RichTextEntry;
      if (isString(span.plain_text)) return span.plain_text;
      const content = span.text?.content;
      return isString(content) ? content : "";
    })
    .join("");
}

interface NotionBlock {
  readonly type?: unknown;
  readonly [key: string]: unknown;
}

const HEADINGS: Readonly<Record<string, string>> = {
  heading_1: "# ",
  heading_2: "## ",
  heading_3: "### "
};

/**
 * A page's block children as markdown.
 *
 * Blocks Notion has but markdown does not — databases, embeds, synced blocks —
 * contribute nothing rather than a placeholder, so the output is text a model
 * or a file can take as-is. Nested children are not fetched: this is a pure
 * function over the blocks handed to it, and a script that wants the whole
 * tree pages through `blocks/{id}/children` itself.
 */
export async function toMarkdown(blocks?: unknown): Promise<string> {
  if (!Array.isArray(blocks)) return "";
  const lines: string[] = [];
  for (const block of blocks as NotionBlock[]) {
    if (!isObjectLike(block)) continue;
    const type = isString(block.type) ? block.type : "";
    const payload = optionsOf(block[type]);
    const text = await plainText(payload.rich_text);

    if (Object.hasOwn(HEADINGS, type)) {
      lines.push(`${HEADINGS[type]}${text}`);
    } else if (type === "paragraph") {
      lines.push(text);
    } else if (type === "bulleted_list_item") {
      lines.push(`- ${text}`);
    } else if (type === "numbered_list_item") {
      lines.push(`1. ${text}`);
    } else if (type === "to_do") {
      lines.push(`- [${payload.checked === true ? "x" : " "}] ${text}`);
    } else if (type === "quote") {
      lines.push(`> ${text}`);
    } else if (type === "code") {
      lines.push(`\`\`\`${String(payload.language ?? "")}\n${text}\n\`\`\``);
    } else if (type === "divider") {
      lines.push("---");
    }
  }
  return lines.join("\n\n");
}
