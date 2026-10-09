chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.cc !== 'badge' || !sender.tab) return;
  chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.text || '' });
  chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#c62828' });
});
