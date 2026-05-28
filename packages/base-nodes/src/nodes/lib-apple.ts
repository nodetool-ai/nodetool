/**
 * Apple automation nodes — pure AppleScript implementations.
 *
 * Every node here drives a stock macOS app (Calendar, Notes, Reminders,
 * Messages, Mail, Contacts, Safari) or a system facility (clipboard,
 * speech synthesis, Notification Center) by spawning `osascript`. No
 * PyObjC, no native bindings — just AppleScript over stdin.
 *
 * Areas mirror https://github.com/nodetool-ai/nodetool-apple, restricted
 * to the subset that can be done in AppleScript alone.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// AppleScript runner
// ---------------------------------------------------------------------------

/**
 * Delimiters used to encode records returned from AppleScript so they can
 * be parsed losslessly on the TypeScript side. Chosen to never collide
 * with normal text (ASCII Record/Unit Separators).
 */
const REC_SEP = "";
const FIELD_SEP = "";

interface RunOptions {
  /** Hard timeout in milliseconds (default 30s). */
  timeoutMs?: number;
}

/**
 * Run an AppleScript program via `osascript` and return stdout.
 *
 * The script is piped over stdin so arbitrarily long programs (e.g. ones
 * that embed a JavaScript blob for Safari) work without command-line
 * length limits.
 */
async function runOsascript(
  script: string,
  options: RunOptions = {}
): Promise<string> {
  if (process.platform !== "darwin") {
    throw new Error(
      "Apple automation nodes require macOS (current platform: " +
        process.platform +
        ")"
    );
  }
  const timeoutMs = options.timeoutMs ?? 30_000;
  return await new Promise<string>((resolve, reject) => {
    const child = spawn("osascript", ["-"], { stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`osascript timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        const msg = stderr.trim() || `osascript exited with code ${code}`;
        reject(new Error(msg));
      }
    });
    child.stdin.end(script, "utf8");
  });
}

/**
 * Escape a string for safe interpolation inside an AppleScript string literal.
 *
 * AppleScript string literals cannot span lines, so literal `\r` / `\n` would
 * break out of the string context and allow arbitrary AppleScript injection.
 * Null bytes and other ASCII control characters are also stripped because they
 * are not meaningful inside AppleScript strings and could cause osascript to
 * behave unexpectedly.
 */
function escAS(input: string): string {
  return String(input ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    // Strip remaining ASCII control characters (0x00-0x1F except the ones
    // we already handled, plus 0x7F DEL).
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/** Parse anything date-like into a Date. Accepts Date, number, ISO string, or {year,month,day,...}. */
function parseDateInput(input: unknown): Date {
  if (input instanceof Date) return new Date(input.getTime());
  if (typeof input === "number") return new Date(input);
  if (typeof input === "string" && input.trim()) {
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) return d;
    throw new Error(`Could not parse date: ${JSON.stringify(input)}`);
  }
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (typeof obj.year === "number" && typeof obj.month === "number") {
      return new Date(
        Number(obj.year),
        Number(obj.month) - 1,
        Number(obj.day ?? 1),
        Number(obj.hour ?? 0),
        Number(obj.minute ?? 0),
        Number(obj.second ?? 0),
        Number(obj.millisecond ?? 0)
      );
    }
  }
  throw new Error(`Could not parse date: ${JSON.stringify(input)}`);
}

/**
 * Render an AppleScript snippet that builds a `date` value matching the
 * supplied JS Date. Property-assignment is locale-independent, unlike
 * `date "1/15/24 2:30 PM"`.
 *
 * Day is set to 1 before changing the month so that an existing day-31 cannot
 * overflow into the next month (e.g. setting month=2 while day=31 would
 * produce Feb 31 → March).
 */
function asDateExpr(varName: string, date: Date): string {
  return [
    `set ${varName} to current date`,
    `set day of ${varName} to 1`,
    `set year of ${varName} to ${date.getFullYear()}`,
    `set month of ${varName} to ${date.getMonth() + 1}`,
    `set day of ${varName} to ${date.getDate()}`,
    `set hours of ${varName} to ${date.getHours()}`,
    `set minutes of ${varName} to ${date.getMinutes()}`,
    `set seconds of ${varName} to ${date.getSeconds()}`
  ].join("\n");
}

/** Split a delimited osascript output into rows of fields. */
function parseRecords(stdout: string): string[][] {
  const trimmed = stdout.replace(/\n+$/g, "");
  if (!trimmed) return [];
  return trimmed
    .split(REC_SEP)
    .filter((row) => row.length > 0)
    .map((row) => row.split(FIELD_SEP));
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export class CreateCalendarEventAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.CreateCalendarEvent";
  static readonly title = "Create Calendar Event";
  static readonly description =
    "Create a new event in macOS Calendar via AppleScript.\n    calendar, event, macos, applescript";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly basicFields = [
    "title",
    "start_date",
    "end_date",
    "calendar_name"
  ];

  @prop({ type: "str", default: "", title: "Title", description: "Title of the calendar event" })
  declare event_title: string;

  @prop({ type: "any", default: "", title: "Start Date", description: "Start date and time" })
  declare start_date: unknown;

  @prop({ type: "any", default: "", title: "End Date", description: "End date and time" })
  declare end_date: unknown;

  @prop({ type: "str", default: "Calendar", title: "Calendar Name", description: "Name of the target calendar" })
  declare calendar_name: string;

  @prop({ type: "str", default: "", title: "Location", description: "Location of the event" })
  declare location: string;

  @prop({ type: "str", default: "", title: "Description", description: "Notes for the event" })
  declare description_text: string;

  async process(): Promise<Record<string, unknown>> {
    const title = String(this.event_title ?? "");
    if (!title) throw new Error("title cannot be empty");
    const start = parseDateInput(this.start_date);
    const end = parseDateInput(this.end_date);
    const calName = String(this.calendar_name ?? "Calendar");
    const loc = String(this.location ?? "");
    const notes = String(this.description_text ?? "");

    const script = `
${asDateExpr("startDate", start)}
${asDateExpr("endDate", end)}
tell application "Calendar"
    tell calendar "${escAS(calName)}"
        make new event with properties {summary:"${escAS(
          title
        )}", start date:startDate, end date:endDate, location:"${escAS(
          loc
        )}", description:"${escAS(notes)}"}
    end tell
end tell
return "ok"
`;
    await runOsascript(script);
    return { output: true };
  }
}

export class ListCalendarEventsAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.ListCalendarEvents";
  static readonly title = "List Calendar Events";
  static readonly description =
    "List events from a Calendar in a date range using AppleScript.\n    calendar, list, events, macos";
  static readonly metadataOutputTypes = {
    events: "list"
  };
  static readonly basicFields = ["days_back", "days_forward", "calendar_name"];

  @prop({ type: "int", default: 0, min: 0, max: 3650, title: "Days Back", description: "Days back from today" })
  declare days_back: number;

  @prop({ type: "int", default: 7, min: 0, max: 3650, title: "Days Forward", description: "Days forward from today" })
  declare days_forward: number;

  @prop({ type: "str", default: "Calendar", title: "Calendar Name", description: "Calendar to query" })
  declare calendar_name: string;

  async process(): Promise<Record<string, unknown>> {
    const back = Math.max(0, Number(this.days_back ?? 0));
    const fwd = Math.max(0, Number(this.days_forward ?? 7));
    const calName = String(this.calendar_name ?? "Calendar");
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - back);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setDate(end.getDate() + fwd);
    end.setHours(23, 59, 59, 999);

    const script = `
${asDateExpr("rangeStart", start)}
${asDateExpr("rangeEnd", end)}
set output to ""
tell application "Calendar"
    set theEvents to every event of calendar "${escAS(calName)}" whose start date is greater than or equal to rangeStart and start date is less than or equal to rangeEnd
    repeat with e in theEvents
        set evTitle to summary of e
        set evStart to (start date of e) as «class isot» as string
        set evEnd to (end date of e) as «class isot» as string
        set evLoc to ""
        try
            set evLoc to location of e
            if evLoc is missing value then set evLoc to ""
        end try
        set evNotes to ""
        try
            set evNotes to description of e
            if evNotes is missing value then set evNotes to ""
        end try
        set output to output & evTitle & "${FIELD_SEP}" & evStart & "${FIELD_SEP}" & evEnd & "${FIELD_SEP}" & evLoc & "${FIELD_SEP}" & evNotes & "${REC_SEP}"
    end repeat
end tell
return output
`;
    const out = await runOsascript(script, { timeoutMs: 60_000 });
    const events = parseRecords(out).map(
      ([title, startStr, endStr, location, notes]) => ({
        title,
        start_date: startStr,
        end_date: endStr,
        location,
        notes,
        calendar: calName
      })
    );
    return { events };
  }
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export class CreateNoteAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.CreateNote";
  static readonly title = "Create Note";
  static readonly description =
    "Create a new note in macOS Notes via AppleScript.\n    notes, macos, applescript";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly basicFields = ["title", "body", "folder"];

  @prop({ type: "str", default: "", title: "Title", description: "Title of the note" })
  declare title: string;

  @prop({ type: "str", default: "", title: "Body", description: "Body content (plain text or HTML)" })
  declare body: string;

  @prop({ type: "str", default: "Notes", title: "Folder", description: "Folder to save the note in" })
  declare folder: string;

  async process(): Promise<Record<string, unknown>> {
    const title = String(this.title ?? "");
    const body = String(this.body ?? "");
    const folder = String(this.folder ?? "Notes");
    if (!title && !body) throw new Error("title or body must be provided");

    const script = `
tell application "Notes"
    set targetFolder to missing value
    try
        set targetFolder to folder "${escAS(folder)}"
    end try
    if targetFolder is missing value then
        make new note with properties {name:"${escAS(title)}", body:"${escAS(body)}"}
    else
        tell targetFolder
            make new note with properties {name:"${escAS(title)}", body:"${escAS(body)}"}
        end tell
    end if
end tell
return "ok"
`;
    await runOsascript(script);
    return { output: true };
  }
}

export class ListNotesAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.ListNotes";
  static readonly title = "List Notes";
  static readonly description =
    "List notes from macOS Notes via AppleScript.\n    notes, list, macos";
  static readonly metadataOutputTypes = {
    notes: "list"
  };

  @prop({ type: "int", default: 25, min: 1, max: 500, title: "Limit", description: "Maximum notes to return" })
  declare limit: number;

  @prop({ type: "str", default: "", title: "Folder", description: "Optional folder name; empty = all folders" })
  declare folder: string;

  async process(): Promise<Record<string, unknown>> {
    const limit = Math.max(1, Number(this.limit ?? 25));
    const folder = String(this.folder ?? "");

    const folderClause = folder
      ? `set theNotes to notes of folder "${escAS(folder)}"`
      : `set theNotes to every note`;

    const script = `
set output to ""
set maxN to ${limit}
set seen to 0
tell application "Notes"
    ${folderClause}
    repeat with n in theNotes
        if seen ≥ maxN then exit repeat
        set noteTitle to name of n
        set noteBody to body of n
        set noteFolder to ""
        try
            set noteFolder to name of container of n
        end try
        set output to output & noteTitle & "${FIELD_SEP}" & noteBody & "${FIELD_SEP}" & noteFolder & "${REC_SEP}"
        set seen to seen + 1
    end repeat
end tell
return output
`;
    const out = await runOsascript(script, { timeoutMs: 60_000 });
    const notes = parseRecords(out).map(([title, body, folderName]) => ({
      title,
      content: body,
      folder: folderName
    }));
    return { notes };
  }
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export class CreateReminderAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.CreateReminder";
  static readonly title = "Create Reminder";
  static readonly description =
    "Create a reminder in macOS Reminders via AppleScript.\n    reminders, todo, macos";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly basicFields = ["title", "due_date", "list_name"];

  @prop({ type: "str", default: "", title: "Title", description: "Title of the reminder" })
  declare title: string;

  @prop({ type: "any", default: "", title: "Due Date", description: "Optional due date; leave empty for none" })
  declare due_date: unknown;

  @prop({ type: "str", default: "Reminders", title: "List", description: "Reminders list name" })
  declare list_name: string;

  @prop({ type: "str", default: "", title: "Notes", description: "Additional notes" })
  declare notes: string;

  async process(): Promise<Record<string, unknown>> {
    const title = String(this.title ?? "");
    if (!title) throw new Error("title cannot be empty");
    const listName = String(this.list_name ?? "Reminders");
    const notes = String(this.notes ?? "");

    let dueExpr = "";
    let dueProp = "";
    if (this.due_date) {
      try {
        const due = parseDateInput(this.due_date);
        dueExpr = asDateExpr("dueDate", due);
        dueProp = `, due date:dueDate`;
      } catch {
        // Treat unparseable due_date as "no due date" rather than failing.
        dueExpr = "";
      }
    }

    const script = `
${dueExpr}
tell application "Reminders"
    tell list "${escAS(listName)}"
        make new reminder with properties {name:"${escAS(
          title
        )}", body:"${escAS(notes)}"${dueProp}}
    end tell
end tell
return "ok"
`;
    await runOsascript(script);
    return { output: true };
  }
}

export class ListRemindersAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.ListReminders";
  static readonly title = "List Reminders";
  static readonly description =
    "List reminders in a given list via AppleScript.\n    reminders, todo, list, macos";
  static readonly metadataOutputTypes = {
    reminders: "list"
  };

  @prop({ type: "str", default: "Reminders", title: "List", description: "Reminders list name" })
  declare list_name: string;

  @prop({ type: "bool", default: false, title: "Include Completed", description: "Include completed reminders" })
  declare include_completed: boolean;

  async process(): Promise<Record<string, unknown>> {
    const listName = String(this.list_name ?? "Reminders");
    const includeCompleted = Boolean(this.include_completed ?? false);

    const whereClause = includeCompleted
      ? "every reminder"
      : "every reminder whose completed is false";

    const script = `
set output to ""
tell application "Reminders"
    set theItems to ${whereClause} of list "${escAS(listName)}"
    repeat with r in theItems
        set rName to name of r
        set rBody to ""
        try
            set rBody to body of r
            if rBody is missing value then set rBody to ""
        end try
        set rDone to (completed of r) as string
        set rDue to ""
        try
            set rDue to ((due date of r) as «class isot» as string)
        end try
        set output to output & rName & "${FIELD_SEP}" & rBody & "${FIELD_SEP}" & rDone & "${FIELD_SEP}" & rDue & "${REC_SEP}"
    end repeat
end tell
return output
`;
    const out = await runOsascript(script, { timeoutMs: 60_000 });
    const reminders = parseRecords(out).map(([name, body, done, due]) => ({
      title: name,
      notes: body,
      completed: done === "true",
      due_date: due,
      list: listName
    }));
    return { reminders };
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export class SendMessageAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.SendMessage";
  static readonly title = "Send iMessage";
  static readonly description =
    "Send an iMessage to a phone number or email via AppleScript.\n    messages, imessage, send, macos";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly basicFields = ["recipient", "text"];

  @prop({ type: "str", default: "", title: "Recipient", description: "Phone number or email of the recipient" })
  declare recipient: string;

  @prop({ type: "str", default: "", title: "Text", description: "Message body" })
  declare text: string;

  async process(): Promise<Record<string, unknown>> {
    const recipient = String(this.recipient ?? "");
    const text = String(this.text ?? "");
    if (!recipient) throw new Error("recipient cannot be empty");
    if (!text) throw new Error("text cannot be empty");

    const script = `
tell application "Messages"
    set targetService to 1st service whose service type = iMessage
    set targetBuddy to buddy "${escAS(recipient)}" of targetService
    send "${escAS(text)}" to targetBuddy
end tell
return "ok"
`;
    await runOsascript(script);
    return { output: true };
  }
}

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------

export class SendMailAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.SendMail";
  static readonly title = "Send Mail (Apple Mail)";
  static readonly description =
    "Compose and send an email through Apple Mail via AppleScript.\n    mail, email, send, macos";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly basicFields = ["to_address", "subject", "body"];

  @prop({ type: "str", default: "", title: "To", description: "Recipient email address" })
  declare to_address: string;

  @prop({ type: "str", default: "", title: "Cc", description: "CC email address (optional)" })
  declare cc_address: string;

  @prop({ type: "str", default: "", title: "Subject", description: "Email subject" })
  declare subject: string;

  @prop({ type: "str", default: "", title: "Body", description: "Email body (plain text)" })
  declare body: string;

  @prop({ type: "bool", default: false, title: "Visible", description: "Show the message in the UI rather than sending silently" })
  declare visible: boolean;

  async process(): Promise<Record<string, unknown>> {
    const to = String(this.to_address ?? "");
    if (!to) throw new Error("to_address cannot be empty");
    const cc = String(this.cc_address ?? "");
    const subject = String(this.subject ?? "");
    const body = String(this.body ?? "");
    const visible = Boolean(this.visible ?? false);

    const ccBlock = cc
      ? `make new cc recipient at end of cc recipients with properties {address:"${escAS(
          cc
        )}"}`
      : "";

    const script = `
tell application "Mail"
    set newMsg to make new outgoing message with properties {subject:"${escAS(
      subject
    )}", content:"${escAS(body)}", visible:${visible ? "true" : "false"}}
    tell newMsg
        make new to recipient at end of to recipients with properties {address:"${escAS(
          to
        )}"}
        ${ccBlock}
        send
    end tell
end tell
return "ok"
`;
    await runOsascript(script, { timeoutMs: 60_000 });
    return { output: true };
  }
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export class SearchContactsAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.SearchContacts";
  static readonly title = "Search Contacts";
  static readonly description =
    "Search macOS Contacts via AppleScript.\n    contacts, search, address book, macos";
  static readonly metadataOutputTypes = {
    contacts: "list"
  };
  static readonly basicFields = ["query", "limit"];

  @prop({ type: "str", default: "", title: "Query", description: "Substring to match against name/email/phone" })
  declare query: string;

  @prop({ type: "int", default: 10, min: 1, max: 200, title: "Limit", description: "Maximum results" })
  declare limit: number;

  async process(): Promise<Record<string, unknown>> {
    const query = String(this.query ?? "");
    const limit = Math.max(1, Number(this.limit ?? 10));

    // Match query against name; emails/phones returned for each hit and
    // optionally also matched in TS for substrings outside the name.
    const script = `
set output to ""
set maxN to ${limit}
set seen to 0
tell application "Contacts"
    set candidates to (every person whose name contains "${escAS(query)}")
    repeat with p in candidates
        if seen ≥ maxN then exit repeat
        set pid to id of p
        set pname to name of p
        set pgiven to ""
        try
            set pgiven to first name of p
            if pgiven is missing value then set pgiven to ""
        end try
        set pfamily to ""
        try
            set pfamily to last name of p
            if pfamily is missing value then set pfamily to ""
        end try
        set emailList to ""
        try
            set emailValues to value of every email of p
            set AppleScript's text item delimiters to ","
            set emailList to emailValues as string
            set AppleScript's text item delimiters to ""
        end try
        set phoneList to ""
        try
            set phoneValues to value of every phone of p
            set AppleScript's text item delimiters to ","
            set phoneList to phoneValues as string
            set AppleScript's text item delimiters to ""
        end try
        set output to output & pid & "${FIELD_SEP}" & pname & "${FIELD_SEP}" & pgiven & "${FIELD_SEP}" & pfamily & "${FIELD_SEP}" & emailList & "${FIELD_SEP}" & phoneList & "${REC_SEP}"
        set seen to seen + 1
    end repeat
end tell
return output
`;
    const out = await runOsascript(script, { timeoutMs: 60_000 });
    const contacts = parseRecords(out).map(
      ([id, fullName, given, family, emails, phones]) => ({
        identifier: id,
        full_name: fullName,
        given_name: given,
        family_name: family,
        emails: emails ? emails.split(",").filter(Boolean) : [],
        phones: phones ? phones.split(",").filter(Boolean) : []
      })
    );
    return { contacts };
  }
}

// ---------------------------------------------------------------------------
// Safari
// ---------------------------------------------------------------------------

export class GetFrontSafariTabAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.GetFrontSafariTab";
  static readonly title = "Get Front Safari Tab";
  static readonly description =
    "Read URL and title of Safari's frontmost tab.\n    safari, browser, tab, macos";
  static readonly metadataOutputTypes = {
    url: "str",
    title: "str"
  };

  async process(): Promise<Record<string, unknown>> {
    const script = `
tell application "Safari"
    set u to URL of current tab of front window
    set t to name of current tab of front window
end tell
return u & "${FIELD_SEP}" & t
`;
    const out = await runOsascript(script);
    const [url = "", title = ""] = out.replace(/\n+$/g, "").split(FIELD_SEP);
    return { url, title };
  }
}

export class OpenSafariURLAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.OpenSafariURL";
  static readonly title = "Open URL in Safari";
  static readonly description =
    "Open a URL in Safari and optionally bring it to the front.\n    safari, browser, open, macos";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly basicFields = ["url", "activate"];

  @prop({ type: "str", default: "", title: "URL", description: "URL to open" })
  declare url: string;

  @prop({ type: "bool", default: true, title: "Activate", description: "Bring Safari to the foreground" })
  declare activate: boolean;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? "");
    if (!url) throw new Error("url cannot be empty");
    const activate = Boolean(this.activate ?? true);

    const script = `
tell application "Safari"
    ${activate ? "activate" : ""}
    open location "${escAS(url)}"
end tell
return "ok"
`;
    await runOsascript(script);
    return { output: true };
  }
}

export class SafariSelectionTextAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.SafariSelectionText";
  static readonly title = "Safari Selection Text";
  static readonly description =
    "Return the currently selected text from Safari's front document (uses `do JavaScript`; requires 'Allow JavaScript from Apple Events' in Safari's Develop menu).\n    safari, selection, text";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  async process(): Promise<Record<string, unknown>> {
    const script = `
tell application "Safari"
    set selText to do JavaScript "window.getSelection().toString()" in front document
end tell
return selText
`;
    const out = await runOsascript(script);
    return { output: out.replace(/\n+$/g, "") };
  }
}

export class SafariPageTextAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.SafariPageText";
  static readonly title = "Safari Page Text";
  static readonly description =
    "Extract visible text from Safari's front document via injected JavaScript (requires 'Allow JavaScript from Apple Events' in Safari's Develop menu).\n    safari, page, text, extract";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "int", default: 50_000, min: 100, max: 1_000_000, title: "Max Chars", description: "Truncate output to this many characters" })
  declare max_chars: number;

  @prop({ type: "bool", default: true, title: "Prefer Article", description: "Use <article> innerText when present" })
  declare prefer_article: boolean;

  async process(): Promise<Record<string, unknown>> {
    const maxChars = Math.max(100, Number(this.max_chars ?? 50_000));
    const preferArticle = Boolean(this.prefer_article ?? true);

    const js = `(function(){var n=${
      preferArticle ? "document.querySelector('article')||document.body" : "document.body"
    };var t=(n&&n.innerText)||'';return t.slice(0,${maxChars});})()`;

    const script = `
tell application "Safari"
    set pageText to do JavaScript "${escAS(js)}" in front document
end tell
return pageText
`;
    const out = await runOsascript(script, { timeoutMs: 60_000 });
    return { output: out.replace(/\n+$/g, "") };
  }
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

export class GetClipboardTextAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.GetClipboardText";
  static readonly title = "Get Clipboard Text";
  static readonly description =
    "Read plain text from the macOS clipboard via AppleScript.\n    clipboard, text, macos";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  async process(): Promise<Record<string, unknown>> {
    const out = await runOsascript(`return (the clipboard as text)`);
    return { output: out.replace(/\n+$/g, "") };
  }
}

export class SetClipboardTextAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.SetClipboardText";
  static readonly title = "Set Clipboard Text";
  static readonly description =
    "Write plain text to the macOS clipboard via AppleScript.\n    clipboard, text, macos";
  static readonly metadataOutputTypes = {
    output: "bool"
  };

  @prop({ type: "str", default: "", title: "Text", description: "Text to put on the clipboard" })
  declare text: string;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? "");
    await runOsascript(`set the clipboard to "${escAS(text)}"\nreturn "ok"`);
    return { output: true };
  }
}

// ---------------------------------------------------------------------------
// Speech
// ---------------------------------------------------------------------------

export class SayTextAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.SayText";
  static readonly title = "Say Text";
  static readonly description =
    "Speak text aloud using macOS text-to-speech via AppleScript's `say` command.\n    speech, tts, voice, macos";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly basicFields = ["text", "voice"];

  @prop({ type: "str", default: "", title: "Text", description: "Text to speak" })
  declare text: string;

  @prop({ type: "str", default: "", title: "Voice", description: "Voice name (e.g. 'Alex', 'Samantha'). Empty = system default." })
  declare voice: string;

  @prop({ type: "int", default: 175, min: 10, max: 500, title: "Rate", description: "Speaking rate (words per minute)" })
  declare rate: number;

  @prop({ type: "bool", default: true, title: "Wait", description: "Wait for speech to finish before returning" })
  declare wait: boolean;

  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? "");
    if (!text) throw new Error("text cannot be empty");
    const voice = String(this.voice ?? "");
    const rate = Math.max(10, Math.min(500, Number(this.rate ?? 175)));
    const wait = Boolean(this.wait ?? true);

    const parts = [`say "${escAS(text)}"`];
    if (voice) parts.push(`using "${escAS(voice)}"`);
    parts.push(`speaking rate ${rate}`);
    if (!wait) parts.push("without waiting until completion");

    await runOsascript(`${parts.join(" ")}\nreturn "ok"`, {
      timeoutMs: wait ? 120_000 : 5_000
    });
    return { output: true };
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export class PostNotificationAppleNode extends BaseNode {
  static readonly nodeType = "lib.apple.PostNotification";
  static readonly title = "Post Notification";
  static readonly description =
    "Post a notification to macOS Notification Center via AppleScript.\n    notification, alert, macos";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly basicFields = ["title", "message"];

  @prop({ type: "str", default: "Nodetool", title: "Title", description: "Notification title" })
  declare title: string;

  @prop({ type: "str", default: "", title: "Subtitle", description: "Notification subtitle" })
  declare subtitle: string;

  @prop({ type: "str", default: "", title: "Message", description: "Notification body" })
  declare message: string;

  @prop({ type: "str", default: "", title: "Sound", description: "Optional sound name (e.g. 'Glass'); empty = silent" })
  declare sound_name: string;

  async process(): Promise<Record<string, unknown>> {
    const title = String(this.title ?? "Nodetool");
    const subtitle = String(this.subtitle ?? "");
    const message = String(this.message ?? "");
    const sound = String(this.sound_name ?? "");

    const parts = [`display notification "${escAS(message)}"`];
    parts.push(`with title "${escAS(title)}"`);
    if (subtitle) parts.push(`subtitle "${escAS(subtitle)}"`);
    if (sound) parts.push(`sound name "${escAS(sound)}"`);

    await runOsascript(`${parts.join(" ")}\nreturn "ok"`);
    return { output: true };
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const LIB_APPLE_NODES = [
  CreateCalendarEventAppleNode,
  ListCalendarEventsAppleNode,
  CreateNoteAppleNode,
  ListNotesAppleNode,
  CreateReminderAppleNode,
  ListRemindersAppleNode,
  SendMessageAppleNode,
  SendMailAppleNode,
  SearchContactsAppleNode,
  GetFrontSafariTabAppleNode,
  OpenSafariURLAppleNode,
  SafariSelectionTextAppleNode,
  SafariPageTextAppleNode,
  GetClipboardTextAppleNode,
  SetClipboardTextAppleNode,
  SayTextAppleNode,
  PostNotificationAppleNode
] as const;

// Internal helpers exported for tests.
export const __testing__ = {
  escAS,
  parseDateInput,
  asDateExpr,
  parseRecords,
  REC_SEP,
  FIELD_SEP
};
