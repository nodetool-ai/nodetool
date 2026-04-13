// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, DataframeRef } from "../types.js";

// Create Document — lib.docx.CreateDocument
export interface CreateDocumentInputs {
}

export interface CreateDocumentOutputs {
  output: unknown;
}

export function createDocument(inputs?: CreateDocumentInputs): DslNode<CreateDocumentOutputs, "output"> {
  return createNode("lib.docx.CreateDocument", (inputs ?? {}) as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Load Word Document — lib.docx.LoadWordDocument
export interface LoadWordDocumentInputs {
  path?: Connectable<string>;
}

export interface LoadWordDocumentOutputs {
  output: unknown;
}

export function loadWordDocument(inputs: LoadWordDocumentInputs): DslNode<LoadWordDocumentOutputs, "output"> {
  return createNode("lib.docx.LoadWordDocument", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Add Heading — lib.docx.AddHeading
export interface AddHeadingInputs {
  document?: Connectable<unknown>;
  text?: Connectable<string>;
  level?: Connectable<number>;
}

export interface AddHeadingOutputs {
  output: unknown;
}

export function addHeading(inputs: AddHeadingInputs): DslNode<AddHeadingOutputs, "output"> {
  return createNode("lib.docx.AddHeading", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Add Paragraph — lib.docx.AddParagraph
export interface AddParagraphInputs {
  document?: Connectable<unknown>;
  text?: Connectable<string>;
  alignment?: Connectable<"LEFT" | "CENTER" | "RIGHT" | "JUSTIFY">;
  bold?: Connectable<boolean>;
  italic?: Connectable<boolean>;
  font_size?: Connectable<number>;
}

export interface AddParagraphOutputs {
  output: unknown;
}

export function addParagraph(inputs: AddParagraphInputs): DslNode<AddParagraphOutputs, "output"> {
  return createNode("lib.docx.AddParagraph", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Add Table — lib.docx.AddTable
export interface AddTableInputs {
  document?: Connectable<unknown>;
  data?: Connectable<DataframeRef>;
}

export interface AddTableOutputs {
  output: unknown;
}

export function addTable(inputs: AddTableInputs): DslNode<AddTableOutputs, "output"> {
  return createNode("lib.docx.AddTable", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Add Image — lib.docx.AddImage
export interface AddImageInputs {
  document?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  width?: Connectable<number>;
  height?: Connectable<number>;
}

export interface AddImageOutputs {
  output: unknown;
}

export function addImage(inputs: AddImageInputs): DslNode<AddImageOutputs, "output"> {
  return createNode("lib.docx.AddImage", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Add Page Break — lib.docx.AddPageBreak
export interface AddPageBreakInputs {
  document?: Connectable<unknown>;
}

export interface AddPageBreakOutputs {
  output: unknown;
}

export function addPageBreak(inputs: AddPageBreakInputs): DslNode<AddPageBreakOutputs, "output"> {
  return createNode("lib.docx.AddPageBreak", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Set Document Properties — lib.docx.SetDocumentProperties
export interface SetDocumentPropertiesInputs {
  document?: Connectable<unknown>;
  title?: Connectable<string>;
  author?: Connectable<string>;
  subject?: Connectable<string>;
  keywords?: Connectable<string>;
}

export interface SetDocumentPropertiesOutputs {
  output: unknown;
}

export function setDocumentProperties(inputs: SetDocumentPropertiesInputs): DslNode<SetDocumentPropertiesOutputs, "output"> {
  return createNode("lib.docx.SetDocumentProperties", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Save Document — lib.docx.SaveDocument
export interface SaveDocumentInputs {
  document?: Connectable<unknown>;
  path?: Connectable<unknown>;
  filename?: Connectable<string>;
}

export interface SaveDocumentOutputs {
}

export function saveDocument(inputs: SaveDocumentInputs): DslNode<SaveDocumentOutputs> {
  return createNode("lib.docx.SaveDocument", inputs as Record<string, unknown>, { outputNames: [] });
}
