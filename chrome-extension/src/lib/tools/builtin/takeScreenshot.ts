/**
 * Browser tool: Take screenshot.
 * Capture a screenshot of a browser tab.
 */
import { BrowserToolRegistry } from "../browserTools";

interface TakeScreenshotArgs {
  tabId?: number;
  format?: "png" | "jpeg";
  quality?: number;
}

BrowserToolRegistry.register({
  name: "browser_take_screenshot",
  description: "Capture a screenshot of a browser tab. Returns the image as a data URL.",
  parameters: {
    type: "object",
    properties: {
      tabId: {
        type: "number",
        description: "Tab ID to screenshot. If not provided, screenshots the active tab in the current window."
      },
      format: {
        type: "string",
        enum: ["png", "jpeg"],
        description: "Image format (default: png)"
      },
      quality: {
        type: "number",
        description: "JPEG quality 0-100 (only used when format is jpeg, default: 92)"
      }
    },
    required: []
  },
  async execute(args: TakeScreenshotArgs) {
    // If tabId is provided, we need to capture that specific tab's window
    // Otherwise capture the current window
    let windowId: number | undefined;
    
    if (args.tabId !== undefined) {
      const tab = await chrome.tabs.get(args.tabId);
      windowId = tab.windowId;
      
      // Make the tab active so we can screenshot it
      if (!tab.active) {
        await chrome.tabs.update(args.tabId, { active: true });
        // Small delay to ensure tab is rendered
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const options: chrome.tabs.CaptureVisibleTabOptions = {
      format: args.format || "png"
    };
    
    if (args.format === "jpeg" && args.quality !== undefined) {
      options.quality = args.quality;
    }
    
    try {
      // captureVisibleTab needs explicit handling for windowId
      let dataUrl: string;
      if (windowId !== undefined) {
        dataUrl = await chrome.tabs.captureVisibleTab(windowId, options);
      } else {
        dataUrl = await chrome.tabs.captureVisibleTab(options);
      }
      
      return {
        dataUrl,
        format: args.format || "png",
        tabId: args.tabId
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Screenshot capture failed",
        tabId: args.tabId
      };
    }
  }
});
