// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function summarizer(inputs) {
  return createNode("nodetool.agents.Summarizer", inputs, { outputNames: ["text", "chunk"], streaming: true });
}
function enhancePrompt(inputs) {
  return createNode("nodetool.agents.EnhancePrompt", inputs, { outputNames: ["text", "chunk"], streaming: true });
}
function createThread(inputs) {
  return createNode("nodetool.agents.CreateThread", inputs, { outputNames: ["thread_id"], defaultOutput: "thread_id" });
}
function extractor(inputs) {
  return createNode("nodetool.agents.Extractor", inputs, { outputNames: [] });
}
function classifier(inputs) {
  return createNode("nodetool.agents.Classifier", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function agent(inputs) {
  return createNode("nodetool.agents.Agent", inputs, { outputNames: ["text", "chunk", "thinking", "audio"], streaming: true });
}
function shellAgent(inputs) {
  return createNode("nodetool.agents.ShellAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}
function browserAgent(inputs) {
  return createNode("nodetool.agents.BrowserAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}
function liveBrowserAgent(inputs) {
  return createNode("nodetool.agents.LiveBrowserAgent", inputs, { outputNames: ["text", "chunk"], streaming: true });
}
function sqLiteAgent(inputs) {
  return createNode("nodetool.agents.SQLiteAgent", inputs, { outputNames: ["text", "json", "dataframe"] });
}
function supabaseAgent(inputs) {
  return createNode("nodetool.agents.SupabaseAgent", inputs, { outputNames: ["text", "json", "dataframe"] });
}
function documentAgent(inputs) {
  return createNode("nodetool.agents.DocumentAgent", inputs, { outputNames: ["text", "document"] });
}
function docxAgent(inputs) {
  return createNode("nodetool.agents.DocxAgent", inputs, { outputNames: ["document", "text"] });
}
function emailAgent(inputs) {
  return createNode("nodetool.agents.EmailAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}
function ffmpegAgent(inputs) {
  return createNode("nodetool.agents.FfmpegAgent", inputs, { outputNames: ["video", "audio", "text"] });
}
function filesystemAgent(inputs) {
  return createNode("nodetool.agents.FilesystemAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}
function gitAgent(inputs) {
  return createNode("nodetool.agents.GitAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}
function htmlAgent(inputs) {
  return createNode("nodetool.agents.HtmlAgent", inputs, { outputNames: ["html", "text"] });
}
function httpApiAgent(inputs) {
  return createNode("nodetool.agents.HttpApiAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}
function imageAgent(inputs) {
  return createNode("nodetool.agents.ImageAgent", inputs, { outputNames: ["image", "text"] });
}
function mediaAgent(inputs) {
  return createNode("nodetool.agents.MediaAgent", inputs, { outputNames: ["video", "audio", "text"] });
}
function pdfLibAgent(inputs) {
  return createNode("nodetool.agents.PdfLibAgent", inputs, { outputNames: ["document", "text"] });
}
function pptxAgent(inputs) {
  return createNode("nodetool.agents.PptxAgent", inputs, { outputNames: ["document", "text"] });
}
function spreadsheetAgent(inputs) {
  return createNode("nodetool.agents.SpreadsheetAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}
function vectorStoreAgent(inputs) {
  return createNode("nodetool.agents.VectorStoreAgent", inputs, { outputNames: ["text"], defaultOutput: "text" });
}
function ytDlpDownloaderAgent(inputs) {
  return createNode("nodetool.agents.YtDlpDownloaderAgent", inputs, { outputNames: ["video", "text"] });
}
function claudeCodeAgent(inputs) {
  return createNode("nodetool.agents.ClaudeCodeAgent", inputs, { outputNames: ["text", "chunk", "transcript", "session_id"], streaming: true });
}
export {
  agent,
  browserAgent,
  classifier,
  claudeCodeAgent,
  createThread,
  documentAgent,
  docxAgent,
  emailAgent,
  enhancePrompt,
  extractor,
  ffmpegAgent,
  filesystemAgent,
  gitAgent,
  htmlAgent,
  httpApiAgent,
  imageAgent,
  liveBrowserAgent,
  mediaAgent,
  pdfLibAgent,
  pptxAgent,
  shellAgent,
  spreadsheetAgent,
  sqLiteAgent,
  summarizer,
  supabaseAgent,
  vectorStoreAgent,
  ytDlpDownloaderAgent
};
