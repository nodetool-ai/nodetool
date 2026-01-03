/**
 * Browser tool: Execute script on page.
 * Run JavaScript code in the context of a web page.
 */
import { BrowserToolRegistry } from "../browserTools";

interface ExecuteScriptArgs {
  tabId?: number;
  code: string;
}

BrowserToolRegistry.register({
  name: "browser_execute_script",
  description: "Execute JavaScript code in the context of a browser tab. Returns the result of the last expression.",
  parameters: {
    type: "object",
    properties: {
      tabId: {
        type: "number",
        description: "Tab ID to execute script in. If not provided, uses the active tab."
      },
      code: {
        type: "string",
        description: "JavaScript code to execute. The result of the last expression is returned."
      }
    },
    required: ["code"]
  },
  requireUserConsent: true,
  async execute(args: ExecuteScriptArgs) {
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
      // Wrap code in an async IIFE to support await
      const wrappedCode = `(async () => { ${args.code} })()`;
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: (code: string) => {
          return eval(code);  
        },
        args: [wrappedCode]
      });
      
      if (results && results.length > 0) {
        const result = results[0];
        return {
          result: result.result,
          tabId: targetTabId,
          frameId: result.frameId
        };
      }
      
      return { result: null, tabId: targetTabId };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Script execution failed",
        tabId: targetTabId
      };
    }
  }
});
