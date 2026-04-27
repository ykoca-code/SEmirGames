/* ==========================================================================
   Tetris
   - 10x20 playfield, 7 standard tetrominoes
   - Rotation, soft/hard drop, hold piece, next preview
   - Line clear with scoring, level-based gravity, game over
   ========================================================================== */

(function () {
  "use strict";

  const COLS = 10;
  const ROWS = 20;
  const CELL = 30; // logical px; canvas is 300x600
  const PREVIEW_CELL = 24;

  const COLORS = {
    I: "#00b8d9",
    O: "#ffb400",
    T: "#a855f7",
    S: "#10b981",
    Z: "#ef4444",
    J: "#3b82f6",
    L: "#f97316",
    ghost: "rgba(255,255,255,0.12)",
    grid: "#23273a",
    empty: "#1a1d29",
  };

  const PIECES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]],
  };

  const PIECE_KEYS = Object.keys(PIECES);

  function rotate(matrix) {
    const N = matrix.length;
    const M = matrix[0].length;
    const out = Array.from({ length: M }, () => Array(N).fill(0));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < M; c++) {
        out[c][N - 1 - r] = matrix[r][c];
      }
    }
    return out;
  }

  function emptyBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  // ---- State ----
  const state = {
    board: emptyBoard(),
    current: null, // { type, shape, row, col }
    next: null,
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 1,
    dropAccum: 0,
    dropInterval: 1000,
    lastTs: 0,
    running: false,
    paused: false,
    gameOver: false,
    bag: [],
  };

  // ---- DOM ----
  const els = {
    canvas: document.getElementById("board"),
    nextCanvas: document.getElementById("next"),
    holdCanvas: document.getElementById("hold"),
    score: document.getElementById("score"),
    lines: document.getElementById("lines"),
    level: document.getElementById("level"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
    newGameBtn: document.getElementById("newGameBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    touchBtns: document.querySelectorAll(".touch-btn"),
  };
  const ctx = els.canvas.getContext("2d");
  const nextCtx = els.nextCanvas.getContext("2d");
  const holdCtx = els.holdCanvas.getContext("2d");

  // ---- 7-bag piece generator ----
  function nextFromBag() {
    if (state.bag.length === 0) {
      state.bag = PIECE_KEYS.slice();
      for (let i = state.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]];
      }
    }
    const type = state.bag.pop();
    return { type, shape: PIECES[type].map((r) => r.slice()) };
  }

  function spawn() {
    const piece = state.next || nextFromBag();
    state.next = nextFromBag();
    piece.row = 0;
    piece.col = Math.floor((COLS - piece.shape[0].length) / 2);
    state.current = piece;
    state.canHold = true;
    if (collides(piece, 0, 0, piece.shape)) {
      gameOver();
    }
  }

  // ---- Collision ----
  function collides(piece, dr, dc, shape) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nr = piece.row + r + dr;
        const nc = piece.col + c + dc;
        if (nc < 0 || nc >= COLS || nr >= ROWS) return true;
        if (nr >= 0 && state.board[nr][nc]) return true;
      }
    }
    return false;
  }

  // ---- Movement ----
  function move(dc) {
    if (!state.current || state.paused || state.gameOver) return;
    if (!collides(state.current, 0, dc, state.current.shape)) {
      state.current.col += dc;
    }
  }

  function softDrop() {
    if (!state.current || state.paused || state.gameOver) return;
    if (!collides(state.current, 1, 0, state.current.shape)) {
      state.current.row++;
      state.score += 1;
      els.score.textContent = state.score;
    } else {
      lockPiece();
    }
  }

  function hardDrop() {
    if (!state.current || state.paused || state.gameOver) return;
    let dist = 0;
    while (!collides(state.current, dist + 1, 0, state.current.shape)) dist++;
    state.current.row += dist;
    state.score += dist * 2;
    els.score.textContent = state.score;
    lockPiece();
  }

  function rotateCurrent() {
    if (!state.current || state.paused || state.gameOver) return;
    const rotated = rotate(state.current.shape);
    // Wall kicks (basic)
    const offsets = [0, -1, 1, -2, 2];
    for (const off of offsets) {
      if (!collides(state.current, 0, off, rotated)) {
        state.current.col += off;
        state.current.shape = rotated;
        return;
      }
    }
  }

  function holdPiece() {
    if (!state.current || !state.canHold || state.paused || state.gameOver) return;
    const currentType = state.current.type;
    if (state.hold) {
      const swapType = state.hold;
      state.current = {
        type: swapType,
        shape: PIECES[swapType].map((r) => r.slice()),
        row: 0,
        col: Math.floor((COLS - PIECES[swapType][0].length) / 2),
      };
    } else {
      state.current = null;
      spawn();
    }
    state.hold = currentType;
    state.canHold = false;
  }

  // ---- Locking & line clear ----
  function lockPiece() {
    const p = state.current;
    for (let r = 0; r < p.shape.length; r++) {
      for (let c = 0; c < p.shape[r].length; c++) {
        if (!p.shape[r][c]) continue;
        const nr = p.row + r;
        const nc = p.col + c;
        if (nr < 0) return gameOver();
        state.board[nr][nc] = p.type;
      }
    }
    clearLines();
    spawn();
  }

  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (state.board[r].every((v) => v !== null)) {
        state.board.splice(r, 1);
        state.board.unshift(Array(COLS).fill(null));
        cleared++;
        r++;
      }
    }
    if (cleared > 0) {
      const points = [0, 100, 300, 500, 800][cleared] * state.level;
      state.score += points;
      state.lines += cleared;
      const newLevel = Math.floor(state.lines / 10) + 1;
      if (newLevel !== state.level) {
        state.level = newLevel;
        state.dropInterval = Math.max(80, 1000 - (state.level - 1) * 90);
      }
      els.score.textContent = state.score;
      els.lines.textContent = state.lines;
      els.level.textContent = state.level;
    }
  }

  // ---- Render ----
  function drawCell(c, x, y, color, size = CELL) {
    c.fillStyle = color;
    c.fillRect(x, y, size, size);
    c.strokeStyle = "rgba(0,0,0,0.35)";
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    // Highlight
    c.fillStyle = "rgba(255,255,255,0.18)";
    c.fillRect(x + 2, y + 2, size - 4, 3);
  }

  function drawBoard() {
    ctx.fillStyle = COLORS.empty;
    ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);

    // grid lines
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL + 0.5);
      ctx.lineTo(els.canvas.width, r * CELL + 0.5);
      ctx.stroke();
    }
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL + 0.5, 0);
      ctx.lineTo(c * CELL + 0.5, els.canvas.height);
      ctx.stroke();
    }

    // settled blocks
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = state.board[r][c];
        if (t) drawCell(ctx, c * CELL, r * CELL, COLORS[t]);
      }
    }

    // ghost
    if (state.current) {
      let dist = 0;
      while (!collides(state.current, dist + 1, 0, state.current.shape)) dist++;
      const p = state.current;
      for (let r = 0; r < p.shape.length; r++) {
        for (let c = 0; c < p.shape[r].length; c++) {
          if (!p.shape[r][c]) continue;
          const nr = p.row + r + dist;
          const nc = p.col + c;
          if (nr >= 0) {
            ctx.fillStyle = COLORS.ghost;
            ctx.fillRect(nc * CELL, nr * CELL, CELL, CELL);
            ctx.strokeStyle = "rgba(255,255,255,0.25)";
            ctx.strokeRect(nc * CELL + 0.5, nr * CELL + 0.5, CELL - 1, CELL - 1);
          }
        }
      }

      // current
      for (let r = 0; r < p.shape.length; r++) {
        for (let c = 0; c < p.shape[r].length; c++) {
          if (!p.shape[r][c]) continue;
          const nr = p.row + r;
          const nc = p.col + c;
          if (nr >= 0) drawCell(ctx, nc * CELL, nr * CELL, COLORS[p.type]);
        }
      }
    }
  }

  function drawPreview(canvas, ctx2, type) {
    ctx2.fillStyle = COLORS.empty;
    ctx2.fillRect(0, 0, canvas.width, canvas.height);
    if (!type) return;
    const shape = PIECES[type];
    const w = shape[0].length * PREVIEW_CELL;
    const h = shape.length * PREVIEW_CELL;
    const ox = (canvas.width - w) / 2;
    const oy = (canvas.height - h) / 2;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          drawCell(ctx2, ox + c * PREVIEW_CELL, oy + r * PREVIEW_CELL, COLORS[type], PREVIEW_CELL);
        }
      }
    }
  }

  // ---- Game loop ----
  function tick(ts) {
    if (!state.running) return;
    if (!state.lastTs) state.lastTs = ts;
    const dt = ts - state.lastTs;
    state.lastTs = ts;

    if (!state.paused && !state.gameOver) {
      state.dropAccum += dt;
      while (state.dropAccum >= state.dropInterval) {
        state.dropAccum -= state.dropInterval;
        if (!collides(state.current, 1, 0, state.current.shape)) {
          state.current.row++;
        } else {
          lockPiece();
        }
      }
    }

    drawBoard();
    drawPreview(els.nextCanvas, nextCtx, state.next ? state.next.type : null);
    drawPreview(els.holdCanvas, holdCtx, state.hold);
    requestAnimationFrame(tick);
  }

  // ---- Lifecycle ----
  function newGame() {
    state.board = emptyBoard();
    state.current = null;
    state.next = null;
    state.hold = null;
    state.canHold = true;
    state.score = 0;
    state.lines = 0;
    state.level = 1;
    state.dropInterval = 1000;
    state.dropAccum = 0;
    state.lastTs = 0;
    state.bag = [];
    state.gameOver = false;
    state.paused = false;
    state.running = true;
    els.score.textContent = "0";
    els.lines.textContent = "0";
    els.level.textContent = "1";
    els.pauseBtn.textContent = "Duraklat";
    hideOverlay();
    spawn();
    requestAnimationFrame(tick);
  }

  function togglePause() {
    if (state.gameOver || !state.running) return;
    state.paused = !state.paused;
    els.pauseBtn.textContent = state.paused ? "Devam" : "Duraklat";
    if (state.paused) {
      showOverlay("Duraklatıldı", "Devam etmek için tuşa bas.", "Devam");
    } else {
      hideOverlay();
    }
  }

  function gameOver() {
    state.gameOver = true;
    state.running = false;
    showOverlay(
      "Oyun Bitti",
      `Skor: ${state.score} · Satır: ${state.lines}`,
      "Tekrar Oyna"
    );
  }

  function showOverlay(title, text, btn) {
    els.overlayTitle.textContent = title;
    els.overlayText.textContent = text;
    els.overlayBtn.textContent = btn;
    els.overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    els.overlay.classList.add("hidden");
  }

  // ---- Input ----
  function handleAction(action) {
    switch (action) {
      case "left": move(-1); break;
      case "right": move(1); break;
      case "soft": softDrop(); break;
      case "hard": hardDrop(); break;
      case "rotate": rotateCurrent(); break;
      case "hold": holdPiece(); break;
    }
  }

  function bindEvents() {
    els.newGameBtn.addEventListener("click", newGame);
    els.pauseBtn.addEventListener("click", togglePause);
    els.overlayBtn.addEventListener("click", () => {
      if (state.paused && !state.gameOver) togglePause();
      else newGame();
    });

    els.touchBtns.forEach((btn) => {
      const action = btn.dataset.action;
      const repeats = action === "left" || action === "right" || action === "soft";
      let holdTimeout = null;
      let holdInterval = null;

      const start = (e) => {
        if (e) e.preventDefault();
        handleAction(action);
        if (!repeats) return;
        holdTimeout = setTimeout(() => {
          holdInterval = setInterval(() => handleAction(action), 90);
        }, 220);
      };
      const stop = () => {
        if (holdTimeout) { clearTimeout(holdTimeout); holdTimeout = null; }
        if (holdInterval) { clearInterval(holdInterval); holdInterval = null; }
      };

      btn.addEventListener("touchstart", start, { passive: false });
      btn.addEventListener("touchend", stop);
      btn.addEventListener("touchcancel", stop);
      btn.addEventListener("mousedown", start);
      btn.addEventListener("mouseup", stop);
      btn.addEventListener("mouseleave", stop);
    });

    document.addEventListener("keydown", (e) => {
      if (!state.running) {
        if (e.key === "Enter") newGame();
        return;
      }
      switch (e.key) {
        case "ArrowLeft": move(-1); e.preventDefault(); break;
        case "ArrowRight": move(1); e.preventDefault(); break;
        case "ArrowDown": softDrop(); e.preventDefault(); break;
        case "ArrowUp":
        case "x":
        case "X": rotateCurrent(); e.preventDefault(); break;
        case " ": hardDrop(); e.preventDefault(); break;
        case "c":
        case "C": holdPiece(); e.preventDefault(); break;
        case "p":
        case "P": togglePause(); e.preventDefault(); break;
      }
    });
  }

  function boot() {
    bindEvents();
    drawBoard();
    drawPreview(els.nextCanvas, nextCtx, null);
    drawPreview(els.holdCanvas, holdCtx, null);
    showOverlay("Tetris'e hoş geldin", "Başlamak için butona bas.", "Yeni Oyun");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
