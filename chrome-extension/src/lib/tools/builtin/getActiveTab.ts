/**
 * Browser tool: Get active tab information.
 * Returns the URL, title, and other metadata of the currently active tab.
 */
import { BrowserToolRegistry } from "../browserTools";

BrowserToolRegistry.register({
  name: "browser_get_active_tab",
  description: "Get information about the currently active browser tab including URL, title, and tab ID.",
  parameters: {
    type: "object",
    properties: {},
    required: []
  },
  async execute() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      return { error: "No active tab found" };
    }
    return {
      tabId: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      status: tab.status,
      incognito: tab.incognito,
      windowId: tab.windowId
    };
  }
});
