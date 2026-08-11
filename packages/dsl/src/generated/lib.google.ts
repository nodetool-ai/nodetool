// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Google Drive Search — lib.google.DriveSearch
export type DriveSearchInputs = {
  query?: Connectable<string>;
  max_results?: Connectable<number>;
};

export interface DriveSearchOutputs {
  output: Record<string, unknown>;
  outputs: unknown[];
}

export function driveSearch(inputs: DriveSearchInputs): DslNode<DriveSearchOutputs> {
  return createNode("lib.google.DriveSearch", inputs, { outputNames: ["output", "outputs"], streaming: true });
}

// Google Drive Read File — lib.google.DriveReadFile
export type DriveReadFileInputs = {
  file_id?: Connectable<string>;
};

export interface DriveReadFileOutputs {
  output: string;
  name: string;
  mime_type: string;
}

export function driveReadFile(inputs: DriveReadFileInputs): DslNode<DriveReadFileOutputs> {
  return createNode("lib.google.DriveReadFile", inputs, { outputNames: ["output", "name", "mime_type"] });
}

// Google Drive Create File — lib.google.DriveCreateFile
export type DriveCreateFileInputs = {
  name?: Connectable<string>;
  content?: Connectable<string>;
  mime_type?: Connectable<string>;
  folder_id?: Connectable<string>;
};

export interface DriveCreateFileOutputs {
  output: Record<string, unknown>;
}

export function driveCreateFile(inputs: DriveCreateFileInputs): DslNode<DriveCreateFileOutputs, "output"> {
  return createNode("lib.google.DriveCreateFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Gmail Search — lib.google.GmailSearch
export type GmailSearchInputs = {
  query?: Connectable<string>;
  max_results?: Connectable<number>;
};

export interface GmailSearchOutputs {
  output: Record<string, unknown>;
  outputs: unknown[];
}

export function gmailSearch(inputs: GmailSearchInputs): DslNode<GmailSearchOutputs> {
  return createNode("lib.google.GmailSearch", inputs, { outputNames: ["output", "outputs"], streaming: true });
}

// Gmail Send — lib.google.GmailSend
export type GmailSendInputs = {
  to?: Connectable<string>;
  subject?: Connectable<string>;
  body?: Connectable<string>;
  cc?: Connectable<string>;
};

export interface GmailSendOutputs {
  output: Record<string, unknown>;
}

export function gmailSend(inputs: GmailSendInputs): DslNode<GmailSendOutputs, "output"> {
  return createNode("lib.google.GmailSend", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Gmail Modify Labels — lib.google.GmailModifyLabels
export type GmailModifyLabelsInputs = {
  message_id?: Connectable<string>;
  add_labels?: Connectable<string>;
  remove_labels?: Connectable<string>;
};

export interface GmailModifyLabelsOutputs {
  output: Record<string, unknown>;
}

export function gmailModifyLabels(inputs: GmailModifyLabelsInputs): DslNode<GmailModifyLabelsOutputs, "output"> {
  return createNode("lib.google.GmailModifyLabels", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Google Docs Read — lib.google.DocsRead
export type DocsReadInputs = {
  document_id?: Connectable<string>;
};

export interface DocsReadOutputs {
  output: string;
  title: string;
}

export function docsRead(inputs: DocsReadInputs): DslNode<DocsReadOutputs> {
  return createNode("lib.google.DocsRead", inputs, { outputNames: ["output", "title"] });
}

// Google Docs Create — lib.google.DocsCreate
export type DocsCreateInputs = {
  title?: Connectable<string>;
  text?: Connectable<string>;
};

export interface DocsCreateOutputs {
  output: Record<string, unknown>;
}

export function docsCreate(inputs: DocsCreateInputs): DslNode<DocsCreateOutputs, "output"> {
  return createNode("lib.google.DocsCreate", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Google Docs Append — lib.google.DocsAppend
export type DocsAppendInputs = {
  document_id?: Connectable<string>;
  text?: Connectable<string>;
};

export interface DocsAppendOutputs {
  output: string;
}

export function docsAppend(inputs: DocsAppendInputs): DslNode<DocsAppendOutputs, "output"> {
  return createNode("lib.google.DocsAppend", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Google Sheets Read — lib.google.SheetsRead
export type SheetsReadInputs = {
  spreadsheet_id?: Connectable<string>;
  range?: Connectable<string>;
};

export interface SheetsReadOutputs {
  output: unknown[];
}

export function sheetsRead(inputs: SheetsReadInputs): DslNode<SheetsReadOutputs, "output"> {
  return createNode("lib.google.SheetsRead", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Google Sheets Append — lib.google.SheetsAppend
export type SheetsAppendInputs = {
  spreadsheet_id?: Connectable<string>;
  range?: Connectable<string>;
  values?: Connectable<string>;
};

export interface SheetsAppendOutputs {
  output: Record<string, unknown>;
}

export function sheetsAppend(inputs: SheetsAppendInputs): DslNode<SheetsAppendOutputs, "output"> {
  return createNode("lib.google.SheetsAppend", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Google Sheets Update — lib.google.SheetsUpdate
export type SheetsUpdateInputs = {
  spreadsheet_id?: Connectable<string>;
  range?: Connectable<string>;
  values?: Connectable<string>;
};

export interface SheetsUpdateOutputs {
  output: Record<string, unknown>;
}

export function sheetsUpdate(inputs: SheetsUpdateInputs): DslNode<SheetsUpdateOutputs, "output"> {
  return createNode("lib.google.SheetsUpdate", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Google Calendar List Events — lib.google.CalendarListEvents
export type CalendarListEventsInputs = {
  calendar_id?: Connectable<string>;
  time_min?: Connectable<string>;
  time_max?: Connectable<string>;
  max_results?: Connectable<number>;
};

export interface CalendarListEventsOutputs {
  output: Record<string, unknown>;
  outputs: unknown[];
}

export function calendarListEvents(inputs: CalendarListEventsInputs): DslNode<CalendarListEventsOutputs> {
  return createNode("lib.google.CalendarListEvents", inputs, { outputNames: ["output", "outputs"], streaming: true });
}

// Google Calendar Create Event — lib.google.CalendarCreateEvent
export type CalendarCreateEventInputs = {
  summary?: Connectable<string>;
  start?: Connectable<string>;
  end?: Connectable<string>;
  calendar_id?: Connectable<string>;
  description?: Connectable<string>;
  attendees?: Connectable<string>;
};

export interface CalendarCreateEventOutputs {
  output: Record<string, unknown>;
}

export function calendarCreateEvent(inputs: CalendarCreateEventInputs): DslNode<CalendarCreateEventOutputs, "output"> {
  return createNode("lib.google.CalendarCreateEvent", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
