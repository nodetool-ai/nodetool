/**
 * Browser tool: Query tabs.
 * Search and filter open browser tabs by various criteria.
 */
import { BrowserToolRegistry } from "../browserTools";

interface QueryTabsArgs {
  url?: string;
  title?: string;
  active?: boolean;
  currentWindow?: boolean;
  status?: "loading" | "complete";
  pinned?: boolean;
  audible?: boolean;
  muted?: boolean;
}

BrowserToolRegistry.register({
  name: "browser_query_tabs",
  description: "Search and filter open browser tabs by URL pattern, title, active status, and other criteria.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL pattern to match (supports wildcards like *://example.com/*)"
      },
      title: {
        type: "string",
        description: "Title pattern to match"
      },
      active: {
        type: "boolean",
        description: "Filter by active state"
      },
      currentWindow: {
        type: "boolean",
        description: "Filter to current window only"
      },
      status: {
        type: "string",
        enum: ["loading", "complete"],
        description: "Filter by loading status"
      },
      pinned: {
        type: "boolean",
        description: "Filter by pinned state"
      },
      audible: {
        type: "boolean",
        description: "Filter by whether tabs are playing audio"
      },
      muted: {
        type: "boolean",
        description: "Filter by muted state"
      }
    },
    required: []
  },
  async execute(args: QueryTabsArgs) {
    const queryInfo: chrome.tabs.QueryInfo = {};
    
    if (args.url !== undefined) {queryInfo.url = args.url;}
    if (args.title !== undefined) {queryInfo.title = args.title;}
    if (args.active !== undefined) {queryInfo.active = args.active;}
    if (args.currentWindow !== undefined) {queryInfo.currentWindow = args.currentWindow;}
    if (args.status !== undefined) {queryInfo.status = args.status;}
    if (args.pinned !== undefined) {queryInfo.pinned = args.pinned;}
    if (args.audible !== undefined) {queryInfo.audible = args.audible;}
    if (args.muted !== undefined) {queryInfo.muted = args.muted;}
    
    const tabs = await chrome.tabs.query(queryInfo);
    
    return {
      count: tabs.length,
      tabs: tabs.map(tab => ({
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        status: tab.status,
        active: tab.active,
        pinned: tab.pinned,
        audible: tab.audible,
        mutedInfo: tab.mutedInfo,
        windowId: tab.windowId,
        index: tab.index
      }))
    };
  }
});
