/**
 * Background service worker for Nodetool Chrome Extension.
 * Handles extension lifecycle, tab events, and message routing.
 */

// Enable side panel when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Nodetool extension installed');

  // Set up side panel behavior
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.error('[Background] Failed to set panel behavior:', error);
  });
});

// Handle extension icon click - open side panel
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (error) {
      console.error('[Background] Failed to open side panel:', error);
    }
  }
});

// Message routing between content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, _sendResponse) => {
  console.log('[Background] Message received:', message.type, sender.tab?.id);

  if (message.type === 'OPEN_SIDEPANEL' && sender.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch((error) => {
      console.error('[Background] Failed to open side panel:', error);
    });
  }

  // Always return true for async response support
  return true;
});

// Monitor tab changes to update context
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    // Notify side panel of tab change (if open)
    await chrome.runtime.sendMessage({
      type: 'TAB_CHANGED',
      payload: { tabId: activeInfo.tabId }
    });
  } catch {
    // Side panel might not be open, ignore error
  }
});

// Monitor tab URL changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    try {
      // Notify side panel of URL change
      await chrome.runtime.sendMessage({
        type: 'URL_CHANGED',
        payload: {
          tabId,
          url: tab.url,
          title: tab.title
        }
      });
    } catch {
      // Side panel might not be open, ignore error
    }
  }
});

// Handle connection from popup
chrome.runtime.onConnect.addListener((port) => {
  console.log('[Background] Port connected:', port.name);

  port.onMessage.addListener((message) => {
    console.log('[Background] Port message:', message);
  });

  port.onDisconnect.addListener(() => {
    console.log('[Background] Port disconnected:', port.name);
  });
});

// Keep service worker alive using chrome.alarms API
// Service workers can be terminated by Chrome after 30 seconds of inactivity
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 }); // ~24 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('[Background] Service worker heartbeat');
  }
});

export {};
