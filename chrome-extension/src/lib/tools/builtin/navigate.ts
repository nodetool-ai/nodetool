/**
 * Browser tool: Navigate (go back, forward, reload).
 * Navigate within browser history or reload pages.
 */
import { BrowserToolRegistry } from "../browserTools";

interface NavigateArgs {
  tabId?: number;
  action: "back" | "forward" | "reload";
  bypassCache?: boolean;
}

BrowserToolRegistry.register({
  name: "browser_navigate",
  description: "Navigate within browser history (back, forward) or reload a page.",
  parameters: {
    type: "object",
    properties: {
      tabId: {
        type: "number",
        description: "Tab ID to navigate. If not provided, uses the active tab."
      },
      action: {
        type: "string",
        enum: ["back", "forward", "reload"],
        description: "Navigation action to perform"
      },
      bypassCache: {
        type: "boolean",
        description: "When reloading, bypass the cache (default: false)"
      }
    },
    required: ["action"]
  },
  async execute(args: NavigateArgs) {
    let targetTabId = args.tabId;
    
    // Get active tab if no tabId provided
    if (targetTabId === undefined) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) {
        return { error: "No active tab found" };
      }
      targetTabId = activeTab.id;
    }
    
    try {
      switch (args.action) {
        case "back":
          await chrome.tabs.goBack(targetTabId);
          break;
        case "forward":
          await chrome.tabs.goForward(targetTabId);
          break;
        case "reload":
          await chrome.tabs.reload(targetTabId, { bypassCache: args.bypassCache });
          break;
      }
      
      // Wait a bit for navigation to complete and get updated tab info
      await new Promise(resolve => setTimeout(resolve, 100));
      const tab = await chrome.tabs.get(targetTabId);
      
      return {
        action: args.action,
        tabId: targetTabId,
        url: tab.url,
        title: tab.title,
        status: tab.status
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Navigation failed",
        action: args.action,
        tabId: targetTabId
      };
    }
  }
});
