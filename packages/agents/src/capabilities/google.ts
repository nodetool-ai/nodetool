/**
 * The `google` capability module — Drive, Gmail, Docs, Sheets and Calendar.
 *
 * Twenty capabilities that used to be twenty `GoogleWorkspaceTool` subclasses
 * in `../tools/google-workspace-tools.ts`. That base class contributed one
 * thing beyond the surface: resolve the user's Google access token, run the
 * call, and return a failure as `{error}` rather than throwing, so an agent can
 * re-authenticate or pick another file instead of aborting the step. That is
 * {@link googleCall} here, and every implementation is its body.
 *
 * All twenty are `external`: none is listed in `TOOL_PERMISSION_CATEGORIES`, so
 * the map's conservative default classes them that way, and a third-party side
 * effect is what they are. Carried over unchanged — a reclassification belongs
 * in its own diff.
 *
 * Design: docs/tool-class-retirement-design.md § "PRs 4–9 — remaining
 * namespaces".
 */

import {
  requireGoogleAccessToken,
  driveSearchFiles,
  driveGetFile,
  driveReadFile,
  driveCreateFile,
  gmailSearchMessages,
  gmailGetMessage,
  gmailSendMessage,
  gmailModifyLabels,
  gmailListLabels,
  docsGetDocument,
  docsCreateDocument,
  docsAppendText,
  sheetsReadRange,
  sheetsAppendRows,
  sheetsUpdateRange,
  sheetsCreateSpreadsheet,
  calendarListCalendars,
  calendarListEvents,
  calendarCreateEvent,
  calendarDeleteEvent
} from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { UNGATED, createCapabilityRun } from "./invoke.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  driveSearchSpec,
  driveReadFileCapabilitySpec,
  driveGetFileCapabilitySpec,
  driveCreateFileCapabilitySpec,
  gmailSearchSpec,
  gmailGetMessageCapabilitySpec,
  gmailSendMessageCapabilitySpec,
  gmailModifyLabelsCapabilitySpec,
  gmailListLabelsCapabilitySpec,
  docsReadSpec,
  docsCreateSpec,
  docsAppendSpec,
  sheetsReadSpec,
  sheetsAppendSpec,
  sheetsUpdateSpec,
  sheetsCreateSpec,
  calendarListSpec,
  calendarEventsSpec,
  calendarCreateSpec,
  calendarDeleteSpec,
  str
} from "./google.specs.js";
import { isFiniteNumber } from "../utils/type-guards.js";

/**
 * Shared plumbing: resolve the token, run the call, and turn a failure into a
 * `{ error }` result rather than a thrown exception, so the agent can recover
 * (re-authenticate, pick another file) instead of aborting the step.
 */
async function googleCall<TResult>(
  run: CapabilityRun,
  call: (token: string) => Promise<TResult>
): Promise<TResult | { error: string }> {
  try {
    const token = await requireGoogleAccessToken(run.context);
    return await call(token);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * A run over one call's context. The Google capabilities need nothing else —
 * the token comes off the context, as it did in the class.
 */
export function googleCapabilityRun(context: ProcessingContext): CapabilityRun {
  return createCapabilityRun({ context, gate: UNGATED });
}

const num = (
  params: Record<string, unknown>,
  key: string,
  fallback: number
): number => {
  const value = params[key];
  return isFiniteNumber(value) ? value : fallback;
};

const rows = (params: Record<string, unknown>, key: string): unknown[][] => {
  const value = params[key];
  if (!Array.isArray(value)) return [];
  return value.map((row) => (Array.isArray(row) ? row : [row]));
};

const strList = (params: Record<string, unknown>, key: string): string[] => {
  const value = params[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
};

const driveSearch: CapabilityExport = {
  spec: driveSearchSpec,
  impl: async (run, params) =>
    googleCall(run, async (token) => ({
      files: await driveSearchFiles(token, {
        q: str(params, "query"),
        maxResults: num(params, "max_results", 20)
      })
    }))
};

const driveReadFileCapability: CapabilityExport = {
  spec: driveReadFileCapabilitySpec,
  impl: async (run, params) =>
    googleCall(run, (token) => driveReadFile(token, str(params, "file_id")))
};

const driveGetFileCapability: CapabilityExport = {
  spec: driveGetFileCapabilitySpec,
  impl: async (run, params) =>
    googleCall(run, (token) => driveGetFile(token, str(params, "file_id")))
};

const driveCreateFileCapability: CapabilityExport = {
  spec: driveCreateFileCapabilitySpec,
  impl: async (run, params) =>
    googleCall(run, (token) =>
      driveCreateFile(token, {
        name: str(params, "name"),
        content: str(params, "content"),
        mimeType: str(params, "mime_type") || undefined,
        folderId: str(params, "folder_id") || undefined
      })
    )
};

const gmailSearch: CapabilityExport = {
  spec: gmailSearchSpec,
  impl: async (run, params) =>
    googleCall(run, async (token) => ({
      messages: await gmailSearchMessages(token, {
        q: str(params, "query"),
        maxResults: num(params, "max_results", 10)
      })
    }))
};

const gmailGetMessageCapability: CapabilityExport = {
  spec: gmailGetMessageCapabilitySpec,
  impl: async (run, params) =>
    googleCall(run, (token) =>
      gmailGetMessage(token, str(params, "message_id"))
    )
};

const gmailSendMessageCapability: CapabilityExport = {
  spec: gmailSendMessageCapabilitySpec,
  impl: async (run, params) =>
    googleCall(run, (token) =>
      gmailSendMessage(token, {
        to: str(params, "to"),
        subject: str(params, "subject"),
        body: str(params, "body"),
        cc: str(params, "cc") || undefined,
        bcc: str(params, "bcc") || undefined
      })
    )
};

const gmailModifyLabelsCapability: CapabilityExport = {
  spec: gmailModifyLabelsCapabilitySpec,
  impl: async (run, params) =>
    googleCall(run, (token) =>
      gmailModifyLabels(token, {
        messageId: str(params, "message_id"),
        addLabelIds: strList(params, "add_label_ids"),
        removeLabelIds: strList(params, "remove_label_ids")
      })
    )
};

const gmailListLabelsCapability: CapabilityExport = {
  spec: gmailListLabelsCapabilitySpec,
  impl: async (run) =>
    googleCall(run, async (token) => ({
      labels: await gmailListLabels(token)
    }))
};

const docsRead: CapabilityExport = {
  spec: docsReadSpec,
  impl: async (run, params) =>
    googleCall(run, (token) =>
      docsGetDocument(token, str(params, "document_id"))
    )
};

const docsCreate: CapabilityExport = {
  spec: docsCreateSpec,
  impl: async (run, params) =>
    googleCall(run, (token) =>
      docsCreateDocument(token, {
        title: str(params, "title"),
        text: str(params, "text") || undefined
      })
    )
};

const docsAppend: CapabilityExport = {
  spec: docsAppendSpec,
  impl: async (run, params) =>
    googleCall(run, async (token) => {
      await docsAppendText(token, {
        documentId: str(params, "document_id"),
        text: str(params, "text")
      });
      return { success: true, document_id: str(params, "document_id") };
    })
};

const sheetsRead: CapabilityExport = {
  spec: sheetsReadSpec,
  impl: async (run, params) =>
    googleCall(run, async (token) => {
      const values = await sheetsReadRange(token, {
        spreadsheetId: str(params, "spreadsheet_id"),
        range: str(params, "range")
      });
      return { values, row_count: values.length };
    })
};

const sheetsAppend: CapabilityExport = {
  spec: sheetsAppendSpec,
  impl: async (run, params) =>
    googleCall(run, (token) =>
      sheetsAppendRows(token, {
        spreadsheetId: str(params, "spreadsheet_id"),
        range: str(params, "range"),
        values: rows(params, "values")
      })
    )
};

const sheetsUpdate: CapabilityExport = {
  spec: sheetsUpdateSpec,
  impl: async (run, params) =>
    googleCall(run, (token) =>
      sheetsUpdateRange(token, {
        spreadsheetId: str(params, "spreadsheet_id"),
        range: str(params, "range"),
        values: rows(params, "values")
      })
    )
};

const sheetsCreate: CapabilityExport = {
  spec: sheetsCreateSpec,
  impl: async (run, params) =>
    googleCall(run, (token) =>
      sheetsCreateSpreadsheet(token, {
        title: str(params, "title"),
        values: rows(params, "values")
      })
    )
};

// ── Calendar ─────────────────────────────────────────────────────────

const calendarList: CapabilityExport = {
  spec: calendarListSpec,
  impl: async (run) =>
    googleCall(run, async (token) => ({
      calendars: await calendarListCalendars(token)
    }))
};

const calendarEvents: CapabilityExport = {
  spec: calendarEventsSpec,
  impl: async (run, params) =>
    googleCall(run, async (token) => ({
      events: await calendarListEvents(token, {
        calendarId: str(params, "calendar_id") || undefined,
        timeMin: str(params, "time_min") || undefined,
        timeMax: str(params, "time_max") || undefined,
        q: str(params, "query") || undefined,
        maxResults: num(params, "max_results", 20)
      })
    }))
};

const calendarCreate: CapabilityExport = {
  spec: calendarCreateSpec,
  impl: async (run, params) =>
    googleCall(run, (token) =>
      calendarCreateEvent(token, {
        calendarId: str(params, "calendar_id") || undefined,
        summary: str(params, "summary"),
        start: str(params, "start"),
        end: str(params, "end"),
        description: str(params, "description") || undefined,
        location: str(params, "location") || undefined,
        attendees: strList(params, "attendees")
      })
    )
};

const calendarDelete: CapabilityExport = {
  spec: calendarDeleteSpec,
  impl: async (run, params) =>
    googleCall(run, async (token) => {
      await calendarDeleteEvent(token, {
        calendarId: str(params, "calendar_id") || undefined,
        eventId: str(params, "event_id")
      });
      return { success: true, event_id: str(params, "event_id") };
    })
};

/** Every Google Workspace capability, in the order the classes were listed. */
export const GOOGLE_CAPABILITIES: readonly CapabilityExport[] = [
  driveSearch,
  driveGetFileCapability,
  driveReadFileCapability,
  driveCreateFileCapability,
  gmailSearch,
  gmailGetMessageCapability,
  gmailSendMessageCapability,
  gmailModifyLabelsCapability,
  gmailListLabelsCapability,
  docsRead,
  docsCreate,
  docsAppend,
  sheetsRead,
  sheetsAppend,
  sheetsUpdate,
  sheetsCreate,
  calendarList,
  calendarEvents,
  calendarCreate,
  calendarDelete
];

export const module: CapabilityModule = {
  module: "google",
  exports: GOOGLE_CAPABILITIES
};

export {
  driveSearch,
  driveGetFileCapability,
  driveReadFileCapability,
  driveCreateFileCapability,
  gmailSearch,
  gmailGetMessageCapability,
  gmailSendMessageCapability,
  gmailModifyLabelsCapability,
  gmailListLabelsCapability,
  docsRead,
  docsCreate,
  docsAppend,
  sheetsRead,
  sheetsAppend,
  sheetsUpdate,
  sheetsCreate,
  calendarList,
  calendarEvents,
  calendarCreate,
  calendarDelete
};
