/**
 * Browser tool: Storage operations.
 * Get, set, and remove items from Chrome extension storage.
 */
import { BrowserToolRegistry } from "../browserTools";

interface StorageGetArgs {
  keys: string | string[];
  area?: "local" | "sync" | "session";
}

interface StorageSetArgs {
  items: Record<string, unknown>;
  area?: "local" | "sync" | "session";
}

interface StorageRemoveArgs {
  keys: string | string[];
  area?: "local" | "sync" | "session";
}

BrowserToolRegistry.register({
  name: "browser_storage_get",
  description: "Get items from Chrome extension storage. Supports local, sync, and session storage areas.",
  parameters: {
    type: "object",
    properties: {
      keys: {
        oneOf: [
          { type: "string", description: "Single key to get" },
          { type: "array", items: { type: "string" }, description: "Array of keys to get" }
        ],
        description: "Key or keys to retrieve from storage"
      },
      area: {
        type: "string",
        enum: ["local", "sync", "session"],
        description: "Storage area to use (default: local)"
      }
    },
    required: ["keys"]
  },
  async execute(args: StorageGetArgs) {
    const area = args.area || "local";
    const storage = chrome.storage[area];
    
    const result = await storage.get(args.keys);
    
    return {
      items: result,
      area
    };
  }
});

BrowserToolRegistry.register({
  name: "browser_storage_set",
  description: "Set items in Chrome extension storage. Supports local, sync, and session storage areas.",
  parameters: {
    type: "object",
    properties: {
      items: {
        type: "object",
        additionalProperties: true,
        description: "Object with key-value pairs to store"
      },
      area: {
        type: "string",
        enum: ["local", "sync", "session"],
        description: "Storage area to use (default: local)"
      }
    },
    required: ["items"]
  },
  async execute(args: StorageSetArgs) {
    const area = args.area || "local";
    const storage = chrome.storage[area];
    
    await storage.set(args.items);
    
    return {
      stored: Object.keys(args.items),
      area
    };
  }
});

BrowserToolRegistry.register({
  name: "browser_storage_remove",
  description: "Remove items from Chrome extension storage. Supports local, sync, and session storage areas.",
  parameters: {
    type: "object",
    properties: {
      keys: {
        oneOf: [
          { type: "string", description: "Single key to remove" },
          { type: "array", items: { type: "string" }, description: "Array of keys to remove" }
        ],
        description: "Key or keys to remove from storage"
      },
      area: {
        type: "string",
        enum: ["local", "sync", "session"],
        description: "Storage area to use (default: local)"
      }
    },
    required: ["keys"]
  },
  async execute(args: StorageRemoveArgs) {
    const area = args.area || "local";
    const storage = chrome.storage[area];
    
    await storage.remove(args.keys);
    
    return {
      removed: Array.isArray(args.keys) ? args.keys : [args.keys],
      area
    };
  }
});
