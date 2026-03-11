/**
 * Agent-backed skill nodes for prompt-driven task execution.
 *
 * Each skill node sends a system prompt + user prompt to an LLM provider
 * and returns the text response.  When a ProcessingContext with a registered
 * provider is available the node delegates to it; otherwise it falls back to
 * direct HTTP calls against OpenAI, Anthropic, or Ollama.
 */

import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProviderMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
};
type ProviderLike = {
  generateMessage(args: {
    messages: ProviderMessage[];
    model: string;
    maxTokens?: number;
  }): Promise<{ content?: string | null }>;
};

// ---------------------------------------------------------------------------
// Secret / key resolution helpers
// ---------------------------------------------------------------------------

function secretsMap(inputs: Record<string, unknown>): Record<string, string> {
  const raw = inputs._secrets;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, string>;
  }
  return {};
}

const PROVIDER_KEY_MAP: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

function resolveApiKey(
  inputs: Record<string, unknown>,
  provider: string
): string | null {
  const envName = PROVIDER_KEY_MAP[provider];
  if (!envName) return null;
  const secrets = secretsMap(inputs);
  return secrets[envName] || process.env[envName] || null;
}

// ---------------------------------------------------------------------------
// Direct HTTP chat completion (fallback when no provider resolver)
// ---------------------------------------------------------------------------

async function callChatCompletionDirect(
  apiKey: string,
  provider: string,
  modelId: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4096,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `OpenAI API error ${response.status}: ${text.slice(0, 500)}`
      );
    }
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content ?? "";
  }

  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Anthropic API error ${response.status}: ${text.slice(0, 500)}`
      );
    }
    const json = (await response.json()) as {
      content?: { type?: string; text?: string }[];
    };
    return (
      json.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("") ?? ""
    );
  }

  if (provider === "ollama") {
    const ollamaUrl =
      process.env.OLLAMA_API_URL || "http://127.0.0.1:11434";
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Ollama API error ${response.status}: ${text.slice(0, 500)}`
      );
    }
    const json = (await response.json()) as {
      message?: { content?: string };
    };
    return json.message?.content ?? "";
  }

  throw new Error(
    `Unsupported provider "${provider}". Supported: openai, anthropic, ollama.`
  );
}

// ---------------------------------------------------------------------------
// Unified chat completion dispatcher
// ---------------------------------------------------------------------------

async function callChatCompletion(
  inputs: Record<string, unknown>,
  context: ProcessingContext | undefined,
  provider: string,
  modelId: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  // Path 1: use runtime provider if available
  if (context && typeof context.getProvider === "function") {
    try {
      const providerImpl = (await context.getProvider(
        provider
      )) as ProviderLike;
      const messages: ProviderMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
      const result = await providerImpl.generateMessage({
        model: modelId,
        messages,
        maxTokens: 4096,
      });
      const text =
        typeof result.content === "string"
          ? result.content
          : JSON.stringify(result.content ?? "");
      return text;
    } catch {
      // Fall through to direct HTTP if provider resolution fails
    }
  }

  // Path 2: direct HTTP call
  const apiKey = resolveApiKey(inputs, provider);
  if (provider !== "ollama" && !apiKey) {
    const envName = PROVIDER_KEY_MAP[provider] ?? `${provider.toUpperCase()}_API_KEY`;
    throw new Error(
      `No API key found for provider "${provider}". ` +
        `Set ${envName} in environment or secrets.`
    );
  }
  return callChatCompletionDirect(
    apiKey ?? "",
    provider,
    modelId,
    systemPrompt,
    userPrompt
  );
}

// ---------------------------------------------------------------------------
// Base skill node
// ---------------------------------------------------------------------------

class SkillNode extends BaseNode {
  static readonly description: string =
    "Base skill node (not directly usable).";

  /** Override in subclasses with the skill-specific system prompt. */
  static readonly _systemPrompt: string =
    "You are a helpful assistant. Complete the task described by the user.";

  async process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const prompt = String(inputs.prompt ?? this.prompt ?? "").trim();
    if (!prompt) throw new Error("Prompt is required");

    const model = (inputs.model ?? this.model ?? {}) as Record<
      string,
      unknown
    >;
    const provider = String(model.provider || "").toLowerCase();
    const modelId = String(model.id || "");
    if (!provider || !modelId) {
      throw new Error("Select a model for this skill.");
    }

    const systemPrompt = (this.constructor as typeof SkillNode)._systemPrompt;
    const text = await callChatCompletion(
      inputs,
      context,
      provider,
      modelId,
      systemPrompt,
      prompt
    );
    return { text };
  }
}

// ---------------------------------------------------------------------------
// ShellAgentSkill
// ---------------------------------------------------------------------------

export class ShellAgentSkillNode extends SkillNode {
  static readonly nodeType = "skills._shell_agent.ShellAgentSkill";
      static readonly title = "Shell Agent Skill";
      static readonly description = "Reusable prompt-driven skill backed by execute_bash.";
    static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a bounded workspace agent. Use execute_bash for concrete actions. " +
    "Ground all claims in command output and keep results concise.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for task planning and execution reasoning." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing the requested task." })
  declare prompt: any;

  @prop({ type: "int", default: 180, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 200000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;

}

// ---------------------------------------------------------------------------
// BrowserSkill
// ---------------------------------------------------------------------------

export class BrowserSkillNode extends SkillNode {
  static readonly nodeType = "skills.browser.BrowserSkill";
      static readonly title = "Browser Skill";
      static readonly description = "Prompt-driven browser skill with bounded tool validation and schema outputs.\n    Supports extraction and browser automation workflows.\n    skills, browser, scrape, extraction, automation";
    static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a browser automation and extraction agent using Playwright-backed browser tools. " +
    "Use `browser` to fetch page content and metadata, `take_screenshot` for screenshots, " +
    "and DOM tools (`dom_examine`, `dom_search`, `dom_extract`) for structured inspection. " +
    "The `browser` tool returns JSON fields like `success`, `url`, `content`, `metadata`, or `error`. " +
    "Do not browse search engine result pages directly; explain that direct SERP browsing is disabled.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for free-form browsing tasks." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt for browser navigation/extraction." })
  declare prompt: any;

  @prop({ type: "int", default: 150, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 180000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;



}

// ---------------------------------------------------------------------------
// SQLiteSkill
// ---------------------------------------------------------------------------

export class SQLiteSkillNode extends SkillNode {
  static readonly nodeType = "skills.data.SQLiteSkill";
      static readonly title = "SQLite Skill";
      static readonly description = "Prompt-driven SQLite skill with guarded query execution.\n    skills, data, sqlite, query";
    static readonly metadataOutputTypes = {
    text: "str",
    json: "dict[str, any]",
    dataframe: "dataframe"
  };
  static readonly _systemPrompt =
    "You are a data analysis skill. Use tools to run queries and ground every " +
    "answer in tool outputs. Keep answers concise and factual.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for optional agent reasoning over query results." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt for data query/transform task." })
  declare prompt: any;

  @prop({ type: "int", default: 120, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 200000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;

  @prop({ type: "str", default: "memory.db", title: "Db Path", description: "Path to SQLite database relative to workspace." })
  declare db_path: any;

  @prop({ type: "bool", default: false, title: "Allow Mutation", description: "Allow INSERT/UPDATE/DELETE/DDL statements when enabled." })
  declare allow_mutation: any;



}

// ---------------------------------------------------------------------------
// SupabaseSkill
// ---------------------------------------------------------------------------

export class SupabaseSkillNode extends SkillNode {
  static readonly nodeType = "skills.data.SupabaseSkill";
      static readonly title = "Supabase Skill";
      static readonly description = "Prompt-driven Supabase skill with guarded SELECT execution.\n    skills, data, supabase, query";
    static readonly metadataOutputTypes = {
    text: "str",
    json: "dict[str, any]",
    dataframe: "dataframe"
  };
  static readonly _systemPrompt =
    "You are a data analysis skill. Use tools to run queries and ground every " +
    "answer in tool outputs. Keep answers concise and factual.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for optional agent reasoning over query results." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt for data query/transform task." })
  declare prompt: any;

  @prop({ type: "int", default: 120, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 200000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;



}

// ---------------------------------------------------------------------------
// DocumentSkill
// ---------------------------------------------------------------------------

export class DocumentSkillNode extends SkillNode {
  static readonly nodeType = "skills.document.DocumentSkill";
      static readonly title = "Document Skill";
      static readonly description = "Prompt-driven document skill for model-based document analysis.\n    skills, document, extraction, conversion, markdown";
    static readonly metadataOutputTypes = {
    text: "str",
    document: "document"
  };
  static readonly _systemPrompt =
    "You are a document skill. Use attached document/text inputs and return concise results.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for free-form document tasks." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing the document task." })
  declare prompt: any;

  @prop({ type: "int", default: 120, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 150000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;



}

// ---------------------------------------------------------------------------
// DocxSkill
// ---------------------------------------------------------------------------

export class DocxSkillNode extends SkillNode {
  static readonly nodeType = "skills.docx.DocxSkill";
      static readonly title = "DOCX Skill";
      static readonly description = "Prompt-driven DOCX creation skill.\n    skills, docx, word, document creation, docx-js";
    static readonly metadataOutputTypes = {
    document: "document",
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a DOCX creation specialist. This skill is creation-only.\n\n" +
    "Scope:\n" +
    "- Create new .docx files (reports, memos, letters, templates, styled docs).\n" +
    "- Use docx-js (npm package `docx`) for document generation.\n" +
    "- Do not perform editing/analysis of existing DOCX files in this skill.\n\n" +
    "Execution policy:\n" +
    "1) Use execute_bash for shell and Node.js commands.\n" +
    "2) Keep outputs workspace-relative.\n" +
    "3) Validate generated DOCX when feasible.\n" +
    "4) Final step is mandatory: call set_output_document with output .docx path.\n\n" +
    "Critical docx-js creation rules:\n" +
    "- Set page size explicitly (docx-js defaults to A4).\n" +
    "  US Letter: width 12240, height 15840 DXA with 1-inch margins (1440 DXA).\n" +
    "- For landscape, pass portrait dimensions and set orientation LANDSCAPE (library swaps).\n" +
    "- Override built-in heading style IDs exactly ('Heading1', 'Heading2', ...).\n" +
    "- Include outlineLevel on heading paragraph styles for TOC support.\n" +
    "- Never use '\\n' for line breaks; use separate Paragraph elements.\n" +
    "- Never use unicode bullet characters directly; use numbering with LevelFormat.BULLET.\n" +
    "- PageBreak must be inside a Paragraph.\n" +
    "- ImageRun requires explicit type (png/jpg/jpeg/gif/bmp/svg).\n" +
    "- Prefer WidthType.DXA for tables; do not use WidthType.PERCENTAGE.\n" +
    "- Tables need dual widths: table columnWidths and matching cell widths.\n" +
    "- Table width must equal sum(columnWidths).\n" +
    "- Use ShadingType.CLEAR for table shading (not SOLID).\n" +
    "- For TOC, headings should use HeadingLevel and headingStyleRange.\n" +
    "- Use headers/footers and PageNumber for professional layouts.\n\n" +
    "Recommended workflow:\n" +
    "- Create JS script (for example scripts/build_docx.js) with `docx` imports.\n" +
    "- Build Document with sections/styles/numbering/tables/images as requested.\n" +
    "- Write output .docx to workspace path (for example out/document.docx).\n" +
    "- Optionally validate with available validator command.\n" +
    "- Call set_output_document with final .docx path.\n\n" +
    "Output rules:\n" +
    "- Keep response concise and include output path.\n" +
    "- If no DOCX was produced, clearly explain why.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for DOCX creation planning and execution." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing what DOCX to create." })
  declare prompt: any;

  @prop({ type: "int", default: 300, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 220000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;



}

// ---------------------------------------------------------------------------
// EmailSkill
// ---------------------------------------------------------------------------

export class EmailSkillNode extends SkillNode {
  static readonly nodeType = "skills.email.EmailSkill";
      static readonly title = "Email Skill";
      static readonly description = "Prompt-driven email skill for IMAP/SMTP and message processing tasks.\n    skills, email, imap, smtp, messaging";
    static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are an email automation specialist. Use execute_bash for mailbox tasks " +
    "(parse RFC822/EML, summarize threads, draft content, IMAP/SMTP workflows). " +
    "Protect sensitive data and redact secrets or private message content unless requested. " +
    "For outbound actions, clearly state recipients, subject, and intent before execution.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for task planning and execution reasoning." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing the requested task." })
  declare prompt: any;

  @prop({ type: "int", default: 180, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 200000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;

}

// ---------------------------------------------------------------------------
// FfmpegSkill
// ---------------------------------------------------------------------------

export class FfmpegSkillNode extends SkillNode {
  static readonly nodeType = "skills.ffmpeg.FfmpegSkill";
      static readonly title = "FFmpeg Skill";
      static readonly description = "Prompt-driven FFmpeg skill for audio/video editing, conversion, and packaging.\n    skills, ffmpeg, media, video, audio, transcode, remux";
    static readonly metadataOutputTypes = {
    video: "video",
    audio: "audio",
    text: "str"
  };
  static readonly _systemPrompt =
    "You are an FFmpeg specialist skill for audio/video processing. " +
    "Use attached media inputs when provided and return concise results.\n\n" +
    "Execution rules:\n" +
    "1) Use execute_bash for ffmpeg/ffprobe commands.\n" +
    "2) Keep generated files under workspace-relative paths.\n" +
    "3) Publish final outputs using set_output_audio and/or set_output_video.\n" +
    "4) Explain failures clearly and include the exact command that failed.\n\n" +
    "FFmpeg reference (https://ffmpeg.org/ffmpeg.html):\n" +
    "- Canonical form: ffmpeg [global_options] {input_opts -i input}... {output_opts output}...\n" +
    "- Option order matters; input options apply to next -i, output options to next output file.\n" +
    "- Use explicit stream mapping for deterministic results: -map 0:v:0 -map 0:a:0.\n" +
    "- Streamcopy/remux: -c copy for fast container changes with no re-encode.\n" +
    "- Transcoding baseline: -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k.\n" +
    "- Video filters: -vf scale=1280:-2,fps=30,crop=...,pad=....\n" +
    "- Audio filters: -af loudnorm,highpass=80,aresample=48000.\n" +
    "- Multi-input graphs: use -filter_complex for concat, overlays, mixdown, subtitles burn-in.\n" +
    "- Trimming: use -ss before -i for fast seek; use -ss/-to after -i for precise cut.\n" +
    "- Subtitle handling: map subtitle streams when possible; burn in with subtitles=... when needed.\n" +
    "- Metadata/chapters: -map_metadata, -map_chapters, -metadata key=value.\n" +
    "- Overwrite behavior: -y overwrite, -n never overwrite.\n" +
    "- Diagnostics: -hide_banner with -loglevel info|warning|error and optional -stats.\n\n" +
    "Common recipes:\n" +
    "- Remux: ffmpeg -i in.mkv -map 0 -c copy out.mp4\n" +
    "- Normalize playback: ffmpeg -i in.ext -map 0:v:0 -map 0:a:0 -c:v libx264 -crf 23 -c:a aac -b:a 192k out.mp4\n" +
    "- 720p derivative: ffmpeg -i in.ext -vf scale=1280:-2 -c:v libx264 -crf 23 -c:a copy out_720p.mp4\n" +
    "- Clip segment: ffmpeg -ss 00:00:30 -to 00:01:00 -i in.ext -c copy clip.ext\n" +
    "- Extract MP3: ffmpeg -i in.ext -vn -c:a libmp3lame -b:a 192k out.mp3\n" +
    "- Burn subtitles: ffmpeg -i in.ext -vf subtitles=subs.srt -c:v libx264 -c:a copy out_subbed.mp4";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for media prompts." })
  declare model: any;

  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "Optional audio input for media reasoning tasks." })
  declare audio: any;

  @prop({ type: "video", default: {
  "type": "video",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "duration": null,
  "format": null
}, title: "Video", description: "Optional video input for media reasoning tasks." })
  declare video: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt for media task execution." })
  declare prompt: any;

  @prop({ type: "int", default: 180, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 200000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;



}

// ---------------------------------------------------------------------------
// FilesystemSkill
// ---------------------------------------------------------------------------

export class FilesystemSkillNode extends SkillNode {
  static readonly nodeType = "skills.filesystem.FilesystemSkill";
      static readonly title = "Filesystem Skill";
      static readonly description = "Prompt-driven filesystem skill for file inspection and transformations.\n    skills, filesystem, files, directories, io";
    static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a filesystem operations specialist constrained to the workspace. " +
    "Use execute_bash for listing, searching, creating, moving, copying, and deleting files. " +
    "Prefer reversible actions and confirm paths before mutating data. " +
    "When changing files, summarize what changed and where.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for task planning and execution reasoning." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing the requested task." })
  declare prompt: any;

  @prop({ type: "int", default: 180, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 200000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;

}

// ---------------------------------------------------------------------------
// GitSkill
// ---------------------------------------------------------------------------

export class GitSkillNode extends SkillNode {
  static readonly nodeType = "skills.git.GitSkill";
      static readonly title = "Git Skill";
      static readonly description = "Prompt-driven Git skill for repository inspection and change management.\n    skills, git, repository, version-control";
    static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a Git workflow specialist. Use execute_bash for all repository actions. " +
    "Prefer non-destructive commands (status, diff, log, branch, add, commit, fetch, pull). " +
    "Do not run destructive history-rewriting commands unless explicitly requested. " +
    "Report exact files, commit IDs, and branch names from command output.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for task planning and execution reasoning." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing the requested task." })
  declare prompt: any;

  @prop({ type: "int", default: 180, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 200000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;

}

// ---------------------------------------------------------------------------
// HtmlSkill
// ---------------------------------------------------------------------------

export class HtmlSkillNode extends SkillNode {
  static readonly nodeType = "skills.html.HtmlSkill";
      static readonly title = "HTML Skill";
      static readonly description = "Prompt-driven HTML creation skill.\n    skills, html, web, template, static-site";
    static readonly metadataOutputTypes = {
    html: "html",
    text: "str"
  };
  static readonly _systemPrompt =
    "You are an HTML creation specialist.\n\n" +
    "Scope:\n" +
    "- Create or generate HTML files and related inline CSS/JS when requested.\n" +
    "- Use execute_bash for shell/file operations.\n" +
    "- Keep output paths workspace-relative.\n" +
    "- Final step is mandatory: call set_output_html with the final HTML file path.\n\n" +
    "Authoring rules:\n" +
    "- Produce valid UTF-8 HTML5 documents (`<!doctype html>`).\n" +
    "- Include semantic structure (header/main/section/footer) when appropriate.\n" +
    "- Prefer accessible markup (labels, alt text, heading hierarchy).\n" +
    "- Keep JS/CSS straightforward unless the user asks for complexity.\n" +
    "- If external dependencies are needed, explain them briefly.\n\n" +
    "Output rules:\n" +
    "- Keep response concise and include final save path.\n" +
    "- If no HTML file was produced, clearly explain why.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for HTML generation planning/execution." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing HTML to create." })
  declare prompt: any;

  @prop({ type: "int", default: 180, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 180000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;



}

// ---------------------------------------------------------------------------
// HttpApiSkill
// ---------------------------------------------------------------------------

export class HttpApiSkillNode extends SkillNode {
  static readonly nodeType = "skills.httpapi.HttpApiSkill";
      static readonly title = "HTTP API Skill";
      static readonly description = "Prompt-driven HTTP API skill for calling REST/GraphQL endpoints.\n    skills, http, api, rest, graphql";
    static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are an HTTP API integration specialist. " +
    "You can use exactly one tool: `http_request`. " +
    "Do not use shell commands or any non-HTTP tooling. " +
    "Plan requests explicitly (method, URL, headers, query, body), " +
    "call `http_request`, and ground conclusions in returned status/body. " +
    "Treat secrets as sensitive and never echo tokens verbatim. " +
    "If a request fails, explain the failure and propose the next request. " +
    "Always return a final user-facing answer, not just tool dumps. " +
    "Final response format: " +
    "1) Direct answer in 1-3 sentences. " +
    "2) Evidence: status code(s) and key response fields used. " +
    "3) If unresolved, the exact missing data needed.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for task planning and execution reasoning." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing the requested task." })
  declare prompt: any;

  @prop({ type: "int", default: 180, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 200000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;

}

// ---------------------------------------------------------------------------
// ImageSkill
// ---------------------------------------------------------------------------

export class ImageSkillNode extends SkillNode {
  static readonly nodeType = "skills.image.ImageSkill";
      static readonly title = "Image Skill";
      static readonly description = "Prompt-driven image skill for model-based image reasoning.\n    skills, image, agent, transform, extraction";
    static readonly metadataOutputTypes = {
    image: "image",
    text: "str"
  };
  static readonly _systemPrompt =
    "You are an image skill. Use attached inputs and return concise results. " +
    "Use execute_bash when shell-based processing is needed. " +
    "When you create a final output image file, call set_output_image with that path.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for image prompts." })
  declare model: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "Optional image input for image reasoning tasks." })
  declare image: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing the image task." })
  declare prompt: any;

  @prop({ type: "int", default: 90, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 120000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;



}

// ---------------------------------------------------------------------------
// MediaSkill
// ---------------------------------------------------------------------------

export class MediaSkillNode extends SkillNode {
  static readonly nodeType = "skills.media.MediaSkill";
      static readonly title = "Media Skill";
      static readonly description = "Prompt-driven media skill for model-based audio/video reasoning.\n    skills, media, audio, video, agent";
    static readonly metadataOutputTypes = {
    video: "video",
    audio: "audio",
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a media skill for audio/video tasks. " +
    "Use attached media inputs when provided and return concise results. " +
    "Use execute_bash for shell-based operations. " +
    "When you create final media files, call set_output_audio and/or " +
    "set_output_video using workspace-relative paths.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for media prompts." })
  declare model: any;

  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "Optional audio input for media reasoning tasks." })
  declare audio: any;

  @prop({ type: "video", default: {
  "type": "video",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "duration": null,
  "format": null
}, title: "Video", description: "Optional video input for media reasoning tasks." })
  declare video: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt for media task execution." })
  declare prompt: any;

  @prop({ type: "int", default: 180, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 200000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;



}

// ---------------------------------------------------------------------------
// PdfLibSkill
// ---------------------------------------------------------------------------

export class PdfLibSkillNode extends SkillNode {
  static readonly nodeType = "skills.pdf_lib.PdfLibSkill";
      static readonly title = "PDF-lib Skill";
      static readonly description = "Prompt-driven PDF processing skill with pdf-lib and complementary tooling.\n    skills, pdf, pdf-lib, qpdf, poppler, pdfjs, pypdfium2";
    static readonly metadataOutputTypes = {
    document: "document",
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a PDF processing specialist. Focus on robust, reproducible PDF workflows.\n\n" +
    "Primary scope:\n" +
    "- JavaScript pdf-lib for creating/modifying/splitting/merging PDFs.\n" +
    "- Python ecosystem for extraction/analysis: pypdf, pdfplumber, pypdfium2, reportlab.\n" +
    "- CLI tooling for performance/repair: poppler-utils (pdftotext/pdftoppm/pdfimages), qpdf.\n\n" +
    "Execution policy:\n" +
    "1) Use execute_bash for shell commands and script execution.\n" +
    "2) Before running any Node script that imports pdf-lib, bootstrap dependency availability with:\n" +
    "   npm -s ls pdf-lib >/dev/null 2>&1 || npm install --no-save pdf-lib\n" +
    "   Then verify with: node -e \"require.resolve('pdf-lib')\".\n" +
    "3) Keep all outputs workspace-relative.\n" +
    "4) If you produce a final PDF file, call set_output_document with its path.\n" +
    "5) For extraction-only requests, return concise text and artifact locations.\n" +
    "6) Include exact commands/scripts used when reporting.\n\n" +
    "Advanced PDF reference:\n" +
    "- pypdfium2: fast rendering/text extraction.\n" +
    "- pdf-lib (JS): PDFDocument.load/create, copyPages, addPage, drawText, drawRectangle, save.\n" +
    "- pdfjs-dist (JS): getDocument, getPage, getTextContent, getAnnotations for browser pipelines.\n" +
    "- poppler-utils: pdftotext, pdftoppm, pdfimages.\n" +
    "- qpdf: --split-pages, --pages, --linearize, --optimize-level, --check.\n\n" +
    "Output rules:\n" +
    "- Keep responses concise.\n" +
    "- If a final PDF was produced, publish it with set_output_document.\n" +
    "- If no PDF was produced, clearly explain why.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for PDF task planning and execution reasoning." })
  declare model: any;

  @prop({ type: "document", default: {
  "type": "document",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Document", description: "Optional PDF/document input for transformation or analysis." })
  declare document: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing the PDF processing task." })
  declare prompt: any;

  @prop({ type: "int", default: 300, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 220000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;



}

// ---------------------------------------------------------------------------
// PptxSkill
// ---------------------------------------------------------------------------

export class PptxSkillNode extends SkillNode {
  static readonly nodeType = "skills.pptx.PptxSkill";
      static readonly title = "PPTX Skill";
      static readonly description = "Prompt-driven PowerPoint generation skill with PptxGenJS.\n    skills, pptx, powerpoint, pptxgenjs, slides";
    static readonly metadataOutputTypes = {
    document: "document",
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a PptxGenJS specialist for creating and editing .pptx presentations.\n\n" +
    "Execution policy:\n" +
    "1) Use execute_bash to run Node.js scripts and shell commands.\n" +
    "2) Keep outputs workspace-relative.\n" +
    "3) If you produce a final PPTX, call set_output_document with its path.\n" +
    "4) Return concise status and key file paths.\n\n" +
    "PptxGenJS fundamentals:\n" +
    "- Use fresh pptxgen() instance per presentation.\n" +
    "- Common layouts: LAYOUT_16x9 (10x5.625), LAYOUT_16x10, LAYOUT_4x3, LAYOUT_WIDE.\n" +
    "- Coordinates are inches.\n" +
    "- Text supports rich runs, bullets, breakLine, align/valign, font styling.\n" +
    "- Use charSpacing (not letterSpacing).\n" +
    "- Use margin: 0 when precise alignment with shapes/icons is required.\n" +
    "- Bullets: use bullet: true; never insert unicode bullet characters manually.\n" +
    "- For multi-line runs in arrays, set breakLine: true between lines.\n" +
    "- Avoid lineSpacing with bullets; prefer paraSpaceAfter.\n\n" +
    "Critical pitfalls to avoid:\n" +
    "- NEVER include '#' in hex colors. Use 'FF0000', not '#FF0000'.\n" +
    "- NEVER use 8-char hex for opacity in colors. Use opacity field.\n" +
    "- Shadow offset must be non-negative.\n" +
    "- Do not reuse option objects across calls because PptxGenJS may mutate them.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for PPTX planning and generation reasoning." })
  declare model: any;

  @prop({ type: "document", default: {
  "type": "document",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Document", description: "Optional source PPTX/document input." })
  declare document: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing PPTX task." })
  declare prompt: any;

  @prop({ type: "int", default: 300, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 220000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;



}

// ---------------------------------------------------------------------------
// SpreadsheetSkill
// ---------------------------------------------------------------------------

export class SpreadsheetSkillNode extends SkillNode {
  static readonly nodeType = "skills.spreadsheet.SpreadsheetSkill";
      static readonly title = "Spreadsheet Skill";
      static readonly description = "Prompt-driven spreadsheet skill for CSV/XLSX processing.\n    skills, spreadsheet, csv, xlsx, tabular";
    static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a spreadsheet and tabular data specialist. Use execute_bash for transformations " +
    "using tools like Python/pandas, csvkit, or shell utilities. Preserve data fidelity and " +
    "call out schema/column assumptions before applying formulas or joins. " +
    "Return concise summaries plus output file paths for generated tables.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for task planning and execution reasoning." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing the requested task." })
  declare prompt: any;

  @prop({ type: "int", default: 180, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 200000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;

}

// ---------------------------------------------------------------------------
// VectorStoreSkill
// ---------------------------------------------------------------------------

export class VectorStoreSkillNode extends SkillNode {
  static readonly nodeType = "skills.vectorstore.VectorStoreSkill";
      static readonly title = "Vector Store Skill";
      static readonly description = "Prompt-driven vector store skill for indexing and similarity search workflows.\n    skills, vectorstore, embeddings, rag, retrieval";
    static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a vector retrieval specialist. Use execute_bash to run embedding/indexing/search " +
    "operations with local or remote vector stores. Be explicit about embedding model, chunking, " +
    "distance metric, and top-k parameters. Ground retrieval quality claims in measurable outputs.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for task planning and execution reasoning." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing the requested task." })
  declare prompt: any;

  @prop({ type: "int", default: 180, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 200000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;

}

// ---------------------------------------------------------------------------
// YtDlpDownloaderSkill
// ---------------------------------------------------------------------------

export class YtDlpDownloaderSkillNode extends SkillNode {
  static readonly nodeType = "skills.ytdlp.YtDlpDownloaderSkill";
      static readonly title = "yt-dlp Downloader Skill";
      static readonly description = "Download videos from YouTube/Bilibili/Twitter and other sites via yt-dlp.\n    skills, media, yt-dlp, downloader, youtube, bilibili, twitter";
    static readonly metadataOutputTypes = {
    video: "video",
    text: "str"
  };
  static readonly _systemPrompt =
    "You are yt-dlp-downloader.\n" +
    "Goal: download web videos with yt-dlp and publish the resulting video file path.\n\n" +
    "Workflow:\n" +
    "1) Verify prerequisites with shell commands:\n" +
    "   - which yt-dlp || echo 'yt-dlp not installed. Install with: pip install yt-dlp'\n" +
    "   - which ffmpeg || echo 'ffmpeg not installed. Install with: brew install ffmpeg'\n" +
    "2) If URL is YouTube, prefer --cookies-from-browser chrome to avoid 403.\n" +
    "3) Build yt-dlp command matching request (download/extract/subtitles/quality).\n" +
    "4) Use execute_bash for all commands.\n" +
    "5) Handle failures:\n" +
    "   - 403: retry with --cookies-from-browser chrome\n" +
    "   - unavailable format: use -F, then choose a format id\n" +
    "6) Final step is mandatory: call set_output_video with the final video file path.\n\n" +
    "Scope boundary:\n" +
    "- This skill is for yt-dlp downloading tasks only.\n" +
    "- For standalone ffmpeg editing/transcoding workflows, use the dedicated FFmpeg Skill.\n\n" +
    "Output rules:\n" +
    "- Keep response concise and include final save location.\n" +
    "- Always save outputs under workspace-relative output_dir.\n" +
    "- If no video file is produced, clearly explain why.";
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model used for yt-dlp planning and execution reasoning." })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Prompt describing what to download." })
  declare prompt: any;

  @prop({ type: "str", default: "", title: "Url", description: "Optional explicit video URL to download." })
  declare url: any;

  @prop({ type: "str", default: "downloads/yt-dlp", title: "Output Dir", description: "Workspace-relative output directory for downloads." })
  declare output_dir: any;

  @prop({ type: "int", default: 300, title: "Timeout Seconds", description: "Maximum runtime for agent execution.", min: 1, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "int", default: 220000, title: "Max Output Chars", description: "Maximum serialized output chars before truncation.", min: 1000, max: 2000000 })
  declare max_output_chars: any;



}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const SKILLS_NODES: readonly NodeClass[] = [
  ShellAgentSkillNode,
  BrowserSkillNode,
  SQLiteSkillNode,
  SupabaseSkillNode,
  DocumentSkillNode,
  DocxSkillNode,
  EmailSkillNode,
  FfmpegSkillNode,
  FilesystemSkillNode,
  GitSkillNode,
  HtmlSkillNode,
  HttpApiSkillNode,
  ImageSkillNode,
  MediaSkillNode,
  PdfLibSkillNode,
  PptxSkillNode,
  SpreadsheetSkillNode,
  VectorStoreSkillNode,
  YtDlpDownloaderSkillNode,
];
