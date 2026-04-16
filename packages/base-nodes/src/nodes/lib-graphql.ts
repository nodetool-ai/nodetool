import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

const TIMEOUT = 30000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonProp(input: unknown): Record<string, unknown> {
  if (!input) return {};
  if (typeof input === "string" && input.trim()) {
    try {
      return JSON.parse(input) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof input === "object") return input as Record<string, unknown>;
  return {};
}

async function graphqlFetch(
  url: string,
  body: unknown,
  headers: Record<string, unknown>
): Promise<Response> {
  if (!url) throw new Error("URL is required");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(headers as Record<string, string>)
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export class GraphQLQueryLibNode extends BaseNode {
  static readonly nodeType = "lib.graphql.Query";
  static readonly title = "GraphQL Query";
  static readonly description =
    "Execute a GraphQL query or mutation against any endpoint.\n    graphql, query, mutation, api, post";
  static readonly metadataOutputTypes = {
    data: "any",
    errors: "list",
    status: "int"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Endpoint URL",
    description: "GraphQL API endpoint URL"
  })
  declare url: any;

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "GraphQL query or mutation string"
  })
  declare query: any;

  @prop({
    type: "str",
    default: "",
    title: "Variables JSON",
    description: "Optional JSON object of query variables"
  })
  declare variables: any;

  @prop({
    type: "str",
    default: "",
    title: "Headers JSON",
    description: "Optional JSON object of additional HTTP headers"
  })
  declare headers: any;

  @prop({
    type: "str",
    default: "",
    title: "Operation Name",
    description: "Optional operation name for multi-operation documents"
  })
  declare operation_name: any;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? "");
    const queryStr = String(this.query ?? "");
    const variables = parseJsonProp(this.variables);
    const headers = parseJsonProp(this.headers);
    const operationName = String(this.operation_name ?? "").trim() || undefined;

    const body: Record<string, unknown> = { query: queryStr };
    if (Object.keys(variables).length > 0) {
      body.variables = variables;
    }
    if (operationName) {
      body.operationName = operationName;
    }

    const res = await graphqlFetch(url, body, headers);
    const json = (await res.json()) as Record<string, unknown>;

    return {
      data: json.data ?? null,
      errors: (json.errors as unknown[]) ?? [],
      status: res.status
    };
  }
}

// ---------------------------------------------------------------------------
// Query with Auth
// ---------------------------------------------------------------------------

export class GraphQLQueryWithAuthLibNode extends BaseNode {
  static readonly nodeType = "lib.graphql.QueryWithAuth";
  static readonly title = "GraphQL Query with Auth";
  static readonly description =
    "Execute a GraphQL query or mutation with Bearer token authentication.\n    graphql, query, mutation, api, auth, bearer, token";
  static readonly metadataOutputTypes = {
    data: "any",
    errors: "list",
    status: "int"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = ["GRAPHQL_AUTH_TOKEN"];

  @prop({
    type: "str",
    default: "",
    title: "Endpoint URL",
    description: "GraphQL API endpoint URL"
  })
  declare url: any;

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "GraphQL query or mutation string"
  })
  declare query: any;

  @prop({
    type: "str",
    default: "",
    title: "Variables JSON",
    description: "Optional JSON object of query variables"
  })
  declare variables: any;

  @prop({
    type: "str",
    default: "",
    title: "Headers JSON",
    description: "Optional JSON object of additional HTTP headers"
  })
  declare headers: any;

  @prop({
    type: "str",
    default: "",
    title: "Operation Name",
    description: "Optional operation name for multi-operation documents"
  })
  declare operation_name: any;

  @prop({
    type: "str",
    default: "",
    title: "Auth Token",
    description:
      "Bearer token, falls back to GRAPHQL_AUTH_TOKEN secret"
  })
  declare auth_token: any;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? "");
    const queryStr = String(this.query ?? "");
    const variables = parseJsonProp(this.variables);
    const headers = parseJsonProp(this.headers);
    const operationName = String(this.operation_name ?? "").trim() || undefined;

    const token =
      String(this.auth_token ?? "").trim() ||
      this._secrets["GRAPHQL_AUTH_TOKEN"] ||
      "";
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const body: Record<string, unknown> = { query: queryStr };
    if (Object.keys(variables).length > 0) {
      body.variables = variables;
    }
    if (operationName) {
      body.operationName = operationName;
    }

    const res = await graphqlFetch(url, body, headers);
    const json = (await res.json()) as Record<string, unknown>;

    return {
      data: json.data ?? null,
      errors: (json.errors as unknown[]) ?? [],
      status: res.status
    };
  }
}

// ---------------------------------------------------------------------------
// Introspection
// ---------------------------------------------------------------------------

const INTROSPECTION_QUERY = `{
  __schema {
    types {
      name
      kind
      fields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
          }
        }
      }
    }
    queryType { name }
    mutationType { name }
    subscriptionType { name }
  }
}`;

export class GraphQLIntrospectionLibNode extends BaseNode {
  static readonly nodeType = "lib.graphql.Introspection";
  static readonly title = "GraphQL Introspection";
  static readonly description =
    "Fetch the schema of a GraphQL endpoint via introspection query.\n    graphql, introspection, schema, types, api";
  static readonly metadataOutputTypes = {
    output: "dict"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Endpoint URL",
    description: "GraphQL API endpoint URL"
  })
  declare url: any;

  @prop({
    type: "str",
    default: "",
    title: "Headers JSON",
    description: "Optional JSON object of additional HTTP headers"
  })
  declare headers: any;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? "");
    const headers = parseJsonProp(this.headers);

    const res = await graphqlFetch(
      url,
      { query: INTROSPECTION_QUERY },
      headers
    );
    const json = (await res.json()) as Record<string, unknown>;

    return { output: json };
  }
}

// ---------------------------------------------------------------------------
// Batch Query
// ---------------------------------------------------------------------------

export class GraphQLBatchQueryLibNode extends BaseNode {
  static readonly nodeType = "lib.graphql.BatchQuery";
  static readonly title = "GraphQL Batch Query";
  static readonly description =
    "Execute multiple GraphQL operations in a single batch request.\n    graphql, batch, query, mutation, api, bulk";
  static readonly metadataOutputTypes = {
    output: "list",
    status: "int"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Endpoint URL",
    description: "GraphQL API endpoint URL"
  })
  declare url: any;

  @prop({
    type: "str",
    default: "[]",
    title: "Queries JSON",
    description:
      "JSON array of {query, variables, operationName} objects"
  })
  declare queries_json: any;

  @prop({
    type: "str",
    default: "",
    title: "Headers JSON",
    description: "Optional JSON object of additional HTTP headers"
  })
  declare headers: any;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? "");
    const headers = parseJsonProp(this.headers);
    const raw = String(this.queries_json ?? "[]");

    let queries: unknown[];
    try {
      const parsed = JSON.parse(raw) as unknown;
      queries = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      throw new Error("queries_json must be a valid JSON array");
    }

    const res = await graphqlFetch(url, queries, headers);
    const json = (await res.json()) as unknown;

    const output = Array.isArray(json) ? json : [json];

    return { output, status: res.status };
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const LIB_GRAPHQL_NODES: readonly NodeClass[] = [
  GraphQLQueryLibNode,
  GraphQLQueryWithAuthLibNode,
  GraphQLIntrospectionLibNode,
  GraphQLBatchQueryLibNode
] as const;
