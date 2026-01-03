/**
 * Content script for page context capture.
 * Injects into web pages to extract content for AI context.
 */

import type { PageContext } from '../types';

// Capture page context
function capturePageContext(): PageContext {
  const selectedText = window.getSelection()?.toString() || '';

  // Extract main body text, limiting to 10000 characters
  let bodyText = '';
  try {
    // Try to get article content first
    const article = document.querySelector('article');
    const main = document.querySelector('main');
    const contentElement = article || main || document.body;

    // Get text content, removing script and style elements
    const clone = contentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, nav, header, footer, aside').forEach((el) => el.remove());
    bodyText = clone.innerText.trim().slice(0, 10000);
    console.log('[ContentScript] Captured page context:', {
      url: window.location.href,
      title: document.title,
      bodyTextLength: bodyText.length,
      selectedTextLength: selectedText.length
    });
  } catch {
    bodyText = document.body.innerText.slice(0, 10000);
  }

  return {
    url: window.location.href,
    title: document.title,
    selectedText,
    bodyText,
    timestamp: Date.now()
  };
}

// Listen for messages from extension
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PAGE_CONTEXT') {
    console.log('[ContentScript] Received GET_PAGE_CONTEXT request');
    const context = capturePageContext();
    sendResponse({ context });
    return true;
  }

  return false;
});

// Notify background script that content script is ready
try {
  console.log('[ContentScript] Content script loaded on:', window.location.href);
  chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', url: window.location.href });
} catch {
  // Extension might not be available (e.g., chrome:// pages)
}

export {};
