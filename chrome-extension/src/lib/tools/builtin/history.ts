/**
 * Browser tool: History management.
 * Search and manage browser history.
 */
import { BrowserToolRegistry } from "../browserTools";

interface SearchHistoryArgs {
  text?: string;
  startTime?: number;
  endTime?: number;
  maxResults?: number;
}

interface DeleteHistoryUrlArgs {
  url: string;
}

interface DeleteHistoryRangeArgs {
  startTime: number;
  endTime: number;
}

BrowserToolRegistry.register({
  name: "browser_search_history",
  description: "Search browser history by text, time range, and limit results.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Search text to match against URL and title"
      },
      startTime: {
        type: "number",
        description: "Start time as milliseconds since epoch"
      },
      endTime: {
        type: "number",
        description: "End time as milliseconds since epoch"
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results (default: 100)"
      }
    },
    required: []
  },
  async execute(args: SearchHistoryArgs) {
    const query: chrome.history.HistoryQuery = {
      text: args.text || "",
      maxResults: args.maxResults || 100
    };
    
    if (args.startTime !== undefined) {query.startTime = args.startTime;}
    if (args.endTime !== undefined) {query.endTime = args.endTime;}
    
    const results = await chrome.history.search(query);
    
    return {
      count: results.length,
      items: results.map(item => ({
        id: item.id,
        url: item.url,
        title: item.title,
        lastVisitTime: item.lastVisitTime,
        visitCount: item.visitCount,
        typedCount: item.typedCount
      }))
    };
  }
});

BrowserToolRegistry.register({
  name: "browser_delete_history_url",
  description: "Delete a specific URL from browser history.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to delete from history"
      }
    },
    required: ["url"]
  },
  async execute(args: DeleteHistoryUrlArgs) {
    await chrome.history.deleteUrl({ url: args.url });
    
    return {
      deleted: true,
      url: args.url
    };
  }
});

BrowserToolRegistry.register({
  name: "browser_delete_history_range",
  description: "Delete all history items within a time range.",
  parameters: {
    type: "object",
    properties: {
      startTime: {
        type: "number",
        description: "Start time as milliseconds since epoch"
      },
      endTime: {
        type: "number",
        description: "End time as milliseconds since epoch"
      }
    },
    required: ["startTime", "endTime"]
  },
  async execute(args: DeleteHistoryRangeArgs) {
    await chrome.history.deleteRange({
      startTime: args.startTime,
      endTime: args.endTime
    });
    
    return {
      deleted: true,
      startTime: args.startTime,
      endTime: args.endTime
    };
  }
});
