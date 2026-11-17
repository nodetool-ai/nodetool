import { describe, expect, it } from "vitest";
import {
  chatAttachmentDetail,
  describeChatAttachment,
  formatAttachmentSize
} from "../src/chat-attachment.js";

// "hello world" is 11 bytes; base64 "aGVsbG8gd29ybGQ=" carries one pad.
const HELLO_PDF = "data:application/pdf;base64,aGVsbG8gd29ybGQ=";

describe("describeChatAttachment", () => {
  it("uses the recorded title and measures an inline payload", () => {
    expect(describeChatAttachment({ uri: HELLO_PDF, title: " Q3 report.pdf " })).toEqual({
      name: "Q3 report.pdf",
      typeLabel: "PDF",
      sizeBytes: 11
    });
  });

  it("types an untitled data URI from its MIME", () => {
    const docx =
      "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,AAAA";
    expect(describeChatAttachment({ uri: docx })).toEqual({
      name: "",
      typeLabel: "DOCX",
      sizeBytes: 3
    });
  });

  it("gives an asset URI no name but keeps its extension", () => {
    expect(
      describeChatAttachment({ uri: "asset://0123456789abcdef0123456789abcdef.pdf" })
    ).toEqual({ name: "", typeLabel: "PDF", sizeBytes: null });
  });

  it("reads the extension from asset_id when there is no uri", () => {
    expect(describeChatAttachment({ asset_id: "abc.xlsx" }).typeLabel).toBe("XLSX");
  });

  it("names a URL by its decoded last segment", () => {
    expect(
      describeChatAttachment({ uri: "https://x.test/files/My%20Notes.docx?sig=1" })
    ).toEqual({ name: "My Notes.docx", typeLabel: "DOCX", sizeBytes: null });
  });

  it("returns empty parts for an empty ref", () => {
    expect(describeChatAttachment({})).toEqual({ name: "", typeLabel: "", sizeBytes: null });
  });
});

describe("formatAttachmentSize", () => {
  it.each([
    [0, "0 B"],
    [980, "980 B"],
    [1536, "1.5 KB"],
    [12 * 1024, "12 KB"],
    [1.4 * 1024 * 1024, "1.4 MB"]
  ])("%d → %s", (bytes, label) => {
    expect(formatAttachmentSize(bytes)).toBe(label);
  });
});

describe("chatAttachmentDetail", () => {
  it("joins the known parts", () => {
    expect(chatAttachmentDetail({ name: "", typeLabel: "PDF", sizeBytes: 2048 })).toBe(
      "PDF · 2 KB"
    );
    expect(chatAttachmentDetail({ name: "", typeLabel: "", sizeBytes: null })).toBe("");
  });
});
