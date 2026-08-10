/**
 * Google Workspace agent tools — Drive, Gmail, Docs, Sheets and Calendar.
 *
 * These authenticate with the access token from the user's Google sign-in
 * (resolved through `getSecret("GOOGLE_ACCESS_TOKEN")`), so there is no API key
 * to configure. They are only offered when the server runs in Supabase auth
 * mode — see `isGoogleWorkspaceEnabled()` in `@nodetool-ai/config`.
 *
 * The implementations live in the `google` capability module
 * (`../capabilities/google.ts`); these classes are the zero-arg constructor
 * surface `GOOGLE_WORKSPACE_TOOL_CLASSES` and `resolveTool(name)` still use.
 */

import type { Tool } from "./base-tool.js";
import { CapabilityTool } from "../capabilities/index.js";
import {
  calendarCreate,
  calendarDelete,
  calendarEvents,
  calendarList,
  docsAppend,
  docsCreate,
  docsRead,
  driveCreateFileCapability,
  driveGetFileCapability,
  driveReadFileCapability,
  driveSearch,
  gmailGetMessageCapability,
  gmailListLabelsCapability,
  gmailModifyLabelsCapability,
  gmailSearch,
  gmailSendMessageCapability,
  googleCapabilityRun,
  sheetsAppend,
  sheetsCreate,
  sheetsRead,
  sheetsUpdate
} from "../capabilities/google.js";
import type { CapabilityExport } from "../capabilities/types.js";
import { registerTool } from "./tool-registry.js";

/**
 * One deprecated class per capability. Each keeps the constructor and the wire
 * identity it had; the behaviour comes from the capability. All die in PR 12.
 */
function toolClassFor(entry: CapabilityExport): new () => Tool {
  return class extends CapabilityTool {
    constructor() {
      super(entry.spec, entry.impl, googleCapabilityRun);
    }
  };
}

/**
 * @deprecated Ported to the `google` capability module
 * (`../capabilities/google.ts`). Kept so existing constructors keep working;
 * there is one implementation behind both.
 */
export const GoogleDriveSearchTool = toolClassFor(driveSearch);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleDriveReadFileTool = toolClassFor(driveReadFileCapability);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleDriveGetFileTool = toolClassFor(driveGetFileCapability);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleDriveCreateFileTool = toolClassFor(
  driveCreateFileCapability
);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GmailSearchTool = toolClassFor(gmailSearch);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GmailGetMessageTool = toolClassFor(gmailGetMessageCapability);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GmailSendMessageTool = toolClassFor(gmailSendMessageCapability);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GmailModifyLabelsTool = toolClassFor(gmailModifyLabelsCapability);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GmailListLabelsTool = toolClassFor(gmailListLabelsCapability);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleDocsReadTool = toolClassFor(docsRead);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleDocsCreateTool = toolClassFor(docsCreate);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleDocsAppendTool = toolClassFor(docsAppend);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleSheetsReadTool = toolClassFor(sheetsRead);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleSheetsAppendTool = toolClassFor(sheetsAppend);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleSheetsUpdateTool = toolClassFor(sheetsUpdate);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleSheetsCreateTool = toolClassFor(sheetsCreate);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleCalendarListCalendarsTool = toolClassFor(calendarList);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleCalendarListEventsTool = toolClassFor(calendarEvents);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleCalendarCreateEventTool = toolClassFor(calendarCreate);
/** @deprecated See {@link GoogleDriveSearchTool}. */
export const GoogleCalendarDeleteEventTool = toolClassFor(calendarDelete);

/**
 * Every Google Workspace tool class. Kept separate from
 * `BUILTIN_TOOL_CLASSES` because they are only offered when the deployment can
 * produce a Google login token.
 */
export const GOOGLE_WORKSPACE_TOOL_CLASSES: ReadonlyArray<new () => Tool> = [
  GoogleDriveSearchTool,
  GoogleDriveGetFileTool,
  GoogleDriveReadFileTool,
  GoogleDriveCreateFileTool,
  GmailSearchTool,
  GmailGetMessageTool,
  GmailSendMessageTool,
  GmailModifyLabelsTool,
  GmailListLabelsTool,
  GoogleDocsReadTool,
  GoogleDocsCreateTool,
  GoogleDocsAppendTool,
  GoogleSheetsReadTool,
  GoogleSheetsAppendTool,
  GoogleSheetsUpdateTool,
  GoogleSheetsCreateTool,
  GoogleCalendarListCalendarsTool,
  GoogleCalendarListEventsTool,
  GoogleCalendarCreateEventTool,
  GoogleCalendarDeleteEventTool
];

/** One fresh instance per Google Workspace tool. */
export function getGoogleWorkspaceTools(): Tool[] {
  return GOOGLE_WORKSPACE_TOOL_CLASSES.map((Cls) => new Cls());
}

let registeredNames: string[] | null = null;

/**
 * Register the Google Workspace tools so `resolveTool(name)` finds them.
 * Idempotent. Callers gate this on `isGoogleWorkspaceEnabled()`.
 */
export function registerGoogleWorkspaceTools(): string[] {
  if (registeredNames) return registeredNames;
  const names: string[] = [];
  for (const tool of getGoogleWorkspaceTools()) {
    registerTool(tool);
    names.push(tool.name);
  }
  registeredNames = names;
  return names;
}
