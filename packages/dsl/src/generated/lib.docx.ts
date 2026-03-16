// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef, DataframeRef } from "../types.js";

// Create Document — lib.docx.CreateDocument
export interface CreateDocumentInputs {
}

export function createDocument(inputs?: CreateDocumentInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.docx.CreateDocument", (inputs ?? {}) as Record<string, unknown>);
}

// Load Word Document — lib.docx.LoadWordDocument
export interface LoadWordDocumentInputs {
  path?: Connectable<string>;
}

export function loadWordDocument(inputs: LoadWordDocumentInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.docx.LoadWordDocument", inputs as Record<string, unknown>);
}

// Add Heading — lib.docx.AddHeading
export interface AddHeadingInputs {
  document?: Connectable<unknown>;
  text?: Connectable<string>;
  level?: Connectable<number>;
}

export function addHeading(inputs: AddHeadingInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.docx.AddHeading", inputs as Record<string, unknown>);
}

// Add Paragraph — lib.docx.AddParagraph
export interface AddParagraphInputs {
  document?: Connectable<unknown>;
  text?: Connectable<string>;
  alignment?: Connectable<unknown>;
  bold?: Connectable<boolean>;
  italic?: Connectable<boolean>;
  font_size?: Connectable<number>;
}

export function addParagraph(inputs: AddParagraphInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.docx.AddParagraph", inputs as Record<string, unknown>);
}

// Add Table — lib.docx.AddTable
export interface AddTableInputs {
  document?: Connectable<unknown>;
  data?: Connectable<DataframeRef>;
}

export function addTable(inputs: AddTableInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.docx.AddTable", inputs as Record<string, unknown>);
}

// Add Image — lib.docx.AddImage
export interface AddImageInputs {
  document?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  width?: Connectable<number>;
  height?: Connectable<number>;
}

export function addImage(inputs: AddImageInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.docx.AddImage", inputs as Record<string, unknown>);
}

// Add Page Break — lib.docx.AddPageBreak
export interface AddPageBreakInputs {
  document?: Connectable<unknown>;
}

export function addPageBreak(inputs: AddPageBreakInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.docx.AddPageBreak", inputs as Record<string, unknown>);
}

// Set Document Properties — lib.docx.SetDocumentProperties
export interface SetDocumentPropertiesInputs {
  document?: Connectable<unknown>;
  title?: Connectable<string>;
  author?: Connectable<string>;
  subject?: Connectable<string>;
  keywords?: Connectable<string>;
}

export function setDocumentProperties(inputs: SetDocumentPropertiesInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.docx.SetDocumentProperties", inputs as Record<string, unknown>);
}

// Save Document — lib.docx.SaveDocument
export interface SaveDocumentInputs {
  document?: Connectable<unknown>;
  path?: Connectable<unknown>;
  filename?: Connectable<string>;
}

export function saveDocument(inputs: SaveDocumentInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.docx.SaveDocument", inputs as Record<string, unknown>);
}
