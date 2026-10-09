let fontUrl = null;

async function loadFont() {
  if (fontUrl) return fontUrl;
  const buf = await (await fetch(chrome.runtime.getURL('fonts/Silkscreen-Regular.ttf'))).arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  fontUrl = 'data:font/ttf;base64,' + btoa(bin);
  return fontUrl;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || sender.id !== chrome.runtime.id) return;
  if (msg.cc === 'font') {
    loadFont().then(reply, () => reply(null));
    return true;
  }
  if (!sender.tab) return;
  if (msg.cc === 'badge') {
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: String(msg.text || '').slice(0, 4) });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#c62828' });
  } else if (msg.cc === 'conquered') {
    const host = String(msg.host || '').toLowerCase().slice(0, 253);
    if (!/^[a-z0-9.\-:\[\] ]+$/.test(host)) return;
    chrome.storage.local.get('conquered').then(({ conquered = {} }) => {
      const now = Date.now();
      const cur = conquered[host] || { first: now, count: 0 };
      const rank = ['easy', 'medium', 'hard'].indexOf(msg.difficulty);
      conquered[host] = { first: cur.first, count: (cur.count || 0) + 1, last: now, best: Math.max(cur.best ?? -1, rank) };
      chrome.storage.local.set({ conquered });
    });
  }
});
