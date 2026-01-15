// Background service worker for Chatwork Log Exporter

// Extension installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('Chatwork Log Exporter installed');
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  sendResponse({ received: true });
  return true;
});
