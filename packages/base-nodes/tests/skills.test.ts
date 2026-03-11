import { describe, it, expect } from "vitest";
import {
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
  SKILLS_NODES,
} from "../src/nodes/skills.js";

describe("Skills node registration", () => {
  it("exports 19 skill nodes", () => {
    expect(SKILLS_NODES.length).toBe(19);
  });
});

const skillClasses = [
  { cls: ShellAgentSkillNode, type: "skills._shell_agent.ShellAgentSkill", title: "Shell Agent Skill" },
  { cls: BrowserSkillNode, type: "skills.browser.BrowserSkill", title: "Browser Skill" },
  { cls: SQLiteSkillNode, type: "skills.data.SQLiteSkill", title: "SQLite Skill" },
  { cls: SupabaseSkillNode, type: "skills.data.SupabaseSkill", title: "Supabase Skill" },
  { cls: DocumentSkillNode, type: "skills.document.DocumentSkill", title: "Document Skill" },
  { cls: DocxSkillNode, type: "skills.docx.DocxSkill", title: "DOCX Skill" },
  { cls: EmailSkillNode, type: "skills.email.EmailSkill", title: "Email Skill" },
  { cls: FfmpegSkillNode, type: "skills.ffmpeg.FfmpegSkill", title: "FFmpeg Skill" },
  { cls: FilesystemSkillNode, type: "skills.filesystem.FilesystemSkill", title: "Filesystem Skill" },
  { cls: GitSkillNode, type: "skills.git.GitSkill", title: "Git Skill" },
  { cls: HtmlSkillNode, type: "skills.html.HtmlSkill", title: "HTML Skill" },
  { cls: HttpApiSkillNode, type: "skills.httpapi.HttpApiSkill", title: "HTTP API Skill" },
  { cls: ImageSkillNode, type: "skills.image.ImageSkill", title: "Image Skill" },
  { cls: MediaSkillNode, type: "skills.media.MediaSkill", title: "Media Skill" },
  { cls: PdfLibSkillNode, type: "skills.pdf_lib.PdfLibSkill", title: "PDF-lib Skill" },
  { cls: PptxSkillNode, type: "skills.pptx.PptxSkill", title: "PPTX Skill" },
  { cls: SpreadsheetSkillNode, type: "skills.spreadsheet.SpreadsheetSkill", title: "Spreadsheet Skill" },
  { cls: VectorStoreSkillNode, type: "skills.vectorstore.VectorStoreSkill", title: "Vector Store Skill" },
  { cls: YtDlpDownloaderSkillNode, type: "skills.ytdlp.YtDlpDownloaderSkill", title: "yt-dlp Downloader Skill" },
];

describe.each(skillClasses)("$title", ({ cls, type, title }) => {
  it(`has nodeType ${type}`, () => {
    expect((cls as any).nodeType).toBe(type);
  });

  it(`has title "${title}"`, () => {
    expect((cls as any).title).toBe(title);
  });

  it("has defaults with model and prompt", () => {
    const node = new (cls as any)();
    const d = node.serialize();
    expect(d).toHaveProperty("model");
    expect(d).toHaveProperty("prompt");
    expect(d).toHaveProperty("timeout_seconds");
  });

  it("process throws when prompt is empty", async () => {
    const node = new (cls as any)();
    await expect(node.process({})).rejects.toThrow();
  });
});

// Specific defaults overrides
describe("Skill-specific defaults", () => {
  it("BrowserSkillNode has timeout_seconds 150", () => {
    const node = new BrowserSkillNode();
    expect(node.serialize().timeout_seconds).toBe(150);
  });

  it("SQLiteSkillNode has db_path", () => {
    const node = new SQLiteSkillNode();
    const d = node.serialize();
    expect(d.db_path).toBe("memory.db");
    expect(d.allow_mutation).toBe(false);
  });

  it("FfmpegSkillNode has audio/video refs", () => {
    const node = new FfmpegSkillNode();
    const d = node.serialize();
    expect(d.audio).toHaveProperty("type", "audio");
    expect(d.video).toHaveProperty("type", "video");
  });

  it("ImageSkillNode has image ref and timeout 90", () => {
    const node = new ImageSkillNode();
    const d = node.serialize();
    expect(d.image).toHaveProperty("type", "image");
    expect(d.timeout_seconds).toBe(90);
  });

  it("YtDlpDownloaderSkillNode has url and output_dir", () => {
    const node = new YtDlpDownloaderSkillNode();
    const d = node.serialize();
    expect(d.url).toBe("");
    expect(d.output_dir).toBe("downloads/yt-dlp");
    expect(d.timeout_seconds).toBe(300);
  });

  it("PdfLibSkillNode has document ref", () => {
    const node = new PdfLibSkillNode();
    const d = node.serialize();
    expect(d.document).toHaveProperty("type", "document");
  });

  it("DocxSkillNode has timeout 300", () => {
    const node = new DocxSkillNode();
    expect(node.serialize().timeout_seconds).toBe(300);
  });

  it("HtmlSkillNode has max_output_chars 180000", () => {
    const node = new HtmlSkillNode();
    expect(node.serialize().max_output_chars).toBe(180000);
  });
});
