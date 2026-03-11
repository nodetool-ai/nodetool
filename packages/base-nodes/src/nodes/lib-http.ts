import { BaseNode, prop } from "@nodetool/node-sdk";
import { promises as fs } from "node:fs";
import path from "node:path";

async function fetchResponse(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(url, init);
  return res;
}

function ensureOk(res: Response): void {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
}

function base64FromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function imageRefFromBytes(bytes: Uint8Array, uri = ""): Record<string, unknown> {
  return { data: base64FromBytes(bytes), uri };
}

function documentRefFromBytes(bytes: Uint8Array, uri = ""): Record<string, unknown> {
  return { data: base64FromBytes(bytes), uri };
}

function castValue(value: unknown, targetType: string): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value === "" && targetType !== "string" && targetType !== "object") {
    return null;
  }

  try {
    if (targetType === "int") return Math.trunc(Number(value));
    if (targetType === "float") return Number(value);
    if (targetType === "string") return String(value);
    if (targetType === "datetime") {
      if (typeof value === "number") return new Date(value * 1000).toISOString();
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
    }
    return value;
  } catch {
    return null;
  }
}

abstract class HTTPBaseLibNode extends BaseNode {
  @prop({ type: "str", default: "" })
  declare url: any;



  protected readUrl(inputs: Record<string, unknown>): string {
    return String(inputs.url ?? this.url ?? "");
  }
}

export class GetRequestLibNode extends HTTPBaseLibNode {
  static readonly nodeType = "lib.http.GetRequest";
      static readonly title = "GET Request";
      static readonly description = "Perform an HTTP GET request to retrieve data from a specified URL.\n    http, get, request, url\n\n    Use cases:\n    - Fetch web page content\n    - Retrieve API data\n    - Download files\n    - Check website availability";
    static readonly exposeAsTool = true;
    static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetchResponse(this.readUrl(inputs));
    const text = await res.text();
    return { output: text };
  }
}

export class PostRequestLibNode extends HTTPBaseLibNode {
  static readonly nodeType = "lib.http.PostRequest";
      static readonly title = "POST Request";
      static readonly description = "Send data to a server using an HTTP POST request.\n    http, post, request, url, data\n\n    Use cases:\n    - Submit form data\n    - Create new resources on an API\n    - Upload files\n    - Authenticate users";
    static readonly basicFields = [
  "url"
];
    static readonly exposeAsTool = true;
    static readonly metadataOutputTypes = {
    output: "str"
  };
  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  @prop({ type: "str", default: "", title: "Data", description: "The data to send in the POST request." })
  declare data: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const data = String(inputs.data ?? this.data ?? "");
    const res = await fetchResponse(this.readUrl(inputs), { method: "POST", body: data });
    return { output: await res.text() };
  }
}

export class PutRequestLibNode extends HTTPBaseLibNode {
  static readonly nodeType = "lib.http.PutRequest";
      static readonly title = "PUT Request";
      static readonly description = "Update existing resources on a server using an HTTP PUT request.\n    http, put, request, url, data\n\n    Use cases:\n    - Update user profiles\n    - Modify existing API resources\n    - Replace file contents\n    - Set configuration values";
    static readonly basicFields = [
  "url"
];
    static readonly exposeAsTool = true;
    static readonly metadataOutputTypes = {
    output: "str"
  };
  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  @prop({ type: "str", default: "", title: "Data", description: "The data to send in the PUT request." })
  declare data: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const data = String(inputs.data ?? this.data ?? "");
    const res = await fetchResponse(this.readUrl(inputs), { method: "PUT", body: data });
    return { output: await res.text() };
  }
}

export class DeleteRequestLibNode extends HTTPBaseLibNode {
  static readonly nodeType = "lib.http.DeleteRequest";
      static readonly title = "DELETE Request";
      static readonly description = "Remove a resource from a server using an HTTP DELETE request.\n    http, delete, request, url\n\n    Use cases:\n    - Delete user accounts\n    - Remove API resources\n    - Cancel subscriptions\n    - Clear cache entries";
    static readonly exposeAsTool = true;
    static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetchResponse(this.readUrl(inputs), { method: "DELETE" });
    return { output: await res.text() };
  }
}

export class HeadRequestLibNode extends HTTPBaseLibNode {
  static readonly nodeType = "lib.http.HeadRequest";
      static readonly title = "HEAD Request";
      static readonly description = "Retrieve headers from a resource using an HTTP HEAD request.\n    http, head, request, url\n\n    Use cases:\n    - Check resource existence\n    - Get metadata without downloading content\n    - Verify authentication or permissions";
    static readonly metadataOutputTypes = {
    output: "dict[str, str]"
  };

  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetchResponse(this.readUrl(inputs), { method: "HEAD", redirect: "follow" });
    const out: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      out[k] = v;
    });
    return { output: out };
  }
}

export class FetchPageLibNode extends BaseNode {
  static readonly nodeType = "lib.http.FetchPage";
            static readonly title = "Fetch Page";
            static readonly description = "Fetch a web page using Selenium and return its content.\n    selenium, fetch, webpage, http\n\n    Use cases:\n    - Retrieve content from dynamic websites\n    - Capture JavaScript-rendered content\n    - Interact with web applications";
        static readonly metadataOutputTypes = {
    html: "str",
    success: "bool",
    error_message: "str"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "", title: "Url", description: "The URL to fetch the page from." })
  declare url: any;

  @prop({ type: "int", default: 10, title: "Wait Time", description: "Maximum time to wait for page load (in seconds)." })
  declare wait_time: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = String(inputs.url ?? this.url ?? "");
    try {
      const res = await fetchResponse(url);
      return { html: await res.text(), success: true, error_message: null };
    } catch (error) {
      return { html: "", success: false, error_message: String(error) };
    }
  }
}

export class ImageDownloaderLibNode extends BaseNode {
  static readonly nodeType = "lib.http.ImageDownloader";
            static readonly title = "Image Downloader";
            static readonly description = "Download images from list of URLs and return a list of ImageRefs.\n    image download, web scraping, data processing\n\n    Use cases:\n    - Prepare image datasets for machine learning tasks\n    - Archive images from web pages\n    - Process and analyze images extracted from websites";
        static readonly metadataOutputTypes = {
    images: "list[image]",
    failed_urls: "list[str]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "list[str]", default: [], title: "Images", description: "List of image URLs to download." })
  declare images: any;

  @prop({ type: "str", default: "", title: "Base Url", description: "Base URL to prepend to relative image URLs." })
  declare base_url: any;

  @prop({ type: "int", default: 10, title: "Max Concurrent Downloads", description: "Maximum number of concurrent image downloads." })
  declare max_concurrent_downloads: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const images = Array.isArray(inputs.images ?? this.images)
      ? ((inputs.images ?? this.images ?? []) as unknown[]).map(String)
      : [];
    const baseUrl = String(inputs.base_url ?? this.base_url ?? "");
    const urls = images.map((u) => new URL(u, baseUrl || undefined).toString());

    const downloaded: Record<string, unknown>[] = [];
    const failedUrls: string[] = [];

    await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetchResponse(url);
          if (!res.ok) {
            failedUrls.push(url);
            return;
          }
          const bytes = new Uint8Array(await res.arrayBuffer());
          downloaded.push(imageRefFromBytes(bytes, url));
        } catch {
          failedUrls.push(url);
        }
      })
    );

    return { images: downloaded, failed_urls: failedUrls };
  }
}

export class GetRequestBinaryLibNode extends HTTPBaseLibNode {
  static readonly nodeType = "lib.http.GetRequestBinary";
      static readonly title = "GET Binary";
      static readonly description = "Perform an HTTP GET request and return raw binary data.\n    http, get, request, url, binary, download\n\n    Use cases:\n    - Download binary files\n    - Fetch images or media\n    - Retrieve PDF documents\n    - Download any non-text content";
    static readonly exposeAsTool = true;
    static readonly metadataOutputTypes = {
    output: "bytes"
  };

  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetchResponse(this.readUrl(inputs));
    return { output: base64FromBytes(new Uint8Array(await res.arrayBuffer())) };
  }
}

export class GetRequestDocumentLibNode extends HTTPBaseLibNode {
  static readonly nodeType = "lib.http.GetRequestDocument";
      static readonly title = "GET Document";
      static readonly description = "Perform an HTTP GET request and return a document\n    http, get, request, url, document\n\n    Use cases:\n    - Download PDF documents\n    - Retrieve Word documents\n    - Fetch Excel files\n    - Download any document format";
    static readonly exposeAsTool = true;
    static readonly metadataOutputTypes = {
    output: "document"
  };

  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = this.readUrl(inputs);
    const res = await fetchResponse(url);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { output: documentRefFromBytes(bytes, url) };
  }
}

export class PostRequestBinaryLibNode extends HTTPBaseLibNode {
  static readonly nodeType = "lib.http.PostRequestBinary";
      static readonly title = "POST Binary";
      static readonly description = "Send data using an HTTP POST request and return raw binary data.\n    http, post, request, url, data, binary\n\n    Use cases:\n    - Upload and receive binary files\n    - Interact with binary APIs\n    - Process image or media uploads\n    - Handle binary file transformations";
    static readonly basicFields = [
  "url"
];
    static readonly exposeAsTool = true;
    static readonly metadataOutputTypes = {
    output: "bytes"
  };
  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  @prop({ type: "union[str, bytes]", default: "", title: "Data", description: "The data to send in the POST request. Can be string or binary." })
  declare data: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const data = inputs.data ?? this.data ?? "";
    const body = typeof data === "string" ? data : JSON.stringify(data);
    const res = await fetchResponse(this.readUrl(inputs), { method: "POST", body });
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { output: base64FromBytes(bytes) };
  }
}

export class DownloadDataframeLibNode extends HTTPBaseLibNode {
  static readonly nodeType = "lib.http.DownloadDataframe";
      static readonly title = "Download Dataframe";
      static readonly description = "Download data from a URL and return as a dataframe.\n    http, get, request, url, dataframe, csv, json, data\n\n    Use cases:\n    - Download CSV data and convert to dataframe\n    - Fetch JSON data and convert to dataframe\n    - Retrieve tabular data from APIs\n    - Process data files from URLs";
    static readonly basicFields = [
  "url",
  "columns",
  "file_format"
];
    static readonly exposeAsTool = true;
    static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  @prop({ type: "enum", default: "csv", title: "File Format", description: "The format of the data file (csv, json, tsv).", values: [
  "csv",
  "json",
  "tsv"
] })
  declare file_format: any;

  @prop({ type: "record_type", default: {
  "type": "record_type",
  "columns": []
}, title: "Columns", description: "The columns of the dataframe." })
  declare columns: any;

  @prop({ type: "str", default: "utf-8", title: "Encoding", description: "The encoding of the text file." })
  declare encoding: any;

  @prop({ type: "str", default: ",", title: "Delimiter", description: "The delimiter for CSV/TSV files." })
  declare delimiter: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = this.readUrl(inputs);
    const fileFormat = String(inputs.file_format ?? this.file_format ?? "csv");
    const delimiter = String(inputs.delimiter ?? this.delimiter ?? ",");
    const columnsObj = (inputs.columns ?? this.columns ?? { columns: [] }) as {
      columns?: Array<{ name: string; data_type: string }>;
    };
    const targetColumns = columnsObj.columns ?? [];

    const res = await fetchResponse(url);
    ensureOk(res);
    const content = await res.text();

    if (targetColumns.length === 0) {
      return { output: { rows: [] as Array<Record<string, unknown>> } };
    }

    const mapRows = (headers: string[], rows: unknown[][]): Array<Record<string, unknown>> => {
      const idx = new Map(headers.map((h, i) => [h, i]));
      return rows.map((row) => {
        const out: Record<string, unknown> = {};
        for (const col of targetColumns) {
          const i = idx.get(col.name);
          const raw = i === undefined ? null : row[i];
          out[col.name] = castValue(raw, col.data_type);
        }
        return out;
      });
    };

    if (fileFormat === "csv" || fileFormat === "tsv") {
      const d = fileFormat === "tsv" ? "\t" : delimiter;
      const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
      if (lines.length === 0) throw new Error(`No data found in ${fileFormat.toUpperCase()}`);
      const headers = lines[0].split(d);
      const rows = lines.slice(1).map((line) => line.split(d));
      return { output: { rows: mapRows(headers, rows) } };
    }

    if (fileFormat === "json") {
      const parsed = JSON.parse(content) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("No data found or data is not a list of records in JSON");
      }
      if (typeof parsed[0] === "object" && parsed[0] !== null && !Array.isArray(parsed[0])) {
        const headers = Object.keys(parsed[0] as Record<string, unknown>);
        const rows = parsed.map((item) => headers.map((h) => (item as Record<string, unknown>)[h]));
        return { output: { rows: mapRows(headers, rows) } };
      }
      if (Array.isArray(parsed[0])) {
        const headers = (parsed[0] as unknown[]).map(String);
        const rows = (parsed as unknown[]).slice(1) as unknown[][];
        return { output: { rows: mapRows(headers, rows) } };
      }
      throw new Error("JSON data is a list, but items are not dictionaries or lists.");
    }

    throw new Error(`Unsupported file format: ${fileFormat}`);
  }
}

export class FilterValidURLsLibNode extends HTTPBaseLibNode {
  static readonly nodeType = "lib.http.FilterValidURLs";
      static readonly title = "Filter Valid URLs";
      static readonly description = "Filter a list of URLs by checking their validity using HEAD requests.\n    url validation, http, head request\n\n    Use cases:\n    - Clean URL lists by removing broken links\n    - Verify resource availability\n    - Validate website URLs before processing";
    static readonly basicFields = [
  "url"
];
    static readonly metadataOutputTypes = {
    output: "list[str]"
  };
  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  @prop({ type: "list[str]", default: [], title: "Urls", description: "List of URLs to validate." })
  declare urls: any;

  @prop({ type: "int", default: 10, title: "Max Concurrent Requests", description: "Maximum number of concurrent HEAD requests." })
  declare max_concurrent_requests: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const urls = Array.isArray(inputs.urls ?? this.urls)
      ? ((inputs.urls ?? this.urls ?? []) as unknown[]).map(String)
      : [];

    const valid: string[] = [];
    await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetchResponse(url, { method: "HEAD", redirect: "follow" });
          if (res.status >= 200 && res.status < 400) valid.push(url);
        } catch {
          // ignore invalid url
        }
      })
    );

    return { output: valid };
  }
}

export class DownloadFilesLibNode extends BaseNode {
  static readonly nodeType = "lib.http.DownloadFiles";
            static readonly title = "Download Files";
            static readonly description = "Download files from a list of URLs into a local folder.\n    download, files, urls, batch\n\n    Use cases:\n    - Batch download files from multiple URLs\n    - Create local copies of remote resources\n    - Archive web content\n    - Download datasets";
        static readonly metadataOutputTypes = {
    success: "list[str]",
    failed: "list[str]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "list[str]", default: [], title: "Urls", description: "List of URLs to download." })
  declare urls: any;

  @prop({ type: "str", default: "downloads", title: "Output Folder", description: "Local folder path where files will be saved." })
  declare output_folder: any;

  @prop({ type: "int", default: 5, title: "Max Concurrent Downloads", description: "Maximum number of concurrent downloads." })
  declare max_concurrent_downloads: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const urls = Array.isArray(inputs.urls ?? this.urls)
      ? ((inputs.urls ?? this.urls ?? []) as unknown[]).map(String)
      : [];
    const outputFolder = String(inputs.output_folder ?? this.output_folder ?? "downloads");
    const expandedFolder = outputFolder.startsWith("~/")
      ? path.join(process.env.HOME ?? "", outputFolder.slice(2))
      : outputFolder;
    await fs.mkdir(expandedFolder, { recursive: true });

    const success: string[] = [];
    const failed: string[] = [];

    await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetchResponse(url);
          if (!res.ok) {
            failed.push(url);
            return;
          }
          const contentDisposition = res.headers.get("content-disposition") ?? "";
          let filename = "";
          const idx = contentDisposition.toLowerCase().indexOf("filename=");
          if (idx >= 0) {
            filename = contentDisposition.slice(idx + "filename=".length).trim().replace(/^"|"$/g, "");
          }
          if (!filename) {
            filename = url.split("/").pop() || "unnamed_file";
          }
          const full = path.join(expandedFolder, filename);
          const bytes = new Uint8Array(await res.arrayBuffer());
          await fs.writeFile(full, bytes);
          success.push(full);
        } catch {
          failed.push(url);
        }
      })
    );

    return { success, failed };
  }
}

abstract class JSONRequestBaseLibNode extends HTTPBaseLibNode {
  @prop({ type: "str", default: "" })
  declare url: any;

  @prop({ type: "dict", default: {} })
  declare data: any;



  protected payload(inputs: Record<string, unknown>): Record<string, unknown> {
    const data = inputs.data ?? this.data ?? {};
    return data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  }
}

export class JSONPostRequestLibNode extends JSONRequestBaseLibNode {
  static readonly nodeType = "lib.http.JSONPostRequest";
      static readonly title = "POST JSON";
      static readonly description = "Send JSON data to a server using an HTTP POST request.\n    http, post, request, url, json, api\n\n    Use cases:\n    - Send structured data to REST APIs\n    - Create resources with JSON payloads\n    - Interface with modern web services";
    static readonly basicFields = [
  "url"
];
    static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  @prop({ type: "dict", default: {}, title: "Data", description: "The JSON data to send in the POST request." })
  declare data: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetchResponse(this.readUrl(inputs), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.payload(inputs)),
    });
    return { output: (await res.json()) as Record<string, unknown> };
  }
}

export class JSONPutRequestLibNode extends JSONRequestBaseLibNode {
  static readonly nodeType = "lib.http.JSONPutRequest";
      static readonly title = "PUT JSON";
      static readonly description = "Update resources with JSON data using an HTTP PUT request.\n    http, put, request, url, json, api\n\n    Use cases:\n    - Update existing API resources\n    - Replace complete objects in REST APIs\n    - Set configuration with JSON data";
    static readonly basicFields = [
  "url"
];
    static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  @prop({ type: "dict", default: {}, title: "Data", description: "The JSON data to send in the PUT request." })
  declare data: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetchResponse(this.readUrl(inputs), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.payload(inputs)),
    });
    return { output: (await res.json()) as Record<string, unknown> };
  }
}

export class JSONPatchRequestLibNode extends JSONRequestBaseLibNode {
  static readonly nodeType = "lib.http.JSONPatchRequest";
      static readonly title = "PATCH JSON";
      static readonly description = "Partially update resources with JSON data using an HTTP PATCH request.\n    http, patch, request, url, json, api\n\n    Use cases:\n    - Partial updates to API resources\n    - Modify specific fields without full replacement\n    - Efficient updates for large objects";
    static readonly basicFields = [
  "url"
];
    static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  @prop({ type: "dict", default: {}, title: "Data", description: "The JSON data to send in the PATCH request." })
  declare data: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetchResponse(this.readUrl(inputs), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.payload(inputs)),
    });
    return { output: (await res.json()) as Record<string, unknown> };
  }
}

export class JSONGetRequestLibNode extends HTTPBaseLibNode {
  static readonly nodeType = "lib.http.JSONGetRequest";
      static readonly title = "GET JSON";
      static readonly description = "Perform an HTTP GET request and parse the response as JSON.\n    http, get, request, url, json, api\n\n    Use cases:\n    - Fetch data from REST APIs\n    - Retrieve JSON-formatted responses\n    - Interface with JSON web services";
    static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({ type: "str", default: "", title: "Url", description: "The URL to make the request to." })
  declare url: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetchResponse(this.readUrl(inputs), {
      headers: { Accept: "application/json" },
    });
    return { output: (await res.json()) as Record<string, unknown> };
  }
}

export const LIB_HTTP_NODES = [
  GetRequestLibNode,
  PostRequestLibNode,
  PutRequestLibNode,
  DeleteRequestLibNode,
  HeadRequestLibNode,
  FetchPageLibNode,
  ImageDownloaderLibNode,
  GetRequestBinaryLibNode,
  GetRequestDocumentLibNode,
  PostRequestBinaryLibNode,
  DownloadDataframeLibNode,
  FilterValidURLsLibNode,
  DownloadFilesLibNode,
  JSONPostRequestLibNode,
  JSONPutRequestLibNode,
  JSONPatchRequestLibNode,
  JSONGetRequestLibNode,
] as const;
