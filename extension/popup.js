const $ = id => document.getElementById(id);
let tabId = null;
let blocked = null;
const BLOCKED_MSG = 'This page can\'t be attacked. Chrome blocks extensions on its own pages and the Web Store.';

function show(st, err) {
  $('start').disabled = !!err;
  const running = st && st.running;
  $('start').hidden = !!running;
  $('end').hidden = !running;
  $('next').hidden = !(running && st.state === 'idle');
  const msg = $('msg');
  msg.classList.toggle('bad', !!err);
  if (err) msg.textContent = err;
  else if (!running) msg.textContent = 'Turn this page\'s buttons and boxes into walls and its cookies into enemies.';
  else if (st.state === 'dead') msg.textContent = `Crushed on wave ${st.wave}. Score ${st.score}.`;
  else msg.textContent = `Wave ${st.wave}${st.paused ? ' (paused)' : ''}. HP ${st.hp}/${st.maxHp}. Score ${st.score}. ${st.walls} walls standing.`;
}

function send(msg) {
  return chrome.tabs.sendMessage(tabId, msg).catch(() => null);
}

async function inject() {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/cookies.js', 'content/game.js'] });
}

async function showBest() {
  const { bestWave } = await chrome.storage.local.get('bestWave');
  $('best').textContent = bestWave ? `Best: wave ${bestWave}` : '';
}

async function refresh() {
  showBest();
  if (blocked) return show(null, blocked);
  show(await send({ cc: 'status' }));
}

$('start').onclick = async () => {
  try {
    await inject();
    show(await send({ cc: 'start', sound: $('sound').checked }));
    window.close();
  } catch (e) {
    blocked = BLOCKED_MSG;
    show(null, blocked);
  }
};
$('end').onclick = async () => { show(await send({ cc: 'end' })); };
$('next').onclick = async () => { show(await send({ cc: 'next' })); window.close(); };
$('sound').onchange = async () => {
  chrome.storage.local.set({ sound: $('sound').checked });
  await send({ cc: 'sound', on: $('sound').checked });
};

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab && tab.id;
  if (!tab || /^(chrome|edge|brave|about|view-source|devtools|chrome-extension|chrome-search):/.test(tab.url || '') || /chromewebstore\.google\.com|chrome\.google\.com\/webstore/.test(tab.url || '')) blocked = BLOCKED_MSG;
  const { sound } = await chrome.storage.local.get('sound');
  if (typeof sound === 'boolean') $('sound').checked = sound;
  await refresh();
  setInterval(refresh, 500);
})();
