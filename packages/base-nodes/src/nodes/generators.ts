import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  isChunkItem,
  isToolCallItem,
  streamProviderMessages,
  toProviderTools,
  type ToolLike
} from "./agents.js";

type Row = Record<string, unknown>;
type ColumnSpec = { name: string; data_type?: string };
type LanguageModelLike = { provider?: string; id?: string; name?: string };
type BinaryRef = {
  uri?: string;
  data?: Uint8Array | string;
  mimeType?: string;
};
type MessageTextContent = { type: "text"; text: string };
type MessageImageContent = { type: "image"; image: BinaryRef };
type MessageAudioContent = { type: "audio"; audio: BinaryRef };
type MessageContent =
  | MessageTextContent
  | MessageImageContent
  | MessageAudioContent;

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (!value) return "";
  return JSON.stringify(value);
}

function parseRequestedCount(prompt: string, fallback: number): number {
  const m = prompt.match(/\b(\d{1,3})\b/);
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

function parseColumns(input: unknown): string[] {
  return parseColumnSpecs(input).map((column) => column.name);
}

function parseColumnSpecs(input: unknown): ColumnSpec[] {
  if (Array.isArray(input)) {
    return input
      .map((c) => {
        if (c && typeof c === "object") {
          const record = c as {
            name?: unknown;
            data_type?: unknown;
            type?: unknown;
          };
          const name =
            typeof record.name === "string"
              ? record.name
              : String(record.name ?? "");
          const dataType =
            typeof record.data_type === "string"
              ? record.data_type
              : typeof record.type === "string"
                ? record.type
                : undefined;
          return { name, data_type: dataType };
        }
        return { name: String(c) };
      })
      .filter((c) => c.name.length > 0);
  }
  if (input && typeof input === "object") {
    const columns = (input as { columns?: unknown }).columns;
    if (Array.isArray(columns)) return parseColumnSpecs(columns);
  }
  return [];
}

function makeRows(columns: string[], count: number, seedText: string): Row[] {
  const names = columns.length > 0 ? columns : ["value"];
  const rows: Row[] = [];
  for (let i = 0; i < count; i += 1) {
    const row: Row = {};
    for (const col of names) {
      const lower = col.toLowerCase();
      if (lower.includes("id")) row[col] = i + 1;
      else if (lower.includes("name"))
        row[col] = `${seedText || "item"}_${i + 1}`;
      else if (lower.includes("date"))
        row[col] = new Date(Date.now() + i * 86_400_000).toISOString();
      else if (
        lower.includes("price") ||
        lower.includes("amount") ||
        lower.includes("score")
      ) {
        row[col] = Number((10 + i * 1.5).toFixed(2));
      } else if (lower.includes("active") || lower.startsWith("is_")) {
        row[col] = i % 2 === 0;
      } else row[col] = `${seedText || "value"}_${i + 1}`;
    }
    rows.push(row);
  }
  return rows;
}

function buildSchemaFromDynamicOutputs(
  outputs: unknown
): Record<string, unknown> | null {
  if (!outputs || typeof outputs !== "object" || Array.isArray(outputs))
    return null;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, spec] of Object.entries(
    outputs as Record<string, unknown>
  )) {
    required.push(name);
    const value =
      spec && typeof spec === "object" ? (spec as Record<string, unknown>) : {};
    const declared =
      typeof value.type === "string" ? value.type.toLowerCase() : "str";
    let type = "string";
    if (["int", "integer"].includes(declared)) type = "integer";
    else if (["float", "number"].includes(declared)) type = "number";
    else if (["bool", "boolean"].includes(declared)) type = "boolean";
    else if (["list", "array"].includes(declared)) type = "array";
    else if (["dict", "object"].includes(declared)) type = "object";
    properties[name] = { type };
  }
  if (required.length === 0) return null;
  return { type: "object", additionalProperties: false, required, properties };
}

function normalizeBinaryRef(value: unknown): BinaryRef | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const out: BinaryRef = {};
  if (typeof record.uri === "string" && record.uri) out.uri = record.uri;
  if (record.data instanceof Uint8Array || typeof record.data === "string")
    out.data = record.data;
  if (typeof record.mimeType === "string" && record.mimeType)
    out.mimeType = record.mimeType;
  if (typeof record.mime_type === "string" && record.mime_type)
    out.mimeType = record.mime_type;
  return out.uri || out.data ? out : null;
}

function buildMessageContent(
  text: string,
  image: unknown,
  audio: unknown
): string | MessageContent[] {
  const imageRef = normalizeBinaryRef(image);
  const audioRef = normalizeBinaryRef(audio);
  if (!imageRef && !audioRef) return text;
  const parts: MessageContent[] = [{ type: "text", text }];
  if (imageRef) parts.push({ type: "image", image: imageRef });
  if (audioRef) parts.push({ type: "audio", audio: audioRef });
  return parts;
}

function getModelConfig(props: Record<string, unknown>): {
  providerId: string;
  modelId: string;
} {
  const model = ((props.model ?? {}) as LanguageModelLike) ?? {};
  return {
    providerId: typeof model.provider === "string" ? model.provider : "",
    modelId: typeof model.id === "string" ? model.id : ""
  };
}

function hasProviderSupport(
  context: ProcessingContext | undefined,
  providerId: string,
  modelId: string
): context is ProcessingContext & {
  runProviderPrediction: (req: Record<string, unknown>) => Promise<unknown>;
  streamProviderPrediction: (
    req: Record<string, unknown>
  ) => AsyncGenerator<unknown>;
} {
  return (
    !!context &&
    typeof context.runProviderPrediction === "function" &&
    typeof context.streamProviderPrediction === "function" &&
    !!providerId &&
    !!modelId
  );
}

const LIST_GENERATOR_SYSTEM_PROMPT =
  "You generate a list by calling the `add_item` tool exactly once per item. " +
  "Each call submits a single item as a short string. " +
  "Do not output prose, explanations, or markdown — only emit tool calls. " +
  "When the list is complete, stop without calling the tool again.";

function makeAddItemTool(): ToolLike {
  return {
    name: "add_item",
    description:
      "Add one item to the output list. Call this once per item in the list.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["item"],
      properties: {
        item: {
          type: "string",
          description: "The list item content (a single string)."
        }
      }
    },
    process: async (_ctx, params) => {
      const item = asText((params as { item?: unknown })?.item ?? "");
      return { ok: true, item };
    }
  };
}

async function* streamListItemsViaToolCalls(
  context: ProcessingContext,
  providerId: string,
  modelId: string,
  prompt: string,
  maxTokens: number
): AsyncGenerator<string> {
  const provider = await (
    context as ProcessingContext & {
      getProvider: (id: string) => Promise<unknown>;
    }
  ).getProvider(providerId);
  const tool = makeAddItemTool();
  const providerTools = toProviderTools([tool]);

  const messages = [
    { role: "system" as const, content: LIST_GENERATOR_SYSTEM_PROMPT },
    { role: "user" as const, content: prompt }
  ];

  for await (const item of streamProviderMessages(
    provider as Parameters<typeof streamProviderMessages>[0],
    {
      messages,
      model: modelId,
      tools: providerTools,
      maxTokens
    }
  )) {
    if (isToolCallItem(item) && item.name === "add_item") {
      const text = asText(
        (item.args as { item?: unknown })?.item ?? ""
      ).trim();
      if (text) yield text;
    } else if (isChunkItem(item)) {
      // Ignore narrative text — items only come via tool calls.
    }
  }
}

function dataframeFromRows(
  rows: Row[],
  columnsInput: unknown
): Record<string, unknown> {
  const names =
    rows.length > 0
      ? Object.keys(rows[0])
      : parseColumnSpecs(columnsInput).map((s) => s.name);
  return {
    rows,
    columns: names.map((name) => ({ name })),
    data: rows.map((row) => names.map((name) => row[name] ?? null))
  };
}

function parseCsv(text: string, specs: ColumnSpec[]): Row[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("```"));
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cells =
      line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ??
      line.split(",");
    const row: Row = {};
    header.forEach((name, i) => {
      const raw = (cells[i] ?? "").trim().replace(/^"|"$/g, "");
      const spec = specs.find((s) => s.name === name);
      const kind = (spec?.data_type ?? "").toLowerCase();
      if (kind === "int" || kind === "integer") {
        const n = Number.parseInt(raw, 10);
        row[name] = Number.isFinite(n) ? n : raw;
      } else if (kind === "float" || kind === "number") {
        const n = Number.parseFloat(raw);
        row[name] = Number.isFinite(n) ? n : raw;
      } else {
        row[name] = raw;
      }
    });
    return row;
  });
}

async function generateDataframeFromCsv(
  context: ProcessingContext & {
    runProviderPrediction: (req: Record<string, unknown>) => Promise<unknown>;
  },
  providerId: string,
  modelId: string,
  prompt: string,
  columnsInput: unknown,
  count: number,
  maxTokens: number
): Promise<Row[]> {
  const specs = parseColumnSpecs(columnsInput);
  const columnHint =
    specs.length > 0
      ? `Use exactly these columns: ${specs.map((s) => s.name).join(", ")}.`
      : "Choose appropriate columns for the data.";
  const systemPrompt = `You are a data generator. Return ONLY a CSV with a header row and exactly ${count} data rows. No explanation, no markdown fences, no extra text. ${columnHint}`;
  const result = await context.runProviderPrediction({
    provider: providerId,
    capability: "generate_message",
    model: modelId,
    params: {
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      max_tokens: maxTokens
    }
  });
  const content = asText((result as { content?: unknown }).content ?? result);
  return parseCsv(content, specs);
}

export class StructuredOutputGeneratorNode extends BaseNode {
  static readonly nodeType = "nodetool.generators.StructuredOutputGenerator";
  static readonly title = "Structured Output Generator";
  static readonly description =
    "Generate structured JSON objects from instructions using LLM providers.\n    data-generation, structured-data, json, synthesis\n\n    Specialized for creating structured information:\n    - Generating JSON that follows dynamic schemas\n    - Fabricating records from requirements and guidance\n    - Simulating sample data for downstream workflows\n    - Producing consistent structured outputs for testing";
  static readonly basicFields = ["instructions", "context", "model"];
  static readonly supportsDynamicOutputs = true;

  @prop({
    type: "str",
    default:
      "\nYou are a structured data generator focused on JSON outputs.\n\nGoal\n- Produce a high-quality JSON object that matches <JSON_SCHEMA> using the guidance in <INSTRUCTIONS> and any supplemental <CONTEXT>.\n\nOutput format (MANDATORY)\n- Output exactly ONE fenced code block labeled json containing ONLY the JSON object:\n\n  ```json\n  { ...single JSON object matching <JSON_SCHEMA>... }\n  ```\n\n- No additional prose before or after the block.\n\nGeneration rules\n- Invent plausible, internally consistent values when not explicitly provided.\n- Honor all constraints from <JSON_SCHEMA> (types, enums, ranges, formats).\n- Prefer ISO 8601 for dates/times when applicable.\n- Ensure numbers respect reasonable magnitudes and relationships described in <INSTRUCTIONS>.\n- Avoid referencing external sources; rely solely on the provided guidance.\n\nValidation\n- Ensure the final JSON validates against <JSON_SCHEMA> exactly.\n",
    title: "System Prompt",
    description: "The system prompt guiding JSON generation."
  })
  declare system_prompt: any;

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model to use for structured generation."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Instructions",
    description: "Detailed instructions for the structured output."
  })
  declare instructions: any;

  @prop({
    type: "str",
    default: "",
    title: "Context",
    description: "Optional context to ground the generation."
  })
  declare context: any;

  @prop({
    type: "int",
    default: 4096,
    title: "Max Tokens",
    description: "The maximum number of tokens to generate.",
    min: 1,
    max: 16384
  })
  declare max_tokens: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Optional image to include in the generation request."
  })
  declare image: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Optional audio to include in the generation request."
  })
  declare audio: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const { providerId, modelId } = getModelConfig(this.serialize());
    const schema = buildSchemaFromDynamicOutputs(
      (this as any)._dynamic_outputs
    );
    if (schema && hasProviderSupport(context, providerId, modelId)) {
      const instructions = asText(this.instructions ?? this.instructions ?? "");
      const extraContext = asText(this.context ?? this.context ?? "");
      const systemPrompt = asText(this.system_prompt ?? "");
      const userText = [instructions, extraContext]
        .filter(Boolean)
        .join("\n\n");
      const messages: Array<{ role: string; content: unknown }> = [];
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      messages.push({
        role: "user",
        content: buildMessageContent(userText, this.image, this.audio)
      });
      const result = await context.runProviderPrediction({
        provider: providerId,
        capability: "generate_message",
        model: modelId,
        params: {
          model: modelId,
          messages,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "structured_output",
              schema
            }
          }
        }
      });
      if (
        result &&
        typeof result === "object" &&
        "content" in (result as Record<string, unknown>)
      ) {
        const content = asText((result as { content?: unknown }).content ?? "");
        try {
          return JSON.parse(content) as Record<string, unknown>;
        } catch {
          return { output: content };
        }
      }
    }
    if (schema && typeof schema === "object" && !Array.isArray(schema)) {
      const props =
        (schema as { properties?: Record<string, unknown> }).properties ?? {};
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(props)) {
        const spec = props[key] as { type?: string };
        if (spec?.type === "number" || spec?.type === "integer") out[key] = 0;
        else if (spec?.type === "boolean") out[key] = false;
        else if (spec?.type === "array") out[key] = [];
        else if (spec?.type === "object") out[key] = {};
        else out[key] = "";
      }
      return out;
    }

    const instructions = asText(this.instructions ?? this.instructions ?? "");
    const contextText = asText(this.context ?? this.context ?? "");
    return {
      output: {
        instructions,
        context: contextText
      }
    };
  }
}

export class DataGeneratorNode extends BaseNode {
  static readonly nodeType = "nodetool.generators.DataGenerator";
  static readonly title = "Data Generator";
  static readonly description =
    "LLM Agent to create a dataframe based on a user prompt.\n    llm, dataframe creation, data structuring\n\n    Use cases:\n    - Generating structured data from natural language descriptions\n    - Creating sample datasets for testing or demonstration\n    - Converting unstructured text into tabular format";
  static readonly metadataOutputTypes = {
    record: "dict",
    dataframe: "dataframe",
    index: "int"
  };
  static readonly basicFields = ["prompt", "model", "columns"];

  static readonly isStreamingOutput = true;
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The model to use for data generation."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The user prompt"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Input Text",
    description: "The input text to be analyzed by the agent."
  })
  declare input_text: any;

  @prop({
    type: "int",
    default: 4096,
    title: "Max Tokens",
    description: "The maximum number of tokens to generate.",
    min: 1,
    max: 100000
  })
  declare max_tokens: any;

  @prop({
    type: "record_type",
    default: {
      type: "record_type",
      columns: []
    },
    title: "Columns",
    description: "The columns to use in the dataframe."
  })
  declare columns: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const prompt = asText(this.prompt ?? this.prompt ?? "");
    const inputText = asText(this.input_text ?? this.input_text ?? "");
    const columnsInput = this.columns ?? this.columns;
    const columns = parseColumns(columnsInput);
    const count = parseRequestedCount(`${prompt} ${inputText}`, 5);
    const { providerId, modelId } = getModelConfig(this.serialize());
    if (hasProviderSupport(context, providerId, modelId)) {
      const rows = await generateDataframeFromCsv(
        context,
        providerId,
        modelId,
        [prompt, inputText].filter(Boolean).join("\n\n"),
        columnsInput,
        count,
        Number(this.max_tokens ?? 4096)
      );
      if (rows.length > 0) {
        return { output: dataframeFromRows(rows, columnsInput) };
      }
    }
    const rows = makeRows(columns, count, inputText || prompt || "item");
    return { output: dataframeFromRows(rows, columnsInput) };
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const full = await this.process(context);
    const rows = ((full.output as { rows?: unknown }).rows ?? []) as Row[];
    for (let i = 0; i < rows.length; i += 1) {
      yield { record: rows[i], index: i, dataframe: null };
    }
    yield { record: null, index: null, dataframe: full.output };
  }
}

export class ListGeneratorNode extends BaseNode {
  static readonly nodeType = "nodetool.generators.ListGenerator";
  static readonly title = "List Generator";
  static readonly description =
    "LLM Agent to create a stream of strings based on a user prompt.\n    llm, text streaming\n\n    Use cases:\n    - Generating text from natural language descriptions\n    - Streaming responses from an LLM";
  static readonly metadataOutputTypes = {
    item: "str",
    index: "int"
  };
  static readonly basicFields = ["prompt", "model"];

  static readonly isStreamingOutput = true;
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The model to use for string generation."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The user prompt"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Input Text",
    description: "The input text to be analyzed by the agent."
  })
  declare input_text: any;

  @prop({
    type: "int",
    default: 4096,
    title: "Max Tokens",
    description: "The maximum number of tokens to generate.",
    min: 1,
    max: 100000
  })
  declare max_tokens: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const items: string[] = [];
    for await (const chunk of this.genProcess(context)) {
      const item = (chunk as { item?: unknown }).item;
      if (typeof item === "string") items.push(item);
    }
    return { output: items };
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const prompt = asText(this.prompt ?? "");
    const inputText = asText(this.input_text ?? "");
    const userMessage = [prompt, inputText].filter(Boolean).join("\n\n");
    const { providerId, modelId } = getModelConfig(this.serialize());

    if (
      context &&
      typeof (context as { getProvider?: unknown }).getProvider === "function" &&
      providerId &&
      modelId
    ) {
      let index = 0;
      for await (const item of streamListItemsViaToolCalls(
        context,
        providerId,
        modelId,
        userMessage,
        Number(this.max_tokens ?? 128)
      )) {
        yield { item, index };
        index += 1;
      }
      if (index === 0) {
        throw new Error(
          "Model returned no add_item tool calls — list is empty."
        );
      }
      return;
    }

    const seed = inputText || prompt || "item";
    const count = parseRequestedCount(userMessage, 5);
    for (let i = 0; i < count; i += 1) {
      yield { item: `${seed}_${i + 1}`, index: i };
    }
  }
}

export class ChartGeneratorNode extends BaseNode {
  static readonly nodeType = "nodetool.generators.ChartGenerator";
  static readonly title = "Chart Generator";
  static readonly description =
    "LLM Agent to create Plotly Express charts based on natural language descriptions.\n    llm, data visualization, charts\n\n    Use cases:\n    - Generating interactive charts from natural language descriptions\n    - Creating data visualizations with minimal configuration\n    - Converting data analysis requirements into visual representations";
  static readonly metadataOutputTypes = {
    output: "chart_config"
  };
  static readonly basicFields = ["prompt", "data", "model"];

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The model to use for chart generation."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Natural language description of the desired chart"
  })
  declare prompt: any;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Data",
    description: "The data to visualize"
  })
  declare data: any;

  @prop({
    type: "int",
    default: 4096,
    title: "Max Tokens",
    description: "The maximum number of tokens to generate.",
    min: 1,
    max: 100000
  })
  declare max_tokens: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const prompt = asText(this.prompt ?? this.prompt ?? "");
    const data = this.data ?? this.data ?? { rows: [] };
    const rows = Array.isArray((data as { rows?: unknown }).rows)
      ? ((data as { rows: Row[] }).rows ?? [])
      : [];
    const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
    const xKey = keys[0] ?? "x";
    const yKey = keys[1] ?? xKey;

    const { providerId, modelId } = getModelConfig(this.serialize());
    if (hasProviderSupport(context, providerId, modelId)) {
      const dataSample =
        rows.length > 0
          ? `Data columns: ${keys.join(", ")}\nSample rows:\n${JSON.stringify(rows.slice(0, 5), null, 2)}`
          : "No data provided.";
      const systemPrompt = `You are a Plotly visualization expert. Given a user's description and optional data, generate a Plotly chart configuration as JSON.
The JSON must conform to the provided schema. Choose appropriate chart types (bar, line, scatter, pie, histogram, box, heatmap, etc.) based on the user's description.
Use the data columns provided to set x_column, y_column, and label fields in the series array.
Set a descriptive title, axis labels, and legend settings.`;
      const userMessage = `${prompt}\n\n${dataSample}`;

      const chartSchema = {
        type: "object",
        additionalProperties: false,
        required: ["title", "x_label", "y_label", "legend", "data"],
        properties: {
          title: { type: "string" },
          x_label: { type: "string" },
          y_label: { type: "string" },
          legend: { type: "boolean" },
          legend_position: { type: "string" },
          data: {
            type: "object",
            additionalProperties: false,
            required: ["series"],
            properties: {
              series: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["type", "x_column", "y_column", "label"],
                  properties: {
                    type: { type: "string" },
                    x_column: { type: "string" },
                    y_column: { type: "string" },
                    label: { type: "string" }
                  }
                }
              }
            }
          }
        }
      };

      const result = await context.runProviderPrediction({
        provider: providerId,
        capability: "generate_message",
        model: modelId,
        params: {
          model: modelId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
          ],
          max_tokens: Number(this.max_tokens ?? 4096),
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "chart_config",
              schema: chartSchema
            }
          }
        }
      });

      const content = asText(
        (result as { content?: unknown }).content ?? result
      );
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        return {
          output: {
            type: "chart_config",
            ...parsed,
            data: {
              type: "chart_data",
              ...((parsed.data as Record<string, unknown>) ?? {}),
              row: null,
              col: null,
              col_wrap: null
            },
            height: null,
            aspect: null,
            x_lim: null,
            y_lim: null,
            x_scale: null,
            y_scale: null,
            palette: null,
            hue_order: null,
            hue_norm: null,
            sizes: null,
            size_order: null,
            size_norm: null,
            marginal_kws: null,
            joint_kws: null,
            diag_kind: null,
            corner: false,
            center: null,
            vmin: null,
            vmax: null,
            cmap: null,
            annot: false,
            fmt: ".2g",
            square: false
          }
        };
      } catch {
        // Fall through to hardcoded fallback
      }
    }

    return {
      output: {
        type: "chart_config",
        title: prompt || "Generated Chart",
        x_label: xKey,
        y_label: yKey,
        legend: true,
        data: {
          type: "chart_data",
          series: [
            {
              type: "bar",
              x_column: xKey,
              y_column: yKey,
              label: prompt || "series"
            }
          ],
          row: null,
          col: null,
          col_wrap: null
        },
        height: null,
        aspect: null,
        x_lim: null,
        y_lim: null,
        x_scale: null,
        y_scale: null,
        legend_position: "auto",
        palette: null,
        hue_order: null,
        hue_norm: null,
        sizes: null,
        size_order: null,
        size_norm: null,
        marginal_kws: null,
        joint_kws: null,
        diag_kind: null,
        corner: false,
        center: null,
        vmin: null,
        vmax: null,
        cmap: null,
        annot: false,
        fmt: ".2g",
        square: false
      }
    };
  }
}

export class SVGGeneratorNode extends BaseNode {
  static readonly nodeType = "nodetool.generators.SVGGenerator";
  static readonly title = "SVGGenerator";
  static readonly description =
    "LLM Agent to create SVG elements based on user prompts.\n    svg, generator, vector, graphics\n\n    Use cases:\n    - Creating vector graphics from text descriptions\n    - Generating scalable illustrations\n    - Creating custom icons and diagrams";
  static readonly metadataOutputTypes = {
    output: "list[svg_element]"
  };
  static readonly basicFields = ["prompt", "image", "audio", "model"];

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The language model to use for SVG generation."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The user prompt for SVG generation"
  })
  declare prompt: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Image to use for generation"
  })
  declare image: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Audio to use for generation"
  })
  declare audio: any;

  @prop({
    type: "int",
    default: 8192,
    title: "Max Tokens",
    description: "The maximum number of tokens to generate.",
    min: 1,
    max: 100000
  })
  declare max_tokens: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const prompt = asText(this.prompt ?? this.prompt ?? "");
    const width = Number((this as any).width ?? 512) || 512;
    const height = Number((this as any).height ?? 512) || 512;

    const { providerId, modelId } = getModelConfig(this.serialize());
    if (hasProviderSupport(context, providerId, modelId)) {
      const systemPrompt = `You are an SVG graphics expert. Generate SVG markup based on the user's description.
Return one or more complete <svg>...</svg> elements. Each SVG should use the xmlns="http://www.w3.org/2000/svg" attribute.
Default canvas size is ${width}x${height} unless the user specifies otherwise.
Output only SVG markup, no explanations or markdown fences.`;

      const messages: Array<{ role: string; content: unknown }> = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: buildMessageContent(prompt, this.image, this.audio)
        }
      ];

      const result = await context.runProviderPrediction({
        provider: providerId,
        capability: "generate_message",
        model: modelId,
        params: {
          model: modelId,
          messages,
          max_tokens: Number(this.max_tokens ?? 8192)
        }
      });

      const content = asText(
        (result as { content?: unknown }).content ?? result
      );
      const svgMatches = Array.from(
        content.matchAll(/<svg[\s\S]*?<\/svg>/gi)
      );
      if (svgMatches.length > 0) {
        return {
          output: svgMatches.map((m) => ({ content: m[0] }))
        };
      }
    }

    // Fallback: generate a simple placeholder SVG
    const text = prompt || "SVG";
    const safeText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f2f2f2"/><text x="16" y="32" font-size="20" fill="#111">${safeText}</text></svg>`;
    return { output: [{ content: svg }] };
  }
}

export const GENERATOR_NODES = [
  StructuredOutputGeneratorNode,
  DataGeneratorNode,
  ListGeneratorNode,
  ChartGeneratorNode,
  SVGGeneratorNode
] as const;
