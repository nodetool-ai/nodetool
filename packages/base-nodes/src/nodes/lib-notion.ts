import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

function notionHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
  };
}

function getNotionToken(secrets: Record<string, string>): string {
  const token = secrets.NOTION_API_KEY || process.env.NOTION_API_KEY || "";
  if (!token) {
    throw new Error(
      "Notion API key is required. Set NOTION_API_KEY in secrets or environment."
    );
  }
  return token;
}

/**
 * Fetch all children of a block, following pagination cursors.
 * Recursively fetches children of blocks that have_children.
 */
async function fetchAllChildren(
  blockId: string,
  token: string,
  pageSize: number,
  maxDepth = 3
): Promise<Record<string, unknown>[]> {
  const allBlocks: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({
      page_size: String(pageSize)
    });
    if (cursor) params.set("start_cursor", cursor);

    const res = await fetch(
      `https://api.notion.com/v1/blocks/${blockId}/children?${params}`,
      { method: "GET", headers: notionHeaders(token) }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Notion get page content failed (${res.status}): ${text}`
      );
    }
    const data = (await res.json()) as {
      results: Record<string, unknown>[];
      has_more: boolean;
      next_cursor: string | null;
    };
    const blocks = data.results ?? [];

    for (const block of blocks) {
      allBlocks.push(block);
      if (maxDepth > 0 && block.has_children) {
        const children = await fetchAllChildren(
          block.id as string,
          token,
          pageSize,
          maxDepth - 1
        );
        (block as Record<string, unknown>).children = children;
      }
    }

    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return allBlocks;
}

function parseJsonProp(value: string, label: string): unknown {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`Invalid JSON for ${label}: ${trimmed}`);
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export class NotionSearchLibNode extends BaseNode {
  static readonly nodeType = "lib.notion.Search";
  static readonly title = "Notion Search";
  static readonly description =
    "Search across all pages and databases the Notion integration has access to.\n    notion, search, pages, databases, api";
  static readonly metadataOutputTypes = {
    result: "dict",
    results: "list"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = ["NOTION_API_KEY"];
  static readonly isStreamingOutput = true;

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "Search query string"
  })
  declare query: any;

  @prop({
    type: "str",
    default: "",
    title: "Filter Type",
    description:
      'Filter by object type: "page", "database", or empty for all'
  })
  declare filter_type: any;

  @prop({
    type: "str",
    default: "descending",
    title: "Sort Direction",
    description: 'Sort direction: "ascending" or "descending"'
  })
  declare sort_direction: any;

  @prop({
    type: "int",
    default: 10,
    title: "Page Size",
    description: "Number of results to return (max 100)"
  })
  declare page_size: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getNotionToken(this._secrets);
    const query = String(this.query ?? "");
    const filterType = String(this.filter_type ?? "");
    const sortDirection = String(this.sort_direction ?? "descending");
    const pageSize = Math.min(Math.max(Number(this.page_size ?? 10), 1), 100);

    const body: Record<string, unknown> = {
      query,
      page_size: pageSize,
      sort: {
        direction: sortDirection,
        timestamp: "last_edited_time"
      }
    };

    if (filterType === "page" || filterType === "database") {
      body.filter = { value: filterType, property: "object" };
    }

    const res = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion search failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { results: Record<string, unknown>[] };
    const results = data.results ?? [];

    return { result: results[0] ?? {}, results };
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const token = getNotionToken(this._secrets);
    const query = String(this.query ?? "");
    const filterType = String(this.filter_type ?? "");
    const sortDirection = String(this.sort_direction ?? "descending");
    const pageSize = Math.min(Math.max(Number(this.page_size ?? 10), 1), 100);

    const body: Record<string, unknown> = {
      query,
      page_size: pageSize,
      sort: {
        direction: sortDirection,
        timestamp: "last_edited_time"
      }
    };

    if (filterType === "page" || filterType === "database") {
      body.filter = { value: filterType, property: "object" };
    }

    const res = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion search failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { results: Record<string, unknown>[] };
    const results = data.results ?? [];

    for (const result of results) {
      yield { result };
    }

    yield { results };
  }
}

// ---------------------------------------------------------------------------
// Get Page
// ---------------------------------------------------------------------------

export class NotionGetPageLibNode extends BaseNode {
  static readonly nodeType = "lib.notion.GetPage";
  static readonly title = "Notion Get Page";
  static readonly description =
    "Retrieve a Notion page and its properties.\n    notion, page, get, read, api";
  static readonly metadataOutputTypes = {
    output: "dict"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = ["NOTION_API_KEY"];

  @prop({
    type: "str",
    default: "",
    title: "Page ID",
    description: "The ID of the Notion page to retrieve"
  })
  declare page_id: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getNotionToken(this._secrets);
    const pageId = String(this.page_id ?? "").trim();

    if (!pageId) throw new Error("page_id is required");

    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "GET",
      headers: notionHeaders(token)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion get page failed (${res.status}): ${text}`);
    }

    const page = (await res.json()) as Record<string, unknown>;

    return {
      output: {
        id: page.id,
        title: extractPageTitle(page),
        properties: page.properties,
        url: page.url,
        created_time: page.created_time,
        last_edited_time: page.last_edited_time
      }
    };
  }
}

function extractPageTitle(page: Record<string, unknown>): string {
  const properties = page.properties as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!properties) return "";
  for (const value of Object.values(properties)) {
    if (value.type === "title") {
      const titleArr = value.title as Array<{ plain_text?: string }> | undefined;
      if (titleArr && titleArr.length > 0) {
        return titleArr.map((t) => t.plain_text ?? "").join("");
      }
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Get Page Content
// ---------------------------------------------------------------------------

export class NotionGetPageContentLibNode extends BaseNode {
  static readonly nodeType = "lib.notion.GetPageContent";
  static readonly title = "Notion Get Page Content";
  static readonly description =
    "Retrieve all blocks (content) of a Notion page.\n    notion, page, content, blocks, read, api";
  static readonly metadataOutputTypes = {
    block: "dict",
    blocks: "list"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = ["NOTION_API_KEY"];
  static readonly isStreamingOutput = true;

  @prop({
    type: "str",
    default: "",
    title: "Page ID",
    description: "The ID of the Notion page"
  })
  declare page_id: any;

  @prop({
    type: "int",
    default: 100,
    title: "Page Size",
    description: "Number of blocks to retrieve (max 100)"
  })
  declare page_size: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getNotionToken(this._secrets);
    const pageId = String(this.page_id ?? "").trim();
    const pageSize = Math.min(Math.max(Number(this.page_size ?? 100), 1), 100);

    if (!pageId) throw new Error("page_id is required");

    const blocks = await fetchAllChildren(pageId, token, pageSize);

    return { block: blocks[0] ?? {}, blocks };
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const token = getNotionToken(this._secrets);
    const pageId = String(this.page_id ?? "").trim();
    const pageSize = Math.min(Math.max(Number(this.page_size ?? 100), 1), 100);

    if (!pageId) throw new Error("page_id is required");

    const blocks = await fetchAllChildren(pageId, token, pageSize);

    for (const block of blocks) {
      yield { block };
    }

    yield { blocks };
  }
}

// ---------------------------------------------------------------------------
// Create Page
// ---------------------------------------------------------------------------

export class NotionCreatePageLibNode extends BaseNode {
  static readonly nodeType = "lib.notion.CreatePage";
  static readonly title = "Notion Create Page";
  static readonly description =
    "Create a new page in a Notion database or as a child of another page.\n    notion, page, create, add, api";
  static readonly metadataOutputTypes = {
    output: "dict"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = ["NOTION_API_KEY"];

  @prop({
    type: "str",
    default: "",
    title: "Parent ID",
    description: "The ID of the parent database or page"
  })
  declare parent_id: any;

  @prop({
    type: "str",
    default: "database_id",
    title: "Parent Type",
    description: 'Type of parent: "database_id" or "page_id"'
  })
  declare parent_type: any;

  @prop({
    type: "str",
    default: "",
    title: "Title",
    description: "Title of the new page"
  })
  declare title: any;

  @prop({
    type: "str",
    default: "Name",
    title: "Title Property",
    description:
      "Name of the database title column (default: Name). Only used for database parents."
  })
  declare title_property: any;

  @prop({
    type: "str",
    default: "",
    title: "Properties JSON",
    description:
      "Optional extra properties as a JSON object (merged with title)"
  })
  declare properties_json: any;

  @prop({
    type: "str",
    default: "",
    title: "Content JSON",
    description: "Optional children blocks as a JSON array"
  })
  declare content_json: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getNotionToken(this._secrets);
    const parentId = String(this.parent_id ?? "").trim();
    const parentType = String(this.parent_type ?? "database_id");
    const title = String(this.title ?? "");
    const titleProperty = String(this.title_property ?? "Name") || "Name";
    const propertiesJsonStr = String(this.properties_json ?? "");
    const contentJsonStr = String(this.content_json ?? "");

    if (!parentId) throw new Error("parent_id is required");
    if (parentType !== "database_id" && parentType !== "page_id") {
      throw new Error('parent_type must be "database_id" or "page_id"');
    }

    const extraProperties = propertiesJsonStr
      ? (parseJsonProp(propertiesJsonStr, "properties_json") as Record<
          string,
          unknown
        >)
      : {};

    const children = contentJsonStr
      ? (parseJsonProp(contentJsonStr, "content_json") as unknown[])
      : undefined;

    const properties: Record<string, unknown> = {
      ...extraProperties
    };

    if (title) {
      if (parentType === "database_id") {
        // Database parents require the title under the actual column name
        properties[titleProperty] = {
          title: [{ text: { content: title } }]
        };
      } else {
        // Page parents use the raw title property
        properties.title = [{ text: { content: title } }];
      }
    }

    const body: Record<string, unknown> = {
      parent: { [parentType]: parentId },
      properties
    };

    if (children && Array.isArray(children) && children.length > 0) {
      body.children = children;
    }

    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion create page failed (${res.status}): ${text}`);
    }

    const page = (await res.json()) as Record<string, unknown>;

    return {
      output: {
        id: page.id,
        url: page.url
      }
    };
  }
}

// ---------------------------------------------------------------------------
// Update Page
// ---------------------------------------------------------------------------

export class NotionUpdatePageLibNode extends BaseNode {
  static readonly nodeType = "lib.notion.UpdatePage";
  static readonly title = "Notion Update Page";
  static readonly description =
    "Update properties of an existing Notion page.\n    notion, page, update, edit, modify, api";
  static readonly metadataOutputTypes = {
    output: "dict"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = ["NOTION_API_KEY"];

  @prop({
    type: "str",
    default: "",
    title: "Page ID",
    description: "The ID of the page to update"
  })
  declare page_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Properties JSON",
    description: "JSON object of properties to update"
  })
  declare properties_json: any;

  @prop({
    type: "bool",
    default: false,
    title: "Archived",
    description: "Set to true to archive (soft-delete) the page"
  })
  declare archived: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getNotionToken(this._secrets);
    const pageId = String(this.page_id ?? "").trim();
    const propertiesJsonStr = String(this.properties_json ?? "");
    const archived = Boolean(this.archived ?? false);

    if (!pageId) throw new Error("page_id is required");

    const properties = propertiesJsonStr
      ? (parseJsonProp(propertiesJsonStr, "properties_json") as Record<
          string,
          unknown
        >)
      : undefined;

    const body: Record<string, unknown> = {};
    if (properties) {
      body.properties = properties;
    }
    if (archived) {
      body.archived = true;
    }

    if (Object.keys(body).length === 0) {
      throw new Error(
        "At least one of properties_json or archived must be provided"
      );
    }

    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: notionHeaders(token),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion update page failed (${res.status}): ${text}`);
    }

    const page = (await res.json()) as Record<string, unknown>;

    return {
      output: {
        id: page.id,
        url: page.url,
        last_edited_time: page.last_edited_time
      }
    };
  }
}

// ---------------------------------------------------------------------------
// Query Database
// ---------------------------------------------------------------------------

export class NotionQueryDatabaseLibNode extends BaseNode {
  static readonly nodeType = "lib.notion.QueryDatabase";
  static readonly title = "Notion Query Database";
  static readonly description =
    "Query a Notion database with optional filter and sort.\n    notion, database, query, filter, sort, api";
  static readonly metadataOutputTypes = {
    result: "dict",
    results: "list"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = ["NOTION_API_KEY"];
  static readonly isStreamingOutput = true;

  @prop({
    type: "str",
    default: "",
    title: "Database ID",
    description: "The ID of the Notion database to query"
  })
  declare database_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Filter JSON",
    description: "Optional Notion filter object as JSON"
  })
  declare filter_json: any;

  @prop({
    type: "str",
    default: "",
    title: "Sort JSON",
    description:
      "Optional Notion sorts array as JSON (array of sort objects)"
  })
  declare sort_json: any;

  @prop({
    type: "int",
    default: 100,
    title: "Page Size",
    description: "Number of results to return (max 100)"
  })
  declare page_size: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getNotionToken(this._secrets);
    const databaseId = String(this.database_id ?? "").trim();
    const filterJsonStr = String(this.filter_json ?? "");
    const sortJsonStr = String(this.sort_json ?? "");
    const pageSize = Math.min(Math.max(Number(this.page_size ?? 100), 1), 100);

    if (!databaseId) throw new Error("database_id is required");

    const body: Record<string, unknown> = {
      page_size: pageSize
    };

    if (filterJsonStr.trim()) {
      body.filter = parseJsonProp(filterJsonStr, "filter_json");
    }

    if (sortJsonStr.trim()) {
      body.sorts = parseJsonProp(sortJsonStr, "sort_json");
    }

    const res = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: "POST",
        headers: notionHeaders(token),
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Notion query database failed (${res.status}): ${text}`
      );
    }

    const data = (await res.json()) as { results: Record<string, unknown>[] };
    const results = data.results ?? [];

    return { result: results[0] ?? {}, results };
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const token = getNotionToken(this._secrets);
    const databaseId = String(this.database_id ?? "").trim();
    const filterJsonStr = String(this.filter_json ?? "");
    const sortJsonStr = String(this.sort_json ?? "");
    const pageSize = Math.min(Math.max(Number(this.page_size ?? 100), 1), 100);

    if (!databaseId) throw new Error("database_id is required");

    const body: Record<string, unknown> = {
      page_size: pageSize
    };

    if (filterJsonStr.trim()) {
      body.filter = parseJsonProp(filterJsonStr, "filter_json");
    }

    if (sortJsonStr.trim()) {
      body.sorts = parseJsonProp(sortJsonStr, "sort_json");
    }

    const res = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: "POST",
        headers: notionHeaders(token),
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Notion query database failed (${res.status}): ${text}`
      );
    }

    const data = (await res.json()) as { results: Record<string, unknown>[] };
    const results = data.results ?? [];

    for (const result of results) {
      yield { result };
    }

    yield { results };
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const LIB_NOTION_NODES: readonly NodeClass[] = [
  NotionSearchLibNode as unknown as NodeClass,
  NotionGetPageLibNode as unknown as NodeClass,
  NotionGetPageContentLibNode as unknown as NodeClass,
  NotionCreatePageLibNode as unknown as NodeClass,
  NotionUpdatePageLibNode as unknown as NodeClass,
  NotionQueryDatabaseLibNode as unknown as NodeClass
];
