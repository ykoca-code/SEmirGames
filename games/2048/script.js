/* ==========================================================================
   2048
   - 4x4 grid; tiles slide and merge; aim for 2048 (game continues after).
   - Keyboard arrows + touch swipe.
   - Score, best score (localStorage), spawn/merge animations.
   ========================================================================== */

(function () {
  "use strict";

  const SIZE = 4;
  const STORAGE_KEY = "semirk_2048_best";

  const state = {
    board: [], // SIZE x SIZE ints (0 = empty)
    score: 0,
    best: +(localStorage.getItem(STORAGE_KEY) || 0),
    won: false,
    keepPlaying: false,
    over: false,
  };

  const els = {
    board: document.getElementById("board"),
    score: document.getElementById("score"),
    best: document.getElementById("best"),
    newGameBtn: document.getElementById("newGameBtn"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    continueBtn: document.getElementById("continueBtn"),
    restartBtn: document.getElementById("restartBtn"),
  };

  // Track tile elements between renders for animations.
  // Each tile element corresponds to a logical position; on each render we
  // recreate based on current board (simpler than tracking moves).

  function emptyBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function renderBackground() {
    els.board.innerHTML = "";
    for (let i = 0; i < SIZE * SIZE; i++) {
      const bg = document.createElement("div");
      bg.className = "g2048-bg";
      els.board.appendChild(bg);
    }
  }

  function tileClass(v) {
    if (v <= 2048) return "v" + v;
    return "vBig";
  }

  function positionTile(tile, r, c) {
    // Position via transform; cell size = (100% - paddings - gaps) / 4
    // padding 12px each side (24), gaps 12*3 = 36 → tile size in CSS
    // tile.style left/top via percentage isn't trivial with transform; we use
    // transform translate based on the board's actual size.
    const rect = els.board.getBoundingClientRect();
    const inner = rect.width - 24; // minus padding
    const gap = 12;
    const cell = (inner - gap * 3) / 4;
    const x = 12 + c * (cell + gap);
    const y = 12 + r * (cell + gap);
    tile.style.transform = `translate(${x}px, ${y}px)`;
    tile.style.width = cell + "px";
    tile.style.height = cell + "px";
  }

  function render(animations) {
    // Remove existing tiles
    els.board.querySelectorAll(".g2048-tile").forEach((t) => t.remove());

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = state.board[r][c];
        if (!v) continue;
        const tile = document.createElement("div");
        tile.className = "g2048-tile " + tileClass(v);
        tile.textContent = v;
        els.board.appendChild(tile);
        positionTile(tile, r, c);
        if (animations) {
          const a = animations.find((x) => x.r === r && x.c === c);
          if (a === undefined) continue;
          if (a.kind === "spawn") tile.classList.add("spawn");
          if (a.kind === "merge") tile.classList.add("merge");
        }
      }
    }

    els.score.textContent = state.score;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(STORAGE_KEY, String(state.best));
    }
    els.best.textContent = state.best;
  }

  function spawnTile() {
    const empty = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (state.board[r][c] === 0) empty.push([r, c]);
    if (empty.length === 0) return null;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    state.board[r][c] = Math.random() < 0.9 ? 2 : 4;
    return { r, c };
  }

  // ---- Movement ----
  function rotateCW(b) {
    const out = emptyBoard();
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) out[c][SIZE - 1 - r] = b[r][c];
    return out;
  }
  function rotateCCW(b) {
    const out = emptyBoard();
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) out[SIZE - 1 - c][r] = b[r][c];
    return out;
  }

  // Slide left; returns { board, moved, mergedCells: [{r,c}] }
  function slideLeft(b) {
    let moved = false;
    const merged = [];
    const out = emptyBoard();
    for (let r = 0; r < SIZE; r++) {
      const row = b[r].filter((v) => v !== 0);
      const newRow = [];
      for (let i = 0; i < row.length; i++) {
        if (row[i] === row[i + 1]) {
          const v = row[i] * 2;
          newRow.push(v);
          state.score += v;
          if (v === 2048 && !state.won) state.won = true;
          merged.push({ r, c: newRow.length - 1 });
          i++;
        } else {
          newRow.push(row[i]);
        }
      }
      while (newRow.length < SIZE) newRow.push(0);
      for (let c = 0; c < SIZE; c++) {
        out[r][c] = newRow[c];
        if (out[r][c] !== b[r][c]) moved = true;
      }
    }
    return { board: out, moved, merged };
  }

  function move(direction) {
    if (state.over) return;
    let b = state.board;

    if (direction === "right") {
      b = rotateCW(rotateCW(b));
    } else if (direction === "up") {
      b = rotateCCW(b);
    } else if (direction === "down") {
      b = rotateCW(b);
    }

    const result = slideLeft(b);
    let newBoard = result.board;
    let mergedCells = result.merged;

    // Undo rotation: map merged cells from slide-coords back to original.
    if (direction === "right") {
      newBoard = rotateCW(rotateCW(newBoard));
      mergedCells = mergedCells.map((m) => ({
        r: SIZE - 1 - m.r,
        c: SIZE - 1 - m.c,
      }));
    } else if (direction === "up") {
      newBoard = rotateCW(newBoard);
      mergedCells = mergedCells.map((m) => ({ r: m.c, c: SIZE - 1 - m.r }));
    } else if (direction === "down") {
      newBoard = rotateCCW(newBoard);
      mergedCells = mergedCells.map((m) => ({ r: SIZE - 1 - m.c, c: m.r }));
    }

    if (!result.moved) return;

    state.board = newBoard;
    const spawned = spawnTile();
    const animations = [...mergedCells.map((m) => ({ ...m, kind: "merge" }))];
    if (spawned) animations.push({ ...spawned, kind: "spawn" });
    render(animations);

    if (state.won && !state.keepPlaying) {
      showWin();
    } else if (!hasMoves()) {
      showGameOver();
    }
  }

  function hasMoves() {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        if (state.board[r][c] === 0) return true;
        if (c + 1 < SIZE && state.board[r][c] === state.board[r][c + 1]) return true;
        if (r + 1 < SIZE && state.board[r][c] === state.board[r + 1][c]) return true;
      }
    return false;
  }

  // ---- Lifecycle ----
  function newGame() {
    state.board = emptyBoard();
    state.score = 0;
    state.won = false;
    state.keepPlaying = false;
    state.over = false;
    spawnTile();
    spawnTile();
    hideOverlay();
    render([]);
  }

  function showWin() {
    els.overlayTitle.textContent = "🎉 Kazandın!";
    els.overlayText.textContent = "2048'e ulaştın! İstersen daha yüksek sayılar için devam edebilirsin.";
    els.continueBtn.classList.remove("hidden");
    els.overlay.classList.remove("hidden");
  }

  function showGameOver() {
    state.over = true;
    els.overlayTitle.textContent = "Oyun Bitti";
    els.overlayText.textContent = `Skor: ${state.score}`;
    els.continueBtn.classList.add("hidden");
    els.overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    els.overlay.classList.add("hidden");
  }

  // ---- Input ----
  function bindEvents() {
    els.newGameBtn.addEventListener("click", newGame);
    els.restartBtn.addEventListener("click", newGame);
    els.continueBtn.addEventListener("click", () => {
      state.keepPlaying = true;
      hideOverlay();
    });

    document.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "ArrowLeft": move("left"); e.preventDefault(); break;
        case "ArrowRight": move("right"); e.preventDefault(); break;
        case "ArrowUp": move("up"); e.preventDefault(); break;
        case "ArrowDown": move("down"); e.preventDefault(); break;
      }
    });

    // Touch swipe
    let touchStart = null;
    els.board.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    els.board.addEventListener("touchend", (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      const threshold = 24;
      if (Math.max(adx, ady) < threshold) return;
      if (adx > ady) move(dx > 0 ? "right" : "left");
      else move(dy > 0 ? "down" : "up");
      touchStart = null;
    }, { passive: true });

    window.addEventListener("resize", () => render([]));
  }

  function boot() {
    renderBackground();
    bindEvents();
    newGame();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
