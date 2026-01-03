/**
 * Browser tool: Update a tab.
 * Modify properties of an existing tab (URL, active state, pinned, muted).
 */
import { BrowserToolRegistry } from "../browserTools";

interface UpdateTabArgs {
  tabId: number;
  url?: string;
  active?: boolean;
  pinned?: boolean;
  muted?: boolean;
}

BrowserToolRegistry.register({
  name: "browser_update_tab",
  description: "Update properties of an existing browser tab. Can change URL, make active, pin, or mute the tab.",
  parameters: {
    type: "object",
    properties: {
      tabId: {
        type: "number",
        description: "ID of the tab to update"
      },
      url: {
        type: "string",
        description: "New URL to navigate to"
      },
      active: {
        type: "boolean",
        description: "Whether to make this the active tab"
      },
      pinned: {
        type: "boolean",
        description: "Whether to pin or unpin the tab"
      },
      muted: {
        type: "boolean",
        description: "Whether to mute or unmute the tab"
      }
    },
    required: ["tabId"]
  },
  async execute(args: UpdateTabArgs) {
    const updateProperties: chrome.tabs.UpdateProperties = {};
    
    if (args.url !== undefined) {updateProperties.url = args.url;}
    if (args.active !== undefined) {updateProperties.active = args.active;}
    if (args.pinned !== undefined) {updateProperties.pinned = args.pinned;}
    if (args.muted !== undefined) {updateProperties.muted = args.muted;}
    
    const tab = await chrome.tabs.update(args.tabId, updateProperties);
    
    return {
      tabId: tab.id,
      url: tab.url,
      title: tab.title,
      status: tab.status,
      active: tab.active,
      pinned: tab.pinned,
      mutedInfo: tab.mutedInfo,
      windowId: tab.windowId
    };
  }
});
