// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef } from "../types.js";

// Summarizer — nodetool.agents.Summarizer
export type SummarizerInputs = {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  max_sentences?: Connectable<number>;
};

export interface SummarizerOutputs {
  text: string;
  chunk: unknown;
}

export function summarizer(inputs: SummarizerInputs): DslNode<SummarizerOutputs> {
  return createNode("nodetool.agents.Summarizer", inputs, { outputNames: ["text", "chunk"], streaming: true });
}

// Enhance Prompt — nodetool.agents.EnhancePrompt
export type EnhancePromptInputs = {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  target?: Connectable<"general" | "text" | "image" | "video" | "audio" | "code">;
};

export interface EnhancePromptOutputs {
  text: string;
  chunk: unknown;
}

export function enhancePrompt(inputs: EnhancePromptInputs): DslNode<EnhancePromptOutputs> {
  return createNode("nodetool.agents.EnhancePrompt", inputs, { outputNames: ["text", "chunk"], streaming: true });
}

// Create Thread — nodetool.agents.CreateThread
export type CreateThreadInputs = {
  title?: Connectable<string>;
  thread_id?: Connectable<string>;
};

export interface CreateThreadOutputs {
  thread_id: string;
}

export function createThread(inputs: CreateThreadInputs): DslNode<CreateThreadOutputs, "thread_id"> {
  return createNode("nodetool.agents.CreateThread", inputs, { outputNames: ["thread_id"], defaultOutput: "thread_id" });
}

// Extractor — nodetool.agents.Extractor
export type ExtractorInputs = {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  max_tokens?: Connectable<number>;
};

export interface ExtractorOutputs {
}

export function extractor(inputs: ExtractorInputs): DslNode<ExtractorOutputs> {
  return createNode("nodetool.agents.Extractor", inputs, { outputNames: [] });
}

// Classifier — nodetool.agents.Classifier
export type ClassifierInputs = {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  categories?: Connectable<string[]>;
  max_tokens?: Connectable<number>;
};

export interface ClassifierOutputs {
  output: string;
}

export function classifier(inputs: ClassifierInputs): DslNode<ClassifierOutputs, "output"> {
  return createNode("nodetool.agents.Classifier", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Agent — nodetool.agents.Agent
export type AgentInputs = {
  model?: Connectable<unknown>;
  mode?: Connectable<"loop" | "plan">;
  system?: Connectable<string>;
  prompt?: Connectable<string>;
  tools?: Connectable<unknown[]>;
  image?: Connectable<ImageRef[]>;
  audio?: Connectable<AudioRef[]>;
  history?: Connectable<unknown[]>;
  thread_id?: Connectable<string>;
  max_tokens?: Connectable<number>;
  max_turns?: Connectable<number>;
  max_steps?: Connectable<number>;
};

export interface AgentOutputs {
  text: string;
  chunk: unknown;
  thinking: unknown;
  audio: AudioRef;
}

export function agent(inputs: AgentInputs): DslNode<AgentOutputs> {
  return createNode("nodetool.agents.Agent", inputs, { outputNames: ["text", "chunk", "thinking", "audio"], streaming: true });
}

// Shell Agent — nodetool.agents.ShellAgent
export type ShellAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface ShellAgentOutputs {
  text: string;
}

export function shellAgent(inputs: ShellAgentInputs): DslNode<ShellAgentOutputs, "text"> {
  return createNode("nodetool.agents.ShellAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}

// Browser Agent — nodetool.agents.BrowserAgent
export type BrowserAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface BrowserAgentOutputs {
  text: string;
}

export function browserAgent(inputs: BrowserAgentInputs): DslNode<BrowserAgentOutputs, "text"> {
  return createNode("nodetool.agents.BrowserAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}

// Live Browser Agent — nodetool.agents.LiveBrowserAgent
export type LiveBrowserAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
};

export interface LiveBrowserAgentOutputs {
  text: string;
  chunk: unknown;
}

export function liveBrowserAgent(inputs: LiveBrowserAgentInputs): DslNode<LiveBrowserAgentOutputs> {
  return createNode("nodetool.agents.LiveBrowserAgent", inputs, { outputNames: ["text", "chunk"], streaming: true });
}

// SQLite Agent — nodetool.agents.SQLiteAgent
export type SQLiteAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
  db_path?: Connectable<string>;
  allow_mutation?: Connectable<boolean>;
};

export interface SQLiteAgentOutputs {
  text: string;
  json: Record<string, unknown>;
  dataframe: DataframeRef;
}

export function sqLiteAgent(inputs: SQLiteAgentInputs): DslNode<SQLiteAgentOutputs> {
  return createNode("nodetool.agents.SQLiteAgent", inputs, { outputNames: ["text", "json", "dataframe"] });
}

// Supabase Agent — nodetool.agents.SupabaseAgent
export type SupabaseAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface SupabaseAgentOutputs {
  text: string;
  json: Record<string, unknown>;
  dataframe: DataframeRef;
}

export function supabaseAgent(inputs: SupabaseAgentInputs): DslNode<SupabaseAgentOutputs> {
  return createNode("nodetool.agents.SupabaseAgent", inputs, { outputNames: ["text", "json", "dataframe"] });
}

// Document Agent — nodetool.agents.DocumentAgent
export type DocumentAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface DocumentAgentOutputs {
  text: string;
  document: unknown;
}

export function documentAgent(inputs: DocumentAgentInputs): DslNode<DocumentAgentOutputs> {
  return createNode("nodetool.agents.DocumentAgent", inputs, { outputNames: ["text", "document"] });
}

// DOCX Agent — nodetool.agents.DocxAgent
export type DocxAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface DocxAgentOutputs {
  document: unknown;
  text: string;
}

export function docxAgent(inputs: DocxAgentInputs): DslNode<DocxAgentOutputs> {
  return createNode("nodetool.agents.DocxAgent", inputs, { outputNames: ["document", "text"] });
}

// Email Agent — nodetool.agents.EmailAgent
export type EmailAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface EmailAgentOutputs {
  text: string;
}

export function emailAgent(inputs: EmailAgentInputs): DslNode<EmailAgentOutputs, "text"> {
  return createNode("nodetool.agents.EmailAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}

// FFmpeg Agent — nodetool.agents.FfmpegAgent
export type FfmpegAgentInputs = {
  model?: Connectable<unknown>;
  audio?: Connectable<AudioRef[]>;
  video?: Connectable<VideoRef[]>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface FfmpegAgentOutputs {
  video: VideoRef;
  audio: AudioRef;
  text: string;
}

export function ffmpegAgent(inputs: FfmpegAgentInputs): DslNode<FfmpegAgentOutputs> {
  return createNode("nodetool.agents.FfmpegAgent", inputs, { outputNames: ["video", "audio", "text"] });
}

// Filesystem Agent — nodetool.agents.FilesystemAgent
export type FilesystemAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface FilesystemAgentOutputs {
  text: string;
}

export function filesystemAgent(inputs: FilesystemAgentInputs): DslNode<FilesystemAgentOutputs, "text"> {
  return createNode("nodetool.agents.FilesystemAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}

// Git Agent — nodetool.agents.GitAgent
export type GitAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface GitAgentOutputs {
  text: string;
}

export function gitAgent(inputs: GitAgentInputs): DslNode<GitAgentOutputs, "text"> {
  return createNode("nodetool.agents.GitAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}

// HTML Agent — nodetool.agents.HtmlAgent
export type HtmlAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface HtmlAgentOutputs {
  html: unknown;
  text: string;
}

export function htmlAgent(inputs: HtmlAgentInputs): DslNode<HtmlAgentOutputs> {
  return createNode("nodetool.agents.HtmlAgent", inputs, { outputNames: ["html", "text"] });
}

// HTTP API Agent — nodetool.agents.HttpApiAgent
export type HttpApiAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface HttpApiAgentOutputs {
  text: string;
}

export function httpApiAgent(inputs: HttpApiAgentInputs): DslNode<HttpApiAgentOutputs, "text"> {
  return createNode("nodetool.agents.HttpApiAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}

// Image Agent — nodetool.agents.ImageAgent
export type ImageAgentInputs = {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef[]>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface ImageAgentOutputs {
  image: ImageRef;
  text: string;
}

export function imageAgent(inputs: ImageAgentInputs): DslNode<ImageAgentOutputs> {
  return createNode("nodetool.agents.ImageAgent", inputs, { outputNames: ["image", "text"] });
}

// Media Agent — nodetool.agents.MediaAgent
export type MediaAgentInputs = {
  model?: Connectable<unknown>;
  audio?: Connectable<AudioRef[]>;
  video?: Connectable<VideoRef[]>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface MediaAgentOutputs {
  video: VideoRef;
  audio: AudioRef;
  text: string;
}

export function mediaAgent(inputs: MediaAgentInputs): DslNode<MediaAgentOutputs> {
  return createNode("nodetool.agents.MediaAgent", inputs, { outputNames: ["video", "audio", "text"] });
}

// PDF-lib Agent — nodetool.agents.PdfLibAgent
export type PdfLibAgentInputs = {
  model?: Connectable<unknown>;
  document?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface PdfLibAgentOutputs {
  document: unknown;
  text: string;
}

export function pdfLibAgent(inputs: PdfLibAgentInputs): DslNode<PdfLibAgentOutputs> {
  return createNode("nodetool.agents.PdfLibAgent", inputs, { outputNames: ["document", "text"] });
}

// PPTX Agent — nodetool.agents.PptxAgent
export type PptxAgentInputs = {
  model?: Connectable<unknown>;
  document?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface PptxAgentOutputs {
  document: unknown;
  text: string;
}

export function pptxAgent(inputs: PptxAgentInputs): DslNode<PptxAgentOutputs> {
  return createNode("nodetool.agents.PptxAgent", inputs, { outputNames: ["document", "text"] });
}

// Spreadsheet Agent — nodetool.agents.SpreadsheetAgent
export type SpreadsheetAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface SpreadsheetAgentOutputs {
  text: string;
}

export function spreadsheetAgent(inputs: SpreadsheetAgentInputs): DslNode<SpreadsheetAgentOutputs, "text"> {
  return createNode("nodetool.agents.SpreadsheetAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}

// Vector Store Agent — nodetool.agents.VectorStoreAgent
export type VectorStoreAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface VectorStoreAgentOutputs {
  text: string;
}

export function vectorStoreAgent(inputs: VectorStoreAgentInputs): DslNode<VectorStoreAgentOutputs, "text"> {
  return createNode("nodetool.agents.VectorStoreAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}

// yt-dlp Downloader Agent — nodetool.agents.YtDlpDownloaderAgent
export type YtDlpDownloaderAgentInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  url?: Connectable<string>;
  output_dir?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
};

export interface YtDlpDownloaderAgentOutputs {
  video: VideoRef;
  text: string;
}

export function ytDlpDownloaderAgent(inputs: YtDlpDownloaderAgentInputs): DslNode<YtDlpDownloaderAgentOutputs> {
  return createNode("nodetool.agents.YtDlpDownloaderAgent", inputs, { outputNames: ["video", "text"] });
}

// Claude Code Agent — nodetool.agents.ClaudeCodeAgent
export type ClaudeCodeAgentInputs = {
  prompt?: Connectable<string>;
  input?: Connectable<string>;
  session_name?: Connectable<string>;
  keep_session?: Connectable<boolean>;
  model?: Connectable<string>;
  system_prompt?: Connectable<string>;
  extra_args?: Connectable<string>;
  command?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  quiet_period_seconds?: Connectable<number>;
};

export interface ClaudeCodeAgentOutputs {
  text: string;
  chunk: unknown;
  transcript: string;
  session_id: string;
}

export function claudeCodeAgent(inputs: ClaudeCodeAgentInputs): DslNode<ClaudeCodeAgentOutputs> {
  return createNode("nodetool.agents.ClaudeCodeAgent", inputs, { outputNames: ["text", "chunk", "transcript", "session_id"], streaming: true });
}
