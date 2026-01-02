/**
 * Browser tool: Window management.
 * Create, update, and query browser windows.
 */
import { BrowserToolRegistry } from "../browserTools";

interface GetWindowsArgs {
  populate?: boolean;
  windowTypes?: Array<"normal" | "popup" | "panel" | "app" | "devtools">;
}

interface CreateWindowArgs {
  url?: string | string[];
  focused?: boolean;
  type?: "normal" | "popup" | "panel";
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  incognito?: boolean;
}

interface UpdateWindowArgs {
  windowId: number;
  focused?: boolean;
  state?: "normal" | "minimized" | "maximized" | "fullscreen";
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

BrowserToolRegistry.register({
  name: "browser_get_windows",
  description: "Get all browser windows with optional tab information.",
  parameters: {
    type: "object",
    properties: {
      populate: {
        type: "boolean",
        description: "Whether to include tab information for each window (default: false)"
      },
      windowTypes: {
        type: "array",
        items: {
          type: "string",
          enum: ["normal", "popup", "panel", "app", "devtools"]
        },
        description: "Filter by window types"
      }
    },
    required: []
  },
  async execute(args: GetWindowsArgs) {
    const getInfo: chrome.windows.QueryOptions = {
      populate: args.populate,
      windowTypes: args.windowTypes
    };
    
    const windows = await chrome.windows.getAll(getInfo);
    
    return {
      count: windows.length,
      windows: windows.map(win => ({
        windowId: win.id,
        type: win.type,
        state: win.state,
        focused: win.focused,
        incognito: win.incognito,
        width: win.width,
        height: win.height,
        left: win.left,
        top: win.top,
        tabCount: win.tabs?.length,
        tabs: args.populate ? win.tabs?.map(tab => ({
          tabId: tab.id,
          url: tab.url,
          title: tab.title,
          active: tab.active
        })) : undefined
      }))
    };
  }
});

BrowserToolRegistry.register({
  name: "browser_create_window",
  description: "Create a new browser window with optional URLs.",
  parameters: {
    type: "object",
    properties: {
      url: {
        oneOf: [
          { type: "string", description: "Single URL to open" },
          { type: "array", items: { type: "string" }, description: "Array of URLs to open as tabs" }
        ],
        description: "URL(s) to open in the new window"
      },
      focused: {
        type: "boolean",
        description: "Whether the window should be focused (default: true)"
      },
      type: {
        type: "string",
        enum: ["normal", "popup", "panel"],
        description: "Window type"
      },
      width: { type: "number", description: "Window width in pixels" },
      height: { type: "number", description: "Window height in pixels" },
      left: { type: "number", description: "Window left position in pixels" },
      top: { type: "number", description: "Window top position in pixels" },
      incognito: {
        type: "boolean",
        description: "Whether to create an incognito window"
      }
    },
    required: []
  },
  async execute(args: CreateWindowArgs) {
    const createData: chrome.windows.CreateData = {};
    
    if (args.url !== undefined) {createData.url = args.url;}
    if (args.focused !== undefined) {createData.focused = args.focused;}
    if (args.type !== undefined) {createData.type = args.type;}
    if (args.width !== undefined) {createData.width = args.width;}
    if (args.height !== undefined) {createData.height = args.height;}
    if (args.left !== undefined) {createData.left = args.left;}
    if (args.top !== undefined) {createData.top = args.top;}
    if (args.incognito !== undefined) {createData.incognito = args.incognito;}
    
    const window = await chrome.windows.create(createData);
    
    return {
      windowId: window.id,
      type: window.type,
      state: window.state,
      focused: window.focused,
      incognito: window.incognito,
      width: window.width,
      height: window.height,
      left: window.left,
      top: window.top,
      tabCount: window.tabs?.length
    };
  }
});

BrowserToolRegistry.register({
  name: "browser_update_window",
  description: "Update a browser window's state, size, or position.",
  parameters: {
    type: "object",
    properties: {
      windowId: {
        type: "number",
        description: "Window ID to update"
      },
      focused: {
        type: "boolean",
        description: "Whether to focus the window"
      },
      state: {
        type: "string",
        enum: ["normal", "minimized", "maximized", "fullscreen"],
        description: "Window state"
      },
      width: { type: "number", description: "Window width in pixels" },
      height: { type: "number", description: "Window height in pixels" },
      left: { type: "number", description: "Window left position in pixels" },
      top: { type: "number", description: "Window top position in pixels" }
    },
    required: ["windowId"]
  },
  async execute(args: UpdateWindowArgs) {
    const updateInfo: chrome.windows.UpdateInfo = {};
    
    if (args.focused !== undefined) {updateInfo.focused = args.focused;}
    if (args.state !== undefined) {updateInfo.state = args.state;}
    if (args.width !== undefined) {updateInfo.width = args.width;}
    if (args.height !== undefined) {updateInfo.height = args.height;}
    if (args.left !== undefined) {updateInfo.left = args.left;}
    if (args.top !== undefined) {updateInfo.top = args.top;}
    
    const window = await chrome.windows.update(args.windowId, updateInfo);
    
    return {
      windowId: window.id,
      type: window.type,
      state: window.state,
      focused: window.focused,
      width: window.width,
      height: window.height,
      left: window.left,
      top: window.top
    };
  }
});
