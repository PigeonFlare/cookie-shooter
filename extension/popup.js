const $ = id => document.getElementById(id);
let tabId = null;
let blocked = null;
const BLOCKED_MSG = 'This page can\'t be attacked. Chrome blocks extensions on its own pages and the Web Store.';

function show(st, err) {
  $('start').disabled = !!err;
  $('cookies').disabled = !!err;
  const running = st && st.running;
  $('start').hidden = !!running;
  $('cookies').hidden = !!running;
  $('end').hidden = !running;
  $('next').hidden = !(running && st.state === 'idle' && st.mode !== 'elements');
  const msg = $('msg');
  msg.classList.toggle('bad', !!err);
  if (err) msg.textContent = err;
  else if (!running) msg.textContent = 'Start attack turns this page\'s own buttons, links and boxes against you. Clear them all to conquer the site.';
  else if (st.state === 'dead') msg.textContent = st.mode === 'elements' ? `The page won. Score ${st.score}.` : `Crushed on wave ${st.wave}. Score ${st.score}.`;
  else if (st.mode === 'elements') msg.textContent = `Page attack${st.paused ? ' (paused)' : ''}. HP ${st.hp}/${st.maxHp}. Score ${st.score}.`;
  else msg.textContent = `Wave ${st.wave}${st.paused ? ' (paused)' : ''}. HP ${st.hp}/${st.maxHp}. Score ${st.score}. ${st.walls} walls standing.`;
}

function send(msg) {
  return chrome.tabs.sendMessage(tabId, msg).catch(() => null);
}

async function inject() {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/cookies.js', 'content/game.js'] });
}

async function showConquered() {
  const { conquered = {} } = await chrome.storage.local.get('conquered');
  const sites = Object.entries(conquered).sort((a, b) => b[1].last - a[1].last);
  $('ccount').textContent = sites.length;
  const list = $('clist');
  const key = sites.map(([h, v]) => h + v.count).join('|');
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  list.replaceChildren();
  if (!sites.length) {
    const li = document.createElement('li');
    li.className = 'none';
    li.textContent = 'None yet. Clear a page to conquer it.';
    list.appendChild(li);
  }
  for (const [host, v] of sites) {
    const li = document.createElement('li');
    const a = document.createElement('span'), b = document.createElement('span');
    a.textContent = host;
    a.title = `First conquered ${new Date(v.first).toLocaleDateString()}`;
    b.textContent = v.count > 1 ? `x${v.count}` : '';
    li.append(a, b);
    list.appendChild(li);
  }
}

async function refresh() {
  showConquered();
  if (blocked) return show(null, blocked);
  show(await send({ cc: 'status' }));
}

async function begin(mode) {
  try {
    await inject();
    show(await send({ cc: 'start', mode, sound: $('sound').checked }));
    window.close();
  } catch (e) {
    blocked = BLOCKED_MSG;
    show(null, blocked);
  }
}
$('start').onclick = () => begin('elements');
$('cookies').onclick = () => begin('cookies');
$('cclear').onclick = async () => { await chrome.storage.local.remove('conquered'); showConquered(); };
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
