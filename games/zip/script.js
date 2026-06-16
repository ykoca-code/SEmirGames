/* ==========================================================================
   Sırayla Bağla (LinkedIn Zip clone)
   - 50 procedurally generated levels with deterministic seeds
   - Connect numbered cells in order while visiting EVERY cell exactly once
     (a Hamiltonian path whose checkpoints appear in numerical order).
   - Drag from cell 1 to grow the path. Drag back to undo the last cell.
   - Difficulty ramps: grid 4x4 → 7x7, checkpoints 3 → 8.
   - Per-level best time saved in localStorage.
   ========================================================================== */
(function () {
  "use strict";

  const TOTAL_LEVELS = 50;

  // Logical canvas size. Cell size is derived from the grid each level.
  const W = 320;
  const H = 320;

  const COLORS = {
    bg: "#f5f7fb",
    grid: "#d4d8e0",
    cellBg: "#ffffff",
    pathFill: "rgba(124, 58, 237, 0.18)",
    pathStroke: "#7c3aed",
    pathStrokeStart: "#3b82f6",
    checkpointBg: "#0f172a",
    checkpointText: "#ffffff",
    hint: "rgba(34, 197, 94, 0.32)",
  };

  // ----- Game state -----
  const state = {
    level: 1,
    levelData: null,             // { size, checkpoints: {idx: number}, solution: [idx,...] }
    userPath: [],                // array of cell indices, must start at checkpoint #1
    drawing: false,
    finished: false,             // overlay shown (boot / win / between levels)
    startMs: 0,
    elapsedMs: 0,
    hintCell: -1,                // cell index briefly highlighted
    hintUntil: 0,
    bestTimes: loadBest(),       // { [level]: seconds }
  };

  const els = {
    canvas: document.getElementById("board"),
    level: document.getElementById("level"),
    timer: document.getElementById("timer"),
    best: document.getElementById("best"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
    undoBtn: document.getElementById("undoBtn"),
    resetBtn: document.getElementById("resetBtn"),
    hintBtn: document.getElementById("hintBtn"),
    prevBtn: document.getElementById("prevBtn"),
    restartBtn: document.getElementById("restartBtn"),
    nextBtn: document.getElementById("nextBtn"),
    hint: document.getElementById("hint"),
  };
  const ctx = els.canvas.getContext("2d");

  // ==========================================================================
  // SFX
  // ==========================================================================
  const SFX = (function () {
    let actx = null;
    function ac() {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
      }
      if (actx.state === "suspended") actx.resume();
      return actx;
    }
    function tone(freq, dur, opts) {
      const a = ac(); if (!a) return;
      opts = opts || {};
      const o = a.createOscillator(), g = a.createGain();
      const t0 = a.currentTime + (opts.delay || 0);
      o.type = opts.type || "triangle";
      o.frequency.setValueAtTime(freq, t0);
      if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + opts.slide), t0 + dur);
      g.gain.setValueAtTime(opts.vol || 0.05, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(a.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
    return {
      unlock: ac,
      step() { tone(540 + Math.random() * 60, 0.04, { vol: 0.04 }); },
      undo() { tone(360, 0.05, { vol: 0.04 }); },
      checkpoint() { tone(880, 0.1); tone(1320, 0.12, { delay: 0.06 }); },
      win() {
        tone(523, 0.12); tone(659, 0.12, { delay: 0.1 });
        tone(784, 0.12, { delay: 0.2 }); tone(1047, 0.22, { delay: 0.3 });
      },
      bad() { tone(220, 0.15, { type: "square", slide: -80, vol: 0.06 }); },
    };
  })();

  // ==========================================================================
  // Seeded RNG (Mulberry32 — small + deterministic)
  // ==========================================================================
  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ==========================================================================
  // Level config (size + checkpoint count grow with level)
  // ==========================================================================
  function levelConfig(level) {
    // Smooth ramp across 50 levels — keeps adjacent levels feeling similar
    // while making the gap between 1 and 50 dramatic.
    let size, checkpoints;
    if (level <= 8)        { size = 4; checkpoints = 3; }
    else if (level <= 16)  { size = 5; checkpoints = 4; }
    else if (level <= 24)  { size = 5; checkpoints = 5; }
    else if (level <= 32)  { size = 6; checkpoints = 5; }
    else if (level <= 40)  { size = 6; checkpoints = 6; }
    else if (level <= 46)  { size = 7; checkpoints = 7; }
    else                   { size = 7; checkpoints = 8; }
    return { size, checkpoints };
  }

  // ==========================================================================
  // Hamiltonian path generator (backtracking + Warnsdorff-style heuristic)
  // ==========================================================================
  function neighbors(idx, size) {
    const r = (idx / size) | 0, c = idx % size;
    const out = [];
    if (r > 0)         out.push((r - 1) * size + c);
    if (r < size - 1)  out.push((r + 1) * size + c);
    if (c > 0)         out.push(r * size + (c - 1));
    if (c < size - 1)  out.push(r * size + (c + 1));
    return out;
  }

  function findHamiltonianPath(size, rng) {
    const total = size * size;
    const visited = new Array(total).fill(false);
    const path = [];

    function dfs(idx) {
      visited[idx] = true;
      path.push(idx);
      if (path.length === total) return true;
      const candidates = neighbors(idx, size).filter((n) => !visited[n]);
      // Warnsdorff: prefer neighbors with the fewest onward options — this
      // dramatically cuts backtracking on tight grids.
      shuffleInPlace(candidates, rng);
      candidates.sort((a, b) => {
        const da = neighbors(a, size).filter((n) => !visited[n]).length;
        const db = neighbors(b, size).filter((n) => !visited[n]).length;
        return da - db;
      });
      for (const next of candidates) {
        if (dfs(next)) return true;
      }
      visited[idx] = false;
      path.pop();
      return false;
    }

    // Try several start cells; pure corners first, then random fallbacks
    const starts = [0, size - 1, total - size, total - 1];
    shuffleInPlace(starts, rng);
    const extras = [];
    for (let i = 0; i < total; i++) extras.push(i);
    shuffleInPlace(extras, rng);
    const tried = new Set(starts);
    for (const e of extras) if (!tried.has(e) && tried.size < 16) { starts.push(e); tried.add(e); }

    for (const start of starts) {
      visited.fill(false);
      path.length = 0;
      if (dfs(start)) return path.slice();
    }
    return null;
  }

  function generateLevel(level) {
    const cfg = levelConfig(level);
    // Multiple seeds per level so we can fall back if a seed happens to
    // generate a boring straight-snake path (rare but possible).
    for (let attempt = 0; attempt < 12; attempt++) {
      const seed = (level * 1009 + attempt * 9173) >>> 0;
      const rng = mulberry32(seed);
      const path = findHamiltonianPath(cfg.size, rng);
      if (!path) continue;
      // Quality filter: count direction changes; reject if too straight.
      // (Path with 0 turns is the trivial serpentine.)
      const turns = countTurns(path, cfg.size);
      const minTurns = Math.max(3, Math.floor(cfg.size * cfg.checkpoints * 0.5));
      if (turns < minTurns && attempt < 10) continue;

      // Place checkpoints evenly along the path; ensure 1 is at start and K at end.
      const total = path.length;
      const checkpoints = {};
      for (let i = 0; i < cfg.checkpoints; i++) {
        const t = i / (cfg.checkpoints - 1);
        const pos = Math.round(t * (total - 1));
        checkpoints[path[pos]] = i + 1;
      }
      return { size: cfg.size, checkpoints, solution: path };
    }
    return null;
  }

  function countTurns(path, size) {
    let turns = 0;
    for (let i = 1; i < path.length - 1; i++) {
      const a = path[i - 1], b = path[i], c = path[i + 1];
      const d1 = direction(a, b, size);
      const d2 = direction(b, c, size);
      if (d1 !== d2) turns++;
    }
    return turns;
  }

  function direction(from, to, size) {
    const d = to - from;
    if (d === 1) return "R";
    if (d === -1) return "L";
    if (d === size) return "D";
    if (d === -size) return "U";
    return "?";
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  function loadBest() {
    try { return JSON.parse(localStorage.getItem("semirk_zip_best") || "{}"); }
    catch { return {}; }
  }
  function saveBest() {
    try { localStorage.setItem("semirk_zip_best", JSON.stringify(state.bestTimes)); }
    catch {}
  }

  function startLevel(level) {
    state.level = Math.max(1, Math.min(TOTAL_LEVELS, level));
    state.levelData = generateLevel(state.level);
    if (!state.levelData) {
      // Fallback: tiny snake puzzle so the screen isn't blank
      state.levelData = {
        size: 4, checkpoints: { 0: 1, 15: 2 },
        solution: [0,1,2,3,7,6,5,4,8,9,10,11,15,14,13,12],
      };
    }
    state.userPath = [];
    state.drawing = false;
    state.finished = false;
    state.startMs = performance.now();
    state.elapsedMs = 0;
    state.hintCell = -1;
    state.hintUntil = 0;
    updateHUD();
    hideOverlay();
    render();
    requestAnimationFrame(loop);
  }

  function restartLevel() { startLevel(state.level); }
  function nextLevel() { startLevel(Math.min(TOTAL_LEVELS, state.level + 1)); }
  function prevLevel() { startLevel(Math.max(1, state.level - 1)); }

  // ==========================================================================
  // Drawing rules
  // ==========================================================================
  function startCellForLevel() {
    // The cell numbered "1"
    const ld = state.levelData;
    for (const idxStr in ld.checkpoints) {
      if (ld.checkpoints[idxStr] === 1) return +idxStr;
    }
    return -1;
  }

  function tryAddCell(idx) {
    if (state.finished) return;
    const ld = state.levelData;
    const path = state.userPath;

    if (path.length === 0) {
      // Must start at checkpoint #1
      if (idx !== startCellForLevel()) { SFX.bad(); return; }
      path.push(idx);
      SFX.step();
      return;
    }

    const last = path[path.length - 1];

    // Drag-back to undo: if we touch the second-to-last cell, drop the tip
    if (path.length >= 2 && idx === path[path.length - 2]) {
      path.pop();
      SFX.undo();
      return;
    }

    // Otherwise the new cell must be a 4-neighbor of the tip and not already in the path
    if (!isAdjacent(last, idx, ld.size)) return;
    if (path.includes(idx)) return;

    // Checkpoint ordering rule: if this cell is a checkpoint, it must be the
    // next expected number.
    const cp = ld.checkpoints[idx];
    if (cp != null) {
      const nextExpected = countCheckpointsVisited(path) + 1;
      if (cp !== nextExpected) { SFX.bad(); return; }
      path.push(idx);
      SFX.checkpoint();
    } else {
      path.push(idx);
      SFX.step();
    }

    // Win check
    if (path.length === ld.size * ld.size) {
      // All cells covered AND all checkpoints in order
      const totalCp = Object.keys(ld.checkpoints).length;
      if (countCheckpointsVisited(path) === totalCp) {
        finishLevel();
      }
    }
  }

  function countCheckpointsVisited(path) {
    const ld = state.levelData;
    let n = 0;
    for (const cell of path) {
      if (ld.checkpoints[cell] != null) n++;
    }
    return n;
  }

  function isAdjacent(a, b, size) {
    const ar = (a / size) | 0, ac = a % size;
    const br = (b / size) | 0, bc = b % size;
    return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
  }

  function finishLevel() {
    state.finished = true;
    state.elapsedMs = performance.now() - state.startMs;
    const seconds = Math.round(state.elapsedMs / 100) / 10;
    const prev = state.bestTimes[state.level];
    let extra = "";
    if (prev == null || seconds < prev) {
      state.bestTimes[state.level] = seconds;
      saveBest();
      extra = " 🏆 Yeni rekor!";
    }
    SFX.win();
    if (window.Leaderboard) {
      // Leaderboard uses score = TOTAL_LEVELS*100 - level*… nope, simpler:
      // we record level reached as the score (higher = farther), with time
      // as a tiebreaker via extra. Best by farthest level.
      const score = state.level;
      if (Leaderboard.qualifies("zip", score)) {
        Leaderboard.add("zip", Leaderboard.getName() || "Anonim", score,
          { time: seconds });
      }
    }
    els.overlayTitle.textContent = "✅ Bölüm " + state.level + " tamam!";
    els.overlayText.textContent = "Süre: " + seconds + " sn" + extra +
      (state.level < TOTAL_LEVELS ? "\n\nSonraki bölüme geçmek için tıkla." :
        "\n\n🎉 50 bölümün hepsini bitirdin!");
    els.overlayBtn.textContent = state.level < TOTAL_LEVELS ? "Sonraki Bölüm →" : "Baştan Başla";
    showOverlay();
  }

  // ==========================================================================
  // Hint: reveal the next correct cell from the solution for ~1.2s
  // ==========================================================================
  function giveHint() {
    if (state.finished) return;
    const ld = state.levelData;
    const sol = ld.solution;
    const path = state.userPath;
    // Find how far our path matches the solution prefix
    let i = 0;
    while (i < path.length && i < sol.length && path[i] === sol[i]) i++;
    if (i >= sol.length) return;
    // If the user's path has diverged from the solution, hint the cell that
    // *would* come after the last matching point.
    state.hintCell = sol[i];
    state.hintUntil = performance.now() + 1400;
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  function cellGeom() {
    const size = state.levelData.size;
    const pad = 14;
    const inner = Math.min(W, H) - pad * 2;
    const cell = Math.floor(inner / size);
    const totalW = cell * size;
    const ox = ((W - totalW) / 2) | 0;
    const oy = ((H - totalW) / 2) | 0;
    return { size, cell, ox, oy };
  }

  function cellCenter(idx, geom) {
    const r = (idx / geom.size) | 0;
    const c = idx % geom.size;
    return {
      x: geom.ox + c * geom.cell + geom.cell / 2,
      y: geom.oy + r * geom.cell + geom.cell / 2,
    };
  }

  function cellAtPoint(px, py, geom) {
    const c = Math.floor((px - geom.ox) / geom.cell);
    const r = Math.floor((py - geom.oy) / geom.cell);
    if (r < 0 || c < 0 || r >= geom.size || c >= geom.size) return -1;
    return r * geom.size + c;
  }

  function render() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const ld = state.levelData;
    if (!ld) return;
    const g = cellGeom();

    // Cells
    for (let i = 0; i < g.size * g.size; i++) {
      const r = (i / g.size) | 0, c = i % g.size;
      const x = g.ox + c * g.cell, y = g.oy + r * g.cell;
      ctx.fillStyle = COLORS.cellBg;
      roundRect(x + 2, y + 2, g.cell - 4, g.cell - 4, 8);
      ctx.fill();
    }

    // Hint highlight (fades out)
    if (state.hintCell >= 0 && performance.now() < state.hintUntil) {
      const r = (state.hintCell / g.size) | 0, c = state.hintCell % g.size;
      const x = g.ox + c * g.cell, y = g.oy + r * g.cell;
      const a = (state.hintUntil - performance.now()) / 1400;
      ctx.fillStyle = COLORS.hint.replace("0.32", String(0.32 * a));
      roundRect(x + 2, y + 2, g.cell - 4, g.cell - 4, 8);
      ctx.fill();
    } else if (state.hintCell >= 0 && performance.now() >= state.hintUntil) {
      state.hintCell = -1;
    }

    // Path
    if (state.userPath.length > 0) {
      const path = state.userPath;
      // Soft fill underlay
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = COLORS.pathFill;
      ctx.lineWidth = g.cell - 8;
      ctx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const p = cellCenter(path[i], g);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      // Bright stroke
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, COLORS.pathStrokeStart);
      grad.addColorStop(1, COLORS.pathStroke);
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(8, g.cell * 0.35);
      ctx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const p = cellCenter(path[i], g);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      // Tip dot
      const tip = cellCenter(path[path.length - 1], g);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, Math.max(4, g.cell * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }

    // Checkpoints (draw last so the path doesn't cover the numbers)
    for (const idxStr in ld.checkpoints) {
      const idx = +idxStr;
      const num = ld.checkpoints[idx];
      const cen = cellCenter(idx, g);
      const r = Math.max(10, g.cell * 0.30);
      ctx.fillStyle = COLORS.checkpointBg;
      ctx.beginPath();
      ctx.arc(cen.x, cen.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.checkpointText;
      ctx.font = "bold " + Math.max(11, Math.floor(g.cell * 0.32)) + "px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(num), cen.x, cen.y + 1);
    }
  }

  function roundRect(x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ==========================================================================
  // Loop (timer + hint fade)
  // ==========================================================================
  function loop() {
    if (!state.finished) {
      state.elapsedMs = performance.now() - state.startMs;
      updateTimer();
    }
    render();
    if (!state.finished) requestAnimationFrame(loop);
  }

  // ==========================================================================
  // UI
  // ==========================================================================
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + (s % 60).toString().padStart(2, "0");
  }
  function updateTimer() { els.timer.textContent = fmtTime(state.elapsedMs); }
  function updateHUD() {
    els.level.textContent = state.level + "/" + TOTAL_LEVELS;
    const best = state.bestTimes[state.level];
    els.best.textContent = best != null ? best + " sn" : "—";
    els.timer.textContent = fmtTime(state.elapsedMs);
    const cp = state.levelData ? Object.keys(state.levelData.checkpoints).length : 3;
    const total = state.levelData ? state.levelData.size * state.levelData.size : 16;
    els.hint.textContent =
      "1'den " + cp + "'e sırayla bağla · " + total + " hücreyi tek seferde gez";
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML = '<div class="lb-title">🏆 En Uzağa Ulaşanlar</div>' +
      Leaderboard.renderHTML("zip", (e) => "Bölüm " + e.score + (e.time ? " · " + e.time + "s" : ""));
  }

  function showOverlay() { els.overlay.classList.remove("hidden"); }
  function hideOverlay() { els.overlay.classList.add("hidden"); }

  // ==========================================================================
  // Input
  // ==========================================================================
  function canvasCoords(e) {
    const rect = els.canvas.getBoundingClientRect();
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    const x = ((t.clientX - rect.left) / rect.width) * W;
    const y = ((t.clientY - rect.top) / rect.height) * H;
    return { x, y };
  }

  function bindEvents() {
    document.addEventListener("pointerdown", () => SFX.unlock(), { once: true });
    document.addEventListener("keydown", () => SFX.unlock(), { once: true });

    els.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (state.finished) return;
      const { x, y } = canvasCoords(e);
      const g = cellGeom();
      const idx = cellAtPoint(x, y, g);
      if (idx < 0) return;
      state.drawing = true;
      // Tap on the path tip = no-op; tap on cell-1 to start
      if (state.userPath.length === 0) {
        tryAddCell(idx);
      } else if (idx === startCellForLevel() && state.userPath[0] !== idx) {
        // Different start? reset and begin fresh
        state.userPath = [idx];
      } else {
        // Maybe extending from tip
        tryAddCell(idx);
      }
    });

    els.canvas.addEventListener("pointermove", (e) => {
      if (!state.drawing || state.finished) return;
      const { x, y } = canvasCoords(e);
      const g = cellGeom();
      const idx = cellAtPoint(x, y, g);
      if (idx < 0) return;
      tryAddCell(idx);
    });

    const stopDraw = () => { state.drawing = false; };
    els.canvas.addEventListener("pointerup", stopDraw);
    els.canvas.addEventListener("pointercancel", stopDraw);
    els.canvas.addEventListener("pointerleave", stopDraw);

    els.undoBtn.addEventListener("click", () => {
      if (state.userPath.length > 0) { state.userPath.pop(); SFX.undo(); }
    });
    els.resetBtn.addEventListener("click", () => {
      state.userPath = []; SFX.undo();
    });
    els.hintBtn.addEventListener("click", giveHint);
    els.restartBtn.addEventListener("click", restartLevel);
    els.prevBtn.addEventListener("click", prevLevel);
    els.nextBtn.addEventListener("click", nextLevel);
    els.overlayBtn.addEventListener("click", () => {
      if (state.finished && state.level >= TOTAL_LEVELS) {
        startLevel(1);
      } else if (state.finished) {
        nextLevel();
      } else {
        startLevel(state.level);
      }
    });
  }

  // ==========================================================================
  // Boot
  // ==========================================================================
  function boot() {
    try {
      bindEvents();
      // Seed an idle preview so the overlay isn't on a blank canvas
      state.levelData = generateLevel(1);
      updateHUD();
      renderLBSlot();
      render();
      showOverlay();
    } catch (err) {
      els.overlayTitle.textContent = "Oyun yüklenemedi 😞";
      els.overlayText.textContent = "Hata: " + (err && err.message ? err.message : err);
      els.overlayBtn.textContent = "Yeniden Dene";
      els.overlayBtn.addEventListener("click", () => location.reload());
      showOverlay();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
