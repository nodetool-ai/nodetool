// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef } from "../types.js";

// Summarizer — nodetool.agents.Summarizer
export interface SummarizerInputs {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
}

export interface SummarizerOutputs {
  text: string;
  chunk: unknown;
}

export function summarizer(inputs: SummarizerInputs): DslNode<SummarizerOutputs> {
  return createNode("nodetool.agents.Summarizer", inputs as Record<string, unknown>, { outputNames: ["text", "chunk"], streaming: true });
}

// Create Thread — nodetool.agents.CreateThread
export interface CreateThreadInputs {
  title?: Connectable<string>;
  thread_id?: Connectable<string>;
}

export interface CreateThreadOutputs {
  thread_id: string;
}

export function createThread(inputs: CreateThreadInputs): DslNode<CreateThreadOutputs, "thread_id"> {
  return createNode("nodetool.agents.CreateThread", inputs as Record<string, unknown>, { outputNames: ["thread_id"], defaultOutput: "thread_id" });
}

// Extractor — nodetool.agents.Extractor
export interface ExtractorInputs {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
}

export interface ExtractorOutputs {
}

export function extractor(inputs: ExtractorInputs): DslNode<ExtractorOutputs> {
  return createNode("nodetool.agents.Extractor", inputs as Record<string, unknown>, { outputNames: [] });
}

// Classifier — nodetool.agents.Classifier
export interface ClassifierInputs {
  system_prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  text?: Connectable<string>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  categories?: Connectable<string[]>;
}

export interface ClassifierOutputs {
  output: string;
}

export function classifier(inputs: ClassifierInputs): DslNode<ClassifierOutputs, "output"> {
  return createNode("nodetool.agents.Classifier", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Agent — nodetool.agents.Agent
export interface AgentInputs {
  model?: Connectable<unknown>;
  mode?: Connectable<string>;
  system?: Connectable<string>;
  prompt?: Connectable<string>;
  tools?: Connectable<unknown[]>;
  image?: Connectable<ImageRef>;
  audio?: Connectable<AudioRef>;
  history?: Connectable<unknown[]>;
  thread_id?: Connectable<string>;
  max_tokens?: Connectable<number>;
  num_agents?: Connectable<number>;
  team_strategy?: Connectable<string>;
}

export interface AgentOutputs {
  text: string;
  chunk: unknown;
  thinking: unknown;
  audio: AudioRef;
}

export function agent(inputs: AgentInputs): DslNode<AgentOutputs> {
  return createNode("nodetool.agents.Agent", inputs as Record<string, unknown>, { outputNames: ["text", "chunk", "thinking", "audio"], streaming: true });
}

// Shell Agent — nodetool.agents.ShellAgent
export interface ShellAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface ShellAgentOutputs {
  text: string;
}

export function shellAgent(inputs: ShellAgentInputs): DslNode<ShellAgentOutputs, "text"> {
  return createNode("nodetool.agents.ShellAgent", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}

// Browser Agent — nodetool.agents.BrowserAgent
export interface BrowserAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface BrowserAgentOutputs {
  text: string;
}

export function browserAgent(inputs: BrowserAgentInputs): DslNode<BrowserAgentOutputs, "text"> {
  return createNode("nodetool.agents.BrowserAgent", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}

// SQLite Agent — nodetool.agents.SQLiteAgent
export interface SQLiteAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
  db_path?: Connectable<string>;
  allow_mutation?: Connectable<boolean>;
}

export interface SQLiteAgentOutputs {
  text: string;
  json: Record<string, unknown>;
  dataframe: DataframeRef;
}

export function sqLiteAgent(inputs: SQLiteAgentInputs): DslNode<SQLiteAgentOutputs> {
  return createNode("nodetool.agents.SQLiteAgent", inputs as Record<string, unknown>, { outputNames: ["text", "json", "dataframe"] });
}

// Supabase Agent — nodetool.agents.SupabaseAgent
export interface SupabaseAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface SupabaseAgentOutputs {
  text: string;
  json: Record<string, unknown>;
  dataframe: DataframeRef;
}

export function supabaseAgent(inputs: SupabaseAgentInputs): DslNode<SupabaseAgentOutputs> {
  return createNode("nodetool.agents.SupabaseAgent", inputs as Record<string, unknown>, { outputNames: ["text", "json", "dataframe"] });
}

// Document Agent — nodetool.agents.DocumentAgent
export interface DocumentAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface DocumentAgentOutputs {
  text: string;
  document: unknown;
}

export function documentAgent(inputs: DocumentAgentInputs): DslNode<DocumentAgentOutputs> {
  return createNode("nodetool.agents.DocumentAgent", inputs as Record<string, unknown>, { outputNames: ["text", "document"] });
}

// DOCX Agent — nodetool.agents.DocxAgent
export interface DocxAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface DocxAgentOutputs {
  document: unknown;
  text: string;
}

export function docxAgent(inputs: DocxAgentInputs): DslNode<DocxAgentOutputs> {
  return createNode("nodetool.agents.DocxAgent", inputs as Record<string, unknown>, { outputNames: ["document", "text"] });
}

// Email Agent — nodetool.agents.EmailAgent
export interface EmailAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface EmailAgentOutputs {
  text: string;
}

export function emailAgent(inputs: EmailAgentInputs): DslNode<EmailAgentOutputs, "text"> {
  return createNode("nodetool.agents.EmailAgent", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}

// FFmpeg Agent — nodetool.agents.FfmpegAgent
export interface FfmpegAgentInputs {
  model?: Connectable<unknown>;
  audio?: Connectable<AudioRef>;
  video?: Connectable<VideoRef>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface FfmpegAgentOutputs {
  video: VideoRef;
  audio: AudioRef;
  text: string;
}

export function ffmpegAgent(inputs: FfmpegAgentInputs): DslNode<FfmpegAgentOutputs> {
  return createNode("nodetool.agents.FfmpegAgent", inputs as Record<string, unknown>, { outputNames: ["video", "audio", "text"] });
}

// Filesystem Agent — nodetool.agents.FilesystemAgent
export interface FilesystemAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface FilesystemAgentOutputs {
  text: string;
}

export function filesystemAgent(inputs: FilesystemAgentInputs): DslNode<FilesystemAgentOutputs, "text"> {
  return createNode("nodetool.agents.FilesystemAgent", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}

// Git Agent — nodetool.agents.GitAgent
export interface GitAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface GitAgentOutputs {
  text: string;
}

export function gitAgent(inputs: GitAgentInputs): DslNode<GitAgentOutputs, "text"> {
  return createNode("nodetool.agents.GitAgent", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}

// HTML Agent — nodetool.agents.HtmlAgent
export interface HtmlAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface HtmlAgentOutputs {
  html: unknown;
  text: string;
}

export function htmlAgent(inputs: HtmlAgentInputs): DslNode<HtmlAgentOutputs> {
  return createNode("nodetool.agents.HtmlAgent", inputs as Record<string, unknown>, { outputNames: ["html", "text"] });
}

// HTTP API Agent — nodetool.agents.HttpApiAgent
export interface HttpApiAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface HttpApiAgentOutputs {
  text: string;
}

export function httpApiAgent(inputs: HttpApiAgentInputs): DslNode<HttpApiAgentOutputs, "text"> {
  return createNode("nodetool.agents.HttpApiAgent", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}

// Image Agent — nodetool.agents.ImageAgent
export interface ImageAgentInputs {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface ImageAgentOutputs {
  image: ImageRef;
  text: string;
}

export function imageAgent(inputs: ImageAgentInputs): DslNode<ImageAgentOutputs> {
  return createNode("nodetool.agents.ImageAgent", inputs as Record<string, unknown>, { outputNames: ["image", "text"] });
}

// Media Agent — nodetool.agents.MediaAgent
export interface MediaAgentInputs {
  model?: Connectable<unknown>;
  audio?: Connectable<AudioRef>;
  video?: Connectable<VideoRef>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface MediaAgentOutputs {
  video: VideoRef;
  audio: AudioRef;
  text: string;
}

export function mediaAgent(inputs: MediaAgentInputs): DslNode<MediaAgentOutputs> {
  return createNode("nodetool.agents.MediaAgent", inputs as Record<string, unknown>, { outputNames: ["video", "audio", "text"] });
}

// PDF-lib Agent — nodetool.agents.PdfLibAgent
export interface PdfLibAgentInputs {
  model?: Connectable<unknown>;
  document?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface PdfLibAgentOutputs {
  document: unknown;
  text: string;
}

export function pdfLibAgent(inputs: PdfLibAgentInputs): DslNode<PdfLibAgentOutputs> {
  return createNode("nodetool.agents.PdfLibAgent", inputs as Record<string, unknown>, { outputNames: ["document", "text"] });
}

// PPTX Agent — nodetool.agents.PptxAgent
export interface PptxAgentInputs {
  model?: Connectable<unknown>;
  document?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface PptxAgentOutputs {
  document: unknown;
  text: string;
}

export function pptxAgent(inputs: PptxAgentInputs): DslNode<PptxAgentOutputs> {
  return createNode("nodetool.agents.PptxAgent", inputs as Record<string, unknown>, { outputNames: ["document", "text"] });
}

// Spreadsheet Agent — nodetool.agents.SpreadsheetAgent
export interface SpreadsheetAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface SpreadsheetAgentOutputs {
  text: string;
}

export function spreadsheetAgent(inputs: SpreadsheetAgentInputs): DslNode<SpreadsheetAgentOutputs, "text"> {
  return createNode("nodetool.agents.SpreadsheetAgent", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}

// Vector Store Agent — nodetool.agents.VectorStoreAgent
export interface VectorStoreAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface VectorStoreAgentOutputs {
  text: string;
}

export function vectorStoreAgent(inputs: VectorStoreAgentInputs): DslNode<VectorStoreAgentOutputs, "text"> {
  return createNode("nodetool.agents.VectorStoreAgent", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}

// yt-dlp Downloader Agent — nodetool.agents.YtDlpDownloaderAgent
export interface YtDlpDownloaderAgentInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  url?: Connectable<string>;
  output_dir?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface YtDlpDownloaderAgentOutputs {
  video: VideoRef;
  text: string;
}

export function ytDlpDownloaderAgent(inputs: YtDlpDownloaderAgentInputs): DslNode<YtDlpDownloaderAgentOutputs> {
  return createNode("nodetool.agents.YtDlpDownloaderAgent", inputs as Record<string, unknown>, { outputNames: ["video", "text"] });
}
