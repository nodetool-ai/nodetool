/**
 * The `web` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `web.ts`, so nothing the
 * implementations pull in reaches the entry graph. `web.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import { WEB_SEARCH_TOOL_NAME, type JsonSchema } from "@nodetool-ai/runtime";

/**
 * Every search backend `web_search` can route to, in preference order.
 *
 * Order is the routing order when nothing is pinned, and it is deliberate:
 * the dedicated SERP services come first because they answer a search with
 * search results, while `openai` and `gemini` answer it with a model's prose
 * about the results and are the fallback when no SERP key is configured.
 */
export const SEARCH_BACKEND_NAMES = [
  "serpapi",
  "dataforseo",
  "brave",
  "apify",
  "openai",
  "gemini"
] as const;

export type SearchBackendName = (typeof SEARCH_BACKEND_NAMES)[number];

export const WEB_SEARCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "The search query to use.",
      minLength: 2
    },
    allowed_domains: {
      type: "array",
      items: { type: "string" },
      description: "Only include results from these domains."
    },
    blocked_domains: {
      type: "array",
      items: { type: "string" },
      description: "Never include results from these domains."
    },
    search_type: {
      type: "string",
      enum: ["web", "news", "images"],
      default: "web",
      description:
        "What to search. `web` returns pages, `news` returns articles with " +
        "dates and sources. `images` is still accepted for backward " +
        "compatibility, but prefer the dedicated `image_search` function " +
        "instead. Not every backend serves every type; the call says so " +
        "rather than silently returning web results."
    },
    num_results: {
      type: "integer",
      description: "How many results to return.",
      default: 10
    },
    backend: {
      type: "string",
      enum: [...SEARCH_BACKEND_NAMES],
      description:
        "Pin one search backend instead of routing to the first " +
        "configured one."
    }
  },
  required: ["query"]
};

export const webSearchSpec: CapabilitySpec = {
  name: WEB_SEARCH_TOOL_NAME,
  description:
    "Search the web and use the results to inform responses. Returns " +
    "up-to-date information for current events and recent data beyond the " +
    "model's training cutoff. Set search_type to `news` for dated articles; " +
    "the default `web` returns pages with a title, URL, and snippet. For " +
    "image results use `image_search` instead. Optionally scope results " +
    "with allowed_domains (only these domains) or blocked_domains (never " +
    "these domains). Runs on the first configured backend — SerpAPI, " +
    "DataForSEO, Brave, Apify, then OpenAI or Gemini native search; " +
    "`backend` pins one.",
  inputSchema: WEB_SEARCH_SCHEMA,
  category: "read",
  userMessage: (params) => {
    const query =
      (params.query as string | undefined) ??
      (params.keyword as string | undefined) ??
      "something";
    const msg = `Searching the web for '${query}'`;
    return msg.length > 80 ? "Searching the web" : msg;
  }
};

export const IMAGE_SEARCH_TOOL_NAME = "image_search";

export const IMAGE_SEARCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "The image search query to use.",
      minLength: 2
    },
    allowed_domains: {
      type: "array",
      items: { type: "string" },
      description: "Only include results from these domains."
    },
    blocked_domains: {
      type: "array",
      items: { type: "string" },
      description: "Never include results from these domains."
    },
    num_results: {
      type: "integer",
      description: "How many results to return.",
      default: 20
    },
    backend: {
      type: "string",
      enum: [...SEARCH_BACKEND_NAMES],
      description:
        "Pin one search backend instead of routing to the first " +
        "configured one that supports image search."
    }
  },
  required: ["query"]
};

export const imageSearchSpec: CapabilitySpec = {
  name: IMAGE_SEARCH_TOOL_NAME,
  description:
    "Search the web for images and return each result's title, page link, " +
    "original image URL, and thumbnail URL. Use this — not `web_search` — " +
    "whenever the task is to find or reference existing images (reference " +
    "photos, product shots, screenshots of a real thing). Optionally scope " +
    "results with allowed_domains (only these domains) or blocked_domains " +
    "(never these domains). Runs on the first configured backend that " +
    "supports image search — SerpAPI, DataForSEO, Brave, or Apify; " +
    "`backend` pins one.",
  inputSchema: IMAGE_SEARCH_SCHEMA,
  category: "read",
  userMessage: (params) => {
    const query = (params.query as string | undefined) ?? "something";
    const msg = `Searching the web for images of '${query}'`;
    return msg.length > 80 ? "Searching the web for images" : msg;
  }
};

export const browserSpec: CapabilitySpec = {
  name: "browser",
  description:
    "Fetches a web page and returns its readable text content (HTML " +
    "stripped). Returns plain text. Errors include a short reason. Search " +
    "engine result pages are blocked — use `google_search` instead.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to fetch."
      }
    },
    required: ["url"]
  },
  category: "external",
  userMessage: (params) => {
    const url = (params.url as string) ?? "a specific URL";
    const msg = `Fetching ${url}`;
    return msg.length > 160 ? "Fetching a URL" : msg;
  }
};

export const takeScreenshotSpec: CapabilitySpec = {
  name: "take_screenshot",
  description:
    "Take a screenshot of a web page and save it to the workspace. Renders " +
    "the page in headless Chrome on this machine, or through the remote " +
    "browser service when BROWSER_URL is configured.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to navigate to before taking screenshot"
      },
      output_file: {
        type: "string",
        description: "Workspace relative path to save the screenshot",
        default: "screenshot.png"
      },
      full_page: {
        type: "boolean",
        description:
          "Capture the whole scrollable page instead of the viewport.",
        default: false
      }
    },
    // `output_file` carries a default and the implementation applies it, so
    // requiring it said the opposite of what the schema next to it said —
    // and told every model a screenshot needs a filename chosen for it.
    required: ["url"]
  },
  category: "read",
  userMessage: (params) => {
    const url = (params.url as string) ?? "a page";
    const output = (params.output_file as string) ?? "screenshot.png";
    const msg = `Taking screenshot of ${url} and saving to ${output}.`;
    return msg.length > 160
      ? `Taking screenshot of a page and saving to ${output}.`
      : msg;
  }
};

export const downloadFileSpec: CapabilitySpec = {
  name: "download_file",
  description:
    "Download a text or binary file from a URL and save it to the workspace. " +
    "Also takes a stored ref in place of a URL — an `asset://` URI, a " +
    "`/api/storage/` key, or a `data:` URI — which is how an asset a tool " +
    "just produced reaches the workspace. " +
    "For images / audio / video / pdf, the result includes a `display_markdown` " +
    "field with a ready-to-paste markdown snippet that embeds the asset via a " +
    "UI-fetchable URL (`asset_url`). When narrating the result to the user, " +
    "include `display_markdown` verbatim — never construct your own markdown " +
    "from `output_file`, which is a workspace storage key, not a URL.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "http(s) URL of the file to download, or a stored ref to copy in: " +
          "an asset:// URI, a /api/storage/ key, or a data: URI"
      },
      output_file: {
        type: "string",
        description: "Workspace relative path where to save the file"
      }
    },
    required: ["url", "output_file"]
  },
  category: "write",
  userMessage: (params) => {
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
};

export const httpRequestSpec: CapabilitySpec = {
  name: "http_request",
  description: "Make an HTTP request and return the response body as text",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to send the request to"
      },
      method: {
        type: "string",
        description:
          "HTTP method (GET, POST, PUT, DELETE, PATCH). Defaults to GET."
      },
      headers: {
        type: "object",
        description: "Optional HTTP headers"
      },
      body: {
        type: "string",
        description: "Optional request body (for POST/PUT/PATCH)"
      }
    },
    required: ["url"]
  },
  category: "external",
  userMessage: (params) => {
    const method = String(params["method"] ?? "GET").toUpperCase();
    const url = String(params["url"] ?? "a URL");
    let msg = `${method} ${url}`;
    if (msg.length > 80) {
      msg = `${method} request...`;
    }
    return msg;
  }
};

/** Every spec this module declares, in declaration order. */
export const webSpecs: readonly CapabilitySpec[] = [
  webSearchSpec,
  imageSearchSpec,
  browserSpec,
  takeScreenshotSpec,
  downloadFileSpec,
  httpRequestSpec
];
