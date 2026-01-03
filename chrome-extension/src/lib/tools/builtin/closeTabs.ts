/**
 * Browser tool: Close tabs.
 * Close one or more browser tabs by their IDs.
 */
import { BrowserToolRegistry } from "../browserTools";

interface CloseTabsArgs {
  tabIds: number | number[];
}

BrowserToolRegistry.register({
  name: "browser_close_tabs",
  description: "Close one or more browser tabs by their tab IDs.",
  parameters: {
    type: "object",
    properties: {
      tabIds: {
        oneOf: [
          { type: "number", description: "Single tab ID to close" },
          { type: "array", items: { type: "number" }, description: "Array of tab IDs to close" }
        ],
        description: "Tab ID or array of tab IDs to close"
      }
    },
    required: ["tabIds"]
  },
  async execute(args: CloseTabsArgs) {
    const ids = Array.isArray(args.tabIds) ? args.tabIds : [args.tabIds];
    
    await chrome.tabs.remove(ids);
    
    return {
      closed: ids,
      count: ids.length
    };
  }
});
