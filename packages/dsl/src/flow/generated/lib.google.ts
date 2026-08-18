// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Google Drive Search — lib.google.DriveSearch
export type DriveSearchInputs = {
  query?: string;
  max_results?: number;
};

export interface DriveSearchOutputs {
  output: Record<string, unknown>;
  outputs: unknown[];
}

export function driveSearch(inputs: DriveSearchInputs): Promise<DriveSearchOutputs> {
  return callNode<DriveSearchOutputs>("lib.google.DriveSearch", inputs);
}

driveSearch.stream = function (inputs: DriveSearchInputs): AsyncIterable<Partial<DriveSearchOutputs>> {
  return streamNode<Partial<DriveSearchOutputs>>("lib.google.DriveSearch", inputs);
};

// Google Drive Read File — lib.google.DriveReadFile
export type DriveReadFileInputs = {
  file_id?: string;
};

export interface DriveReadFileOutputs {
  output: string;
  name: string;
  mime_type: string;
}

export function driveReadFile(inputs: DriveReadFileInputs): Promise<DriveReadFileOutputs> {
  return callNode<DriveReadFileOutputs>("lib.google.DriveReadFile", inputs);
}

// Google Drive Create File — lib.google.DriveCreateFile
export type DriveCreateFileInputs = {
  name?: string;
  content?: string;
  mime_type?: string;
  folder_id?: string;
};

export interface DriveCreateFileOutputs {
  output: Record<string, unknown>;
}

export function driveCreateFile(inputs: DriveCreateFileInputs): Promise<DriveCreateFileOutputs> {
  return callNode<DriveCreateFileOutputs>("lib.google.DriveCreateFile", inputs);
}

// Gmail Search — lib.google.GmailSearch
export type GmailSearchInputs = {
  query?: string;
  max_results?: number;
};

export interface GmailSearchOutputs {
  output: Record<string, unknown>;
  outputs: unknown[];
}

export function gmailSearch(inputs: GmailSearchInputs): Promise<GmailSearchOutputs> {
  return callNode<GmailSearchOutputs>("lib.google.GmailSearch", inputs);
}

gmailSearch.stream = function (inputs: GmailSearchInputs): AsyncIterable<Partial<GmailSearchOutputs>> {
  return streamNode<Partial<GmailSearchOutputs>>("lib.google.GmailSearch", inputs);
};

// Gmail Send — lib.google.GmailSend
export type GmailSendInputs = {
  to?: string;
  subject?: string;
  body?: string;
  cc?: string;
};

export interface GmailSendOutputs {
  output: Record<string, unknown>;
}

export function gmailSend(inputs: GmailSendInputs): Promise<GmailSendOutputs> {
  return callNode<GmailSendOutputs>("lib.google.GmailSend", inputs);
}

// Gmail Modify Labels — lib.google.GmailModifyLabels
export type GmailModifyLabelsInputs = {
  message_id?: string;
  add_labels?: string;
  remove_labels?: string;
};

export interface GmailModifyLabelsOutputs {
  output: Record<string, unknown>;
}

export function gmailModifyLabels(inputs: GmailModifyLabelsInputs): Promise<GmailModifyLabelsOutputs> {
  return callNode<GmailModifyLabelsOutputs>("lib.google.GmailModifyLabels", inputs);
}

// Google Docs Read — lib.google.DocsRead
export type DocsReadInputs = {
  document_id?: string;
};

export interface DocsReadOutputs {
  output: string;
  title: string;
}

export function docsRead(inputs: DocsReadInputs): Promise<DocsReadOutputs> {
  return callNode<DocsReadOutputs>("lib.google.DocsRead", inputs);
}

// Google Docs Create — lib.google.DocsCreate
export type DocsCreateInputs = {
  title?: string;
  text?: string;
};

export interface DocsCreateOutputs {
  output: Record<string, unknown>;
}

export function docsCreate(inputs: DocsCreateInputs): Promise<DocsCreateOutputs> {
  return callNode<DocsCreateOutputs>("lib.google.DocsCreate", inputs);
}

// Google Docs Append — lib.google.DocsAppend
export type DocsAppendInputs = {
  document_id?: string;
  text?: string;
};

export interface DocsAppendOutputs {
  output: string;
}

export function docsAppend(inputs: DocsAppendInputs): Promise<DocsAppendOutputs> {
  return callNode<DocsAppendOutputs>("lib.google.DocsAppend", inputs);
}

// Google Sheets Read — lib.google.SheetsRead
export type SheetsReadInputs = {
  spreadsheet_id?: string;
  range?: string;
};

export interface SheetsReadOutputs {
  output: unknown[];
}

export function sheetsRead(inputs: SheetsReadInputs): Promise<SheetsReadOutputs> {
  return callNode<SheetsReadOutputs>("lib.google.SheetsRead", inputs);
}

// Google Sheets Append — lib.google.SheetsAppend
export type SheetsAppendInputs = {
  spreadsheet_id?: string;
  range?: string;
  values?: string;
};

export interface SheetsAppendOutputs {
  output: Record<string, unknown>;
}

export function sheetsAppend(inputs: SheetsAppendInputs): Promise<SheetsAppendOutputs> {
  return callNode<SheetsAppendOutputs>("lib.google.SheetsAppend", inputs);
}

// Google Sheets Update — lib.google.SheetsUpdate
export type SheetsUpdateInputs = {
  spreadsheet_id?: string;
  range?: string;
  values?: string;
};

export interface SheetsUpdateOutputs {
  output: Record<string, unknown>;
}

export function sheetsUpdate(inputs: SheetsUpdateInputs): Promise<SheetsUpdateOutputs> {
  return callNode<SheetsUpdateOutputs>("lib.google.SheetsUpdate", inputs);
}

// Google Calendar List Events — lib.google.CalendarListEvents
export type CalendarListEventsInputs = {
  calendar_id?: string;
  time_min?: string;
  time_max?: string;
  max_results?: number;
};

export interface CalendarListEventsOutputs {
  output: Record<string, unknown>;
  outputs: unknown[];
}

export function calendarListEvents(inputs: CalendarListEventsInputs): Promise<CalendarListEventsOutputs> {
  return callNode<CalendarListEventsOutputs>("lib.google.CalendarListEvents", inputs);
}

calendarListEvents.stream = function (inputs: CalendarListEventsInputs): AsyncIterable<Partial<CalendarListEventsOutputs>> {
  return streamNode<Partial<CalendarListEventsOutputs>>("lib.google.CalendarListEvents", inputs);
};

// Google Calendar Create Event — lib.google.CalendarCreateEvent
export type CalendarCreateEventInputs = {
  summary?: string;
  start?: string;
  end?: string;
  calendar_id?: string;
  description?: string;
  attendees?: string;
};

export interface CalendarCreateEventOutputs {
  output: Record<string, unknown>;
}

export function calendarCreateEvent(inputs: CalendarCreateEventInputs): Promise<CalendarCreateEventOutputs> {
  return callNode<CalendarCreateEventOutputs>("lib.google.CalendarCreateEvent", inputs);
}
