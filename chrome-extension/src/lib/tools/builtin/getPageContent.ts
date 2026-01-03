/**
 * Browser tool: Get page content.
 * Extract text content from the current page using the content script.
 */
import { BrowserToolRegistry } from "../browserTools";

interface GetPageContentArgs {
  tabId?: number;
  maxLength?: number;
  includeSelectedText?: boolean;
}

BrowserToolRegistry.register({
  name: "browser_get_page_content",
  description: "Extract text content from a browser tab. Returns URL, title, body text, and optionally selected text.",
  parameters: {
    type: "object",
    properties: {
      tabId: {
        type: "number",
        description: "Tab ID to get content from. If not provided, uses the active tab."
      },
      maxLength: {
        type: "number",
        description: "Maximum length of body text to return (default: 10000)"
      },
      includeSelectedText: {
        type: "boolean",
        description: "Whether to include currently selected text (default: true)"
      }
    },
    required: []
  },
  async execute(args: GetPageContentArgs) {
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
      // Send message to content script to get page context
      const response = await chrome.tabs.sendMessage(targetTabId, {
        type: "GET_PAGE_CONTEXT"
      });
      
      if (response?.context) {
        const context = response.context;
        const maxLength = args.maxLength ?? 10000;
        
        return {
          url: context.url,
          title: context.title,
          selectedText: args.includeSelectedText !== false ? context.selectedText : undefined,
          bodyText: context.bodyText?.slice(0, maxLength),
          timestamp: context.timestamp,
          tabId: targetTabId
        };
      }
      
      return { error: "Failed to get page context from content script" };
    } catch (_error) {
      // Content script might not be injected on this page
      const tab = await chrome.tabs.get(targetTabId);
      return {
        error: "Content script not available on this page",
        url: tab.url,
        title: tab.title,
        tabId: targetTabId
      };
    }
  }
});
