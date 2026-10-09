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
  } else if (msg.cc === 'wave') {
    const wave = Math.floor(Number(msg.wave));
    if (!(wave > 0 && wave < 10000)) return;
    chrome.storage.local.get('bestWave').then(({ bestWave }) => {
      if (!(bestWave >= wave)) chrome.storage.local.set({ bestWave: wave });
    });
  }
});
