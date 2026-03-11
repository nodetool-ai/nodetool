import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";

type Row = Record<string, unknown>;
type ColumnSpec = { name: string; data_type?: string };
type LanguageModelLike = { provider?: string; id?: string; name?: string };
type ProviderStreamItem = { type?: string; content?: unknown; delta?: unknown };

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
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
          const record = c as { name?: unknown; data_type?: unknown; type?: unknown };
          const name = typeof record.name === "string" ? record.name : String(record.name ?? "");
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
      else if (lower.includes("name")) row[col] = `${seedText || "item"}_${i + 1}`;
      else if (lower.includes("date")) row[col] = new Date(Date.now() + i * 86_400_000).toISOString();
      else if (lower.includes("price") || lower.includes("amount") || lower.includes("score")) {
        row[col] = Number((10 + i * 1.5).toFixed(2));
      } else if (lower.includes("active") || lower.startsWith("is_")) {
        row[col] = i % 2 === 0;
      } else row[col] = `${seedText || "value"}_${i + 1}`;
    }
    rows.push(row);
  }
  return rows;
}

function getModelConfig(
  inputs: Record<string, unknown>,
  props: Record<string, unknown>
): { providerId: string; modelId: string } {
  const model = ((inputs.model ?? props.model ?? {}) as LanguageModelLike) ?? {};
  return {
    providerId: typeof model.provider === "string" ? model.provider : "",
    modelId: typeof model.id === "string" ? model.id : "",
  };
}

function hasProviderSupport(
  context: ProcessingContext | undefined,
  providerId: string,
  modelId: string
): context is ProcessingContext & {
  runProviderPrediction: (req: Record<string, unknown>) => Promise<unknown>;
  streamProviderPrediction: (req: Record<string, unknown>) => AsyncGenerator<unknown>;
} {
  return (
    !!context &&
    typeof context.runProviderPrediction === "function" &&
    typeof context.streamProviderPrediction === "function" &&
    !!providerId &&
    !!modelId
  );
}

function chunkText(item: unknown): string {
  if (!item || typeof item !== "object") return asText(item);
  const chunk = item as ProviderStreamItem;
  return asText(chunk.content ?? chunk.delta ?? "");
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseListItems(text: string): string[] {
  const matches = Array.from(text.matchAll(/<LIST_ITEM>([\s\S]*?)<\/LIST_ITEM>/gi));
  return matches.map((match) => normalizeWhitespace(match[1] ?? "")).filter((item) => item.length > 0);
}

function convertValue(column: ColumnSpec | undefined, raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed || /^none$/i.test(trimmed) || /^null$/i.test(trimmed)) return null;
  const kind = (column?.data_type ?? "").toLowerCase();
  if (kind === "int" || kind === "integer") {
    const value = Number.parseInt(trimmed, 10);
    return Number.isFinite(value) ? value : trimmed;
  }
  if (kind === "float" || kind === "number") {
    const value = Number.parseFloat(trimmed);
    return Number.isFinite(value) ? value : trimmed;
  }
  return trimmed;
}

function parseMarkdownTable(text: string, columnsInput: unknown): Row[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));
  if (lines.length < 3) return [];

  const header = lines[0]
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
  const specs = parseColumnSpecs(columnsInput);
  const columns =
    specs.length > 0
      ? header.map((name) => specs.find((spec) => spec.name === name) ?? { name })
      : header.map((name) => ({ name }));

  return lines
    .slice(2)
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells.length >= header.length)
    .map((cells) => {
      const row: Row = {};
      header.forEach((name, index) => {
        row[name] = convertValue(columns[index], cells[index] ?? "");
      });
      return row;
    });
}

function dataframeFromRows(rows: Row[], columnsInput: unknown): Record<string, unknown> {
  const specs = parseColumnSpecs(columnsInput);
  const names =
    specs.length > 0 ? specs.map((column) => column.name) : rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    rows,
    columns: names.map((name) => ({ name })),
    data: rows.map((row) => names.map((name) => row[name] ?? null)),
  };
}

async function generateProviderText(
  context: ProcessingContext & {
    runProviderPrediction: (req: Record<string, unknown>) => Promise<unknown>;
  },
  providerId: string,
  modelId: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  const result = await context.runProviderPrediction({
    provider: providerId,
    capability: "generate_message",
    model: modelId,
    params: {
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      maxTokens,
    },
  });
  if (result && typeof result === "object" && "content" in (result as Record<string, unknown>)) {
    return asText((result as { content?: unknown }).content ?? "");
  }
  return asText(result);
}

async function streamProviderText(
  context: ProcessingContext & {
    streamProviderPrediction: (req: Record<string, unknown>) => AsyncGenerator<unknown>;
  },
  providerId: string,
  modelId: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  let text = "";
  for await (const item of context.streamProviderPrediction({
    provider: providerId,
    capability: "generate_messages",
    model: modelId,
    params: {
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      maxTokens,
    },
  })) {
    text += chunkText(item);
  }
  return text;
}

export class StructuredOutputGeneratorNode extends BaseNode {
  static readonly nodeType = "nodetool.generators.StructuredOutputGenerator";
            static readonly title = "Structured Output Generator";
            static readonly description = "Generate structured JSON objects from instructions using LLM providers.\n    data-generation, structured-data, json, synthesis\n\n    Specialized for creating structured information:\n    - Generating JSON that follows dynamic schemas\n    - Fabricating records from requirements and guidance\n    - Simulating sample data for downstream workflows\n    - Producing consistent structured outputs for testing";
          static readonly basicFields = [
  "instructions",
  "context",
  "model"
];
          static readonly supportsDynamicOutputs = true;
  
  @prop({ type: "str", default: "\nYou are a structured data generator focused on JSON outputs.\n\nGoal\n- Produce a high-quality JSON object that matches <JSON_SCHEMA> using the guidance in <INSTRUCTIONS> and any supplemental <CONTEXT>.\n\nOutput format (MANDATORY)\n- Output exactly ONE fenced code block labeled json containing ONLY the JSON object:\n\n  ```json\n  { ...single JSON object matching <JSON_SCHEMA>... }\n  ```\n\n- No additional prose before or after the block.\n\nGeneration rules\n- Invent plausible, internally consistent values when not explicitly provided.\n- Honor all constraints from <JSON_SCHEMA> (types, enums, ranges, formats).\n- Prefer ISO 8601 for dates/times when applicable.\n- Ensure numbers respect reasonable magnitudes and relationships described in <INSTRUCTIONS>.\n- Avoid referencing external sources; rely solely on the provided guidance.\n\nValidation\n- Ensure the final JSON validates against <JSON_SCHEMA> exactly.\n", title: "System Prompt", description: "The system prompt guiding JSON generation." })
  declare system_prompt: any;

  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model to use for structured generation." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Instructions", description: "Detailed instructions for the structured output." })
  declare instructions: any;

  @prop({ type: "str", default: "", title: "Context", description: "Optional context to ground the generation." })
  declare context: any;

  @prop({ type: "int", default: 4096, title: "Max Tokens", description: "The maximum number of tokens to generate.", min: 1, max: 16384 })
  declare max_tokens: any;




  async process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const { providerId, modelId } = getModelConfig(inputs, this.serialize());
    const schema = inputs.schema ?? this.schema;
    if (schema && typeof schema === "object" && !Array.isArray(schema) && hasProviderSupport(context, providerId, modelId)) {
      const instructions = asText(inputs.instructions ?? this.instructions ?? "");
      const extraContext = asText(inputs.context ?? this.context ?? "");
      const result = await context.runProviderPrediction({
        provider: providerId,
        capability: "generate_message",
        model: modelId,
        params: {
          model: modelId,
          messages: [
            {
              role: "user",
              content: [instructions, extraContext].filter(Boolean).join("\n\n"),
            },
          ],
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "structured_output",
              schema,
            },
          },
        },
      });
      if (result && typeof result === "object" && "content" in (result as Record<string, unknown>)) {
        const content = asText((result as { content?: unknown }).content ?? "");
        try {
          return JSON.parse(content) as Record<string, unknown>;
        } catch {
          return { output: content };
        }
      }
    }
    if (schema && typeof schema === "object" && !Array.isArray(schema)) {
      const props = (schema as { properties?: Record<string, unknown> }).properties ?? {};
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

    const instructions = asText(inputs.instructions ?? this.instructions ?? "");
    const contextText = asText(inputs.context ?? this.context ?? "");
    return {
      output: {
        instructions,
        context: contextText,
      },
    };
  }
}

export class DataGeneratorNode extends BaseNode {
  static readonly nodeType = "nodetool.generators.DataGenerator";
            static readonly title = "Data Generator";
            static readonly description = "LLM Agent to create a dataframe based on a user prompt.\n    llm, dataframe creation, data structuring\n\n    Use cases:\n    - Generating structured data from natural language descriptions\n    - Creating sample datasets for testing or demonstration\n    - Converting unstructured text into tabular format";
        static readonly metadataOutputTypes = {
    record: "dict",
    dataframe: "dataframe",
    index: "int"
  };
          static readonly basicFields = [
  "prompt",
  "model",
  "columns"
];
  
            static readonly isStreamingOutput = true;
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "The model to use for data generation." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The user prompt" })
  declare prompt: any;

  @prop({ type: "str", default: "", title: "Input Text", description: "The input text to be analyzed by the agent." })
  declare input_text: any;

  @prop({ type: "int", default: 4096, title: "Max Tokens", description: "The maximum number of tokens to generate.", min: 1, max: 100000 })
  declare max_tokens: any;

  @prop({ type: "record_type", default: {
  "type": "record_type",
  "columns": []
}, title: "Columns", description: "The columns to use in the dataframe." })
  declare columns: any;




  async process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const prompt = asText(inputs.prompt ?? this.prompt ?? "");
    const inputText = asText(inputs.input_text ?? this.input_text ?? "");
    const columnsInput = inputs.columns ?? this.columns;
    const columns = parseColumns(columnsInput);
    const count = parseRequestedCount(`${prompt} ${inputText}`, 5);
    const { providerId, modelId } = getModelConfig(inputs, this.serialize());
    if (hasProviderSupport(context, providerId, modelId)) {
      const providerText = await generateProviderText(
        context,
        providerId,
        modelId,
        [prompt, inputText].filter(Boolean).join("\n\n"),
        Number(inputs.max_tokens ?? this.max_tokens ?? 256)
      );
      const rows = parseMarkdownTable(providerText, columnsInput);
      if (rows.length > 0) {
        return { output: dataframeFromRows(rows, columnsInput) };
      }
    }
    const rows = makeRows(columns, count, inputText || prompt || "item");
    return { output: dataframeFromRows(rows, columnsInput) };
  }

  async *genProcess(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const { providerId, modelId } = getModelConfig(inputs, this.serialize());
    const columnsInput = inputs.columns ?? this.columns;
    if (hasProviderSupport(context, providerId, modelId)) {
      const prompt = asText(inputs.prompt ?? this.prompt ?? "");
      const inputText = asText(inputs.input_text ?? this.input_text ?? "");
      const providerText = await streamProviderText(
        context,
        providerId,
        modelId,
        [prompt, inputText].filter(Boolean).join("\n\n"),
        Number(inputs.max_tokens ?? this.max_tokens ?? 256)
      );
      const rows = parseMarkdownTable(providerText, columnsInput);
      if (rows.length > 0) {
        for (let i = 0; i < rows.length; i += 1) {
          yield { record: rows[i], index: i, dataframe: null };
        }
        yield { record: null, index: null, dataframe: dataframeFromRows(rows, columnsInput) };
        return;
      }
    }

    const full = await this.process(inputs, context);
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
            static readonly description = "LLM Agent to create a stream of strings based on a user prompt.\n    llm, text streaming\n\n    Use cases:\n    - Generating text from natural language descriptions\n    - Streaming responses from an LLM";
        static readonly metadataOutputTypes = {
    item: "str",
    index: "int"
  };
          static readonly basicFields = [
  "prompt",
  "model"
];
  
            static readonly isStreamingOutput = true;
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "The model to use for string generation." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The user prompt" })
  declare prompt: any;

  @prop({ type: "str", default: "", title: "Input Text", description: "The input text to be analyzed by the agent." })
  declare input_text: any;

  @prop({ type: "int", default: 4096, title: "Max Tokens", description: "The maximum number of tokens to generate.", min: 1, max: 100000 })
  declare max_tokens: any;




  async process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const prompt = asText(inputs.prompt ?? this.prompt ?? "");
    const inputText = asText(inputs.input_text ?? this.input_text ?? "");
    const { providerId, modelId } = getModelConfig(inputs, this.serialize());
    if (hasProviderSupport(context, providerId, modelId)) {
      const providerText = await generateProviderText(
        context,
        providerId,
        modelId,
        [prompt, inputText].filter(Boolean).join("\n\n"),
        Number(inputs.max_tokens ?? this.max_tokens ?? 128)
      );
      const items = parseListItems(providerText);
      if (items.length === 0) {
        throw new Error("Expected <LIST_ITEM> tags in provider output");
      }
      return { output: items };
    }
    const seed = inputText || prompt || "item";
    const count = parseRequestedCount(`${prompt} ${inputText}`, 5);
    const items = Array.from({ length: count }, (_, i) => `${seed}_${i + 1}`);
    return { output: items };
  }

  async *genProcess(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const { providerId, modelId } = getModelConfig(inputs, this.serialize());
    if (hasProviderSupport(context, providerId, modelId)) {
      const prompt = asText(inputs.prompt ?? this.prompt ?? "");
      const inputText = asText(inputs.input_text ?? this.input_text ?? "");
      const providerText = await streamProviderText(
        context,
        providerId,
        modelId,
        [prompt, inputText].filter(Boolean).join("\n\n"),
        Number(inputs.max_tokens ?? this.max_tokens ?? 128)
      );
      const items = parseListItems(providerText);
      if (items.length === 0) {
        throw new Error("Expected <LIST_ITEM> tags in provider output");
      }
      for (let i = 0; i < items.length; i += 1) {
        yield { item: items[i], index: i };
      }
      return;
    }

    const result = await this.process(inputs, context);
    const list = Array.isArray(result.output) ? result.output : [];
    for (let i = 0; i < list.length; i += 1) {
      yield { item: String(list[i]), index: i };
    }
  }
}

export class ChartGeneratorNode extends BaseNode {
  static readonly nodeType = "nodetool.generators.ChartGenerator";
            static readonly title = "Chart Generator";
            static readonly description = "LLM Agent to create Plotly Express charts based on natural language descriptions.\n    llm, data visualization, charts\n\n    Use cases:\n    - Generating interactive charts from natural language descriptions\n    - Creating data visualizations with minimal configuration\n    - Converting data analysis requirements into visual representations";
        static readonly metadataOutputTypes = {
    output: "plotly_config"
  };
          static readonly basicFields = [
  "prompt",
  "data",
  "model"
];
  
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "The model to use for chart generation." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Natural language description of the desired chart" })
  declare prompt: any;

  @prop({ type: "dataframe", default: {
  "type": "dataframe",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "columns": null
}, title: "Data", description: "The data to visualize" })
  declare data: any;

  @prop({ type: "int", default: 4096, title: "Max Tokens", description: "The maximum number of tokens to generate.", min: 1, max: 100000 })
  declare max_tokens: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const prompt = asText(inputs.prompt ?? this.prompt ?? "");
    const data = inputs.data ?? this.data ?? { rows: [] };
    const rows = Array.isArray((data as { rows?: unknown }).rows)
      ? ((data as { rows: Row[] }).rows ?? [])
      : [];
    const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
    const xKey = keys[0] ?? "x";
    const yKey = keys[1] ?? xKey;
    const x = rows.map((r, i) => r[xKey] ?? i);
    const y = rows.map((r, i) => r[yKey] ?? i);
    return {
      output: {
        data: [{ type: "bar", x, y, name: prompt || "series" }],
        layout: { title: prompt || "Generated Chart" },
      },
    };
  }
}

export class SVGGeneratorNode extends BaseNode {
  static readonly nodeType = "nodetool.generators.SVGGenerator";
            static readonly title = "SVGGenerator";
            static readonly description = "LLM Agent to create SVG elements based on user prompts.\n    svg, generator, vector, graphics\n\n    Use cases:\n    - Creating vector graphics from text descriptions\n    - Generating scalable illustrations\n    - Creating custom icons and diagrams";
        static readonly metadataOutputTypes = {
    output: "list[svg_element]"
  };
          static readonly basicFields = [
  "prompt",
  "image",
  "audio",
  "model"
];
  
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "The language model to use for SVG generation." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The user prompt for SVG generation" })
  declare prompt: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "Image to use for generation" })
  declare image: any;

  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "Audio to use for generation" })
  declare audio: any;

  @prop({ type: "int", default: 8192, title: "Max Tokens", description: "The maximum number of tokens to generate.", min: 1, max: 100000 })
  declare max_tokens: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const prompt = asText(inputs.prompt ?? this.prompt ?? "");
    const width = Number(inputs.width ?? this.width ?? 512) || 512;
    const height = Number(inputs.height ?? this.height ?? 512) || 512;
    const text = prompt || "SVG";
    const safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f2f2f2"/><text x="16" y="32" font-size="20" fill="#111">${safeText}</text></svg>`;
    return { output: [{ content: svg }] };
  }
}

export const GENERATOR_NODES = [
  StructuredOutputGeneratorNode,
  DataGeneratorNode,
  ListGeneratorNode,
  ChartGeneratorNode,
  SVGGeneratorNode,
] as const;
