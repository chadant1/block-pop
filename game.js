'use strict';
(() => {
  const N = 8;
  const SAVE_KEY = 'blockpop.save.v1';
  const BEST_KEY = 'blockpop.best';
  const SOUND_KEY = 'blockpop.sound';

  // ---------- Colors ----------
  const PALETTE = ['#ff4d6d', '#ff9f1c', '#ffd60a', '#38d26f', '#22c3e6', '#4f6bff', '#a05cf2', '#ff5fc8'];
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return `rgb(${r},${g},${b})`;
  }
  const COLORS = PALETTE.map(h => ({
    base: h, light: shade(h, 0.5), lite: shade(h, 0.22), dark: shade(h, -0.22), darker: shade(h, -0.42),
  }));

  // ---------- Shapes ----------
  const rect = (h, w) => { const a = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) a.push([r, c]); return a; };
  const BASES = [
    { w: 3, cells: [[0, 0]] },
    { w: 6, cells: rect(1, 2) },
    { w: 7, cells: rect(1, 3) },
    { w: 6, cells: rect(1, 4) },
    { w: 4, cells: rect(1, 5) },
    { w: 7, cells: rect(2, 2) },
    { w: 3, cells: rect(3, 3) },
    { w: 4, cells: rect(2, 3) },
    { w: 7, cells: [[0, 0], [1, 0], [1, 1]] },                 // small corner
    { w: 7, cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },         // L
    { w: 4, cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] }, // big corner
    { w: 6, cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },         // T
    { w: 5, cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },         // S/Z
  ];
  function normalize(cells) {
    const mr = Math.min(...cells.map(p => p[0])), mc = Math.min(...cells.map(p => p[1]));
    return cells.map(([r, c]) => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  function variants(cells) {
    const out = new Map();
    let cur = cells;
    for (let flip = 0; flip < 2; flip++) {
      for (let i = 0; i < 4; i++) {
        cur = cur.map(([r, c]) => [c, -r]);
        const n = normalize(cur);
        out.set(JSON.stringify(n), n);
      }
      cur = cur.map(([r, c]) => [r, -c]);
    }
    return [...out.values()];
  }
  function makeShape(cells) {
    return { cells, h: Math.max(...cells.map(p => p[0])) + 1, w: Math.max(...cells.map(p => p[1])) + 1 };
  }
  const SHAPE_SETS = BASES.map(b => ({ weight: b.w, variants: variants(b.cells).map(makeShape) }));
  const TOTAL_WEIGHT = SHAPE_SETS.reduce((s, x) => s + x.weight, 0);

  // ---------- State ----------
  let board, pieces, score, streak, sinceClear, best, gameOver;
  let soundOn = true;
  let shownScore = 0;

  function load(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  function randomPiece() {
    let x = Math.random() * TOTAL_WEIGHT, set = SHAPE_SETS[0];
    for (const s of SHAPE_SETS) { x -= s.weight; if (x <= 0) { set = s; break; } }
    const shape = set.variants[Math.floor(Math.random() * set.variants.length)];
    return { cells: shape.cells, w: shape.w, h: shape.h, color: Math.floor(Math.random() * COLORS.length) };
  }
  function canPlace(p, r0, c0, b = board) {
    for (const [r, c] of p.cells) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= N || cc >= N || b[rr * N + cc] >= 0) return false;
    }
    return true;
  }
  function fitsAnywhere(p, b = board) {
    for (let r = 0; r <= N - p.h; r++) for (let c = 0; c <= N - p.w; c++) if (canPlace(p, r, c, b)) return true;
    return false;
  }
  function newSet() {
    let set;
    for (let t = 0; t < 40; t++) {
      set = [randomPiece(), randomPiece(), randomPiece()];
      const fits = set.filter(p => fitsAnywhere(p)).length;
      if (t < 12 ? fits === 3 : fits >= 1) return set;
    }
    return set;
  }

  function newGame() {
    board = new Array(N * N).fill(-1);
    score = 0; streak = 0; sinceClear = 0; gameOver = false;
    shownScore = 0;
    pieces = newSet();
    anims.length = 0; particles.length = 0; popups.length = 0;
    save(); updateHud(true); dirty = true;
  }
  function save() { store(SAVE_KEY, { board, pieces, score, streak, sinceClear, gameOver }); }
  function restore() {
    const s = load(SAVE_KEY, null);
    if (!s || !Array.isArray(s.board) || s.board.length !== N * N || s.gameOver) return false;
    board = s.board; pieces = s.pieces; score = s.score | 0; streak = s.streak | 0; sinceClear = s.sinceClear | 0; gameOver = false;
    shownScore = score;
    if (pieces.every(p => !p)) pieces = newSet();
    return true;
  }

  // ---------- Audio ----------
  let actx = null;
  function audio() {
    if (!soundOn) return null;
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, type = 'sine', vol = 0.12, delay = 0) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const sfx = {
    pick() { tone(520, 0.05, 'triangle', 0.06); },
    place() { tone(200, 0.08, 'triangle', 0.16); tone(300, 0.06, 'sine', 0.06, 0.01); },
    clear(lines, combo) {
      const base = 440 * Math.pow(2, Math.min(combo, 8) / 12);
      const n = 3 + Math.min(lines, 4);
      for (let i = 0; i < n; i++) tone(base * Math.pow(2, [0, 4, 7, 12, 16, 19, 24][i] / 12), 0.18, 'sine', 0.1, i * 0.05);
    },
    bad() { tone(140, 0.12, 'sawtooth', 0.04); },
    over() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, i * 0.16)); },
  };
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

  // ---------- Canvas / layout ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, cell = 40, bx = 0, by = 0, bsize = 320, trayY = 0, slotW = 0, trayScale = 0.5, trayH = 0;

  function layout() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const maxByH = (H - 24) / (1 + 0.12 + 0.42); // board + gap + tray
    bsize = Math.min(W * 0.94, maxByH, 560);
    cell = Math.floor(bsize / N); bsize = cell * N;
    trayH = bsize * 0.42;
    const total = bsize + bsize * 0.12 + trayH;
    bx = Math.round((W - bsize) / 2);
    by = Math.max(8, Math.round((H - total) * 0.35));
    trayY = by + bsize + bsize * 0.12;
    slotW = bsize / 3;
    trayScale = Math.min(0.62, (slotW * 0.86) / (5 * cell), (trayH * 0.9) / (5 * cell)) ;
    trayScale = Math.max(trayScale, Math.min(0.62, (slotW * 0.9) / (5 * cell)));
    dirty = true;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawBlock(x, y, s, ci, alpha = 1) {
    const col = COLORS[ci];
    const b = s * 0.13;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = col.base; ctx.fillRect(x, y, s, s);
    // bevels
    ctx.fillStyle = col.light;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y); ctx.lineTo(x + s - b, y + b); ctx.lineTo(x + b, y + b); ctx.fill();
    ctx.fillStyle = col.lite;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + b, y + b); ctx.lineTo(x + b, y + s - b); ctx.lineTo(x, y + s); ctx.fill();
    ctx.fillStyle = col.dark;
    ctx.beginPath(); ctx.moveTo(x + s, y); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - b, y + s - b); ctx.lineTo(x + s - b, y + b); ctx.fill();
    ctx.fillStyle = col.darker;
    ctx.beginPath(); ctx.moveTo(x, y + s); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - b, y + s - b); ctx.lineTo(x + b, y + s - b); ctx.fill();
    // glossy face
    const g = ctx.createLinearGradient(x, y + b, x, y + s - b);
    g.addColorStop(0, col.lite); g.addColorStop(1, col.base);
    ctx.fillStyle = g; ctx.fillRect(x + b, y + b, s - 2 * b, s - 2 * b);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + b * 1.6, y + b * 1.6, s * 0.18, s * 0.08);
    ctx.globalAlpha = 1;
  }

  function drawPiece(p, x, y, s, alpha = 1) {
    for (const [r, c] of p.cells) drawBlock(x + c * s, y + r * s, s, p.color, alpha);
  }

  // ---------- Effects ----------
  const anims = [];     // clearing cells
  const particles = [];
  const popups = [];
  let shake = 0;
  let dirty = true;

  function spawnClear(cells, now) {
    for (const { r, c, color, d } of cells) {
      anims.push({ r, c, color, t0: now + d * 35 });
      for (let i = 0; i < 3; i++) {
        particles.push({
          x: bx + (c + 0.5) * cell, y: by + (r + 0.5) * cell,
          vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 6 - 1,
          s: cell * (0.12 + Math.random() * 0.15), color, t0: now + d * 35, life: 700 + Math.random() * 300,
        });
      }
    }
  }
  function popup(text, x, y, size, color = '#fff', delay = 0) {
    const half = size * text.length * 0.3;
    x = Math.max(half + 6, Math.min(W - half - 6, x));
    popups.push({ text, x, y, size, color, t0: performance.now() + delay });
  }

  // ---------- Game logic ----------
  function place(slot, r0, c0) {
    const p = pieces[slot];
    for (const [r, c] of p.cells) board[(r0 + r) * N + (c0 + c)] = p.color;
    let gained = p.cells.length;

    const rows = [], cols = [];
    for (let r = 0; r < N; r++) { let full = true; for (let c = 0; c < N; c++) if (board[r * N + c] < 0) { full = false; break; } if (full) rows.push(r); }
    for (let c = 0; c < N; c++) { let full = true; for (let r = 0; r < N; r++) if (board[r * N + c] < 0) { full = false; break; } if (full) cols.push(c); }
    const lines = rows.length + cols.length;
    const cx = bx + (c0 + p.w / 2) * cell, cy = by + (r0 + p.h / 2) * cell;

    if (lines > 0) {
      streak++; sinceClear = 0;
      const now = performance.now();
      const toClear = new Map();
      const pr = r0 + p.h / 2, pc = c0 + p.w / 2;
      for (const r of rows) for (let c = 0; c < N; c++) toClear.set(r * N + c, { r, c });
      for (const c of cols) for (let r = 0; r < N; r++) toClear.set(r * N + c, { r, c });
      const list = [];
      for (const [i, v] of toClear) {
        list.push({ ...v, color: board[i], d: Math.abs(v.r - pr) + Math.abs(v.c - pc) });
        board[i] = -1;
      }
      spawnClear(list, now);
      let pts = 10 * lines * (lines + 1) / 2 * Math.max(1, streak);
      const empty = board.every(v => v < 0);
      if (empty) pts += 300;
      gained += pts;
      shake = Math.min(14, 3 + lines * 3);
      popup('+' + pts, cx, cy, cell * 0.9, '#fff');
      const words = ['', '', 'Great!', 'Excellent!', 'Amazing!', 'Unbelievable!'];
      if (lines >= 2) popup(words[Math.min(lines, 5)], W / 2, by + bsize * 0.38, cell * 1.0, '#ffd166', 120);
      if (streak >= 2) popup('Combo x' + streak, W / 2, by + bsize * 0.52, cell * 0.85, '#7ef0ff', 220);
      if (empty) popup('Board Clear! +300', W / 2, by + bsize * 0.66, cell * 0.75, '#a6ff8f', 340);
      sfx.clear(lines, streak);
      buzz(lines > 1 ? [20, 30, 20] : 25);
    } else {
      sinceClear++;
      if (sinceClear >= 3) streak = 0;
      sfx.place();
      buzz(8);
    }

    score += gained;
    pieces[slot] = null;
    if (pieces.every(x => !x)) pieces = newSet();
    updateHud();

    if (!pieces.some(x => x && fitsAnywhere(x))) {
      gameOver = true;
      save();
      setTimeout(showGameOver, 900);
    } else {
      save();
    }
    dirty = true;
  }

  // ---------- HUD ----------
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  let newBestThisGame = false;
  function updateHud(reset) {
    if (score > best) { best = score; store(BEST_KEY, best); if (!reset) newBestThisGame = true; }
    if (reset) { scoreEl.textContent = score; newBestThisGame = false; }
    bestEl.textContent = best;
  }

  const overOverlay = document.getElementById('overlay-over');
  function showGameOver() {
    sfx.over();
    document.getElementById('final-score').textContent = score;
    document.getElementById('final-best').textContent = best;
    document.getElementById('new-best').hidden = !(newBestThisGame && score > 0);
    overOverlay.hidden = false;
  }
  document.getElementById('btn-again').addEventListener('click', () => { overOverlay.hidden = true; newGame(); });

  const confirmOverlay = document.getElementById('overlay-confirm');
  document.getElementById('btn-restart').addEventListener('click', () => {
    if (gameOver || score === 0) { overOverlay.hidden = true; newGame(); return; }
    confirmOverlay.hidden = false;
  });
  document.getElementById('btn-cancel').addEventListener('click', () => { confirmOverlay.hidden = true; });
  document.getElementById('btn-confirm').addEventListener('click', () => { confirmOverlay.hidden = true; newGame(); });

  const sOn = document.getElementById('ico-sound-on'), sOff = document.getElementById('ico-sound-off');
  function syncSound() { sOn.hidden = !soundOn; sOff.hidden = soundOn; }
  document.getElementById('btn-sound').addEventListener('click', () => {
    soundOn = !soundOn; store(SOUND_KEY, soundOn); syncSound(); if (soundOn) sfx.pick();
  });

  // ---------- Input ----------
  let drag = null; // {slot, x, y, target:{r,c}|null}

  function slotRect(i) { return { x: bx + i * slotW, y: trayY, w: slotW, h: trayH }; }
  function trayPiecePos(i, p) {
    const sr = slotRect(i);
    const s = Math.min(cell * 0.62, (sr.w * 0.9) / p.w, (sr.h * 0.9) / p.h);
    return { x: sr.x + (sr.w - p.w * s) / 2, y: sr.y + (sr.h - p.h * s) / 2, s };
  }
  function dragGeom(p, x, y) {
    const lift = cell * 1.4;
    const left = x - (p.w * cell) / 2;
    const top = y - lift - p.h * cell;
    return { left, top };
  }
  function computeTarget() {
    const p = pieces[drag.slot];
    const { left, top } = dragGeom(p, drag.x, drag.y);
    const c = Math.round((left - bx) / cell), r = Math.round((top - by) / cell);
    drag.target = canPlace(p, r, c) ? { r, c } : null;
  }
  function pt(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  canvas.addEventListener('pointerdown', e => {
    if (gameOver || drag) return;
    const { x, y } = pt(e);
    for (let i = 0; i < 3; i++) {
      const p = pieces[i]; if (!p) continue;
      const sr = slotRect(i);
      if (x >= sr.x && x <= sr.x + sr.w && y >= sr.y - cell * 0.4 && y <= sr.y + sr.h + cell) {
        drag = { slot: i, x, y, target: null, id: e.pointerId };
        try { canvas.setPointerCapture(e.pointerId); } catch {}
        computeTarget(); sfx.pick(); dirty = true;
        e.preventDefault();
        return;
      }
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const { x, y } = pt(e); drag.x = x; drag.y = y; computeTarget(); dirty = true;
  });
  function endDrag(e, cancel) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null; dirty = true;
    if (!cancel && d.target) place(d.slot, d.target.r, d.target.c);
  }
  canvas.addEventListener('pointerup', e => endDrag(e, false));
  canvas.addEventListener('pointercancel', e => endDrag(e, true));
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());

  // ---------- Render ----------
  function render(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    let ox = 0, oy = 0;
    if (shake > 0.2) { ox = (Math.random() - 0.5) * shake; oy = (Math.random() - 0.5) * shake; shake *= 0.86; } else shake = 0;
    ctx.save(); ctx.translate(ox, oy);

    // board frame
    const pad = cell * 0.18;
    ctx.fillStyle = 'rgba(8,10,30,0.55)';
    roundRect(bx - pad, by - pad, bsize + pad * 2, bsize + pad * 2, cell * 0.28); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; ctx.stroke();

    // preview info
    let ghost = null, hiRows = new Set(), hiCols = new Set(), hiColor = 0;
    if (drag && drag.target) {
      const p = pieces[drag.slot];
      ghost = { p, ...drag.target };
      hiColor = p.color;
      const tmp = board.slice();
      for (const [r, c] of p.cells) tmp[(ghost.r + r) * N + ghost.c + c] = p.color;
      for (let r = 0; r < N; r++) { let f = true; for (let c = 0; c < N; c++) if (tmp[r * N + c] < 0) { f = false; break; } if (f) hiRows.add(r); }
      for (let c = 0; c < N; c++) { let f = true; for (let r = 0; r < N; r++) if (tmp[r * N + c] < 0) { f = false; break; } if (f) hiCols.add(c); }
    }

    // cells
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const x = bx + c * cell, y = by + r * cell, v = board[r * N + c];
      if (v >= 0) {
        drawBlock(x, y, cell, (hiRows.has(r) || hiCols.has(c)) ? hiColor : v);
      } else {
        ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.065)';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      }
    }
    if (ghost) {
      for (const [r, c] of ghost.p.cells) {
        const rr = ghost.r + r, cc = ghost.c + c;
        const willClear = hiRows.has(rr) || hiCols.has(cc);
        drawBlock(bx + cc * cell, by + rr * cell, cell, ghost.p.color, willClear ? 1 : 0.4);
      }
      if (hiRows.size || hiCols.size) {
        const pulse = 0.18 + 0.12 * Math.sin(now / 90);
        ctx.fillStyle = `rgba(255,255,255,${pulse})`;
        for (const r of hiRows) ctx.fillRect(bx, by + r * cell, bsize, cell);
        for (const c of hiCols) ctx.fillRect(bx + c * cell, by, cell, bsize);
      }
    }

    // clearing anims
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i], t = (now - a.t0) / 320;
      if (t >= 1) { anims.splice(i, 1); continue; }
      if (t < 0) { drawBlock(bx + a.c * cell, by + a.r * cell, cell, a.color); continue; }
      const s = cell * (1 - t * 0.9), off = (cell - s) / 2;
      drawBlock(bx + a.c * cell + off, by + a.r * cell + off, s, a.color, 1 - t);
      ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - t)})`;
      ctx.fillRect(bx + a.c * cell + off, by + a.r * cell + off, s, s);
    }
    ctx.restore();

    // tray
    for (let i = 0; i < 3; i++) {
      const p = pieces[i]; if (!p || (drag && drag.slot === i)) continue;
      const pos = trayPiecePos(i, p);
      const ok = fitsAnywhere(p);
      drawPiece(p, pos.x, pos.y, pos.s, ok ? 1 : 0.3);
    }

    // dragged piece
    if (drag) {
      const p = pieces[drag.slot];
      const { left, top } = dragGeom(p, drag.x, drag.y);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
      drawPiece(p, left, top, cell * 0.96, 0.95);
      ctx.restore();
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i], t = now - q.t0;
      if (t < 0) continue;
      if (t > q.life) { particles.splice(i, 1); continue; }
      const k = t / 16;
      const x = q.x + q.vx * k, y = q.y + q.vy * k + 0.12 * k * k;
      ctx.globalAlpha = 1 - t / q.life;
      ctx.fillStyle = COLORS[q.color] ? COLORS[q.color].light : '#fff';
      ctx.fillRect(x - q.s / 2, y - q.s / 2, q.s, q.s);
    }
    ctx.globalAlpha = 1;

    // popups
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i], t = (now - p.t0) / 1100;
      if (t < 0) continue;
      if (t >= 1) { popups.splice(i, 1); continue; }
      const scale = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : t < 0.25 ? 1.1 - (t - 0.15) : 1;
      ctx.save();
      ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      ctx.translate(p.x, p.y - t * cell * 1.2); ctx.scale(scale, scale);
      ctx.font = `900 ${Math.round(p.size)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = p.size * 0.16; ctx.strokeStyle = 'rgba(20,20,50,0.85)'; ctx.lineJoin = 'round';
      ctx.strokeText(p.text, 0, 0); ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }

  function frame(now) {
    // animate score counter
    if (shownScore !== score) {
      const diff = score - shownScore;
      shownScore += diff > 0 ? Math.max(1, Math.ceil(diff * 0.15)) : diff;
      scoreEl.textContent = shownScore;
    }
    const busy = anims.length || particles.length || popups.length || shake || drag;
    if (dirty || busy) { render(now); dirty = false; }
    requestAnimationFrame(frame);
  }

  // ---------- Boot ----------
  best = load(BEST_KEY, 0) | 0;
  soundOn = load(SOUND_KEY, true) !== false;
  syncSound();
  if (!restore()) newGame();
  updateHud(true);
  layout();
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(canvas);
  requestAnimationFrame(frame);

  // test hook
  window.__pp = { get board() { return board; }, get pieces() { return pieces; }, get score() { return score; }, place, canPlace, newGame };
})();
