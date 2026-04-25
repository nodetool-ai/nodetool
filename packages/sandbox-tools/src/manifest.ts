/**
 * Manifest of every sandbox tool exposed to agents.
 *
 * Adding a new sandbox tool here is a three-field change: name,
 * description, and the ToolClient method to invoke. The input schema is
 * imported directly from the shared @nodetool/sandbox/schemas.
 */

import type { ToolClient } from "@nodetool/sandbox";
import {
  FileReadInput,
  FileWriteInput,
  FileStrReplaceInput,
  FileFindInContentInput,
  FileFindByNameInput,
  ShellExecInput,
  ShellViewInput,
  ShellWaitInput,
  ShellWriteToProcessInput,
  ShellKillProcessInput,
  BrowserViewInput,
  BrowserNavigateInput,
  BrowserRestartInput,
  BrowserClickInput,
  BrowserInputTextInput,
  BrowserMoveMouseInput,
  BrowserPressKeyInput,
  BrowserSelectOptionInput,
  BrowserScrollInput,
  BrowserConsoleExecInput,
  BrowserConsoleViewInput,
  ScreenCaptureInput,
  ScreenFindInput,
  MouseMoveInput,
  MouseClickInput,
  MouseDragInput,
  MouseScrollInput,
  KeyPressInput,
  KeyTypeInput,
  InfoSearchWebInput,
  MessageNotifyUserInput,
  MessageAskUserInput,
  IdleInput,
  ExposePortInput
} from "@nodetool/sandbox/schemas";
import type { SandboxToolDefinition } from "./SandboxTool.js";
import { SandboxTool } from "./SandboxTool.js";

// Registry of every tool. Not typed as `SandboxToolDefinition<any, any>[]`
// to keep each entry's generics precise; we erase to `unknown` at the
// factory boundary.
function defs(): SandboxToolDefinition<unknown, unknown>[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: SandboxToolDefinition<any, any>[] = [
    // --- File -----------------------------------------------------------
    {
      name: "file_read",
      description:
        "Read a file from the sandbox filesystem. Returns the full content and a truncation flag.",
      inputSchema: FileReadInput,
      invoke: (c, i) => c.fileRead(i),
      renderStatus: (i) => `Reading ${i.file}`
    },
    {
      name: "file_write",
      description:
        "Write (or append to) a file in the sandbox filesystem. Creates parent directories.",
      inputSchema: FileWriteInput,
      invoke: (c, i) => c.fileWrite(i),
      renderStatus: (i) => `Writing ${i.file}`
    },
    {
      name: "file_str_replace",
      description:
        "Replace every occurrence of old_str with new_str inside a file. Errors if old_str is absent.",
      inputSchema: FileStrReplaceInput,
      invoke: (c, i) => c.fileStrReplace(i),
      renderStatus: (i) => `Patching ${i.file}`
    },
    {
      name: "file_find_in_content",
      description:
        "Search for a regex pattern inside a file. Returns the matching lines with line numbers.",
      inputSchema: FileFindInContentInput,
      invoke: (c, i) => c.fileFindInContent(i),
      renderStatus: (i) => `Searching ${i.file}`
    },
    {
      name: "file_find_by_name",
      description:
        "Find files whose name matches a glob under a root directory.",
      inputSchema: FileFindByNameInput,
      invoke: (c, i) => c.fileFindByName(i),
      renderStatus: (i) => `Finding ${i.glob} in ${i.path}`
    },

    // --- Shell ----------------------------------------------------------
    {
      name: "shell_exec",
      description:
        "Run a shell command in a persistent named tmux session. Use the same id to run multiple commands in the same session.",
      inputSchema: ShellExecInput,
      invoke: (c, i) => c.shellExec(i),
      renderStatus: (i) =>
        `Running \`${i.command.slice(0, 60)}${i.command.length > 60 ? "…" : ""}\``
    },
    {
      name: "shell_view",
      description:
        "Read the current output buffer of a shell session without blocking.",
      inputSchema: ShellViewInput,
      invoke: (c, i) => c.shellView(i),
      renderStatus: (i) => `Viewing session ${i.id}`
    },
    {
      name: "shell_wait",
      description:
        "Wait for a shell session's current command to finish, up to `seconds`.",
      inputSchema: ShellWaitInput,
      invoke: (c, i) => c.shellWait(i),
      renderStatus: (i) => `Waiting on ${i.id}`
    },
    {
      name: "shell_write_to_process",
      description:
        "Write to the stdin of a running shell process. Use press_enter=true to submit a line.",
      inputSchema: ShellWriteToProcessInput,
      invoke: (c, i) => c.shellWriteToProcess(i),
      renderStatus: (i) => `Writing to ${i.id}`
    },
    {
      name: "shell_kill_process",
      description:
        "Terminate a shell session and release its resources.",
      inputSchema: ShellKillProcessInput,
      invoke: (c, i) => c.shellKillProcess(i),
      renderStatus: (i) => `Killing ${i.id}`
    },

    // --- Browser --------------------------------------------------------
    {
      name: "browser_view",
      description:
        "Return the current page's URL, title, an indexed list of interactive elements, and a screenshot.",
      inputSchema: BrowserViewInput,
      invoke: (c, i) => c.browserView(i),
      renderStatus: () => "Inspecting the page"
    },
    {
      name: "browser_navigate",
      description: "Navigate the browser to a URL and wait for load.",
      inputSchema: BrowserNavigateInput,
      invoke: (c, i) => c.browserNavigate(i),
      renderStatus: (i) => `Navigating to ${i.url}`
    },
    {
      name: "browser_restart",
      description:
        "Close and re-open the browser. Optionally navigate to a starting URL.",
      inputSchema: BrowserRestartInput,
      invoke: (c, i) => c.browserRestart(i),
      renderStatus: () => "Restarting the browser"
    },
    {
      name: "browser_click",
      description:
        "Click an element. Address by the index returned from browser_view or by viewport coordinates.",
      inputSchema: BrowserClickInput,
      invoke: (c, i) => c.browserClick(i),
      renderStatus: (i) =>
        i.index !== undefined
          ? `Clicking element ${i.index}`
          : `Clicking (${i.coordinate_x}, ${i.coordinate_y})`
    },
    {
      name: "browser_input",
      description:
        "Type text into a form field. Address by element index or viewport coordinates. Optionally press Enter after typing.",
      inputSchema: BrowserInputTextInput,
      invoke: (c, i) => c.browserInput(i),
      renderStatus: () => "Typing into the page"
    },
    {
      name: "browser_move_mouse",
      description: "Move the browser's virtual mouse to viewport coordinates.",
      inputSchema: BrowserMoveMouseInput,
      invoke: (c, i) => c.browserMoveMouse(i),
      renderStatus: (i) =>
        `Moving mouse to (${i.coordinate_x}, ${i.coordinate_y})`
    },
    {
      name: "browser_press_key",
      description:
        "Press a keyboard key or chord in the browser (e.g. 'Enter', 'Control+a').",
      inputSchema: BrowserPressKeyInput,
      invoke: (c, i) => c.browserPressKey(i),
      renderStatus: (i) => `Pressing ${i.key}`
    },
    {
      name: "browser_select_option",
      description:
        "Select an option value from a <select> element by its element index.",
      inputSchema: BrowserSelectOptionInput,
      invoke: (c, i) => c.browserSelectOption(i),
      renderStatus: (i) => `Selecting ${i.option}`
    },
    {
      name: "browser_scroll",
      description:
        "Scroll the browser viewport. Use to_top, to_bottom, or pixels for a relative scroll.",
      inputSchema: BrowserScrollInput,
      invoke: (c, i) => c.browserScroll(i),
      renderStatus: () => "Scrolling"
    },
    {
      name: "browser_console_exec",
      description:
        "Evaluate a JavaScript expression in the page and return the JSON-serialized result.",
      inputSchema: BrowserConsoleExecInput,
      invoke: (c, i) => c.browserConsoleExec(i),
      renderStatus: () => "Running JS in the page"
    },
    {
      name: "browser_console_view",
      description:
        "Return recent console messages from the page (log, warn, error).",
      inputSchema: BrowserConsoleViewInput,
      invoke: (c, i) => c.browserConsoleView(i),
      renderStatus: () => "Reading console"
    },

    // --- Desktop --------------------------------------------------------
    {
      name: "screen_capture",
      description:
        "Capture the sandbox desktop as a base64-encoded PNG or JPEG. Optionally restricts to a region.",
      inputSchema: ScreenCaptureInput,
      invoke: (c, i) => c.screenCapture(i),
      renderStatus: () => "Capturing screen"
    },
    {
      name: "screen_find",
      description:
        "Locate text on the desktop via OCR. Returns bounding boxes and OCR confidence.",
      inputSchema: ScreenFindInput,
      invoke: (c, i) => c.screenFind(i),
      renderStatus: (i) => `Looking for "${i.query}"`
    },
    {
      name: "mouse_move",
      description:
        "Move the real desktop mouse cursor to screen coordinates. Optional tween duration in ms.",
      inputSchema: MouseMoveInput,
      invoke: (c, i) => c.mouseMove(i),
      renderStatus: (i) => `Moving cursor to (${i.x}, ${i.y})`
    },
    {
      name: "mouse_click",
      description:
        "Move the desktop mouse to coordinates and click. Optional button and click count.",
      inputSchema: MouseClickInput,
      invoke: (c, i) => c.mouseClick(i),
      renderStatus: (i) => `Clicking (${i.x}, ${i.y})`
    },
    {
      name: "mouse_drag",
      description: "Press-and-hold, move, and release the desktop mouse.",
      inputSchema: MouseDragInput,
      invoke: (c, i) => c.mouseDrag(i),
      renderStatus: (i) =>
        `Dragging (${i.from_x}, ${i.from_y}) → (${i.to_x}, ${i.to_y})`
    },
    {
      name: "mouse_scroll",
      description: "Scroll the desktop mouse wheel at a given position.",
      inputSchema: MouseScrollInput,
      invoke: (c, i) => c.mouseScroll(i),
      renderStatus: () => "Scrolling desktop"
    },
    {
      name: "key_press",
      description:
        "Press a key or chord on the desktop keyboard (xdotool syntax, e.g. 'ctrl+c').",
      inputSchema: KeyPressInput,
      invoke: (c, i) => c.keyPress(i),
      renderStatus: (i) => `Pressing ${i.keys}`
    },
    {
      name: "key_type",
      description: "Type a literal string via the desktop keyboard.",
      inputSchema: KeyTypeInput,
      invoke: (c, i) => c.keyType(i),
      renderStatus: () => "Typing on keyboard"
    },

    // --- Search ---------------------------------------------------------
    {
      name: "info_search_web",
      description:
        "Search the web via the configured provider (Tavily / Brave / Serper). Returns ranked results.",
      inputSchema: InfoSearchWebInput,
      invoke: (c, i) => c.infoSearchWeb(i),
      renderStatus: (i) => `Searching: ${i.query}`
    },

    // --- Messaging ------------------------------------------------------
    {
      name: "message_notify_user",
      description:
        "Send a non-blocking status update to the user. Optionally attach files from the workspace.",
      inputSchema: MessageNotifyUserInput,
      invoke: (c, i) => c.messageNotifyUser(i),
      renderStatus: () => "Notifying user"
    },
    {
      name: "message_ask_user",
      description:
        "Ask the user a question and wait for their reply. Set suggest_user_takeover to hand off control (captchas, logins).",
      inputSchema: MessageAskUserInput,
      invoke: (c, i) => c.messageAskUser(i),
      renderStatus: () => "Asking user"
    },
    {
      name: "idle",
      description:
        "Signal that the current objective is complete. Call this exactly once when done.",
      inputSchema: IdleInput,
      invoke: (c, i) => c.idle(i),
      renderStatus: () => "Finishing"
    },

    // --- Deploy ---------------------------------------------------------
    {
      name: "expose_port",
      description:
        "Return the public host URL for a service the agent is running on a known sandbox container port (3000, 5000, 8000, 8080).",
      inputSchema: ExposePortInput,
      invoke: (c, i) => c.exposePort(i),
      renderStatus: (i) => `Exposing port ${i.port}`
    }
  ];
  return all as SandboxToolDefinition<unknown, unknown>[];
}

export interface CreateSandboxToolsOptions {
  /** Only include tools whose name appears in the list. */
  include?: string[];
  /** Exclude tools whose name appears in the list. */
  exclude?: string[];
}

/**
 * Build the full array of agent-facing sandbox tools for a given
 * ToolClient. Callers can filter by include/exclude to constrain the
 * tool surface exposed to an agent.
 */
export function createSandboxTools(
  client: ToolClient,
  options: CreateSandboxToolsOptions = {}
): SandboxTool[] {
  const include = options.include ? new Set(options.include) : null;
  const exclude = options.exclude ? new Set(options.exclude) : null;
  const out: SandboxTool[] = [];
  for (const def of defs()) {
    if (include && !include.has(def.name)) continue;
    if (exclude && exclude.has(def.name)) continue;
    out.push(new SandboxTool(client, def));
  }
  return out;
}

/** All tool names defined by the manifest, in a stable order. */
export function listSandboxToolNames(): string[] {
  return defs().map((d) => d.name);
}
