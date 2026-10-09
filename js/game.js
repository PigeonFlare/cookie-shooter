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

  /* ---------- game state ---------- */

  const BASE = {
    hp: 100,
    speed: 230,
    damage: 10,
    fireInterval: 0.15,
    bulletSpeed: 560
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

  const maxHpFor = n => BASE.hp + Math.round(15 * (1 - Math.pow(0.82, n)) / 0.18);
  const spdMultFor = n => 1 + 0.5 * (1 - Math.pow(0.8, n));
  const dmgMultFor = n => 1 + 0.75 * (1 - Math.pow(0.8, n));

  function newPlayer() {
    return {
      x: W / 2, y: H * 0.62, vx: 0, vy: 0, r: 9,
      hp: maxHpFor(stacks.hp), maxHp: maxHpFor(stacks.hp),
      angle: -Math.PI / 2, inv: 0, fireCd: 0
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
  const touch = { active: false, x: 0, y: 0 };

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') return;
    keys[k] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (k === 'escape' || k === 'p') togglePopup();
    if ((k === 'enter' || k === 'n') && state === 'idle') startWave();
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

  /* ---------- game flow ---------- */

  function clearField() {
    enemies = []; bullets = []; powerups = []; particles = []; floaters = []; spawnQueue = [];
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

  function spawn(spec) {
    const kind = spec.kind;
    const info = pick(DB[kind]);
    let x, y, tries = 0;
    do {
      x = rand(40, W - 40);
      y = rand(50, H - 40);
      tries++;
    } while (hyp(x - player.x, y - player.y) < 200 && tries < 30);

    const wp = waveInfo;
    const e = {
      kind, name: info.n, domain: info.d, x, y, vx: 0, vy: 0,
      spawnT: 0.75, hitFlash: 0, contactCd: 0,
      wanderA: rand(0, Math.PI * 2),
      fireCd: rand(1, 2.2), burstCd: 3, t: 0
    };
    if (kind === 'necessary') {
      Object.assign(e, { r: 18, scale: 3, hp: 30, speed: 38 });
    } else if (kind === 'chaser') {
      Object.assign(e, { r: 13, scale: 2, hp: 18 * wp.hp, speed: rand(90, 115) * wp.spd, dmg: 8 * wp.dmg });
    } else if (kind === 'shooter') {
      Object.assign(e, { r: 18, scale: 3, hp: 28 * wp.hp, speed: 70 * wp.spd, dmg: 6 * wp.dmg, keep: rand(200, 280) });
    } else {
      Object.assign(e, { r: 46, scale: 7, hp: 420 * wp.hp, speed: 45 * wp.spd, dmg: 7 * wp.dmg });
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

    const accel = Math.min(1, dt * 12);
    p.vx += (ix * speed - p.vx) * accel;
    p.vy += (iy * speed - p.vy) * accel;
    p.x = clamp(p.x + p.vx * dt, p.r, W - p.r);
    p.y = clamp(p.y + p.vy * dt, p.r, H - p.r);
    p.inv = Math.max(0, p.inv - dt);

    let wantFire = mouse.down || keys[' '];
    if (touch.active) {
      const t = nearestHostile();
      if (t) { p.angle = Math.atan2(t.y - p.y, t.x - p.x); wantFire = true; }
    } else if (mouse.inside || mouse.down) {
      p.angle = Math.atan2(mouse.y - p.y, mouse.x - p.x);
    }

    p.fireCd -= dt;
    if (wantFire && p.fireCd <= 0) {
      p.fireCd = BASE.fireInterval;
      const a = p.angle + rand(-0.03, 0.03);
      bullets.push({
        x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14,
        vx: Math.cos(a) * BASE.bulletSpeed, vy: Math.sin(a) * BASE.bulletSpeed,
        r: 3, dmg: BASE.damage * dmgMultFor(stacks.dmg), from: 'player', life: 1.6
      });
      SND.shoot();
    }
  }

  function enemyShoot(e, angle, speed, dmg) {
    bullets.push({ x: e.x + Math.cos(angle) * e.r, y: e.y + Math.sin(angle) * e.r, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 3, dmg, from: 'enemy', life: 6 });
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
        const side = Math.sin(e.wanderA) > 0 ? 1 : -1;
        if (d > e.keep + 40) { tvx = nx * e.speed; tvy = ny * e.speed; }
        else if (d < e.keep - 40) { tvx = -nx * e.speed; tvy = -ny * e.speed; }
        else { tvx = -ny * side * e.speed * 0.7; tvy = nx * side * e.speed * 0.7; }
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          e.fireCd = rand(1.4, 2.3) / waveInfo.fireRate;
          enemyShoot(e, Math.atan2(dy, dx) + rand(-0.12, 0.12), 165 * Math.min(1.6, waveInfo.spd), e.dmg);
          SND.enemyShot();
        }
      } else if (e.kind === 'boss') {
        tvx = nx * e.speed; tvy = ny * e.speed; steer = 1;
        e.fireCd -= dt;
        e.burstCd -= dt;
        if (e.fireCd <= 0) {
          e.fireCd = 0.9 / waveInfo.fireRate;
          const a = Math.atan2(dy, dx);
          for (let i = -1; i <= 1; i++) enemyShoot(e, a + i * 0.18, 190, e.dmg);
          SND.enemyShot();
        }
        if (e.burstCd <= 0) {
          e.burstCd = 3.2;
          const n = 16, off = rand(0, Math.PI);
          for (let i = 0; i < n; i++) enemyShoot(e, off + i * Math.PI * 2 / n, 130, e.dmg);
          sfx(90, 0.3, 'sawtooth', 0.06, -40);
        }
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

      if (e.kind !== 'necessary' && d < e.r + p.r && e.contactCd <= 0) {
        e.contactCd = 0.8;
        hurtPlayer(e.kind === 'boss' ? e.dmg * 2.5 : e.dmg, e.x, e.y);
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
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) b.life = 0;
      if (b.life <= 0) continue;

      if (b.from === 'player') {
        for (const e of enemies) {
          if (e.dead || e.spawnT > 0) continue;
          if (hyp(e.x - b.x, e.y - b.y) < e.r + b.r) {
            b.life = 0;
            e.hp -= b.dmg;
            e.hitFlash = 0.08;
            e.vx += b.vx * 0.05; e.vy += b.vy * 0.05;
            burst(b.x, b.y, PALETTES[e.kind].edge, 3, 80);
            if (e.kind === 'necessary') {
              floaters.push({ x: e.x, y: e.y - 26, text: 'FRIENDLY FIRE!', color: '#2e7d32', life: 0.9, max: 0.9 });
              SND.friendly();
              hurtPlayer(b.dmg * 0.6, undefined, undefined, true);
            } else {
              SND.hit();
            }
            if (e.hp <= 0) killEnemy(e);
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

  const TAG_COLORS = { necessary: '#2e7d32', chaser: '#b71c1c', shooter: '#5e35b1', boss: '#111' };

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

    ctx.save();
    ctx.translate(Math.round(e.x), Math.round(e.y));
    if (e.kind === 'chaser') ctx.rotate(Math.sin(e.t * 10) * 0.12);
    if (e.kind === 'necessary') {
      ctx.strokeStyle = 'rgba(46,125,50,.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 3 + Math.sin(e.t * 3) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.drawImage(e.hitFlash > 0 ? spr.flash : spr.img, -size / 2, -size / 2, size, size);
    ctx.restore();

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

  function drawPlayer() {
    const p = player;
    if (state === 'dead') return;
    if (p.inv > 0 && state === 'wave' && Math.floor(p.inv * 20) % 2) return;
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
    ctx.beginPath();
    CURSOR.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = '#fff';
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
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.round(pu.x - 13), Math.round(y - 9), 26, 18);
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(pu.x - 13) + 0.5, Math.round(y - 9) + 0.5, 25, 17);
    text(POWER_LABEL[pu.type], Math.round(pu.x), Math.round(y) + 1, 8, c);
  }

  function drawHud() {
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

    for (const pu of powerups) drawPowerup(pu);
    for (const e of enemies) if (e.kind === 'necessary') drawEnemy(e);
    for (const e of enemies) if (e.kind !== 'necessary') drawEnemy(e);

    for (const b of bullets) {
      if (b.from === 'player') {
        ctx.fillStyle = '#1851ce';
        ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 2, 4, 4);
      } else {
        ctx.fillStyle = '#e0157a';
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

    drawHud();

    if (state === 'idle' && popup.classList.contains('hidden') && floaters.every(f => !f.big)) {
      const a = 0.6 + Math.sin(idleHintT * 3) * 0.4;
      ctx.globalAlpha = a;
      text(`Click the cookie extension (top right) or press ENTER to start wave ${wave}`, W / 2, H - 46, 9, '#1851ce');
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
