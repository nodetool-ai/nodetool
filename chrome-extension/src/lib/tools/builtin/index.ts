/**
 * Browser Tools - Built-in tools for Chrome Extension.
 * 
 * Import this file to register all browser tools with the BrowserToolRegistry.
 */

// Tab management
import "./getActiveTab";
import "./queryTabs";
import "./createTab";
import "./updateTab";
import "./closeTabs";

// Page interaction
import "./getPageContent";
import "./executeScript";
import "./takeScreenshot";
import "./navigate";

// Storage
import "./storage";

// Window management
import "./windows";

// Bookmarks
import "./bookmarks";

// History
import "./history";

// Re-export the registry for convenience
export { BrowserToolRegistry } from "../browserTools";
