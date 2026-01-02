/**
 * Browser tool: Create a new tab.
 * Opens a new browser tab with the specified URL.
 */
import { BrowserToolRegistry } from "../browserTools";

interface CreateTabArgs {
  url: string;
  active?: boolean;
  pinned?: boolean;
}

BrowserToolRegistry.register({
  name: "browser_create_tab",
  description: "Create and open a new browser tab with the specified URL.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to open in the new tab"
      },
      active: {
        type: "boolean",
        description: "Whether the new tab should become the active tab (default: true)"
      },
      pinned: {
        type: "boolean",
        description: "Whether the tab should be pinned"
      }
    },
    required: ["url"]
  },
  async execute(args: CreateTabArgs) {
    const createProperties: chrome.tabs.CreateProperties = {
      url: args.url,
      active: args.active ?? true,
      pinned: args.pinned
    };
    
    const tab = await chrome.tabs.create(createProperties);
    
    return {
      tabId: tab.id,
      url: tab.url || tab.pendingUrl,
      title: tab.title,
      status: tab.status,
      active: tab.active,
      windowId: tab.windowId,
      index: tab.index
    };
  }
});
