(() => {
  'use strict';
  if (window.__cookieCrusher) return;

  const DB = window.COOKIE_DB;
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  const hasChrome = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

  const host = document.createElement('div');
  host.id = 'cookie-crusher-host';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;display:block;';
  const root = host.attachShadow({ mode: 'closed' });
  const css = `:host { all: initial; }
* { box-sizing: border-box; }
canvas.game { position: fixed; inset: 0; width: 100vw; height: 100vh; cursor: crosshair; touch-action: none; image-rendering: pixelated; }
.weapons { position: fixed; left: 50%; bottom: 12px; transform: translateX(-50%); display: flex; gap: 8px; transition: opacity .15s; }
.weapons.faded { opacity: .3; }
.wbtn { position: relative; width: 58px; height: 58px; padding: 4px 0 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; overflow: hidden;
background: linear-gradient(#fdfdfd, #e6ecf5); border: 1px solid #8a9bb7; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,.25); cursor: pointer; touch-action: manipulation; }
.wbtn canvas { image-rendering: pixelated; height: 24px; width: auto; }
.wbtn .wname { font: 8px CCSilk, monospace; color: #334; }
.wbtn .key { position: absolute; top: 2px; left: 3px; font: bold 9px/1 Tahoma, Verdana, sans-serif; color: #667; }
.wbtn.active { border-color: #e0a000; background: linear-gradient(#fffbe6, #ffe9a8); box-shadow: 0 0 0 2px rgba(255,190,0,.6), 0 2px 4px rgba(0,0,0,.25); }
.wbtn .cd { position: absolute; left: 0; right: 0; top: 0; height: 0; background: rgba(40,50,80,.35); pointer-events: none; }
.panel { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); min-width: 280px; max-width: 90vw; padding: 14px 16px 12px; text-align: center;
font: 12px/1.45 Tahoma, Verdana, sans-serif; color: #111; background: #fff; border: 1px solid #6d89b8; border-radius: 4px; box-shadow: 0 6px 24px rgba(0,0,0,.35); }
.panel.hidden { display: none; }
.panel h2 { margin: 0 0 6px; font: 14px CCSilk, monospace; color: #1851ce; }
.panel h2.bad { color: #c62828; }
.panel p { margin: 4px 0 10px; }
.panel .btns { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
.panel button { font: 12px Tahoma, Verdana, sans-serif; padding: 5px 12px; color: #000; background: linear-gradient(#fdfdfd, #ececec 50%, #ddd); border: 1px solid #999; border-radius: 2px; cursor: pointer; }
.panel button.primary { font-weight: bold; }
.panel button:hover { border-color: #6d89b8; background: linear-gradient(#fff, #f2f6fc 50%, #dfe8f6); }
.panel .hint { color: #777; font-size: 11px; margin-top: 8px; }
@media (max-width: 720px) { .weapons { bottom: 24px; gap: 12px; } .wbtn { width: 64px; height: 64px; } }`;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
  } catch {
    const st = document.createElement('style');
    st.textContent = css;
    root.appendChild(st);
  }
  const h = (tag, props, ...kids) => {
    const n = document.createElement(tag);
    for (const k in props || {}) k === 'text' ? (n.textContent = props[k]) : n.setAttribute(k, props[k]);
    n.append(...kids);
    return n;
  };
  const wbtn = (w, key, name, active) => h('button', { class: 'wbtn' + (active ? ' active' : ''), 'data-w': w, title: `${name} (${key})` },
    h('span', { class: 'key', text: key }), h('canvas'), h('span', { class: 'wname', text: name }), h('span', { class: 'cd' }));
  root.append(
    h('canvas', { class: 'game' }),
    h('div', { class: 'weapons' }, wbtn('swing', '1', 'Swing'), wbtn('shoot', '2', 'Shoot', true), wbtn('dash', '3', 'Dash')),
    h('div', { class: 'panel hidden' }, h('h2'), h('p'), h('div', { class: 'btns' }), h('div', { class: 'hint' }))
  );
  const canvas = root.querySelector('canvas.game');
  const ctx = canvas.getContext('2d');
  const weaponsEl = root.querySelector('.weapons');
  const panel = root.querySelector('.panel');

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hyp = (x, y) => Math.sqrt(x * x + y * y);

  let W = 0, H = 0;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    const dpr = lowFx ? 1 : Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (player) {
      player.x = clamp(player.x, 12, W - 12);
      player.y = clamp(player.y, 12, H - 12);
      measureObstacles();
    }
  }

  const prefs = { sound: true };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let lowFx = false, slowT = 0, pageDark = false;

  let audio = null;
  function sfx(freq, dur, type = 'square', vol = 0.05, slide = 0) {
    if (!prefs.sound) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {}
  }
  const SND = {
    shoot: () => sfx(880, 0.05, 'square', 0.02, -300),
    hit: () => sfx(220, 0.06, 'square', 0.03, -80),
    kill: () => sfx(520, 0.14, 'triangle', 0.06, -380),
    hurt: () => sfx(140, 0.2, 'sawtooth', 0.06, -60),
    enemyShot: () => sfx(1400, 0.04, 'square', 0.012, -600),
    power: () => { sfx(660, 0.08, 'square', 0.05); setTimeout(() => sfx(990, 0.12, 'square', 0.05), 70); },
    friendly: () => sfx(180, 0.25, 'sawtooth', 0.06, 120),
    wave: () => { [392, 523, 659].forEach((f, i) => setTimeout(() => sfx(f, 0.12, 'square', 0.04), i * 90)); },
    clear: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => sfx(f, 0.14, 'triangle', 0.06), i * 100)); },
    dead: () => { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => sfx(f, 0.22, 'sawtooth', 0.05), i * 160)); }
  };

  const PALETTES = {
    necessary: { body: '#ecc679', edge: '#c2913f', chip: '#6b3e1d' },
    chaser: { body: '#d9a066', edge: '#a8713a', chip: '#3b2010' },
    shooter: { body: '#c6a07a', edge: '#8f6a48', chip: '#2b1a40' },
    boss: { body: '#7d5a3a', edge: '#4f3420', chip: '#120904' }
  };

  function makeSprite(kind) {
    const S = 14;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const p = PALETTES[kind];
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    const biteX = 12, biteY = 2;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const d = hyp(x - 6.5, y - 6.5);
        if (d > 6.7) continue;
        if (kind === 'chaser' && hyp(x - biteX, y - biteY) < 3.2) continue;
        px(x, y, d > 5.5 ? p.edge : p.body);
      }
    }
    const chips = [[3, 9], [9, 10], [6, 11], [10, 7], [2, 6], [5, 3]];
    chips.forEach(([x, y]) => {
      if (kind === 'chaser' && hyp(x - biteX, y - biteY) < 4) return;
      px(x, y, p.chip);
      if (Math.random() < 0.5) px(x + 1, y, p.chip);
    });
    if (kind === 'necessary') {
      px(4, 5, '#2b1a0a'); px(9, 5, '#2b1a0a');
      px(4, 8, '#2b1a0a'); px(5, 9, '#2b1a0a'); px(6, 9, '#2b1a0a'); px(7, 9, '#2b1a0a'); px(8, 9, '#2b1a0a'); px(9, 8, '#2b1a0a');
    } else if (kind === 'chaser') {
      px(3, 4, '#2b1a0a'); px(4, 5, '#2b1a0a'); px(8, 5, '#2b1a0a'); px(9, 4, '#2b1a0a');
      px(4, 6, '#e01b1b'); px(8, 6, '#e01b1b');
      px(5, 9, '#2b1a0a'); px(6, 8, '#2b1a0a'); px(7, 9, '#2b1a0a');
    } else if (kind === 'shooter') {
      px(4, 5, '#fff'); px(5, 5, '#fff'); px(8, 5, '#fff'); px(9, 5, '#fff');
      px(5, 5, '#5e35b1'); px(9, 5, '#5e35b1');
      px(5, 9, '#2b1a0a'); px(6, 9, '#2b1a0a'); px(7, 9, '#2b1a0a'); px(8, 9, '#2b1a0a');
    } else {
      px(3, 4, '#ff3030'); px(4, 4, '#ff3030'); px(9, 4, '#ff3030'); px(10, 4, '#ff3030');
      px(4, 5, '#ff3030'); px(9, 5, '#ff3030');
      for (let x = 4; x <= 9; x++) px(x, 9, x % 2 ? '#fff' : '#120904');
    }
    const flash = document.createElement('canvas');
    flash.width = flash.height = S;
    const fg = flash.getContext('2d');
    fg.drawImage(c, 0, 0);
    fg.globalCompositeOperation = 'source-atop';
    fg.fillStyle = '#fff';
    fg.fillRect(0, 0, S, S);
    return { img: c, flash };
  }

  const SPRITES = {};
  ['necessary', 'chaser', 'shooter', 'boss'].forEach(k => { SPRITES[k] = makeSprite(k); });

  const ICON_MAPS = {
    hp: { pal: { R: '#e53935', D: '#9a1b1b', W: '#ffcdd2' }, rows: [
      '.DD...DD.',
      'DRRD.DRRD',
      'DRWRDRRRD',
      'DRRRRRRRD',
      '.DRRRRRD.',
      '..DRRRD..',
      '...DRD...',
      '....D....'] },
    spd: { pal: { Y: '#ffd600', D: '#a07800' }, rows: [
      '....DDD',
      '...DYYD',
      '..DYYD.',
      '.DYYDDD',
      'DYYYYYD',
      'DDDYYD.',
      '..DYD..',
      '.DYD...',
      '.DD....'] },
    dmg: { pal: { S: '#cfd8dc', E: '#607d8b', G: '#ffb300', H: '#6d4c41' }, rows: [
      '.......EE',
      '......ESE',
      '.....ESE.',
      '....ESE..',
      '.G.ESE...',
      '..GSE....',
      '..HG.....',
      '.H..G....',
      'H........'] },
    shoot: { pal: { B: '#1851ce', L: '#4f86f7', D: '#0d3a9e', K: '#9db8e2' }, rows: [
      '.........',
      'K....DDD.',
      '....DLLLD',
      'KK..DLBLD',
      '....DLLLD',
      'K....DDD.',
      '.........'] },
    dash: { pal: { B: '#1851ce', L: '#7fa7ff' }, rows: [
      'L...B....',
      'LL..BB...',
      '.LL..BB..',
      '..LL..BB.',
      '.LL..BB..',
      'LL..BB...',
      'L...B....'] }
  };
  ICON_MAPS.swing = ICON_MAPS.dmg;

  function makeIcon(def) {
    const c = document.createElement('canvas');
    c.width = def.rows[0].length;
    c.height = def.rows.length;
    const g = c.getContext('2d');
    def.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (def.pal[ch]) { g.fillStyle = def.pal[ch]; g.fillRect(x, y, 1, 1); }
    }));
    return c;
  }
  const ICONS = {};
  for (const k in ICON_MAPS) ICONS[k] = makeIcon(ICON_MAPS[k]);

  const weaponBtns = {};
  root.querySelectorAll('.wbtn').forEach(btn => {
    const w = btn.dataset.w;
    weaponBtns[w] = btn;
    const cv = btn.querySelector('canvas');
    const img = ICONS[w];
    cv.width = img.width * 3;
    cv.height = img.height * 3;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, cv.width, cv.height);
    const choose = e => { e.preventDefault(); e.stopPropagation(); setWeapon(w); };
    btn.addEventListener('pointerdown', choose);
    btn.addEventListener('click', e => e.preventDefault());
  });

  function setWeapon(w) {
    if (weapon !== w) sfx(760, 0.04, 'square', 0.025);
    weapon = w;
    for (const k in weaponBtns) weaponBtns[k].classList.toggle('active', k === w);
  }

  const CD_MAX = { swing: 0.42, shoot: 0.16, dash: 0.9 };
  function updateWeaponUi() {
    for (const k in weaponBtns) {
      const f = clamp(cds[k] / CD_MAX[k], 0, 1);
      weaponBtns[k].querySelector('.cd').style.height = (f * 100).toFixed(1) + '%';
    }
    const wb = weaponsEl;
    if (player && wb) {
      const r = wb.getBoundingClientRect();
      const x0 = r.left - 10, x1 = r.right + 10, y0 = r.top - 10, y1 = r.bottom + 10;
      const near = (x, y, rr) => x + rr > x0 && x - rr < x1 && y + rr > y0 && y - rr < y1;
      wb.classList.toggle('faded', near(player.x, player.y, player.r) || enemies.some(e => near(e.x, e.y, e.r)));
    }
  }

  const BASE = {
    hp: 100,
    speed: 230,
    damage: 10,
    fireInterval: 0.16,
    bulletSpeed: 540,
    swingCd: 0.42,
    swingRange: 80,
    swingArc: 1.05,
    dashCd: 0.9,
    dashTime: 0.17,
    dashSpeed: 780
  };

  let player = null;
  let stacks = { hp: 0, spd: 0, dmg: 0 };
  let wave = 1;
  let score = 0;
  let state = 'boot';
  let paused = false;
  let enemies = [], bullets = [], powerups = [], particles = [], floaters = [];
  let spawnQueue = [], spawnTimer = 0, waveInfo = null, countdown = 0, firstHalf = [];
  let shake = 0, flashRed = 0, flashes = [], rings = [], hitStop = 0, whiteFlash = 0, fxT = 0;
  let idleHintT = 0;
  let weapon = 'shoot';
  const cds = { swing: 0, shoot: 0, dash: 0 };
  let slashes = [], ghosts = [], lasers = [];
  let swingDir = 1;

  const maxHpFor = n => BASE.hp + Math.round(15 * (1 - Math.pow(0.82, n)) / 0.18);
  const spdMultFor = n => 1 + 0.5 * (1 - Math.pow(0.8, n));
  const dmgMultFor = n => 1 + 0.75 * (1 - Math.pow(0.8, n));

  function newPlayer() {
    return {
      x: W / 2, y: H * 0.62, vx: 0, vy: 0, r: 9,
      hp: maxHpFor(stacks.hp), maxHp: maxHpFor(stacks.hp),
      angle: -Math.PI / 2, inv: 0, dashT: 0, dashVx: 0, dashVy: 0, dashHits: new Set()
    };
  }

  function waveParams(w) {
    return {
      count: Math.round(4 + w * 2.4),
      spd: Math.min(2.2, 1 + 0.06 * (w - 1)),
      dmg: 1 + 0.12 * (w - 1),
      hp: 1 + 0.13 * (w - 1),
      shooterFrac: Math.min(0.75, 0.55 + 0.02 * w),
      necessary: Math.min(8, 2 + Math.floor(w / 2)),
      boss: w % 5 === 0,
      interval: Math.max(0.22, 1.1 - 0.05 * w),
      fireRate: 1 + 0.05 * (w - 1)
    };
  }

  const keys = {};
  const mouse = { x: 0, y: 0, down: false, inside: false };
  const touch = { active: false, x: 0, y: 0, dashReq: false };

  const GAME_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', '1', '2', '3', 'enter', 'n', 'escape', 'p']);
  window.addEventListener('keydown', e => {
    const k = (e.key || '').toLowerCase();
    if (!GAME_KEYS.has(k)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat && !['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) return;
    keys[k] = true;
    if (k === 'escape' || k === 'p') togglePause();
    if ((k === 'enter' || k === 'n') && state === 'idle') startWave();
    if (k === '1') setWeapon('swing');
    if (k === '2') setWeapon('shoot');
    if (k === '3') setWeapon('dash');
  }, { capture: true, signal: ac.signal });
  window.addEventListener('keyup', e => {
    const k = (e.key || '').toLowerCase();
    if (!GAME_KEYS.has(k)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    keys[k] = false;
  }, { capture: true, signal: ac.signal });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    mouse.down = false;
    if (state === 'wave' && !paused) togglePause();
  }, sig);

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  canvas.addEventListener('mousemove', e => { const p = canvasPos(e); mouse.x = p.x; mouse.y = p.y; mouse.inside = true; });
  canvas.addEventListener('mouseleave', () => { mouse.inside = false; });
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (paused) { togglePause(); return; }
    const p = canvasPos(e); mouse.x = p.x; mouse.y = p.y; mouse.down = true;
  });
  window.addEventListener('mouseup', () => { mouse.down = false; }, sig);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (paused) { togglePause(); return; }
    const p = canvasPos(e.touches[0]);
    touch.active = true; touch.x = p.x; touch.y = p.y;
    if (weapon === 'dash') touch.dashReq = true;
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const p = canvasPos(e.touches[0]);
    touch.x = p.x; touch.y = p.y;
  }, { passive: false });
  canvas.addEventListener('touchend', e => { if (!e.touches.length) touch.active = false; });

  function showPanel(title, msg, buttons, hint, bad) {
    const h = panel.querySelector('h2');
    h.textContent = title;
    h.classList.toggle('bad', !!bad);
    panel.querySelector('p').textContent = msg || '';
    panel.querySelector('.hint').textContent = hint || '';
    const box = panel.querySelector('.btns');
    box.textContent = '';
    for (const b of buttons || []) {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.primary) el.className = 'primary';
      el.addEventListener('click', e => { e.stopPropagation(); b.onClick(); });
      box.appendChild(el);
    }
    panel.classList.remove('hidden');
  }
  function hidePanel() { panel.classList.add('hidden'); }
  const panelHidden = () => panel.classList.contains('hidden');

  function togglePause() {
    if (state !== 'wave') return;
    if (paused) {
      paused = false;
      hidePanel();
    } else {
      paused = true;
      mouse.down = false;
      showPanel('Paused', `Wave ${wave} is on hold.`, [
        { label: 'Resume', primary: true, onClick: togglePause },
        { label: 'End attack', onClick: end }
      ], 'Esc to resume');
    }
  }

  const OBST_HP = 5;
  const CELL = 20;
  let obstacles = [];
  const nav = { cols: 0, rows: 0, blocked: null, dist: null, t: 0 };

  let lastBadge = '';
  function updateBadge() {
    const n = enemies.filter(e => e.kind !== 'necessary').length + spawnQueue.filter(s => s.kind !== 'necessary').length + firstHalf.filter(s => s.kind !== 'necessary').length;
    const text = state === 'dead' || !running ? '' : String(n);
    if (text === lastBadge) return;
    lastBadge = text;
    if (hasChrome) { try { chrome.runtime.sendMessage({ cc: 'badge', text }).catch(() => {}); } catch {} }
  }

  const CONTROL_SEL = 'button, input:not([type=hidden]), textarea, select, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="searchbox"], [role="textbox"], [role="combobox"]';
  const MEDIA_SEL = 'img, video, iframe, svg, canvas, picture, embed, object';
  const BOX_SEL = 'a, label, li, td, th, div, section, article, aside, nav, header, footer, form, figure, fieldset, details, summary, span, p, h1, h2, h3, h4, h5, h6, blockquote, pre, table, ul, ol, dl, main';
  let pageEls = [], mode = 'cookies', elementSpecs = [];
  const moved = new Map();
  const saved = new Map();

  function visibleAlpha(c) {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return 0;
    const parts = m[1].split(/[ ,\/]+/).filter(Boolean);
    return parts.length > 3 ? parseFloat(parts[3]) : 1;
  }

  function looksLikeBox(cs) {
    if (visibleAlpha(cs.backgroundColor) > 0.08) return true;
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
    const bw = ['Top', 'Right', 'Bottom', 'Left'].filter(sd => parseFloat(cs['border' + sd + 'Width']) > 0 && cs['border' + sd + 'Style'] !== 'none' && visibleAlpha(cs['border' + sd + 'Color']) > 0.1).length;
    if (bw >= 3) return true;
    if (cs.boxShadow && cs.boxShadow !== 'none') return true;
    return false;
  }

  function isSearchBar(el) {
    if (!el.matches('input, textarea, [role="searchbox"], [role="combobox"], [role="textbox"]')) return false;
    if (el.matches('[type="search"], [role="searchbox"]') || el.closest('[role="search"], search')) return true;
    const hint = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.title].join(' ').toLowerCase();
    return /search|\bq\b|query|find/.test(hint);
  }

  function detectElements() {
    const vw = window.innerWidth, vh = window.innerHeight, area = vw * vh;
    let cands = [];
    const all = document.body ? document.body.querySelectorAll(CONTROL_SEL + ',' + MEDIA_SEL + ',' + BOX_SEL) : [];
    for (const el of all) {
      if (cands.length > 1500) break;
      if (el === host || host.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 14) continue;
      if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) continue;
      const visW = Math.min(r.right, vw) - Math.max(r.left, 0), visH = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (visW * visH < r.width * r.height * 0.6) continue;
      if (r.width * r.height > area * 0.22 || r.height > vh / 3 || (r.width > vw / 3 && !isSearchBar(el))) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility !== 'visible' || parseFloat(cs.opacity) < 0.1 || cs.display === 'none') continue;
      if (cs.position === 'fixed' && r.width * r.height > area * 0.1) continue;
      const isControl = el.matches(CONTROL_SEL);
      const isMedia = el.matches(MEDIA_SEL);
      if (!isControl && !isMedia && !looksLikeBox(cs)) continue;
      if (isMedia && r.width * r.height < 900) continue;
      cands.push({ el, r, isControl });
    }
    const controls = cands.filter(c => c.isControl);
    cands = cands.filter(c => !controls.some(p => p.el !== c.el && p.el.contains(c.el)));
    cands.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    const dropped = new Set();
    let keep = [];
    for (const c of cands) {
      if (dropped.has(c.el)) continue;
      const inner = cands.filter(o => o.el !== c.el && !dropped.has(o.el) && c.el.contains(o.el));
      if (inner.length > 3) continue;
      inner.forEach(o => dropped.add(o.el));
      keep.push(c);
    }
    const out = [];
    for (const c of keep) {
      const el = promoteToBox(c.el, c.r, vw, vh);
      if (!out.some(o => o === el || o.contains(el) || el.contains(o))) out.push(el);
    }
    return out.slice(0, 60);
  }

  function detectEnemyElements() {
    const vw = window.innerWidth, vh = window.innerHeight, area = vw * vh;
    let cands = [];
    const all = document.body ? document.body.querySelectorAll(CONTROL_SEL + ',' + MEDIA_SEL + ',' + BOX_SEL) : [];
    for (const el of all) {
      if (cands.length > 2000) break;
      if (el === host || host.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 16 || r.height < 12) continue;
      if (r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) continue;
      if (r.width * r.height > area * 0.06 || r.height > vh / 4 || (r.width > vw / 3 && !isSearchBar(el))) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility !== 'visible' || parseFloat(cs.opacity) < 0.1 || cs.display === 'none' || cs.position === 'fixed') continue;
      const isControl = el.matches(CONTROL_SEL);
      const isLink = el.tagName === 'A' && (el.textContent.trim() || el.querySelector('img, svg'));
      const isMedia = el.matches('img, svg, picture');
      if (el.matches('iframe, video, canvas, embed, object')) continue;
      if (!isControl && !isLink && !isMedia && !looksLikeBox(cs)) continue;
      if (el.getElementsByTagName('*').length > 150 || el.querySelector('iframe, video, canvas')) continue;
      cands.push({ el, r });
    }
    cands.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    const keep = [];
    for (const c of cands) {
      if (keep.some(k => k.el.contains(c.el))) continue;
      if (cands.filter(o => o.el !== c.el && c.el.contains(o.el)).length > 3) continue;
      keep.push(c);
    }
    const out = [];
    for (const c of keep) {
      const el = promoteToBox(c.el, c.r, vw, vh);
      if (out.some(o => o === el || o.contains(el) || el.contains(o))) continue;
      out.push(el);
    }
    for (let i = out.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [out[i], out[j]] = [out[j], out[i]]; }
    return out.slice(0, 40);
  }

  function elementLabel(el) {
    const t = (el.getAttribute('aria-label') || el.value || el.placeholder || el.alt || el.textContent || '').replace(/\s+/g, ' ').trim();
    const tag = '<' + el.tagName.toLowerCase() + '>';
    return t ? `${tag} ${t.length > 18 ? t.slice(0, 17) + '…' : t}` : tag;
  }

  let cloneLayer = null;

  function copyStyles(src, dst) {
    const cs = getComputedStyle(src);
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i];
      dst.style.setProperty(prop, cs.getPropertyValue(prop));
    }
    const sk = src.children, dk = dst.children;
    for (let i = 0; i < sk.length && i < dk.length; i++) copyStyles(sk[i], dk[i]);
  }

  function makeClone(el) {
    if (!cloneLayer) {
      cloneLayer = document.createElement('div');
      cloneLayer.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:visible;display:block;';
      document.documentElement.appendChild(cloneLayer);
    }
    const r = el.getBoundingClientRect();
    const c = el.cloneNode(true);
    c.removeAttribute('id');
    c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    copyStyles(el, c);
    if ('value' in el && el.value) c.value = el.value;
    const st = c.style;
    st.setProperty('position', 'fixed');
    st.setProperty('left', r.left + 'px');
    st.setProperty('top', r.top + 'px');
    st.setProperty('width', r.width + 'px');
    st.setProperty('height', r.height + 'px');
    st.setProperty('box-sizing', 'border-box');
    st.setProperty('margin', '0');
    st.setProperty('transform', 'none');
    st.setProperty('transition', 'none');
    st.setProperty('animation', 'none');
    st.setProperty('pointer-events', 'none');
    st.setProperty('visibility', 'visible');
    st.setProperty('z-index', 'auto');
    cloneLayer.appendChild(c);
    return c;
  }

  function moveElement(e) {
    const el = e.el;
    if (!e.clone) {
      e.clone = makeClone(el);
      if (!moved.has(el)) moved.set(el, { visibility: [el.style.getPropertyValue('visibility'), el.style.getPropertyPriority('visibility')], clones: [] });
      moved.get(el).clones.push(e.clone);
      el.style.setProperty('visibility', 'hidden', 'important');
    }
    let dx = e.x - e.homeX, dy = e.y - e.homeY;
    if (e.hitFlash > 0) { dx += rand(-3, 3); dy += rand(-3, 3); }
    e.clone.style.setProperty('transform', `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`);
  }

  function restoreElements() {
    for (const [el, orig] of moved) {
      orig.clones.forEach(c => c.remove());
      const [v, pr] = orig.visibility;
      if (v) el.style.setProperty('visibility', v, pr); else el.style.removeProperty('visibility');
    }
    moved.clear();
    for (const e of enemies) e.clone = null;
    if (cloneLayer) { cloneLayer.remove(); cloneLayer = null; }
  }

  function promoteToBox(el, r, vw, vh) {
    const search = isSearchBar(el);
    let best = el;
    let cur = el.parentElement;
    for (let i = 0; i < 6 && cur && cur !== document.body && cur !== document.documentElement; i++, cur = cur.parentElement) {
      const pr = cur.getBoundingClientRect();
      if (pr.width > r.width * 1.8 + 80 || pr.height > r.height * 2.6 + 40) break;
      if (pr.height > vh / 3 || (pr.width > vw / 3 && !search)) break;
      if (cur.querySelectorAll(CONTROL_SEL).length > 4) break;
      if (looksLikeBox(getComputedStyle(cur))) best = cur;
    }
    return best;
  }

  function obstacleEls() {
    return pageEls.filter(el => el.isConnected);
  }

  function obstacleColor(el) {
    const cs = getComputedStyle(el);
    if (visibleAlpha(cs.backgroundColor) > 0.08) return cs.backgroundColor;
    if (visibleAlpha(cs.borderTopColor) > 0.1 && parseFloat(cs.borderTopWidth) > 0) return cs.borderTopColor;
    return el.matches(MEDIA_SEL) ? '#8a8a8a' : '#9db8e2';
  }

  function measureObstacles() {
    const prev = new Map(obstacles.map(o => [o.el, o]));
    obstacles = [];
    for (const el of obstacleEls()) {
      if (saved.has(el) && saved.get(el).broken) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const old = prev.get(el);
      obstacles.push({
        el, x: r.left, y: r.top, w: r.width, h: r.height,
        hp: old ? old.hp : OBST_HP, color: obstacleColor(el)
      });
    }
    buildNav();
  }

  function restoreObstacles() {
    for (const [el, info] of saved) {
      if (!info.broken) continue;
      el.style.setProperty('visibility', info.value, info.priority);
      if (!info.value) el.style.removeProperty('visibility');
      info.broken = false;
    }
    obstacles = [];
    measureObstacles();
  }

  function hitObstacle(o) {
    if (o.hp <= 0 || state !== 'wave') return;
    o.hp--;
    try {
      o.el.animate([
        { transform: 'translate(0, 0)' }, { transform: 'translate(-3px, 1px)' }, { transform: 'translate(3px, -1px)' },
        { transform: 'translate(-1px, 2px)' }, { transform: 'translate(0, 0)' }
      ], { duration: 140, composite: 'add' });
    } catch {}
    if (o.hp <= 0) breakObstacle(o);
  }

  function breakObstacle(o) {
    if (!saved.has(o.el)) saved.set(o.el, { value: o.el.style.getPropertyValue('visibility'), priority: o.el.style.getPropertyPriority('visibility'), broken: false });
    saved.get(o.el).broken = true;
    o.el.style.setProperty('visibility', 'hidden', 'important');
    for (let i = 0; i < 28; i++) {
      const x = o.x + rand(0, o.w), y = o.y + rand(0, o.h);
      const a = rand(0, Math.PI * 2), sp = rand(40, 200);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: rand(0.5, 1), max: 1, color: i % 3 ? o.color : '#555', size: rand(3, 6) | 0 });
    }
    shake = Math.min(12, shake + 4);
    sfx(90, 0.25, 'sawtooth', 0.06, -40);
    score += 5;
    obstacles = obstacles.filter(x => x !== o);
    buildNav();
  }

  function circleRect(cx, cy, r, o) {
    const nx = clamp(cx, o.x, o.x + o.w), ny = clamp(cy, o.y, o.y + o.h);
    let dx = cx - nx, dy = cy - ny;
    const d = hyp(dx, dy);
    if (d >= r) return null;
    if (d > 0) return { nx: dx / d, ny: dy / d, depth: r - d, px: nx, py: ny };
    const l = cx - o.x, rr = o.x + o.w - cx, t = cy - o.y, b = o.y + o.h - cy;
    const m = Math.min(l, rr, t, b);
    if (m === l) return { nx: -1, ny: 0, depth: l + r, px: o.x, py: cy };
    if (m === rr) return { nx: 1, ny: 0, depth: rr + r, px: o.x + o.w, py: cy };
    if (m === t) return { nx: 0, ny: -1, depth: t + r, px: cx, py: o.y };
    return { nx: 0, ny: 1, depth: b + r, px: cx, py: o.y + o.h };
  }

  function pushOut(ent, r) {
    let touched = null;
    for (const o of obstacles) {
      const c = circleRect(ent.x, ent.y, r, o);
      if (!c) continue;
      ent.x += c.nx * c.depth;
      ent.y += c.ny * c.depth;
      const vn = ent.vx * c.nx + ent.vy * c.ny;
      if (vn < 0) { ent.vx -= vn * c.nx; ent.vy -= vn * c.ny; }
      touched = touched || { o, c, vn };
    }
    return touched;
  }

  function insideObstacle(x, y, pad) {
    return obstacles.some(o => x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad);
  }

  function obstacleAt(x, y, pad) {
    return obstacles.find(o => x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad);
  }

  function segRect(x1, y1, x2, y2, o, pad) {
    const dx = x2 - x1, dy = y2 - y1;
    let t0 = 0, t1 = 1;
    const ps = [-dx, dx, -dy, dy];
    const qs = [x1 - (o.x - pad), o.x + o.w + pad - x1, y1 - (o.y - pad), o.y + o.h + pad - y1];
    for (let i = 0; i < 4; i++) {
      if (ps[i] === 0) { if (qs[i] < 0) return null; continue; }
      const t = qs[i] / ps[i];
      if (ps[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return t0;
  }

  function segBlocked(x1, y1, x2, y2, pad) {
    for (const o of obstacles) if (segRect(x1, y1, x2, y2, o, pad) !== null) return true;
    return false;
  }

  function rayLength(x, y, a) {
    const L = hyp(W, H) * 1.2;
    let best = L;
    const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
    for (const o of obstacles) {
      const t = segRect(x, y, x2, y2, o, 0);
      if (t !== null && t * L < best) best = t * L;
    }
    return best;
  }

  function buildNav() {
    nav.cols = Math.max(1, Math.ceil(W / CELL));
    nav.rows = Math.max(1, Math.ceil(H / CELL));
    const n = nav.cols * nav.rows;
    nav.blocked = new Uint8Array(n);
    nav.dist = new Int32Array(n).fill(-1);
    for (let r = 0; r < nav.rows; r++) {
      for (let c = 0; c < nav.cols; c++) {
        if (insideObstacle(c * CELL + CELL / 2, r * CELL + CELL / 2, 14)) nav.blocked[r * nav.cols + c] = 1;
      }
    }
    nav.t = 0;
  }

  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function updateNav(dt) {
    nav.t -= dt;
    if (nav.t > 0 || !nav.blocked || !obstacles.length) return;
    nav.t = 0.2;
    const { cols, rows, blocked, dist } = nav;
    dist.fill(-1);
    const pc = clamp(Math.floor(player.x / CELL), 0, cols - 1), pr = clamp(Math.floor(player.y / CELL), 0, rows - 1);
    const q = new Int32Array(cols * rows);
    let head = 0, tail = 0;
    q[tail++] = pr * cols + pc;
    dist[pr * cols + pc] = 0;
    while (head < tail) {
      const cur = q[head++], c = cur % cols, r = (cur / cols) | 0;
      for (const [dc, dr] of NB) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = nr * cols + nc;
        if (blocked[ni] || dist[ni] >= 0) continue;
        if (dc && dr && (blocked[r * cols + nc] || blocked[nr * cols + c])) continue;
        dist[ni] = dist[cur] + 1;
        q[tail++] = ni;
      }
    }
  }

  function flowDir(x, y) {
    const { cols, rows, blocked, dist } = nav;
    if (!dist) return null;
    const c = clamp(Math.floor(x / CELL), 0, cols - 1), r = clamp(Math.floor(y / CELL), 0, rows - 1);
    let best = -1, bd = dist[r * cols + c] >= 0 ? dist[r * cols + c] : 1e9;
    for (const [dc, dr] of NB) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = nr * cols + nc;
      if (blocked[ni] || dist[ni] < 0) continue;
      if (dc && dr && (blocked[r * cols + nc] || blocked[nr * cols + c])) continue;
      if (dist[ni] < bd) { bd = dist[ni]; best = ni; }
    }
    if (best < 0) return null;
    const tx = (best % cols) * CELL + CELL / 2, ty = ((best / cols) | 0) * CELL + CELL / 2;
    const dx = tx - x, dy = ty - y, d = hyp(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }

  function clearField() {
    enemies = []; bullets = []; powerups = []; particles = []; floaters = []; spawnQueue = []; firstHalf = []; countdown = 0; flashes = []; rings = []; hitStop = 0; whiteFlash = 0;
    slashes = []; ghosts = []; lasers = [];
    restoreElements();
    restoreObstacles();
    for (const k in cds) cds[k] = 0;
  }

  function resetGame() {
    stacks = { hp: 0, spd: 0, dmg: 0 };
    wave = 1;
    score = 0;
    clearField();
    player = newPlayer();
    state = 'idle';
    paused = false;
    updateBadge();
  }

  function startWave() {
    if (state !== 'idle') return;
    waveInfo = waveParams(wave);
    if (mode === 'elements') {
      restoreElements();
      enemies = [];
      firstHalf = elementSpecs.filter(sp => sp.el.isConnected).map(sp => ({ ...sp }));
      spawnQueue = [];
      countdown = 3;
      spawnTimer = 0;
      state = 'wave';
      paused = false;
      player.inv = 1;
      hidePanel();
      SND.wave();
      floaters.push({ x: W / 2, y: H * 0.35, text: 'THE PAGE IS FIGHTING BACK', color: '#c62828', life: 2, max: 2, big: true });
      updateBadge();
      return;
    }
    const q = [];
    for (let i = 0; i < waveInfo.count; i++) {
      q.push({ kind: Math.random() < waveInfo.shooterFrac ? 'shooter' : 'chaser' });
    }
    for (let i = 0; i < waveInfo.necessary; i++) {
      q.splice((Math.random() * (q.length + 1)) | 0, 0, { kind: 'necessary' });
    }
    if (waveInfo.boss) q.splice(Math.floor(q.length * 0.6), 0, { kind: 'boss' });
    q.unshift({ kind: 'necessary' });
    const half = Math.ceil(q.length / 2);
    firstHalf = q.slice(0, half);
    spawnQueue = q.slice(half);
    if (!firstHalf.some(sp => sp.kind !== 'necessary')) {
      const i = spawnQueue.findIndex(sp => sp.kind !== 'necessary');
      if (i >= 0) firstHalf.push(spawnQueue.splice(i, 1)[0]);
    }
    countdown = 3;
    spawnTimer = 0;
    state = 'wave';
    paused = false;
    player.inv = 1;
    restoreObstacles();
    hidePanel();
    SND.wave();
    floaters.push({ x: W / 2, y: H * 0.35, text: `WAVE ${wave}${waveInfo.boss ? ' - BOSS' : ''}`, color: '#1851ce', life: 2, max: 2, big: true });
    updateBadge();
  }

  function waveCleared() {
    if (mode === 'elements') {
      state = 'idle';
      lasers = [];
      bullets = bullets.filter(b => b.from === 'player');
      SND.clear();
      score += 500;
      const site = location.hostname.replace(/^www\./, '') || 'local file';
      if (hasChrome) { try { chrome.runtime.sendMessage({ cc: 'conquered', host: site }).catch(() => {}); } catch {} }
      floaters.push({ x: W / 2, y: H * 0.35, text: `${site.toUpperCase()} CONQUERED  +500`, color: '#1f8a17', life: 2.4, max: 2.4, big: true });
      updateBadge();
      setTimeout(() => {
        if (state !== 'idle' || !running) return;
        showPanel(`${site} conquered`, `You took apart every element on the page with ${Math.ceil(player.hp)} HP left. Score ${score.toLocaleString()}.`, [
          { label: 'Play again', primary: true, onClick: () => { resetGame(); startWave(); } },
          { label: 'End attack', onClick: end }
        ], 'End attack puts the page back');
      }, 1300);
      return;
    }
    state = 'idle';
    const bonus = 100 * wave;
    score += bonus;
    enemies.forEach(e => {
      if (e.kind === 'necessary') floaters.push({ x: e.x, y: e.y - 22, text: 'ACCEPTED', color: '#2e7d32', life: 1.2, max: 1.2 });
    });
    enemies = [];
    lasers = [];
    restoreObstacles();
    bullets = bullets.filter(b => b.from === 'player');
    const heal = Math.round(player.maxHp * 0.15);
    player.hp = Math.min(player.maxHp, player.hp + heal);
    SND.clear();
    floaters.push({ x: W / 2, y: H * 0.35, text: `WAVE ${wave} CLEARED  +${bonus}`, color: '#1f8a17', life: 2.4, max: 2.4, big: true });
    wave++;
    updateBadge();
    setTimeout(() => {
      if (state !== 'idle' || !running) return;
      showPanel(`Wave ${wave - 1} cleared`, `You healed ${heal} HP. Wave ${wave}${waveParams(wave).boss ? ' has a supercookie boss' : ' is ready when you are'}.`, [
        { label: `Start wave ${wave}`, primary: true, onClick: startWave },
        { label: 'End attack', onClick: end }
      ], 'Enter starts the next wave');
    }, 1300);
  }

  function gameOver() {
    state = 'dead';
    paused = false;
    hidePanel();
    SND.dead();
    setTimeout(() => {
      if (!running) return;
      showPanel('Aw, Snap!', mode === 'elements' ? `The page won. ${enemies.filter(e => !e.dead).length} elements were still standing. Score ${score.toLocaleString()}.` : `Too many cookies got through. You reached wave ${wave} with ${score.toLocaleString()} points.`, [
        { label: 'Try again', primary: true, onClick: () => { resetGame(); startWave(); } },
        { label: 'End attack', onClick: end }
      ], '', true);
    }, 900);
  }

  function spawnElement(spec) {
    const el = spec.el, r = el.getBoundingClientRect();
    const n = spec.count, nerf = Math.max(1, n / 3);
    const hw = r.width / 2, hh = r.height / 2;
    const boss = spec.kind === 'boss';
    const e = {
      kind: spec.kind, el, name: elementLabel(el), domain: '', x: r.left + hw, y: r.top + hh, homeX: r.left + hw, homeY: r.top + hh,
      hw, hh, r: Math.max(10, Math.min(Math.max(hw, hh), Math.min(hw, hh) * 1.6 + 6)), scale: 3, vx: 0, vy: 0,
      spawnT: 0.75, hitFlash: 0, contactCd: 0, wanderA: rand(0, Math.PI * 2), t: 0, nerf,
      shots: 0, shotT: 0, spinA: rand(0, 6.3), orbitA: rand(0, 6.3), orbitDir: Math.random() < 0.5 ? 1 : -1
    };
    if (boss) {
      Object.assign(e, { hp: 320, speed: 50, dmg: 13, touch: 30, bulletSpeed: 150, phase: 'orbit', phaseT: 3, windup: 0, chargesLeft: 0, fadeT: 0, trailT: 0,
        variant: pick(BOSS_VARIANTS), fireCd: 1.5 });
    } else {
      Object.assign(e, { hp: clamp(Math.sqrt(r.width * r.height) * 0.6, 20, 90), speed: 105 * rand(0.85, 1.15) * Math.max(0.6, 1 - n * 0.01), dmg: 11, touch: 18,
        keep: rand(170, 260), pattern: pick(PATTERNS).id, bulletSpeed: 330 * Math.max(0.75, 1 - n * 0.006), fireCd: rand(0.4, 2.5) * nerf });
    }
    e.maxHp = e.hp;
    enemies.push(e);
    rings.push({ x: e.x, y: e.y, r: 2, rmax: Math.max(hw, hh) * 1.6, color: RING_COLORS[e.kind], life: 0.75, max: 0.75, w: 3 });
    moveElement(e);
    return e;
  }

  function spawn(spec, atX, atY) {
    if (spec.el) return spawnElement(spec);
    const kind = spec.kind;
    const info = pick(DB[kind]);
    let x, y, tries = 0;
    do {
      x = rand(40, W - 40);
      y = rand(50, H - 40);
      tries++;
    } while (atX === undefined && (hyp(x - player.x, y - player.y) < 200 || insideObstacle(x, y, 40)) && tries < 40);
    if (atX !== undefined) { x = atX; y = atY; }

    const wp = waveInfo;
    const e = {
      kind, name: info.n, domain: info.d, x, y, vx: 0, vy: 0,
      spawnT: 0.75, hitFlash: 0, contactCd: 0,
      wanderA: rand(0, Math.PI * 2),
      fireCd: rand(1, 2.2), burstCd: 3, t: 0
    };
    if (kind === 'necessary') {
      Object.assign(e, { r: 18, scale: 3, hp: 30, speed: 38 * rand(0.8, 1.2) });
    } else if (kind === 'chaser') {
      Object.assign(e, { r: 13, scale: 2, hp: 18 * wp.hp, speed: BASE.speed * rand(1.04, 1.16) * Math.min(1.3, 1 + 0.02 * (wave - 1)), dmg: 20 * wp.dmg, touch: 20 * wp.dmg });
    } else if (kind === 'shooter') {
      Object.assign(e, { r: 18, scale: 3, hp: 28 * wp.hp, speed: 110 * wp.spd * rand(0.85, 1.15), dmg: 11 * wp.dmg, touch: 18 * wp.dmg, keep: rand(190, 260),
        pattern: pick(PATTERNS.filter(pt => pt.from <= wave)).id,
        orbitA: rand(0, 6.3), orbitDir: Math.random() < 0.5 ? 1 : -1, bulletSpeed: 330 * Math.min(1.25, wp.spd), shots: 0, shotT: 0, spinA: rand(0, 6.3) });
    } else {
      Object.assign(e, { r: 46, scale: 7, hp: 420 * wp.hp, speed: 45 * wp.spd, dmg: 13 * wp.dmg, touch: 35 * wp.dmg, bulletSpeed: 150, shots: 0, shotT: 0, spinA: 0,
        phase: 'orbit', phaseT: 3, orbitA: 0, orbitDir: 1, windup: 0, chargesLeft: 0, fadeT: 0, trailT: 0, variant: pick(BOSS_VARIANTS), fireCd: 1.2 });
    }
    e.maxHp = e.hp;
    enemies.push(e);
    rings.push({ x, y, r: 2, rmax: e.r * 2.6, color: RING_COLORS[kind], life: 0.75, max: 0.75, w: 3 });
    if (!spec.quiet) sfx(300 + Math.random() * 200, 0.05, 'triangle', 0.02, 200);
    return e;
  }

  function hurtPlayer(dmg, srcX, srcY, ignoreInv) {
    if (state !== 'wave') return;
    if (player.inv > 0 && !ignoreInv) return;
    dmg = clamp(dmg, 12, 25);
    player.hp -= dmg;
    player.inv = ignoreInv ? Math.max(player.inv, 0.15) : 0.7;
    shake = Math.min(14, shake + 5 + dmg * 0.3);
    flashRed = 0.35;
    rings.push({ x: player.x, y: player.y, r: 8, rmax: 70, color: '#ff1744', life: 0.3, max: 0.3, w: 4 });
    sparks(player.x, player.y, '#ff8a80', 10);
    SND.hurt();
    if (srcX !== undefined) {
      const dx = player.x - srcX, dy = player.y - srcY, d = hyp(dx, dy) || 1;
      player.vx += dx / d * 260;
      player.vy += dy / d * 260;
    }
    floaters.push({ x: player.x, y: player.y - 18, text: `-${Math.round(dmg)}`, color: '#d32f2f', life: 0.8, max: 0.8 });
    if (player.hp <= 0) {
      player.hp = 0;
      burst(player.x, player.y, '#ffffff', 30);
      burst(player.x, player.y, '#1851ce', 20);
      gameOver();
    }
  }

  function burst(x, y, color, n, speed = 160) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(30, speed);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.8), max: 0.8, color, size: rand(2, 4) | 0 });
    }
  }

  const RING_COLORS = { necessary: '#69f0ae', chaser: '#ff5252', shooter: '#b388ff', boss: '#ea80fc' };

  function sparks(x, y, color, n, dir, spread = 1.3, speed = 340) {
    for (let i = 0; i < n; i++) {
      const a = dir === undefined ? rand(0, Math.PI * 2) : dir + rand(-spread, spread), sp = rand(speed * 0.35, speed);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.15, 0.4), max: 0.4, color, size: 2, spark: true });
    }
  }

  function killEnemy(e) {
    const p = PALETTES[e.kind];
    const big = e.kind === 'boss';
    rings.push({ x: e.x, y: e.y, r: e.r * 0.5, rmax: e.r * (big ? 8 : 3.4), color: RING_COLORS[e.kind], life: big ? 0.8 : 0.42, max: big ? 0.8 : 0.42, w: big ? 14 : 6 });
    flashes.push({ x: e.x, y: e.y, color: '#ffab00', r: e.r * (big ? 5 : 2.6), life: big ? 0.4 : 0.2, max: big ? 0.4 : 0.2 });
    sparks(e.x, e.y, '#ff9100', big ? 60 : 12 + e.scale * 2, undefined, 0, big ? 600 : 380);
    if (big) {
      hitStop = 0.2;
      whiteFlash = 0.8;
      rings.push({ x: e.x, y: e.y, r: 10, rmax: Math.max(W, H), color: '#d500f9', life: 0.7, max: 0.7, w: 8 });
    }
    burst(e.x, e.y, p.body, 14 + e.scale * 2);
    burst(e.x, e.y, p.chip, 6 + e.scale);
    e.dead = true;
    if (e.clone) e.clone.remove();
    if (e.kind === 'necessary') {
      score = Math.max(0, score - 150);
      floaters.push({ x: e.x, y: e.y - 20, text: 'SITE BROKE! -150', color: '#d32f2f', life: 1.4, max: 1.4 });
      SND.friendly();
      return;
    }
    SND.kill();
    const pts = e.kind === 'boss' ? 1000 : e.kind === 'shooter' ? 30 : 20;
    score += Math.round(pts * (1 + 0.1 * (wave - 1)));
    floaters.push({ x: e.x, y: e.y - 20, text: e.kind === 'boss' ? 'SUPERCOOKIE DELETED' : 'DELETED', color: '#444', life: 0.9, max: 0.9 });
    if (e.kind === 'boss') {
      shake = 22;
      for (let i = 0; i < 3; i++) dropPowerup(e.x + rand(-40, 40), e.y + rand(-30, 30));
    } else if (Math.random() < 0.1) {
      dropPowerup(e.x, e.y);
    }
  }

  function dropPowerup(x, y) {
    const o = obstacleAt(x, y, 14);
    if (o) y = o.y - 18 > 20 ? o.y - 18 : o.y + o.h + 18;
    powerups.push({ x: clamp(x, 20, W - 20), y: clamp(y, 20, H - 20), type: pick(['hp', 'spd', 'dmg']), life: 12, t: rand(0, 6) });
  }

  function applyPowerup(pu) {
    let text;
    if (pu.type === 'hp') {
      const before = maxHpFor(stacks.hp);
      stacks.hp++;
      const after = maxHpFor(stacks.hp);
      player.maxHp = after;
      const heal = 15 + (after - before);
      player.hp = Math.min(player.maxHp, player.hp + heal);
      text = `+${after - before} MAX HP`;
    } else if (pu.type === 'spd') {
      const before = spdMultFor(stacks.spd);
      stacks.spd++;
      text = `+${Math.round((spdMultFor(stacks.spd) - before) * 100)}% SPEED`;
    } else {
      const before = dmgMultFor(stacks.dmg);
      stacks.dmg++;
      text = `+${Math.round((dmgMultFor(stacks.dmg) - before) * 100)}% DAMAGE`;
    }
    SND.power();
    floaters.push({ x: pu.x, y: pu.y - 16, text, color: POWER_COLORS[pu.type], life: 1.4, max: 1.4 });
  }

  const POWER_COLORS = { hp: '#d32f2f', spd: '#e0a000', dmg: '#e65100' };

  function update(dt) {
    if (hitStop > 0) { hitStop -= dt; dt *= 0.12; }
    for (const f of floaters) { f.life -= dt; f.y -= (f.big ? 8 : 26) * dt; }
    for (const sl of slashes) { sl.life -= dt; sl.x = player.x; sl.y = player.y; }
    for (const lz of lasers) {
      if (lz.owner && !lz.owner.dead && lz.warn > 0) { lz.x = lz.owner.x; lz.y = lz.owner.y; }
      if (lz.owner && lz.owner.dead && lz.warn > 0) lz.gone = true;
      if (paused || (state !== 'wave' && state !== 'idle')) continue;
      if (lz.warn > 0) {
        lz.warn -= dt;
        if (lz.warn <= 0) {
          sfx(110, 0.35, 'sawtooth', 0.06, 300);
          shake = Math.min(14, shake + 6);
          whiteFlash = Math.max(whiteFlash, 0.1);
          flashes.push({ x: lz.x, y: lz.y, color: lz.color, r: 70, life: 0.3, max: 0.3 });
        }
      } else {
        lz.active -= dt;
        shake = Math.max(shake, 4);
        const L = rayLength(lz.x, lz.y, lz.a);
        if (Math.random() < 0.8) sparks(lz.x + Math.cos(lz.a) * L, lz.y + Math.sin(lz.a) * L, Math.random() < 0.5 ? '#ffffff' : lz.color, 2, lz.a + Math.PI, 1.2, 300);
        if (!lz.hit && state === 'wave') {
          const dx = player.x - lz.x, dy = player.y - lz.y;
          const along = dx * Math.cos(lz.a) + dy * Math.sin(lz.a);
          const off = Math.abs(-dx * Math.sin(lz.a) + dy * Math.cos(lz.a));
          if (along > 0 && along < rayLength(lz.x, lz.y, lz.a) && off < lz.width / 2 + player.r && player.inv <= 0) {
            lz.hit = true;
            hurtPlayer(lz.dmg, player.x - Math.sin(lz.a) * 10, player.y + Math.cos(lz.a) * 10);
          }
        }
      }
    }
    lasers = lasers.filter(lz => !lz.gone && (lz.warn > 0 || lz.active > 0));
    slashes = slashes.filter(sl => sl.life > 0);
    for (const g of ghosts) g.life -= dt;
    ghosts = ghosts.filter(g => g.life > 0);
    floaters = floaters.filter(f => f.life > 0);
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy = p.vy * 0.92 + 200 * dt;
    }
    particles = particles.filter(p => p.life > 0);
    const cap = lowFx ? 250 : 900;
    if (particles.length > cap) particles.splice(0, particles.length - cap);
    for (const f of flashes) f.life -= dt;
    flashes = flashes.filter(f => f.life > 0);
    for (const r of rings) r.life -= dt;
    rings = rings.filter(r => r.life > 0);
    whiteFlash = Math.max(0, whiteFlash - dt * 2.5);
    if (state === 'wave' && hyp(player.vx, player.vy) > 60 && Math.random() < 0.7) {
      const ba = player.angle + Math.PI + rand(-0.4, 0.4);
      particles.push({ x: player.x + Math.cos(player.angle + Math.PI) * 10, y: player.y + Math.sin(player.angle + Math.PI) * 10, vx: Math.cos(ba) * 90, vy: Math.sin(ba) * 90 - 20, life: rand(0.15, 0.35), max: 0.35, color: Math.random() < 0.5 ? '#ff9800' : '#ffd54f', size: 2, spark: true });
    }
    shake = Math.max(0, shake - dt * 30);
    flashRed = Math.max(0, flashRed - dt);

    if (state !== 'wave' && state !== 'idle') return;
    if (paused) return;

    idleHintT += dt;
    updatePlayer(dt);

    if (state === 'wave') {
      if (countdown > 0) {
        const before = Math.ceil(countdown);
        countdown -= dt;
        if (countdown <= 0) {
          countdown = 0;
          firstHalf.forEach(sp => { const e = spawn({ ...sp, quiet: true }); if (e) e.group = 1; });
          firstHalf = [];
          SND.wave();
          updateBadge();
        } else if (Math.ceil(countdown) !== before) sfx(660, 0.08, 'square', 0.04);
      } else if (spawnQueue.length && enemies.filter(e => e.group === 1 && !e.dead && e.kind !== 'necessary').length <= 1) {
        spawnQueue.forEach(sp => spawn({ ...sp, quiet: true }));
        spawnQueue = [];
        SND.wave();
        floaters.push({ x: W / 2, y: H * 0.35, text: 'SECOND WAVE', color: '#b71c1c', life: 1.6, max: 1.6, big: true });
        updateBadge();
      }
      updateNav(dt);
      updateEnemies(dt);
    }

    updateBullets(dt);
    updatePowerups(dt);

    if (state === 'wave' && countdown <= 0 && !spawnQueue.length && !enemies.some(e => e.kind !== 'necessary')) {
      waveCleared();
    }
  }

  function nearestHostile() {
    let best = null, bd = Infinity;
    for (const e of enemies) {
      if (e.kind === 'necessary' || e.spawnT > 0) continue;
      const d = hyp(e.x - player.x, e.y - player.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function updatePlayer(dt) {
    const p = player;
    let ix = 0, iy = 0;
    if (keys.a || keys.arrowleft) ix -= 1;
    if (keys.d || keys.arrowright) ix += 1;
    if (keys.w || keys.arrowup) iy -= 1;
    if (keys.s || keys.arrowdown) iy += 1;
    const speed = BASE.speed * spdMultFor(stacks.spd);

    if (touch.active) {
      const tx = touch.x, ty = touch.y - 60;
      const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy);
      if (d > 6) { ix = dx / d * Math.min(1, d / 60); iy = dy / d * Math.min(1, d / 60); }
    } else {
      const l = hyp(ix, iy);
      if (l > 0) { ix /= l; iy /= l; }
    }

    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashVx; p.vy = p.dashVy;
      ghosts.push({ x: p.x, y: p.y, angle: p.angle, life: 0.22, max: 0.22 });
      if (state === 'wave') {
        const dmg = BASE.damage * dmgMultFor(stacks.dmg) * 1.8;
        for (const e of enemies) {
          if (e.dead || e.spawnT > 0 || e.ghost || p.dashHits.has(e)) continue;
          if (hyp(e.x - p.x, e.y - p.y) < e.r + p.r + 6) {
            p.dashHits.add(e);
            const d = hyp(p.dashVx, p.dashVy) || 1;
            damageEnemy(e, dmg, p.dashVx / d * 260, p.dashVy / d * 260, 0.6);
            floaters.push({ x: e.x, y: e.y - 24, text: 'DASH HIT', color: '#1851ce', life: 0.6, max: 0.6 });
          }
        }
      }
    } else {
      const accel = Math.min(1, dt * 12);
      p.vx += (ix * speed - p.vx) * accel;
      p.vy += (iy * speed - p.vy) * accel;
    }
    p.x = clamp(p.x + p.vx * dt, p.r, W - p.r);
    p.y = clamp(p.y + p.vy * dt, p.r, H - p.r);
    if (pushOut(p, p.r) && p.dashT > 0) p.dashT = 0;
    p.inv = Math.max(0, p.inv - dt);

    if (touch.active) {
      const t = nearestHostile();
      if (t) p.angle = Math.atan2(t.y - p.y, t.x - p.x);
    } else if (mouse.inside || mouse.down) {
      p.angle = Math.atan2(mouse.y - p.y, mouse.x - p.x);
    }

    for (const k in cds) cds[k] = Math.max(0, cds[k] - dt);
    let want = mouse.down || keys[' '];
    if (touch.active && weapon === 'shoot') want = !!nearestHostile();
    if (touch.active && weapon === 'swing') { const t = nearestHostile(); want = !!t && hyp(t.x - p.x, t.y - p.y) < BASE.swingRange + t.r; }
    if (touch.dashReq) { want = weapon === 'dash'; touch.dashReq = false; }
    if (want && cds[weapon] <= 0) attack(weapon, ix, iy);
  }

  function attack(w, ix, iy) {
    const p = player;
    const dmg = BASE.damage * dmgMultFor(stacks.dmg);
    if (w === 'shoot') {
      cds.shoot = BASE.fireInterval;
      const a = p.angle + rand(-0.03, 0.03);
      bullets.push({
        x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14,
        vx: Math.cos(a) * BASE.bulletSpeed, vy: Math.sin(a) * BASE.bulletSpeed,
        r: 6, dmg, from: 'player', life: 1.6
      });
      flashes.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, color: '#6fa0ff', r: 26, life: 0.07, max: 0.07 });
      SND.shoot();
    } else if (w === 'swing') {
      cds.swing = BASE.swingCd;
      const a = p.angle;
      swingDir = -swingDir;
      slashes.push({ x: p.x, y: p.y, a, dir: swingDir, life: 0.2, max: 0.2 });
      sfx(320, 0.09, 'sawtooth', 0.035, -200);
      const reach = BASE.swingRange;
      for (const e of enemies) {
        if (e.dead || e.spawnT > 0 || e.ghost) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = hyp(dx, dy);
        if (d > reach + e.r) continue;
        let da = Math.atan2(dy, dx) - a;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > BASE.swingArc && d > e.r) continue;
        damageEnemy(e, dmg * 2.2, dx / (d || 1) * 220, dy / (d || 1) * 220, 0.35);
      }
      for (const b of bullets) {
        if (b.from !== 'enemy') continue;
        const dx = b.x - p.x, dy = b.y - p.y, d = hyp(dx, dy);
        if (d > reach + 6) continue;
        let da = Math.atan2(dy, dx) - a;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) <= BASE.swingArc) { b.life = 0; burst(b.x, b.y, b.color || '#e0157a', 2, 60); }
      }
    } else if (w === 'dash') {
      cds.dash = BASE.dashCd;
      p.dashVx = Math.cos(p.angle) * BASE.dashSpeed;
      p.dashVy = Math.sin(p.angle) * BASE.dashSpeed;
      p.dashT = BASE.dashTime;
      p.dashHits = new Set();
      p.inv = Math.max(p.inv, BASE.dashTime + 0.08);
      sfx(200, 0.15, 'triangle', 0.05, 500);
    }
  }

  function damageEnemy(e, dmg, kx, ky, friendlyMult) {
    e.hp -= dmg;
    e.hitFlash = 0.08;
    e.vx += kx; e.vy += ky;
    burst(e.x, e.y, PALETTES[e.kind].edge, 3, 80);
    sparks(e.x - kx * 0.25, e.y - ky * 0.25, '#ffab00', 6, Math.atan2(-ky, -kx), 1.1);
    flashes.push({ x: e.x, y: e.y, color: '#ffd740', r: e.r * 1.6, life: 0.06, max: 0.06 });
    if (e.kind === 'necessary') {
      floaters.push({ x: e.x, y: e.y - 26, text: 'FRIENDLY FIRE!', color: '#2e7d32', life: 0.9, max: 0.9 });
      SND.friendly();
      hurtPlayer(dmg * friendlyMult, undefined, undefined, true);
    } else {
      SND.hit();
    }
    if (e.hp <= 0 && !e.dead) killEnemy(e);
  }

  const LASER_WARN = 2;
  const LASER_ON = 0.45;
  function fireLaser(e, angle, dmg, color, width) {
    lasers.push({ owner: e, x: e.x, y: e.y, a: angle, warn: LASER_WARN, active: LASER_ON, dmg, color, width: width || 16, hit: false });
    sfx(900, 0.25, 'sine', 0.03, -500);
  }

  const PATTERNS = [
    { id: 'burst3', from: 1 },
    { id: 'heavy', from: 1 },
    { id: 'laser', from: 2 }
  ];
  const PATTERN_COLORS = { burst3: '#e0157a', heavy: '#d50000', laser: '#ff1744' };
  const BOSS_VARIANTS = ['ring6', 'laser4', 'leadBurst'];
  const BOSS_COLORS = { ring6: '#aa00ff', laser4: '#d500f9', leadBurst: '#6200ea' };

  const BOSS_PHASES = ['orbit', 'charge', 'teleport'];

  function bossNextPhase(e) {
    if (e.phase === 'charge' && e.windup <= 0 && e.chargesLeft > 0) {
      e.chargesLeft--;
      e.windup = 0.55; e.phaseT = 1.15;
      return;
    }
    e.ghost = false;
    let next;
    do { next = pick(BOSS_PHASES); } while (next === e.phase || (e.el && next === 'teleport'));
    if (next !== 'orbit' && Math.random() < 0.4) next = 'orbit';
    e.phase = next;
    if (next === 'orbit') { e.phaseT = 4.5; e.orbitA = Math.atan2(e.y - player.y, e.x - player.x) + Math.PI; e.orbitDir = Math.random() < 0.5 ? 1 : -1; }
    else if (next === 'charge') { e.phaseT = 1.25; e.windup = 0.8; e.chargesLeft = Math.random() < 0.5 ? 1 : 0; }
    else if (next === 'teleport') { e.phaseT = 1.3; e.fadeT = 0.45; sfx(300, 0.3, 'triangle', 0.05, 900); }
  }

  function bossFire(e, aim) {
    const col = BOSS_COLORS[e.variant];
    const fr = waveInfo.fireRate;
    if (e.variant === 'ring6') {
      e.spinA += rand(0.25, 0.45);
      const s = 230 * rand(0.95, 1.05);
      for (let i = 0; i < 6; i++) enemyShoot(e, e.spinA + i * Math.PI / 3, s, e.dmg, col, { r: 5 });
      e.fireCd = 0.75 / fr;
    } else if (e.variant === 'laser4') {
      for (let i = 0; i < 4; i++) fireLaser(e, aim + i * Math.PI / 2, e.dmg * 2.4, col, 20);
      e.fireCd = (LASER_WARN + LASER_ON + 0.9) / fr;
      return;
    } else {
      e.shots = 6 + Math.min(4, Math.floor(wave / 10));
      e.shotT = 0;
      e.burstSpeed = 300 * rand(0.95, 1.05);
      e.burstA = leadAim(e, e.burstSpeed);
      e.fireCd = 1.7 / fr;
      return;
    }
    SND.enemyShot();
  }

  function shooterFire(e, aim) {
    const col = PATTERN_COLORS[e.pattern];
    const fr = waveInfo.fireRate;
    switch (e.pattern) {
      case 'burst3':
        e.shots = 3; e.shotT = 0;
        e.fireCd = rand(0.85, 1.25) / fr;
        return;
      case 'heavy':
        enemyShoot(e, aim, e.bulletSpeed * rand(0.95, 1.05), e.dmg * 1.8, col, { lead: true, r: 8 });
        e.fireCd = rand(1.1, 1.5) / fr;
        sfx(320, 0.12, 'square', 0.04, -180);
        return;
      case 'laser':
        fireLaser(e, aim, e.dmg * 2.2, col, 14);
        e.fireCd = rand(2.6, 3.1) / fr;
        return;
    }
  }

  function shooterStream(e, dt) {
    if (e.shots <= 0) return;
    e.shotT -= dt;
    if (e.shotT > 0) return;
    e.shots--;
    if (e.kind === 'boss') {
      enemyShoot(e, e.burstA, e.burstSpeed, e.dmg, BOSS_COLORS[e.variant]);
      e.shotT = 0.08;
    } else {
      enemyShoot(e, Math.atan2(player.y - e.y, player.x - e.x), e.bulletSpeed * rand(1.15, 1.25), e.dmg, PATTERN_COLORS[e.pattern], { lead: true });
      e.shotT = 0.11;
    }
    SND.enemyShot();
  }

  function leadAim(e, speed) {
    const p = player;
    const vx = p.dashT > 0 ? 0 : p.vx, vy = p.dashT > 0 ? 0 : p.vy;
    const dx = p.x - e.x, dy = p.y - e.y;
    const a = vx * vx + vy * vy - speed * speed, b = 2 * (dx * vx + dy * vy), c = dx * dx + dy * dy;
    let t;
    if (Math.abs(a) < 1e-6) {
      t = b !== 0 ? -c / b : -1;
    } else {
      const disc = b * b - 4 * a * c;
      if (disc < 0) return Math.atan2(dy, dx);
      const r = Math.sqrt(disc), t1 = (-b - r) / (2 * a), t2 = (-b + r) / (2 * a);
      t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
    }
    if (!(t > 0)) return Math.atan2(dy, dx);
    t = Math.min(t, 2.5);
    return Math.atan2(dy + vy * t, dx + vx * t);
  }

  function enemyShoot(e, angle, speed, dmg, color, extra) {
    speed = Math.max(speed, BASE.speed * rand(1.12, 1.3));
    if (extra && extra.lead) {
      angle += leadAim(e, speed) - Math.atan2(player.y - e.y, player.x - e.x);
      extra = Object.assign({}, extra);
      delete extra.lead;
    }
    bullets.push(Object.assign({
      x: e.x + Math.cos(angle) * e.r, y: e.y + Math.sin(angle) * e.r,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      r: 3, dmg, from: 'enemy', life: 7, t: 0, color: color || '#e0157a'
    }, extra || {}));
    flashes.push({ x: e.x + Math.cos(angle) * e.r, y: e.y + Math.sin(angle) * e.r, color: color || '#e0157a', r: 22, life: 0.09, max: 0.09 });
  }

  function updateEnemies(dt) {
    const p = player;
    for (const e of enemies) {
      e.t += dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.contactCd = Math.max(0, e.contactCd - dt);
      if (e.spawnT > 0) { e.spawnT -= dt; continue; }

      const dx = p.x - e.x, dy = p.y - e.y, d = hyp(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      let tvx = 0, tvy = 0, steer = 2.5;
      const flow = e.kind !== 'necessary' && obstacles.length && segBlocked(e.x, e.y, p.x, p.y, e.r * 0.7) ? flowDir(e.x, e.y) : null;

      if (e.kind === 'necessary') {
        e.wanderA += rand(-1.5, 1.5) * dt;
        tvx = Math.cos(e.wanderA) * e.speed;
        tvy = Math.sin(e.wanderA) * e.speed;
        steer = 1.5;
      } else if (e.kind === 'chaser') {
        const wob = Math.sin(e.t * 3 + e.wanderA) * 0.35;
        tvx = (nx - ny * wob) * e.speed;
        tvy = (ny + nx * wob) * e.speed;
        steer = 2.2;
      } else if (e.kind === 'shooter') {
        const aim = Math.atan2(dy, dx);
        const qx = p.x < W / 2 ? 0 : W / 2, qy = p.y < H / 2 ? 0 : H / 2;
        const qw = W / 2, qh = H / 2, pad = e.r + 10;
        e.orbitA += dt * e.orbitDir * 0.5;
        if (Math.random() < dt * 0.3) e.orbitDir = -e.orbitDir;
        let gx = clamp(p.x + Math.cos(e.orbitA) * e.keep, qx + pad, qx + qw - pad);
        let gy = clamp(p.y + Math.sin(e.orbitA) * e.keep, qy + pad, qy + qh - pad);
        if (hyp(gx - p.x, gy - p.y) < e.keep * 0.7) {
          gx = p.x - qx < qw / 2 ? qx + qw - pad : qx + pad;
          gy = p.y - qy < qh / 2 ? qy + qh - pad : qy + pad;
        }
        const ox = gx - e.x, oy = gy - e.y, od = hyp(ox, oy) || 1;
        const sp = Math.min(e.speed * 1.8, od * 3);
        tvx = ox / od * sp; tvy = oy / od * sp;
        if (d < e.keep * 0.6) { tvx -= nx * e.speed; tvy -= ny * e.speed; }
        steer = 3;
        if (lasers.some(lz => lz.owner === e)) { tvx *= 0.15; tvy *= 0.15; }
        shooterStream(e, dt);
        e.fireCd -= dt;
        if (e.fireCd <= 0 && e.shots <= 0) { shooterFire(e, aim); if (e.nerf) e.fireCd *= e.nerf; }
      } else if (e.kind === 'boss') {
        const aim = Math.atan2(dy, dx);
        const rage = e.hp < e.maxHp * 0.4 ? 1.35 : 1;
        shooterStream(e, dt);
        e.phaseT -= dt * rage;
        if (e.phaseT <= 0) bossNextPhase(e);
        e.fireCd -= dt * rage;
        if (e.fireCd <= 0 && e.shots <= 0 && !e.ghost) { bossFire(e, aim); if (e.nerf) e.fireCd *= Math.sqrt(e.nerf); }
        steer = 2;
        if (e.phase === 'orbit') {
          e.orbitA += dt * 0.75 * e.orbitDir * rage;
          const ox = p.x - Math.cos(e.orbitA) * 260 - e.x, oy = p.y - Math.sin(e.orbitA) * 260 - e.y, od = hyp(ox, oy) || 1;
          const sp = Math.min(e.speed * 5, od * 2.5);
          tvx = ox / od * sp; tvy = oy / od * sp;
        } else if (e.phase === 'charge') {
          if (e.windup > 0) {
            e.windup -= dt * rage;
            e.chargeA = aim;
            steer = 6;
            if (e.windup <= 0) sfx(70, 0.4, 'sawtooth', 0.07, 60);
          } else {
            tvx = Math.cos(e.chargeA) * 600 * rage;
            tvy = Math.sin(e.chargeA) * 600 * rage;
            steer = 10;
          }
        } else if (e.phase === 'teleport') {
          if (e.fadeT > 0) {
            e.fadeT -= dt * rage;
            e.ghost = true;
            if (e.fadeT <= 0) {
              let tx, ty, tries = 0;
              do { tx = rand(80, W - 80); ty = rand(90, H - 80); tries++; } while (hyp(tx - p.x, ty - p.y) < 260 && tries < 30);
              e.x = tx; e.y = ty; e.vx = 0; e.vy = 0;
              e.ghost = false;
              e.appearT = 0.35;
              burst(e.x, e.y, BOSS_COLORS[e.variant], 24);
              sfx(1200, 0.25, 'triangle', 0.05, -1000);
            }
          }
          e.appearT = Math.max(0, (e.appearT || 0) - dt);
          tvx = 0; tvy = 0;
        }
        if (lasers.some(lz => lz.owner === e)) { tvx *= 0.2; tvy *= 0.2; }
      }

      if (flow && !(e.kind === 'boss' && e.phase !== 'orbit')) {
        const sp = e.kind === 'shooter' ? Math.max(e.speed * 1.3, 90) : e.kind === 'boss' ? e.speed * 3 : e.speed;
        tvx = flow.x * sp; tvy = flow.y * sp; steer = Math.max(steer, 4);
      }
      const k = Math.min(1, dt * steer);
      e.vx += (tvx - e.vx) * k;
      e.vy += (tvy - e.vy) * k;
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      if (e.x < e.r) { e.x = e.r; e.vx = Math.abs(e.vx); e.wanderA = Math.PI - e.wanderA; }
      if (e.x > W - e.r) { e.x = W - e.r; e.vx = -Math.abs(e.vx); e.wanderA = Math.PI - e.wanderA; }
      if (e.y < e.r + 14) { e.y = e.r + 14; e.vy = Math.abs(e.vy); e.wanderA = -e.wanderA; }
      if (e.y > H - e.r) { e.y = H - e.r; e.vy = -Math.abs(e.vy); e.wanderA = -e.wanderA; }
      if (obstacles.length && !e.ghost) {
        const hit = pushOut(e, e.r * 0.8);
        if (hit && e.kind === 'necessary') e.wanderA = Math.atan2(hit.c.ny, hit.c.nx) + rand(-1, 1);
      }

      if (e.kind !== 'necessary' && !e.ghost && d < e.r + p.r && e.contactCd <= 0) {
        e.contactCd = 0.8;
        hurtPlayer(e.touch, e.x, e.y);
        e.vx -= nx * 200; e.vy -= ny * 200;
      } else if (e.kind === 'necessary' && d < e.r + p.r) {
        p.x += nx * 2; p.y += ny * 2;
      }
      if (e.el) moveElement(e);
    }

    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (a.spawnT > 0) continue;
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (b.spawnT > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy), min = (a.r + b.r) * 0.8;
        if (d > 0 && d < min) {
          const push = (min - d) / 2, ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
        }
      }
    }
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      if (b.wob) {
        b.t += dt;
        const v = hyp(b.vx, b.vy) || 1, c = Math.cos(b.t * b.wf) * b.wob * b.wf / v;
        b.x += (b.vx - b.vy * c) * dt;
        b.y += (b.vy + b.vx * c) * dt;
      } else {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      b.life -= dt;
      if (b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) b.life = 0;
      if (b.life <= 0) continue;
      const wall = obstacles.length ? obstacleAt(b.x, b.y, b.r * 0.5) : null;
      if (wall) {
        b.life = 0;
        sparks(b.x, b.y, b.from === 'player' ? '#9cc2ff' : b.color, 5, Math.atan2(-b.vy, -b.vx), 1.2, 260);
        hitObstacle(wall);
        continue;
      }

      if (b.from === 'player') {
        for (const e of enemies) {
          if (e.dead || e.spawnT > 0 || e.ghost) continue;
          if (e.el ? Math.abs(e.x - b.x) < e.hw + b.r && Math.abs(e.y - b.y) < e.hh + b.r : hyp(e.x - b.x, e.y - b.y) < e.r + b.r) {
            b.life = 0;
            damageEnemy(e, b.dmg, b.vx * 0.05, b.vy * 0.05, 0.6);
            break;
          }
        }
      } else if (state === 'wave' && hyp(player.x - b.x, player.y - b.y) < player.r + b.r) {
        b.life = 0;
        hurtPlayer(b.dmg, b.x - b.vx, b.y - b.vy);
      }
    }
    bullets = bullets.filter(b => b.life > 0);
    if (enemies.some(e => e.dead)) {
      enemies = enemies.filter(e => !e.dead);
      updateBadge();
    }
  }

  function updatePowerups(dt) {
    for (const pu of powerups) {
      pu.life -= dt;
      pu.t += dt;
      const d = hyp(player.x - pu.x, player.y - pu.y);
      if (d < 70) {
        pu.x += (player.x - pu.x) * Math.min(1, dt * 5);
        pu.y += (player.y - pu.y) * Math.min(1, dt * 5);
      }
      if (d < player.r + 12) { pu.life = 0; applyPowerup(pu); }
    }
    powerups = powerups.filter(pu => pu.life > 0);
  }

  function text(str, x, y, size, color, align = 'center', font = 'CCSilk') {
    ctx.font = `${size}px ${font}, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  const TAG_COLORS = { necessary: '#2e7d32', chaser: '#b71c1c', shooter: '#5e35b1', boss: '#4a148c' };

  function drawElementEnemy(e) {
    const k = e.spawnT > 0 ? 1 - e.spawnT / 0.75 : 1;
    const col = e.kind === 'boss' ? (BOSS_COLORS[e.variant] || '#aa00ff') : PATTERN_COLORS[e.pattern] || '#e0157a';
    const pulse = 0.55 + Math.sin(e.t * 6) * 0.25;
    ctx.save();
    ctx.globalAlpha = k * pulse;
    ctx.strokeStyle = col;
    ctx.lineWidth = e.kind === 'boss' ? 4 : 2;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -e.t * 30;
    const pad = 4 + (1 - k) * 20;
    ctx.strokeRect(Math.round(e.x - e.hw - pad) + 0.5, Math.round(e.y - e.hh - pad) + 0.5, Math.round(e.hw * 2 + pad * 2), Math.round(e.hh * 2 + pad * 2));
    ctx.setLineDash([]);
    if (e.hitFlash > 0) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffd740';
      ctx.fillRect(e.x - e.hw, e.y - e.hh, e.hw * 2, e.hh * 2);
    }
    ctx.restore();
    if (e.spawnT > 0) return;
    if (e.nerf > 4 && e.kind !== 'boss' && e.hp >= e.maxHp) return;
    const fs = e.kind === 'boss' ? 10 : 8;
    const label = e.kind === 'boss' ? `BOSS ${e.name}` : e.name;
    ctx.font = `${fs}px CCSilk, monospace`;
    const tw = Math.ceil(ctx.measureText(label).width) + 6;
    const ty = Math.round(e.y - e.hh - 12);
    ctx.fillStyle = e.kind === 'boss' ? TAG_COLORS.boss : col;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(Math.round(e.x - tw / 2), ty - fs / 2 - 2, tw, fs + 3);
    ctx.globalAlpha = 1;
    text(label, Math.round(e.x), ty, fs, '#fff');
    if (e.hp < e.maxHp) {
      const bw = Math.max(30, Math.min(140, e.hw * 2));
      const by = Math.round(e.y + e.hh + 6);
      ctx.fillStyle = '#333';
      ctx.fillRect(Math.round(e.x - bw / 2) - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = '#e53935';
      ctx.fillRect(Math.round(e.x - bw / 2), by, Math.max(0, bw * e.hp / e.maxHp), 3);
    }
  }

  function drawEnemy(e) {
    if (e.el) return drawElementEnemy(e);
    const spr = SPRITES[e.kind];
    const size = 14 * e.scale;
    if (e.spawnT > 0) {
      const k = 1 - e.spawnT / 0.75;
      ctx.save();
      ctx.strokeStyle = TAG_COLORS[e.kind];
      ctx.setLineDash([3, 4]);
      ctx.lineDashOffset = -k * 30;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (0.3 + k * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      const g = Math.round(size * (1 - Math.pow(1 - k, 3)));
      if (g > 0) ctx.drawImage(spr.img, Math.round(e.x - g / 2), Math.round(e.y - g / 2), g, g);
      return;
    }

    if (e.kind === 'boss' && e.phase === 'charge' && e.windup > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(220,0,60,${0.35 + Math.sin(e.t * 40) * 0.25})`;
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.chargeA) * 2000, e.y + Math.sin(e.chargeA) * 2000);
      ctx.stroke();
      ctx.restore();
    }
    let alpha = 1;
    if (e.kind === 'boss') {
      if (e.ghost) alpha = clamp(e.fadeT / 0.45, 0, 1) * 0.8;
      else if (e.appearT > 0) alpha = 1 - e.appearT / 0.35 * 0.7;
    }
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(Math.round(e.x), Math.round(e.y));
    if (e.kind === 'chaser') ctx.rotate(Math.sin(e.t * 10) * 0.12);
    if (e.kind === 'boss' && ((e.phase === 'charge' && e.windup > 0))) ctx.translate(rand(-2, 2), rand(-2, 2));
    if (e.kind === 'necessary') {
      ctx.strokeStyle = 'rgba(46,125,50,.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 3 + Math.sin(e.t * 3) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.drawImage(e.hitFlash > 0 ? spr.flash : spr.img, -size / 2, -size / 2, size, size);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (e.ghost) return;

    const label = e.kind === 'boss' ? `${e.name} @ ${e.domain}` : `${e.name} ${e.domain}`;
    const fs = e.kind === 'boss' ? 10 : 8;
    ctx.font = `${fs}px CCSilk, monospace`;
    const tw = Math.ceil(ctx.measureText(label).width) + 6;
    const ty = Math.round(e.y - size / 2 - (e.kind === 'boss' ? 14 : 10));
    ctx.fillStyle = TAG_COLORS[e.kind];
    ctx.globalAlpha = 0.85;
    ctx.fillRect(Math.round(e.x - tw / 2), ty - fs / 2 - 2, tw, fs + 3);
    ctx.globalAlpha = 1;
    text(label, Math.round(e.x), ty, fs, '#fff');

    if (e.hp < e.maxHp) {
      const bw = e.kind === 'boss' ? 120 : Math.max(24, size);
      const by = Math.round(e.y + size / 2 + 4);
      ctx.fillStyle = '#333';
      ctx.fillRect(Math.round(e.x - bw / 2) - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = e.kind === 'necessary' ? '#43a047' : '#e53935';
      ctx.fillRect(Math.round(e.x - bw / 2), by, Math.max(0, bw * e.hp / e.maxHp), 3);
    }
  }

  const CURSOR = [[0, 0], [0, 17], [4, 13], [7, 20], [10, 19], [7, 12], [12, 12]];
  const CURSOR_CENTER = [4, 10];
  const CURSOR_ANGLE = Math.atan2(-CURSOR_CENTER[1], -CURSOR_CENTER[0]);

  function cursorPath() {
    ctx.beginPath();
    CURSOR.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }

  function drawGhosts() {
    for (const g of ghosts) {
      ctx.save();
      ctx.globalAlpha = g.life / g.max * 0.45;
      ctx.translate(g.x, g.y);
      ctx.rotate(g.angle - CURSOR_ANGLE);
      ctx.scale(1.3, 1.3);
      ctx.translate(-CURSOR_CENTER[0], -CURSOR_CENTER[1]);
      cursorPath();
      ctx.fillStyle = '#7fa7ff';
      ctx.fill();
      ctx.restore();
    }
  }

  const SWORD_MAP = {
    pal: { P: '#ffb300', H: '#6d4c41', G: '#ffca28', g: '#c48b00', E: '#455a64', S: '#b0bec5', W: '#ffffff' },
    rows: [
      '....G.................',
      '....GEEEEEEEEEEEEEE...',
      'PHHHGSSSSSSSSSSSSSSEE.',
      'PHHHGWWWWWWWWWWWWWWSSE',
      'PHHHgSSSSSSSSSSSSSSEE.',
      '....gEEEEEEEEEEEEEE...',
      '....g.................'
    ]
  };
  const SWORD = makeIcon(SWORD_MAP);

  function drawSlashes() {
    for (const sl of slashes) {
      const t = 1 - sl.life / sl.max;
      const k = 1 - Math.pow(1 - Math.min(1, t * 1.4), 3);
      const sweep = BASE.swingArc;
      const from = sl.a - sweep * sl.dir;
      const cur = from + sweep * 2 * sl.dir * k;
      const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;

      const inner = 30, outer = BASE.swingRange;
      const span = Math.abs(cur - from);
      const steps = Math.max(1, Math.ceil(span * outer / 5));
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const ang = from + (cur - from) * f;
        ctx.globalAlpha = Math.pow(f, 1.6) * 0.9 * fade;
        for (let r = inner; r <= outer; r += 5) {
          const px = Math.round((sl.x + Math.cos(ang) * r) / 5) * 5;
          const py = Math.round((sl.y + Math.sin(ang) * r) / 5) * 5;
          ctx.fillStyle = r >= outer - 5 ? '#ffffff' : r >= outer - 20 ? '#bcd3f7' : '#6f9df5';
          ctx.fillRect(px - 3, py - 3, 6, 6);
        }
      }
      ctx.globalAlpha = fade;
      ctx.save();
      ctx.translate(Math.round(sl.x), Math.round(sl.y));
      ctx.rotate(cur);
      const sc = 3;
      ctx.drawImage(SWORD, 6, -Math.floor(SWORD.height * sc / 2), SWORD.width * sc, SWORD.height * sc);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function drawLasers() {
    for (const lz of lasers) {
      const L = rayLength(lz.x, lz.y, lz.a);
      const ex = lz.x + Math.cos(lz.a) * L, ey = lz.y + Math.sin(lz.a) * L;
      ctx.save();
      ctx.lineCap = 'round';
      if (lz.warn > 0) {
        const k = 1 - lz.warn / LASER_WARN;
        const blink = lz.warn < 0.5 ? (Math.floor(lz.warn * 16) % 2 ? 1 : 0.35) : 0.55 + Math.sin(k * 30) * 0.2;
        ctx.globalAlpha = (0.25 + k * 0.6) * blink;
        ctx.strokeStyle = lz.color;
        ctx.lineWidth = 1 + k * (lz.width - 6);
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -fxT * 90;
        ctx.save();
        ctx.strokeStyle = 'rgba(30,0,40,.35)';
        ctx.lineWidth += 3;
        ctx.beginPath(); ctx.moveTo(lz.x, lz.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.restore();
        ctx.beginPath(); ctx.moveTo(lz.x, lz.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        if (lz.warn < 0.6) {
          ctx.globalAlpha = 0.5 + 0.5 * blink;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(lz.x, lz.y); ctx.lineTo(ex, ey); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 + 0.5 * k;
        drawGlow(lz.x, lz.y, 14 + k * 46, lz.color);
        drawGlow(lz.x, lz.y, 6 + k * 14, '#ffffff');
        ctx.fillStyle = lz.color;
        for (let i = 0; i < 7; i++) {
          const ph = (fxT * 1.8 + i / 7) % 1;
          const ang = i * 0.9 + fxT * 4, rad = 55 * (1 - ph);
          ctx.globalAlpha = ph * (0.4 + 0.6 * k);
          ctx.fillRect(Math.round(lz.x + Math.cos(ang) * rad) - 2, Math.round(lz.y + Math.sin(ang) * rad) - 2, 4, 4);
        }
      } else {
        const f = lz.active / LASER_ON;
        const w = lz.width * (0.7 + 0.5 * f) + rand(-2, 2);
        ctx.globalAlpha = 0.5 * f + 0.15;
        ctx.strokeStyle = 'rgba(30,0,40,.6)';
        ctx.lineWidth = w * 1.3 + 5;
        ctx.beginPath(); ctx.moveTo(lz.x, lz.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = 0.3 * f + 0.08;
        ctx.strokeStyle = lz.color;
        ctx.lineWidth = w * 2.6;
        ctx.beginPath(); ctx.moveTo(lz.x, lz.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = 0.85 * f + 0.15;
        ctx.lineWidth = w * 1.3;
        ctx.beginPath(); ctx.moveTo(lz.x, lz.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = w * 0.5;
        ctx.beginPath(); ctx.moveTo(lz.x, lz.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = 0.6 * f + 0.2;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        const nx = -Math.sin(lz.a), ny = Math.cos(lz.a);
        for (let d = 0; d <= L; d += 18) {
          const o = Math.sin(d * 0.08 - fxT * 40) * w * 0.7;
          const px = lz.x + Math.cos(lz.a) * d + nx * o, py = lz.y + Math.sin(lz.a) * d + ny * o;
          d ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = f * 0.8 + 0.2;
        drawGlow(ex, ey, w * 4, lz.color);
        drawGlow(ex, ey, w * 1.6, '#ffffff');
        drawGlow(lz.x, lz.y, w * 3.5, lz.color);
        drawGlow(lz.x, lz.y, w * 1.4, '#ffffff');
      }
      ctx.restore();
    }
  }

  function drawPlayer() {
    const p = player;
    if (state === 'dead') return;
    if (p.inv > 0 && p.dashT <= 0 && state === 'wave' && Math.floor(p.inv * 20) % 2) return;
    const moving = hyp(p.vx, p.vy) > 30;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle - CURSOR_ANGLE);
    ctx.scale(1.3, 1.3);
    ctx.translate(-CURSOR_CENTER[0], -CURSOR_CENTER[1]);
    if (moving) {
      ctx.fillStyle = Math.random() < 0.5 ? '#ff9800' : '#ffeb3b';
      const fl = rand(3, 7);
      ctx.fillRect(7, 20, 3, fl);
    }
    cursorPath();
    ctx.fillStyle = p.dashT > 0 ? '#dfe9ff' : '#fff';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.restore();
  }

  function drawPowerup(pu) {
    if (pu.life < 3 && Math.floor(pu.life * 8) % 2) return;
    const y = pu.y + Math.sin(pu.t * 4) * 3;
    const c = POWER_COLORS[pu.type];
    const img = ICONS[pu.type];
    const sc = 3, w = img.width * sc, h = img.height * sc;
    ctx.globalAlpha = 0.35 + Math.sin(pu.t * 6) * 0.15;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(pu.x, y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.drawImage(img, Math.round(pu.x - w / 2), Math.round(y - h / 2), w, h);
  }

  function hudBlocked() {
    const x0 = 0, y0 = 20, x1 = 250, y1 = 90;
    const near = (x, y, r) => x + r > x0 && x - r < x1 && y + r > y0 && y - r < y1;
    if (player && near(player.x, player.y, player.r)) return true;
    return enemies.some(e => near(e.x, e.y, e.r + 14));
  }

  let hudAlpha = 1;
  function drawHud() {
    hudAlpha += ((hudBlocked() ? 0.25 : 1) - hudAlpha) * 0.2;
    ctx.globalAlpha = hudAlpha;
    const pad = 10;
    const bw = 150;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(pad - 4, pad + 22, bw + 70, 40);
    ctx.strokeStyle = '#9fb3d3';
    ctx.strokeRect(pad - 3.5, pad + 22.5, bw + 69, 39);
    text(`WAVE ${wave}`, pad + 2, pad + 32, 10, '#1851ce', 'left');
    text(`SCORE ${score}`, pad + bw + 62, pad + 32, 8, '#444', 'right');
    const pct = clamp(player.hp / player.maxHp, 0, 1);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(pad + 2, pad + 44, bw, 10);
    const segs = Math.floor(bw / 6);
    ctx.fillStyle = pct < 0.3 ? '#d8402a' : '#3fbf3f';
    for (let i = 0; i < segs * pct; i++) ctx.fillRect(pad + 3 + i * 6, pad + 45, 5, 8);
    text(`${Math.ceil(player.hp)}/${player.maxHp}`, pad + bw + 8, pad + 49, 8, '#333', 'left');
    ctx.globalAlpha = 1;
  }

  const glowCache = new Map();
  function hexRgb(c) {
    let m = /^#([0-9a-f]{6})$/i.exec(c);
    if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    m = /^#([0-9a-f]{3})$/i.exec(c);
    if (m) return m[1].split('').map(h => parseInt(h + h, 16));
    m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) return m[1].split(',').slice(0, 3).map(v => parseFloat(v));
    return [255, 255, 255];
  }
  function glowSprite(color) {
    let cv = glowCache.get(color);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const [r, gg, b] = hexRgb(color);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${r},${gg},${b},1)`);
    grad.addColorStop(0.25, `rgba(${r},${gg},${b},0.55)`);
    grad.addColorStop(0.6, `rgba(${r},${gg},${b},0.15)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowCache.set(color, cv);
    return cv;
  }
  function drawGlow(x, y, r, color) {
    if (r <= 0) return;
    ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  }

  function drawLighting() {
    ctx.fillStyle = pageDark ? (state === 'wave' ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.1)') : (state === 'wave' ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.12)');
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    for (const lz of lasers) {
      if (lz.warn > 0) continue;
      const L = rayLength(lz.x, lz.y, lz.a);
      ctx.globalAlpha = 0.16 * (lz.active / LASER_ON) + 0.05;
      for (let d = 0; d <= L; d += 50) drawGlow(lz.x + Math.cos(lz.a) * d, lz.y + Math.sin(lz.a) * d, 70, lz.color);
    }
    for (const f of flashes) {
      ctx.globalAlpha = 0.35 * f.life / f.max;
      drawGlow(f.x, f.y, f.r * 2.4, f.color);
    }
    ctx.restore();
  }

  function drawBullets() {
    ctx.lineCap = 'round';
    for (const b of bullets) {
      if (b.from === 'player') {
        for (let i = 3; i >= 1; i--) {
          ctx.globalAlpha = 0.35 / i;
          ctx.fillStyle = '#4f86f7';
          const s = 12 - i * 2;
          ctx.fillRect(Math.round(b.x - b.vx * 0.014 * i) - s / 2, Math.round(b.y - b.vy * 0.014 * i) - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0d3a9e';
        ctx.fillRect(Math.round(b.x) - 6, Math.round(b.y) - 6, 12, 12);
        ctx.fillStyle = '#4f86f7';
        ctx.fillRect(Math.round(b.x) - 4, Math.round(b.y) - 4, 8, 8);
        ctx.fillStyle = '#dfe9ff';
        ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 2, 4, 4);
      } else {
        const sp = hyp(b.vx, b.vy) || 1, tl = b.r * 5;
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.r * 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx / sp * tl, b.y - b.vy / sp * tl);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(30,0,40,.55)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(1.2, b.r * 0.55), 0, Math.PI * 2);
        ctx.fill();
        if (b.r >= 7) {
          ctx.strokeStyle = b.color;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 5]);
          ctx.lineDashOffset = -fxT * 40;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + 5 + Math.sin(fxT * 20) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawGlowPass() {
    if (lowFx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const e of enemies) {
      if (e.kind === 'boss' && e.spawnT <= 0) {
        ctx.globalAlpha = 0.28 + Math.sin(fxT * 4) * 0.08;
        drawGlow(e.x, e.y, e.r * 3, BOSS_COLORS[e.variant] || '#aa00ff');
      } else if (e.hitFlash > 0) {
        ctx.globalAlpha = 0.6;
        drawGlow(e.x, e.y, e.r * 2, '#ffd740');
      }
    }
    for (const b of bullets) {
      if (b.from === 'player') { ctx.globalAlpha = 0.55; drawGlow(b.x, b.y, 26, '#4f86f7'); }
      else { ctx.globalAlpha = 0.5; drawGlow(b.x, b.y, b.r * 5 + 6, b.color); }
    }
    for (const p of particles) {
      if (!p.spark) continue;
      ctx.globalAlpha = clamp(p.life / p.max * 1.4, 0, 1);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    for (const r of rings) {
      const t = 1 - r.life / r.max;
      const rad = r.r + (r.rmax - r.r) * (1 - Math.pow(1 - t, 3));
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1, r.w * (1 - t));
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const f of flashes) {
      ctx.globalAlpha = f.life / f.max;
      drawGlow(f.x, f.y, f.r, f.color);
      drawGlow(f.x, f.y, f.r * 0.4, '#fff176');
    }
    if (state !== 'dead' && player) {
      ctx.globalAlpha = player.dashT > 0 ? 0.7 : 0.3;
      drawGlow(player.x, player.y, player.dashT > 0 ? 50 : 34, '#7fa7ff');
    }
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    fxT += 1 / 60;
    if (state === 'boot' || !player) return;

    ctx.save();
    if (shake > 0 && !reducedMotion) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);

    drawLighting();
    drawHud();

    for (const pu of powerups) drawPowerup(pu);
    for (const e of enemies) if (e.kind === 'necessary') drawEnemy(e);
    for (const e of enemies) if (e.kind !== 'necessary') drawEnemy(e);

    drawBullets();

    for (const p of particles) {
      if (p.spark) continue;
      ctx.globalAlpha = clamp(p.life / p.max * 1.5, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    drawLasers();
    drawGhosts();
    drawSlashes();
    drawPlayer();
    drawGlowPass();

    for (const f of floaters) {
      ctx.globalAlpha = clamp(f.life / f.max * 2, 0, 1);
      if (f.big) {
        text(f.text, f.x + 2, f.y + 2, 22, 'rgba(0,0,0,.25)');
        text(f.text, f.x, f.y, 22, f.color);
      } else {
        text(f.text, f.x, f.y, 8, f.color);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (flashRed > 0) {
      const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) / 2);
      grad.addColorStop(0, 'rgba(220,30,30,0)');
      grad.addColorStop(1, `rgba(220,30,30,${Math.min(0.55, flashRed * 1.6)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }
    if (whiteFlash > 0 && !reducedMotion) {
      ctx.fillStyle = `rgba(255,236,179,${whiteFlash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (state === 'idle' && panelHidden() && floaters.every(f => !f.big)) {
      const a = 0.6 + Math.sin(idleHintT * 3) * 0.4;
      ctx.globalAlpha = a;
      text(`Press ENTER to start wave ${wave}`, W / 2, H - 92, 9, '#1851ce');
      ctx.globalAlpha = 1;
    }
    if (state === 'wave' && countdown > 0) {
      ctx.fillStyle = `rgba(0,0,0,${0.55 * Math.min(1, countdown / 0.3)})`;
      ctx.fillRect(0, 0, W, H);
      const n = Math.ceil(countdown);
      const f = countdown - Math.floor(countdown) || 1;
      ctx.globalAlpha = Math.min(1, f * 2);
      text(String(n), W / 2, H / 2, Math.round(40 + (1 - f) * 24), '#fff');
      ctx.globalAlpha = 1;
    }
    if (state === 'wave' && paused) {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  let running = false;
  let last = performance.now();
  let rafId = 0;
  let remeasureT = 0;
  const savedOverflow = { html: '', body: '' };

  function frame(now) {
    if (!running) return;
    const raw = (now - last) / 1000;
    const dt = Math.min(0.05, raw);
    last = now;
    if (!lowFx && raw < 0.2) {
      slowT = raw > 0.028 ? slowT + raw : Math.max(0, slowT - raw * 0.5);
      if (slowT > 3) { lowFx = true; resize(); }
    }
    remeasureT -= dt;
    if (remeasureT <= 0) { remeasureT = 1; measureObstacles(); }
    update(dt);
    render();
    updateWeaponUi();
    rafId = requestAnimationFrame(frame);
  }

  async function loadFont() {
    if (!hasChrome) return;
    try {
      const url = await chrome.runtime.sendMessage({ cc: 'font' });
      if (!url) return;
      const bin = atob(url.slice(url.indexOf(',') + 1));
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const face = new FontFace('CCSilk', buf);
      await face.load();
      document.fonts.add(face);
    } catch {}
  }

  function isPageDark() {
    for (const el of [document.body, document.documentElement]) {
      if (!el) continue;
      const [r, g, b] = hexRgb(getComputedStyle(el).backgroundColor);
      if (visibleAlpha(getComputedStyle(el).backgroundColor) > 0.5) return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.4;
    }
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && getComputedStyle(document.documentElement).colorScheme.includes('dark'));
  }

  function start(opts) {
    if (running) return status();
    if (opts && typeof opts.sound === 'boolean') prefs.sound = opts.sound;
    mode = opts && opts.mode === 'elements' ? 'elements' : 'cookies';
    pageDark = isPageDark();
    elementSpecs = [];
    if (mode === 'elements') {
      const els = detectEnemyElements();
      if (els.length) {
        let bossEl = null;
        if (els.length <= 6) bossEl = els.reduce((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return rb.width * rb.height > ra.width * ra.height ? b : a; });
        elementSpecs = els.map(el => ({ el, kind: el === bossEl ? 'boss' : 'shooter', count: els.length }));
      } else {
        mode = 'cookies';
      }
    }
    pageEls = mode === 'elements' ? [] : detectElements();
    savedOverflow.html = document.documentElement.style.overflow;
    savedOverflow.body = document.body ? document.body.style.overflow : '';
    document.documentElement.style.overflow = 'hidden';
    if (document.body) document.body.style.overflow = 'hidden';
    document.documentElement.appendChild(host);
    running = true;
    resize();
    player = newPlayer();
    resetGame();
    if (opts && opts.mode === 'elements' && mode === 'cookies') floaters.push({ x: W / 2, y: H * 0.45, text: 'NOTHING TO ANIMATE - COOKIES INSTEAD', color: '#666', life: 2.5, max: 2.5 });
    else if (mode === 'cookies' && !obstacles.length) floaters.push({ x: W / 2, y: H * 0.45, text: 'NO PAGE ELEMENTS FOUND - OPEN ARENA', color: '#666', life: 2.5, max: 2.5 });
    window.addEventListener('resize', resize, sig);
    last = performance.now();
    rafId = requestAnimationFrame(frame);
    setTimeout(() => { if (running && state === 'idle') startWave(); }, 300);
    return status();
  }

  function end() {
    if (!running) { cleanup(); return status(); }
    running = false;
    state = 'ended';
    cancelAnimationFrame(rafId);
    restoreElements();
    restoreObstacles();
    cleanup();
    return status();
  }

  function cleanup() {
    ac.abort();
    host.remove();
    document.documentElement.style.overflow = savedOverflow.html;
    if (document.body) document.body.style.overflow = savedOverflow.body;
    if (hasChrome) { try { chrome.runtime.sendMessage({ cc: 'badge', text: '' }).catch(() => {}); } catch {} }
    if (hasChrome && chrome.runtime.onMessage) chrome.runtime.onMessage.removeListener(onMessage);
    window.__cookieCrusher = null;
  }

  function status() {
    return { running, mode, state, wave, score, hp: player ? Math.ceil(player.hp) : 0, maxHp: player ? player.maxHp : 0, walls: obstacles.length, paused };
  }

  function onMessage(msg, sender, reply) {
    if (!msg || !msg.cc) return;
    if (msg.cc === 'start') reply(start(msg));
    else if (msg.cc === 'end') reply(end());
    else if (msg.cc === 'next') { if (state === 'idle') startWave(); reply(status()); }
    else if (msg.cc === 'sound') { prefs.sound = !!msg.on; reply(status()); }
    else if (msg.cc === 'status') reply(status());
  }

  if (hasChrome && chrome.runtime.onMessage) chrome.runtime.onMessage.addListener(onMessage);
  loadFont();
  window.__cookieCrusher = { start, end, status };
})();
