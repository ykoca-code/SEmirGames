/* ==========================================================================
   2048
   - 4x4 grid; persistent tile objects with stable ids drive smooth slide
     and merge animations via CSS transform transitions.
   - Keyboard arrows + touch swipe.
   ========================================================================== */

(function () {
  "use strict";

  const SIZE = 4;
  const STORAGE_KEY = "semirk_2048_best";
  const SLIDE_MS = 140;

  let nextTileId = 1;

  const state = {
    tiles: [], // {id, value, r, c, justMerged, justSpawned}
    score: 0,
    best: +(localStorage.getItem(STORAGE_KEY) || 0),
    won: false,
    keepPlaying: false,
    over: false,
    busy: false,
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

  // ---- Background grid ----
  function renderBackground() {
    els.board.innerHTML = "";
    for (let i = 0; i < SIZE * SIZE; i++) {
      const bg = document.createElement("div");
      bg.className = "g2048-bg";
      els.board.appendChild(bg);
    }
  }

  // ---- Layout helpers ----
  function getMetrics() {
    const rect = els.board.getBoundingClientRect();
    const inner = rect.width - 24; // padding 12px each side
    const gap = 12;
    const cell = (inner - gap * 3) / 4;
    return { cell, gap, pad: 12 };
  }

  function getX(c) {
    const m = getMetrics();
    return m.pad + c * (m.cell + m.gap);
  }
  function getY(r) {
    const m = getMetrics();
    return m.pad + r * (m.cell + m.gap);
  }

  // ---- Tile DOM management ----
  function tileClass(v) {
    return v <= 2048 ? "v" + v : "vBig";
  }

  function createTileEl(tile) {
    const el = document.createElement("div");
    el.className = "g2048-tile";
    el.dataset.id = tile.id;
    const face = document.createElement("div");
    face.className = "g2048-tile-face " + tileClass(tile.value);
    face.textContent = tile.value;
    el.appendChild(face);
    const m = getMetrics();
    el.style.width = m.cell + "px";
    el.style.height = m.cell + "px";
    el.style.transform = `translate(${getX(tile.c)}px, ${getY(tile.r)}px)`;
    els.board.appendChild(el);
    return el;
  }

  function syncTile(tile) {
    let el = els.board.querySelector(`.g2048-tile[data-id="${tile.id}"]`);
    if (!el) {
      el = createTileEl(tile);
    }
    // Outer position
    const m = getMetrics();
    el.style.width = m.cell + "px";
    el.style.height = m.cell + "px";
    el.style.transform = `translate(${getX(tile.c)}px, ${getY(tile.r)}px)`;
    // Inner face: value + class
    const face = el.firstChild;
    face.className = "g2048-tile-face " + tileClass(tile.value);
    face.textContent = tile.value;
    // Reset state classes; re-apply if needed
    el.classList.remove("appear");
    el.classList.remove("merge");
    if (tile.justSpawned) el.classList.add("appear");
  }

  function removeStaleTiles() {
    const liveIds = new Set(state.tiles.map((t) => t.id));
    els.board.querySelectorAll(".g2048-tile").forEach((el) => {
      if (!liveIds.has(+el.dataset.id)) el.remove();
    });
  }

  function render() {
    state.tiles.forEach(syncTile);
    removeStaleTiles();
    els.score.textContent = state.score;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(STORAGE_KEY, String(state.best));
    }
    els.best.textContent = state.best;
  }

  function pulseMerged() {
    state.tiles
      .filter((t) => t.justMerged)
      .forEach((t) => {
        const el = els.board.querySelector(
          `.g2048-tile[data-id="${t.id}"]`
        );
        if (!el) return;
        el.classList.remove("merge");
        // force reflow to restart animation
        void el.offsetWidth;
        el.classList.add("merge");
        setTimeout(() => el.classList.remove("merge"), 240);
      });
  }

  // ---- Spawn ----
  function spawnTile() {
    const occupied = new Set(state.tiles.map((t) => t.r * SIZE + t.c));
    const empty = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (!occupied.has(r * SIZE + c)) empty.push([r, c]);
    if (empty.length === 0) return null;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    const tile = {
      id: nextTileId++,
      value: Math.random() < 0.9 ? 2 : 4,
      r,
      c,
      justSpawned: true,
      justMerged: false,
    };
    state.tiles.push(tile);
    return tile;
  }

  // ---- Movement ----
  function getVector(dir) {
    return {
      left: { dr: 0, dc: -1 },
      right: { dr: 0, dc: 1 },
      up: { dr: -1, dc: 0 },
      down: { dr: 1, dc: 0 },
    }[dir];
  }

  function getTraversals(dir) {
    const x = [0, 1, 2, 3];
    const y = [0, 1, 2, 3];
    if (dir === "right") x.reverse();
    if (dir === "down") y.reverse();
    return { x, y };
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function move(direction) {
    if (state.over || state.busy) return;
    state.tiles.forEach((t) => {
      t.justMerged = false;
      t.justSpawned = false;
    });

    const { dr, dc } = getVector(direction);
    const trav = getTraversals(direction);

    // grid view
    const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (const t of state.tiles) grid[t.r][t.c] = t;

    let moved = false;
    const consumed = []; // tiles to delete after slide animation

    for (const r of trav.y) {
      for (const c of trav.x) {
        const tile = grid[r][c];
        if (!tile) continue;

        // Find farthest empty cell in direction, then check next for merge.
        let nr = r, nc = c;
        while (inBounds(nr + dr, nc + dc) && !grid[nr + dr][nc + dc]) {
          nr += dr;
          nc += dc;
        }

        const tr = nr + dr, tc = nc + dc;
        if (
          inBounds(tr, tc) &&
          grid[tr][tc] &&
          grid[tr][tc].value === tile.value &&
          !grid[tr][tc].justMerged
        ) {
          // Merge: tile slides into target's cell, target absorbs.
          const target = grid[tr][tc];
          target.value *= 2;
          target.justMerged = true;
          state.score += target.value;
          if (target.value === 2048 && !state.won) state.won = true;
          tile.r = tr;
          tile.c = tc;
          consumed.push(tile);
          grid[r][c] = null;
          moved = true;
        } else if (nr !== r || nc !== c) {
          grid[r][c] = null;
          grid[nr][nc] = tile;
          tile.r = nr;
          tile.c = nc;
          moved = true;
        }
      }
    }

    if (!moved) return;

    state.busy = true;
    render(); // tiles transition to their new positions

    setTimeout(() => {
      // Remove the tiles consumed by merges
      const consumedIds = new Set(consumed.map((t) => t.id));
      state.tiles = state.tiles.filter((t) => !consumedIds.has(t.id));
      // Spawn one new tile and re-render
      const spawned = spawnTile();
      render();
      pulseMerged();
      state.busy = false;

      if (state.won && !state.keepPlaying) {
        showWin();
      } else if (!hasMoves()) {
        showGameOver();
      }
    }, SLIDE_MS);
  }

  function hasMoves() {
    if (state.tiles.length < SIZE * SIZE) return true;
    const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (const t of state.tiles) grid[t.r][t.c] = t;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c].value;
        if (c + 1 < SIZE && grid[r][c + 1].value === v) return true;
        if (r + 1 < SIZE && grid[r + 1][c].value === v) return true;
      }
    }
    return false;
  }

  // ---- Lifecycle ----
  function newGame() {
    state.tiles = [];
    state.score = 0;
    state.won = false;
    state.keepPlaying = false;
    state.over = false;
    state.busy = false;
    nextTileId = 1;
    spawnTile();
    spawnTile();
    hideOverlay();
    // First render: we want spawn animations on initial tiles.
    render();
  }

  function showWin() {
    els.overlayTitle.textContent = "🎉 Kazandın!";
    els.overlayText.textContent =
      "2048'e ulaştın! İstersen daha yüksek sayılar için devam edebilirsin.";
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
        case "ArrowLeft":
          move("left");
          e.preventDefault();
          break;
        case "ArrowRight":
          move("right");
          e.preventDefault();
          break;
        case "ArrowUp":
          move("up");
          e.preventDefault();
          break;
        case "ArrowDown":
          move("down");
          e.preventDefault();
          break;
      }
    });

    // Touch swipe
    let touchStart = null;
    els.board.addEventListener(
      "touchstart",
      (e) => {
        const t = e.changedTouches[0];
        touchStart = { x: t.clientX, y: t.clientY };
      },
      { passive: true }
    );
    els.board.addEventListener(
      "touchend",
      (e) => {
        if (!touchStart) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStart.x;
        const dy = t.clientY - touchStart.y;
        const adx = Math.abs(dx),
          ady = Math.abs(dy);
        const threshold = 24;
        if (Math.max(adx, ady) >= threshold) {
          if (adx > ady) move(dx > 0 ? "right" : "left");
          else move(dy > 0 ? "down" : "up");
        }
        touchStart = null;
      },
      { passive: true }
    );

    window.addEventListener("resize", () => {
      // Reposition without animation jitter on resize.
      els.board.querySelectorAll(".g2048-tile").forEach((el) => {
        el.style.transition = "none";
      });
      render();
      requestAnimationFrame(() => {
        els.board.querySelectorAll(".g2048-tile").forEach((el) => {
          el.style.transition = "";
        });
      });
    });
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
