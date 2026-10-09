(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const DB = window.COOKIE_DB;
  const SAVE_KEY = 'cookieCrusher.save.v1';
  const PREF_KEY = 'cookieCrusher.prefs.v1';

  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const viewport = $('viewport');
  const popup = $('popup');
  const extBtn = $('extBtn');
  const badge = $('badge');
  const statusEl = $('status');
  const tabIcon = $('tabIcon');

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hyp = (x, y) => Math.sqrt(x * x + y * y);

  let W = 0, H = 0;

  function resize() {
    const r = viewport.getBoundingClientRect();
    W = r.width;
    H = r.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
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

  /* ---------- storage ---------- */

  function storeGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function storeSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  function storeDel(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  const prefs = Object.assign({ sound: true }, storeGet(PREF_KEY) || {});

  /* ---------- sound ---------- */

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
    } catch (e) { /* no audio */ }
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
    dead: () => { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => sfx(f, 0.22, 'sawtooth', 0.05), i * 160)); },
    save: () => sfx(1200, 0.08, 'triangle', 0.05)
  };

  /* ---------- pixel sprites ---------- */

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

  function paintIcon(cv) {
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 16, 16);
    g.drawImage(SPRITES.chaser.img, 1, 1);
    g.strokeStyle = '#c00';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(2, 2); g.lineTo(14, 14);
    g.stroke();
  }
  paintIcon($('extIcon'));
  paintIcon($('popIcon'));

  /* ---------- pixel icons ---------- */

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
  document.querySelectorAll('.wbtn').forEach(btn => {
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
    const wb = $('weapons');
    if (player && wb) {
      const vr = viewport.getBoundingClientRect(), r = wb.getBoundingClientRect();
      const x0 = r.left - vr.left - 10, x1 = r.right - vr.left + 10, y0 = r.top - vr.top - 10, y1 = r.bottom - vr.top + 10;
      const near = (x, y, rr) => x + rr > x0 && x - rr < x1 && y + rr > y0 && y - rr < y1;
      wb.classList.toggle('faded', near(player.x, player.y, player.r) || enemies.some(e => near(e.x, e.y, e.r)));
    }
    const hidden = popup.classList.contains('hidden');
    const show = hidden && (state === 'idle' || state === 'wave');
    extBtn.classList.toggle('pulse', show && state === 'idle');
    extBtn.classList.toggle('pulse-soft', show && state === 'wave');
  }

  /* ---------- game state ---------- */

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
  let spawnQueue = [], spawnTimer = 0, waveInfo = null;
  let shake = 0, flashRed = 0;
  let loadedThisWave = 0, domainsThisWave = new Set();
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
      shooterFrac: Math.min(0.5, 0.18 + 0.03 * w),
      necessary: Math.min(8, 2 + Math.floor(w / 2)),
      boss: w % 5 === 0,
      interval: Math.max(0.22, 1.1 - 0.05 * w),
      fireRate: 1 + 0.05 * (w - 1)
    };
  }

  /* ---------- input ---------- */

  const keys = {};
  const mouse = { x: 0, y: 0, down: false, inside: false };
  const touch = { active: false, x: 0, y: 0, dashReq: false };

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') return;
    keys[k] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (k === 'escape' || k === 'p') togglePopup();
    if ((k === 'enter' || k === 'n') && state === 'idle') startWave();
    if (k === '1') setWeapon('swing');
    if (k === '2') setWeapon('shoot');
    if (k === '3') setWeapon('dash');
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    mouse.down = false;
    if (state === 'wave' && !paused) openPopup();
  });

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  canvas.addEventListener('mousemove', e => { const p = canvasPos(e); mouse.x = p.x; mouse.y = p.y; mouse.inside = true; });
  canvas.addEventListener('mouseleave', () => { mouse.inside = false; });
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (!popup.classList.contains('hidden')) { closePopup(); return; }
    const p = canvasPos(e); mouse.x = p.x; mouse.y = p.y; mouse.down = true;
  });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!popup.classList.contains('hidden')) { closePopup(); return; }
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

  /* ---------- popup / UI ---------- */

  function openPopup(msg, cls) {
    if (state === 'boot' || state === 'dead') return;
    if (msg !== undefined) setPopMsg(msg, cls);
    popup.classList.remove('hidden');
    extBtn.classList.add('open');
    extBtn.classList.remove('pulse');
    if (state === 'wave') paused = true;
    refreshPopup();
  }
  function closePopup() {
    popup.classList.add('hidden');
    extBtn.classList.remove('open');
    paused = false;
    mouse.down = false;
  }
  function togglePopup() {
    if (popup.classList.contains('hidden')) openPopup(); else closePopup();
  }
  function setPopMsg(msg, cls) {
    const el = $('popMsg');
    el.textContent = msg || '';
    el.className = 'pop-msg' + (cls ? ' ' + cls : '');
  }

  function refreshPopup() {
    const save = storeGet(SAVE_KEY);
    $('pWave').textContent = wave + (waveParams(wave).boss ? ' (boss)' : '');
    $('pState').textContent = state === 'wave' ? (paused ? 'Paused' : 'Under attack') : state === 'idle' ? 'Ready' : '...';
    const hpPct = player ? clamp(player.hp / player.maxHp, 0, 1) : 1;
    const bar = $('pHp');
    bar.style.width = (hpPct * 100).toFixed(0) + '%';
    bar.classList.toggle('low', hpPct < 0.3);
    $('pHpTxt').textContent = player ? `${Math.ceil(player.hp)}/${player.maxHp}` : '';
    $('pDmg').innerHTML = `x${dmgMultFor(stacks.dmg).toFixed(2)} <small>(${stacks.dmg} upgrades)</small>`;
    $('pSpd').innerHTML = `x${spdMultFor(stacks.spd).toFixed(2)} <small>(${stacks.spd} upgrades)</small>`;
    $('pScore').textContent = score.toLocaleString();
    const start = $('btnStart');
    start.disabled = state !== 'idle' && !(state === 'wave' && paused);
    start.textContent = state === 'wave' ? `Resume wave ${wave}` : `Start wave ${wave}`;
    const load = $('btnLoad');
    load.disabled = !save;
    load.textContent = save ? `Load save (wave ${save.wave})` : 'No save yet';
    $('chkSound').checked = !!prefs.sound;
  }

  extBtn.addEventListener('click', togglePopup);
  popup.addEventListener('click', e => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') setTimeout(() => e.target.blur(), 0);
  });
  $('btnStart').addEventListener('click', () => {
    if (state === 'idle') startWave();
    else if (state === 'wave') closePopup();
  });
  $('btnSave').addEventListener('click', () => {
    const data = { wave, stacks: { ...stacks }, score, savedAt: Date.now() };
    if (storeSet(SAVE_KEY, data)) {
      SND.save();
      setPopMsg(`Progress saved at wave ${wave}. It will still be here after you reload.`, 'good');
    } else {
      setPopMsg('Could not save: this browser is blocking storage.', 'bad');
    }
    refreshPopup();
  });
  $('btnLoad').addEventListener('click', () => {
    const save = storeGet(SAVE_KEY);
    if (!save) return;
    loadFrom(save);
    setPopMsg(`Loaded your save. Wave ${wave} is ready.`, 'good');
    refreshPopup();
  });
  $('btnClear').addEventListener('click', () => {
    if (!window.confirm('Clear browsing data?\n\nThis deletes your saved wave and starts over at wave 1.')) return;
    storeDel(SAVE_KEY);
    resetGame();
    setPopMsg('Browsing data cleared. Back to wave 1.', '');
    refreshPopup();
  });
  $('chkSound').addEventListener('change', e => {
    prefs.sound = e.target.checked;
    storeSet(PREF_KEY, prefs);
  });
  $('reloadBtn').addEventListener('click', () => window.location.reload());
  document.addEventListener('mousedown', e => {
    if (popup.classList.contains('hidden')) return;
    if (popup.contains(e.target) || extBtn.contains(e.target) || e.target === canvas) return;
    closePopup();
  });

  $('snapReload').addEventListener('click', () => {
    const save = storeGet(SAVE_KEY);
    $('awsnap').classList.add('hidden');
    if (save) loadFrom(save); else resetGame();
    state = 'idle';
    openPopup(save ? `Reloaded from your save at wave ${save.wave}.` : 'No save found, so you are back at wave 1.', save ? 'good' : '');
  });
  $('snapReset').addEventListener('click', () => {
    $('awsnap').classList.add('hidden');
    resetGame();
    state = 'idle';
    openPopup('Fresh start at wave 1. Remember to save between waves.', '');
  });

  function setStatus(text) {
    if (!text) { statusEl.classList.add('hidden'); return; }
    statusEl.textContent = text;
    statusEl.classList.remove('hidden');
  }

  function updateBadge() {
    const n = enemies.filter(e => e.kind !== 'necessary').length + spawnQueue.filter(s => s.kind !== 'necessary').length;
    badge.textContent = n > 999 ? '999+' : String(n);
    badge.classList.toggle('zero', n === 0);
  }

  /* ---------- page obstacles ---------- */

  const OBST_HP = 5;
  const CELL = 20;
  let obstacles = [];
  const nav = { cols: 0, rows: 0, blocked: null, dist: null, t: 0 };

  function obstacleEls() {
    return [...document.querySelectorAll('.glogo span, #gq, .gside, .gbtns button, .gpromo')];
  }

  function obstacleColor(el) {
    if (el.parentElement && el.parentElement.classList.contains('glogo')) return getComputedStyle(el).color;
    if (el.tagName === 'INPUT') return '#7e9db9';
    if (el.tagName === 'BUTTON') return '#b5b5b5';
    return '#3355cc';
  }

  function measureObstacles() {
    const vr = viewport.getBoundingClientRect();
    const prev = new Map(obstacles.map(o => [o.el, o]));
    obstacles = [];
    if ($('googlePage').classList.contains('hidden')) { buildNav(); return; }
    for (const el of obstacleEls()) {
      if (el.dataset.broken === '1') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const old = prev.get(el);
      obstacles.push({
        el, x: r.left - vr.left, y: r.top - vr.top, w: r.width, h: r.height,
        hp: old ? old.hp : OBST_HP, cracks: old ? old.cracks : [], hitCd: 0, color: obstacleColor(el)
      });
    }
    buildNav();
  }

  function restoreObstacles() {
    for (const el of obstacleEls()) {
      el.dataset.broken = '';
      el.style.visibility = '';
      el.style.opacity = '';
    }
    obstacles = [];
    measureObstacles();
  }

  function hitObstacle(o, x, y) {
    if (o.hp <= 0) return;
    o.hp--;
    const fx = clamp((x - o.x) / o.w, 0.05, 0.95), fy = clamp((y - o.y) / o.h, 0.05, 0.95);
    const crack = [[fx, fy]];
    let cx = fx, cy = fy;
    for (let i = 0; i < 3; i++) {
      cx = clamp(cx + rand(-0.25, 0.25), 0, 1);
      cy = clamp(cy + rand(-0.35, 0.35), 0, 1);
      crack.push([cx, cy]);
    }
    o.cracks.push(crack);
    o.el.style.opacity = (0.45 + 0.55 * o.hp / OBST_HP).toFixed(2);
    o.el.classList.remove('ghit');
    void o.el.offsetWidth;
    o.el.classList.add('ghit');
    burst(x, y, o.color, 5, 90);
    sfx(160 + o.hp * 40, 0.06, 'square', 0.03, -60);
    if (o.hp <= 0) breakObstacle(o);
  }

  function breakObstacle(o) {
    o.el.style.visibility = 'hidden';
    o.el.dataset.broken = '1';
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

  function drawCracks() {
    ctx.strokeStyle = 'rgba(40,40,40,.75)';
    ctx.lineWidth = 2;
    for (const o of obstacles) {
      for (const cr of o.cracks) {
        ctx.beginPath();
        cr.forEach(([fx, fy], i) => {
          const x = Math.round(o.x + fx * o.w), y = Math.round(o.y + fy * o.h);
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
    }
  }

  /* ---------- game flow ---------- */

  function clearField() {
    enemies = []; bullets = []; powerups = []; particles = []; floaters = []; spawnQueue = [];
    slashes = []; ghosts = []; lasers = [];
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
    tabIcon.classList.remove('loading');
    setStatus('Done');
    updateBadge();
  }

  function loadFrom(save) {
    stacks = {
      hp: Math.max(0, save.stacks?.hp | 0),
      spd: Math.max(0, save.stacks?.spd | 0),
      dmg: Math.max(0, save.stacks?.dmg | 0)
    };
    wave = Math.max(1, save.wave | 0);
    score = Math.max(0, save.score | 0);
    clearField();
    player = newPlayer();
    state = 'idle';
    paused = false;
    tabIcon.classList.remove('loading');
    setStatus('Done');
    updateBadge();
  }

  function startWave() {
    if (state !== 'idle') return;
    waveInfo = waveParams(wave);
    const q = [];
    for (let i = 0; i < waveInfo.count; i++) {
      q.push({ kind: Math.random() < waveInfo.shooterFrac ? 'shooter' : 'chaser' });
    }
    for (let i = 0; i < waveInfo.necessary; i++) {
      q.splice((Math.random() * (q.length + 1)) | 0, 0, { kind: 'necessary' });
    }
    if (waveInfo.boss) q.splice(Math.floor(q.length * 0.6), 0, { kind: 'boss' });
    q.unshift({ kind: 'necessary' });
    spawnQueue = q;
    spawnTimer = 0.4;
    loadedThisWave = 0;
    domainsThisWave = new Set();
    state = 'wave';
    paused = false;
    player.inv = 1;
    restoreObstacles();
    closePopup();
    tabIcon.classList.add('loading');
    SND.wave();
    floaters.push({ x: W / 2, y: H * 0.35, text: `WAVE ${wave}${waveInfo.boss ? ' - BOSS' : ''}`, color: '#1851ce', life: 2, max: 2, big: true });
    updateBadge();
  }

  function waveCleared() {
    state = 'idle';
    tabIcon.classList.remove('loading');
    const bonus = 100 * wave;
    score += bonus;
    enemies.forEach(e => {
      if (e.kind === 'necessary') floaters.push({ x: e.x, y: e.y - 22, text: 'ACCEPTED', color: '#2e7d32', life: 1.2, max: 1.2 });
    });
    enemies = [];
    lasers = [];
    bullets = bullets.filter(b => b.from === 'player');
    const heal = Math.round(player.maxHp * 0.15);
    player.hp = Math.min(player.maxHp, player.hp + heal);
    SND.clear();
    setStatus(`Done. Blocked ${loadedThisWave} cookies from ${domainsThisWave.size} domains.`);
    floaters.push({ x: W / 2, y: H * 0.35, text: `WAVE ${wave} CLEARED  +${bonus}`, color: '#1f8a17', life: 2.4, max: 2.4, big: true });
    wave++;
    updateBadge();
    setTimeout(() => {
      if (state !== 'idle') return;
      extBtn.classList.add('pulse');
      openPopup(`Wave ${wave - 1} cleared! You healed ${heal} HP. Save now, or start wave ${wave} when ready.`, 'good');
    }, 1300);
  }

  function gameOver() {
    state = 'dead';
    paused = false;
    closePopup();
    tabIcon.classList.remove('loading');
    SND.dead();
    const save = storeGet(SAVE_KEY);
    $('snapStats').textContent = `WAVE ${wave}  ·  SCORE ${score.toLocaleString()}` + (save ? `  ·  SAVE: WAVE ${save.wave}` : '');
    setTimeout(() => {
      $('awsnap').classList.remove('hidden');
      setStatus('');
    }, 900);
  }

  /* ---------- spawning ---------- */

  function spawn(spec, atX, atY) {
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
      Object.assign(e, { r: 18, scale: 3, hp: 28 * wp.hp, speed: 70 * wp.spd * rand(0.8, 1.2), dmg: 11 * wp.dmg, touch: 18 * wp.dmg, keep: rand(200, 300),
        pattern: pick(PATTERNS.filter(pt => pt.from <= wave)).id, move: pick(['kite', 'orbit', 'hop', 'drift']),
        orbitA: rand(0, 6.3), orbitDir: Math.random() < 0.5 ? 1 : -1, hopT: 0, hopX: x, hopY: y, homeX: x, homeY: y, bulletSpeed: 150 * Math.min(1.5, wp.spd), shots: 0, shotT: 0, spinA: rand(0, 6.3) });
    } else {
      Object.assign(e, { r: 46, scale: 7, hp: 420 * wp.hp, speed: 45 * wp.spd, dmg: 13 * wp.dmg, touch: 35 * wp.dmg, bulletSpeed: 150, shots: 0, shotT: 0, spinA: 0,
        phase: 'orbit', phaseT: 3, orbitA: 0, orbitDir: 1, windup: 0, chargesLeft: 0, fadeT: 0, trailT: 0 });
      setStatus(`Warning: ${info.n} from ${info.d} is regenerating itself...`);
    }
    e.maxHp = e.hp;
    enemies.push(e);
    loadedThisWave++;
    domainsThisWave.add(info.d);
    if (kind !== 'boss') setStatus(`Waiting for ${info.d}...`);
    sfx(300 + Math.random() * 200, 0.05, 'triangle', 0.02, 200);
  }

  /* ---------- combat helpers ---------- */

  function hurtPlayer(dmg, srcX, srcY, ignoreInv) {
    if (state !== 'wave') return;
    if (player.inv > 0 && !ignoreInv) return;
    dmg = clamp(dmg, 12, 25);
    player.hp -= dmg;
    player.inv = ignoreInv ? Math.max(player.inv, 0.15) : 0.7;
    shake = Math.min(12, shake + 4 + dmg * 0.3);
    flashRed = 0.25;
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

  function killEnemy(e) {
    const p = PALETTES[e.kind];
    burst(e.x, e.y, p.body, 14 + e.scale * 2);
    burst(e.x, e.y, p.chip, 6 + e.scale);
    e.dead = true;
    if (e.kind === 'necessary') {
      score = Math.max(0, score - 150);
      floaters.push({ x: e.x, y: e.y - 20, text: 'SITE BROKE! -150', color: '#d32f2f', life: 1.4, max: 1.4 });
      setStatus(`Oops: deleting ${e.name} logged you out of ${e.domain}.`);
      SND.friendly();
      return;
    }
    SND.kill();
    const pts = e.kind === 'boss' ? 1000 : e.kind === 'shooter' ? 30 : 20;
    score += Math.round(pts * (1 + 0.1 * (wave - 1)));
    floaters.push({ x: e.x, y: e.y - 20, text: e.kind === 'boss' ? 'SUPERCOOKIE DELETED' : 'DELETED', color: '#444', life: 0.9, max: 0.9 });
    if (e.kind === 'boss') {
      shake = 14;
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
  const POWER_LABEL = { hp: '+HP', spd: 'SPD', dmg: 'DMG' };

  /* ---------- update ---------- */

  function update(dt) {
    for (const f of floaters) { f.life -= dt; f.y -= (f.big ? 8 : 26) * dt; }
    for (const sl of slashes) { sl.life -= dt; sl.x = player.x; sl.y = player.y; }
    for (const lz of lasers) {
      if (lz.owner && !lz.owner.dead && lz.warn > 0) { lz.x = lz.owner.x; lz.y = lz.owner.y; }
      if (lz.owner && lz.owner.dead && lz.warn > 0) lz.gone = true;
      if (paused || (state !== 'wave' && state !== 'idle')) continue;
      if (lz.warn > 0) {
        lz.warn -= dt;
        if (lz.warn <= 0) { sfx(110, 0.35, 'sawtooth', 0.06, 300); shake = Math.min(12, shake + 3); }
      } else {
        lz.active -= dt;
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
    shake = Math.max(0, shake - dt * 30);
    flashRed = Math.max(0, flashRed - dt);

    if (state !== 'wave' && state !== 'idle') return;
    if (paused) return;

    idleHintT += dt;
    updatePlayer(dt);

    if (state === 'wave') {
      if (spawnQueue.length) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawn(spawnQueue.shift());
          spawnTimer = waveInfo.interval * rand(0.6, 1.4);
          updateBadge();
        }
      }
      updateNav(dt);
      updateEnemies(dt);
    }

    updateBullets(dt);
    updatePowerups(dt);

    if (state === 'wave' && !spawnQueue.length && !enemies.some(e => e.kind !== 'necessary')) {
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
    for (const o of obstacles) o.hitCd = Math.max(0, o.hitCd - dt);
    const bump = pushOut(p, p.r);
    if (bump && bump.o.hitCd <= 0 && (p.dashT > 0 || bump.vn < -60)) {
      bump.o.hitCd = 0.45;
      hitObstacle(bump.o, bump.c.px, bump.c.py);
      if (p.dashT > 0) { p.dashT = 0; shake = Math.min(10, shake + 3); }
    }
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
      for (const o of obstacles.slice()) {
        const nx = clamp(p.x, o.x, o.x + o.w), ny = clamp(p.y, o.y, o.y + o.h);
        const dx = nx - p.x, dy = ny - p.y, d = hyp(dx, dy);
        if (d > reach) continue;
        let da = Math.atan2(dy, dx) - a;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) <= BASE.swingArc + 0.3 || d < p.r + 2) hitObstacle(o, nx, ny);
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
    { id: 'aimed', from: 1 },
    { id: 'spread', from: 1 },
    { id: 'ring', from: 2 },
    { id: 'burst', from: 3 },
    { id: 'laser', from: 3 },
    { id: 'wave', from: 4 },
    { id: 'spiral', from: 5 }
  ];
  const PATTERN_COLORS = { aimed: '#e0157a', spread: '#e0157a', ring: '#ff6d00', burst: '#d50000', wave: '#00897b', spiral: '#2962ff', laser: '#ff1744', boss: '#aa00ff' };

  const BOSS_PHASES = ['orbit', 'charge', 'spiral', 'teleport', 'summon', 'laser'];

  function bossNextPhase(e) {
    if (e.phase === 'charge' && e.windup <= 0) {
      const n = 18, off = rand(0, Math.PI);
      for (let i = 0; i < n; i++) enemyShoot(e, off + i * Math.PI * 2 / n, 160 * rand(0.9, 1.1), e.dmg, '#aa00ff');
      shake = Math.min(14, shake + 6);
      if (e.chargesLeft > 0) {
        e.chargesLeft--;
        e.windup = 0.55; e.trailT = 0; e.phaseT = 1.15;
        return;
      }
    }
    e.ghost = false;
    let next;
    do { next = pick(BOSS_PHASES); } while (next === e.phase);
    if (next === 'summon' && enemies.filter(o => o.kind === 'chaser').length > 8) next = 'orbit';
    e.phase = next;
    if (next === 'orbit') { e.phaseT = 4.5; e.orbitA = Math.atan2(e.y - player.y, e.x - player.x) + Math.PI; e.orbitDir = Math.random() < 0.5 ? 1 : -1; e.fireCd = 0.5; }
    else if (next === 'charge') { e.phaseT = 1.25; e.windup = 0.8; e.trailT = 0; e.chargesLeft = 1 + (Math.random() < 0.5 ? 1 : 0); }
    else if (next === 'spiral') { e.phaseT = 3.6; e.shots = 44; e.shotT = 0.4; e.burstAim = false; }
    else if (next === 'laser') {
      e.phaseT = 3.4;
      e.laserStage = 0;
      const aim = Math.atan2(player.y - e.y, player.x - e.x);
      for (let i = -1; i <= 1; i++) {
        fireLaser(e, aim + i * 0.42, e.dmg * 2.4, '#aa00ff', 20);
        fireLaser(e, aim + Math.PI + i * 0.42, e.dmg * 2.4, '#aa00ff', 20);
      }
    }
    else if (next === 'teleport') { e.phaseT = 1.3; e.fadeT = 0.45; sfx(300, 0.3, 'triangle', 0.05, 900); }
    else if (next === 'summon') {
      e.phaseT = 1.6;
      const n = 2 + Math.min(3, Math.floor(wave / 10));
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI * 2 / n + rand(-0.3, 0.3);
        spawn({ kind: 'chaser' }, clamp(e.x + Math.cos(a) * 70, 30, W - 30), clamp(e.y + Math.sin(a) * 70, 40, H - 30));
      }
      floaters.push({ x: e.x, y: e.y - 70, text: 'RESPAWNING DELETED COOKIES...', color: '#aa00ff', life: 1.4, max: 1.4 });
      updateBadge();
    }
  }

  function shooterFire(e, aim) {
    const sp = () => e.bulletSpeed * rand(0.85, 1.15);
    const col = PATTERN_COLORS[e.pattern];
    const fr = waveInfo.fireRate;
    switch (e.pattern) {
      case 'aimed':
        enemyShoot(e, aim + rand(-0.1, 0.1), sp() * 1.15, e.dmg, col, { lead: true });
        e.shots = 1 + Math.min(2, Math.floor(wave / 4)); e.shotT = 0.18; e.burstAim = true;
        e.fireCd = rand(1.3, 1.9) / fr;
        break;
      case 'spread': {
        const n = 3 + Math.min(4, Math.floor(wave / 3)) * 1;
        const s = sp();
        for (let i = 0; i < n; i++) enemyShoot(e, aim + (i - (n - 1) / 2) * 0.2, s, e.dmg, col, { lead: true });
        e.fireCd = rand(1.7, 2.3) / fr;
        break;
      }
      case 'ring': {
        const n = 8 + Math.min(10, wave);
        const off = rand(0, Math.PI * 2), s = sp() * 0.85;
        for (let i = 0; i < n; i++) enemyShoot(e, off + i * Math.PI * 2 / n, s, e.dmg, col);
        e.fireCd = rand(2.2, 2.8) / fr;
        break;
      }
      case 'burst':
        e.shots = 5 + Math.min(5, Math.floor(wave / 3)); e.shotT = 0; e.burstAim = true;
        e.fireCd = rand(2.4, 3) / fr;
        break;
      case 'wave': {
        const s = sp();
        for (let i = -1; i <= 1; i++) enemyShoot(e, aim + i * 0.3, s, e.dmg, col, { wob: 45, wf: 7, lead: true });
        e.fireCd = rand(1.6, 2.1) / fr;
        break;
      }
      case 'spiral':
        e.shots = 18 + Math.min(12, wave); e.shotT = 0; e.burstAim = false;
        e.fireCd = rand(3, 3.6) / fr;
        break;
      case 'laser':
        fireLaser(e, aim, e.dmg * 2.2, col, 14);
        fireLaser(e, aim + Math.PI, e.dmg * 2.2, col, 14);
        if (wave >= 8) { fireLaser(e, aim + Math.PI / 2, e.dmg * 2.2, col, 14); fireLaser(e, aim - Math.PI / 2, e.dmg * 2.2, col, 14); }
        e.fireCd = rand(3.6, 4.4) / fr;
        return;
    }
    SND.enemyShot();
  }

  function shooterStream(e, dt, aim) {
    if (e.shots <= 0) return;
    e.shotT -= dt;
    if (e.shotT > 0) return;
    e.shots--;
    const col = PATTERN_COLORS[e.pattern];
    if (e.burstAim) {
      enemyShoot(e, aim + rand(-0.15, 0.15), e.bulletSpeed * rand(1, 1.3), e.dmg, col, { lead: true });
      e.shotT = 0.09;
    } else {
      e.spinA += 0.42;
      const arms = e.kind === 'boss' ? 4 : 2;
      for (let i = 0; i < arms; i++) enemyShoot(e, e.spinA + i * Math.PI * 2 / arms, e.bulletSpeed * rand(0.8, 1), e.dmg, col);
      e.shotT = e.kind === 'boss' ? 0.07 : 0.1;
    }
    if (e.shots % 3 === 0) SND.enemyShot();
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
        if (e.move === 'kite') {
          const side = Math.sin(e.wanderA) > 0 ? 1 : -1;
          if (d > e.keep + 40) { tvx = nx * e.speed; tvy = ny * e.speed; }
          else if (d < e.keep - 40) { tvx = -nx * e.speed; tvy = -ny * e.speed; }
          else { tvx = -ny * side * e.speed * 0.7; tvy = nx * side * e.speed * 0.7; }
        } else if (e.move === 'orbit') {
          e.orbitA += dt * e.orbitDir * e.speed / Math.max(120, e.keep);
          const ox = p.x - Math.cos(e.orbitA) * e.keep - e.x, oy = p.y - Math.sin(e.orbitA) * e.keep - e.y, od = hyp(ox, oy) || 1;
          const sp = Math.min(e.speed * 1.6, od * 2.5);
          tvx = ox / od * sp; tvy = oy / od * sp;
        } else if (e.move === 'hop') {
          e.hopT -= dt;
          if (e.hopT <= 0) {
            e.hopT = rand(1.2, 2.2);
            const ha = rand(0, Math.PI * 2), hr = rand(160, 320);
            e.hopX = clamp(p.x + Math.cos(ha) * hr, 40, W - 40);
            e.hopY = clamp(p.y + Math.sin(ha) * hr, 50, H - 40);
          }
          const ox = e.hopX - e.x, oy = e.hopY - e.y, od = hyp(ox, oy);
          if (od > 8) { const sp = Math.min(e.speed * 3.2, od * 5); tvx = ox / od * sp; tvy = oy / od * sp; steer = 5; }
        } else {
          e.homeX += (p.x - e.homeX) * dt * 0.15;
          e.homeY += (p.y - e.keep * 0.8 - e.homeY) * dt * 0.15;
          const fx = e.homeX + Math.sin(e.t * 0.9) * 180, fy = clamp(e.homeY, 60, H - 60) + Math.sin(e.t * 1.8) * 70;
          const ox = fx - e.x, oy = fy - e.y, od = hyp(ox, oy) || 1;
          const sp = Math.min(e.speed * 1.8, od * 2);
          tvx = ox / od * sp; tvy = oy / od * sp;
        }
        if (lasers.some(lz => lz.owner === e)) { tvx *= 0.15; tvy *= 0.15; }
        shooterStream(e, dt, aim);
        e.fireCd -= dt;
        if (e.fireCd <= 0 && e.shots <= 0) shooterFire(e, aim);
      } else if (e.kind === 'boss') {
        const aim = Math.atan2(dy, dx);
        const rage = e.hp < e.maxHp * 0.4 ? 1.35 : 1;
        e.pattern = 'boss';
        shooterStream(e, dt, aim);
        e.phaseT -= dt * rage;
        if (e.phaseT <= 0) bossNextPhase(e);
        e.fireCd -= dt * rage;
        if (e.fireCd <= 0 && !e.ghost) {
          e.fireCd = (e.phase === 'orbit' ? 1.0 : 1.6) / waveInfo.fireRate;
          const sp = 260 * rand(0.9, 1.1);
          const lead = leadAim(e, sp) - aim;
          for (let m = 0; m < 4; m++) {
            for (let i = -1; i <= 1; i++) enemyShoot(e, aim + lead + m * Math.PI / 2 + i * 0.14, sp, e.dmg, '#aa00ff');
          }
          SND.enemyShot();
        }
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
            e.trailT -= dt;
            if (e.trailT <= 0) {
              e.trailT = 0.12;
              enemyShoot(e, e.chargeA + Math.PI / 2, 55 * rand(0.8, 1.2), e.dmg, '#aa00ff');
              enemyShoot(e, e.chargeA - Math.PI / 2, 55 * rand(0.8, 1.2), e.dmg, '#aa00ff');
            }
          }
        } else if (e.phase === 'spiral') {
          const ox = W / 2 - e.x, oy = H / 2 - e.y, od = hyp(ox, oy) || 1;
          const sp = Math.min(e.speed * 2, od * 2);
          tvx = ox / od * sp; tvy = oy / od * sp;
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
              burst(e.x, e.y, '#aa00ff', 24);
              const n = 24, off = rand(0, Math.PI);
              for (let i = 0; i < n; i++) enemyShoot(e, off + i * Math.PI * 2 / n, 140 * rand(0.9, 1.1), e.dmg, '#aa00ff', { wob: 25, wf: 4 });
              sfx(1200, 0.25, 'triangle', 0.05, -1000);
            }
          }
          e.appearT = Math.max(0, (e.appearT || 0) - dt);
          tvx = 0; tvy = 0;
        } else if (e.phase === 'laser') {
          tvx = 0; tvy = 0; steer = 4;
          if (e.laserStage === 0 && e.phaseT < 2.2) {
            e.laserStage = 1;
            const off = Math.atan2(player.y - e.y, player.x - e.x);
            for (let i = 0; i < 4; i++) fireLaser(e, off + i * Math.PI / 2, e.dmg * 2.4, '#d500f9', 20);
          }
        } else if (e.phase === 'summon') {
          tvx = Math.cos(e.t * 30) * 30; tvy = 0;
        }
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
        if (b.from === 'player') hitObstacle(wall, b.x, b.y);
        else burst(b.x, b.y, b.color, 2, 50);
        continue;
      }

      if (b.from === 'player') {
        for (const e of enemies) {
          if (e.dead || e.spawnT > 0 || e.ghost) continue;
          if (hyp(e.x - b.x, e.y - b.y) < e.r + b.r) {
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

  /* ---------- render ---------- */

  function text(str, x, y, size, color, align = 'center', font = 'Silkscreen') {
    ctx.font = `${size}px ${font}, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  const TAG_COLORS = { necessary: '#2e7d32', chaser: '#b71c1c', shooter: '#5e35b1', boss: '#4a148c' };

  function drawEnemy(e) {
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
      ctx.globalAlpha = k * 0.6;
      ctx.drawImage(spr.img, Math.round(e.x - size / 2), Math.round(e.y - size / 2), size, size);
      ctx.globalAlpha = 1;
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
    if (e.kind === 'boss' && ((e.phase === 'charge' && e.windup > 0) || e.phase === 'summon')) ctx.translate(rand(-2, 2), rand(-2, 2));
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
    ctx.font = `${fs}px Silkscreen, monospace`;
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
      if (lz.warn > 0) {
        const k = 1 - lz.warn / LASER_WARN;
        const blink = lz.warn < 0.5 ? (Math.floor(lz.warn * 16) % 2 ? 1 : 0.3) : 0.5 + Math.sin(k * 30) * 0.2;
        ctx.globalAlpha = (0.25 + k * 0.6) * blink;
        ctx.strokeStyle = lz.color;
        ctx.lineWidth = 1 + k * (lz.width - 4);
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -k * 60;
        ctx.beginPath();
        ctx.moveTo(lz.x, lz.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.9 * blink;
        ctx.fillStyle = lz.color;
        ctx.fillRect(Math.round(lz.x) - 4, Math.round(lz.y) - 4, 8, 8);
      } else {
        const f = lz.active / LASER_ON;
        const w = lz.width * (0.6 + 0.4 * f) + rand(-1.5, 1.5);
        ctx.globalAlpha = 0.35 + 0.6 * f;
        ctx.strokeStyle = lz.color;
        ctx.lineWidth = w + 8;
        ctx.beginPath(); ctx.moveTo(lz.x, lz.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = 0.9 * f + 0.1;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = w * 0.45;
        ctx.beginPath(); ctx.moveTo(lz.x, lz.y); ctx.lineTo(ex, ey); ctx.stroke();
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

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (state === 'boot' || !player) return;

    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);

    if (state === 'wave') {
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(0, 0, W, H);
    }
    drawHud();
    drawCracks();

    for (const pu of powerups) drawPowerup(pu);
    for (const e of enemies) if (e.kind === 'necessary') drawEnemy(e);
    for (const e of enemies) if (e.kind !== 'necessary') drawEnemy(e);

    for (const b of bullets) {
      if (b.from === 'player') {
        ctx.fillStyle = '#0d3a9e';
        ctx.fillRect(Math.round(b.x) - 6, Math.round(b.y) - 6, 12, 12);
        ctx.fillStyle = '#4f86f7';
        ctx.fillRect(Math.round(b.x) - 4, Math.round(b.y) - 4, 8, 8);
        ctx.fillStyle = '#dfe9ff';
        ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 2, 4, 4);
      } else {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 1, 1);
      }
    }

    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max * 1.5, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    drawLasers();
    drawGhosts();
    drawSlashes();
    drawPlayer();

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
      ctx.fillStyle = `rgba(220,30,30,${flashRed * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (state === 'idle' && popup.classList.contains('hidden') && floaters.every(f => !f.big)) {
      const a = 0.6 + Math.sin(idleHintT * 3) * 0.4;
      ctx.globalAlpha = a;
      text(`Click the cookie extension (top right) or press ENTER to start wave ${wave}`, W / 2, H - 92, 9, '#1851ce');
      ctx.globalAlpha = 1;
    }
    if (state === 'wave' && paused) {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(0, 0, W, H);
      text('PAUSED', W / 2, H / 2, 24, '#fff');
    }
  }

  /* ---------- main loop ---------- */

  let last = performance.now();
  let popupRefreshT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    updateWeaponUi();
    popupRefreshT -= dt;
    if (popupRefreshT <= 0 && !popup.classList.contains('hidden')) { popupRefreshT = 0.25; refreshPopup(); }
    requestAnimationFrame(frame);
  }

  /* ---------- boot: pretend it's a slow 2009 connection ---------- */

  function boot() {
    resize();
    player = newPlayer();
    tabIcon.classList.add('loading');
    const steps = [
      [0, 'Resolving host...'],
      [450, 'Connecting to www.google.com...'],
      [900, 'Waiting for www.google.com...'],
      [1300, 'Transferring data from www.google.com...']
    ];
    steps.forEach(([t, msg]) => setTimeout(() => setStatus(msg), t));
    setTimeout(() => {
      $('googlePage').classList.remove('hidden');
    }, 1250);
    setTimeout(() => {
      tabIcon.classList.remove('loading');
      const save = storeGet(SAVE_KEY);
      if (save) {
        loadFrom(save);
        state = 'idle';
        openPopup(`Welcome back! Your progress was restored at wave ${wave}.`, 'good');
      } else {
        resetGame();
        state = 'idle';
        openPopup('This page wants to load a lot of cookies. Fly your cursor around and delete the trackers before they get you. Leave the green necessary ones alone.', '');
      }
      setStatus('Done');
    }, 1800);
    requestAnimationFrame(t => { last = t; frame(t); });
  }

  window.addEventListener('resize', resize);
  try { document.fonts.load('8px Silkscreen'); } catch (e) { /* ignore */ }
  boot();
})();
