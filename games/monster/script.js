/* ==========================================================================
   Canavar Eşleştir (Match-3)
   - 7x7 grid of 6 monster types
   - Tap a tile, then a neighbor, to swap
   - Swap only sticks if it produces a 3+ match; otherwise it reverts
   - Cascading clears with chain multiplier; 25 moves per round
   ========================================================================== */

(function () {
  "use strict";

  const ROWS = 7;
  const COLS = 7;
  const NUM_TYPES = 6;
  const GAP = 4; // px between cells
  const MAX_MOVES = 25;
  const STORAGE_KEY = "semirk_monster_best";

  const GLYPHS = ["●", "■", "▲", "★", "◆", "✚"];

  // ---- State ----
  const state = {
    board: [], // [r][c] = { id, type } | null
    selected: null, // {r, c} | null
    score: 0,
    moves: MAX_MOVES,
    best: +(localStorage.getItem(STORAGE_KEY) || 0),
    busy: false,
    finished: true, // start with overlay shown
  };
  let nextTileId = 0;

  // ---- DOM ----
  const els = {
    board: document.getElementById("board"),
    score: document.getElementById("score"),
    moves: document.getElementById("moves"),
    best: document.getElementById("best"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
    newGameBtn: document.getElementById("newGameBtn"),
  };

  // ==========================================================================
  // Board logic
  // ==========================================================================
  function makeTile(type) {
    return { id: "t" + nextTileId++, type };
  }

  function makeBoard() {
    const board = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        let type;
        do {
          type = Math.floor(Math.random() * NUM_TYPES);
        } while (
          (c >= 2 && row[c - 1].type === type && row[c - 2].type === type) ||
          (r >= 2 && board[r - 1][c].type === type && board[r - 2][c].type === type)
        );
        row.push(makeTile(type));
      }
      board.push(row);
    }
    return board;
  }

  function findMatches(board) {
    const matches = new Set();
    // Rows
    for (let r = 0; r < ROWS; r++) {
      let runStart = 0;
      for (let c = 1; c <= COLS; c++) {
        const sameType =
          c < COLS &&
          board[r][c] &&
          board[r][runStart] &&
          board[r][c].type === board[r][runStart].type;
        if (!sameType) {
          if (c - runStart >= 3) {
            for (let k = runStart; k < c; k++) matches.add(r + "," + k);
          }
          runStart = c;
        }
      }
    }
    // Columns
    for (let c = 0; c < COLS; c++) {
      let runStart = 0;
      for (let r = 1; r <= ROWS; r++) {
        const sameType =
          r < ROWS &&
          board[r] && board[r][c] &&
          board[runStart] && board[runStart][c] &&
          board[r][c].type === board[runStart][c].type;
        if (!sameType) {
          if (r - runStart >= 3) {
            for (let k = runStart; k < r; k++) matches.add(k + "," + c);
          }
          runStart = r;
        }
      }
    }
    return matches;
  }

  function applyDrop(board) {
    for (let c = 0; c < COLS; c++) {
      let writeRow = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][c]) {
          if (writeRow !== r) {
            board[writeRow][c] = board[r][c];
            board[r][c] = null;
          }
          writeRow--;
        }
      }
      // Fill new tiles at top
      for (let r = writeRow; r >= 0; r--) {
        board[r][c] = makeTile(Math.floor(Math.random() * NUM_TYPES));
      }
    }
  }

  function isAdjacent(r1, c1, r2, c2) {
    return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
  }

  function swapTiles(r1, c1, r2, c2) {
    const tmp = state.board[r1][c1];
    state.board[r1][c1] = state.board[r2][c2];
    state.board[r2][c2] = tmp;
  }

  // ==========================================================================
  // Animations / async helpers
  // ==========================================================================
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  function getCellSize() {
    const inner = els.board.clientWidth - 12; // padding 6 each side
    return (inner - GAP * (COLS - 1)) / COLS;
  }

  function positionEl(el, r, c) {
    const cell = getCellSize();
    const x = 6 + c * (cell + GAP);
    const y = 6 + r * (cell + GAP);
    el.style.setProperty("--tx", x + "px");
    el.style.setProperty("--ty", y + "px");
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.width = cell + "px";
    el.style.height = cell + "px";
  }

  function createTileEl(tile) {
    const el = document.createElement("div");
    el.className = "tile t" + tile.type;
    el.dataset.id = tile.id;
    el.textContent = GLYPHS[tile.type];
    return el;
  }

  function render(opts = {}) {
    const present = new Set();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = state.board[r][c];
        if (tile) present.add(tile.id);
      }
    }

    // Add or update tiles
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = state.board[r][c];
        if (!tile) continue;
        let el = els.board.querySelector('[data-id="' + tile.id + '"]');
        if (!el) {
          el = createTileEl(tile);
          els.board.appendChild(el);
          if (opts.spawnNew) el.classList.add("spawning");
          el.addEventListener("click", onTileClick);
        }
        positionEl(el, r, c);
      }
    }

    updateSelectionVisual();
    updateStats();
  }

  function updateSelectionVisual() {
    els.board.querySelectorAll(".tile.selected").forEach((el) => el.classList.remove("selected"));
    if (state.selected) {
      const t = state.board[state.selected.r][state.selected.c];
      if (!t) return;
      const el = els.board.querySelector('[data-id="' + t.id + '"]');
      if (el) el.classList.add("selected");
    }
  }

  function updateStats() {
    els.score.textContent = state.score;
    els.moves.textContent = state.moves;
    els.best.textContent = state.best;
  }

  // ==========================================================================
  // Interaction
  // ==========================================================================
  function onTileClick(e) {
    if (state.busy || state.finished) return;
    const id = e.currentTarget.dataset.id;
    const pos = findTilePos(id);
    if (!pos) return;

    if (!state.selected) {
      state.selected = pos;
      updateSelectionVisual();
      return;
    }

    const sel = state.selected;
    if (sel.r === pos.r && sel.c === pos.c) {
      state.selected = null;
      updateSelectionVisual();
      return;
    }

    if (isAdjacent(sel.r, sel.c, pos.r, pos.c)) {
      attemptSwap(sel.r, sel.c, pos.r, pos.c);
    } else {
      // Switch selection to new tile
      state.selected = pos;
      updateSelectionVisual();
    }
  }

  function findTilePos(id) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (state.board[r][c] && state.board[r][c].id === id) return { r, c };
      }
    }
    return null;
  }

  // ==========================================================================
  // Game flow
  // ==========================================================================
  async function attemptSwap(r1, c1, r2, c2) {
    state.busy = true;
    state.selected = null;
    updateSelectionVisual();

    swapTiles(r1, c1, r2, c2);
    render();
    await wait(220);

    const matches = findMatches(state.board);
    if (matches.size === 0) {
      // revert
      swapTiles(r1, c1, r2, c2);
      render();
      await wait(220);
      state.busy = false;
      return;
    }

    state.moves--;
    updateStats();

    let cascade = 0;
    while (true) {
      const m = findMatches(state.board);
      if (m.size === 0) break;
      cascade++;

      const points = m.size * 10 * cascade;
      state.score += points;
      if (state.score > state.best) {
        state.best = state.score;
        localStorage.setItem(STORAGE_KEY, String(state.best));
      }

      // Show floating score in centroid of matches
      let sumX = 0, sumY = 0;
      const cell = getCellSize();
      for (const key of m) {
        const [r, c] = key.split(",").map(Number);
        sumX += 6 + c * (cell + GAP) + cell / 2;
        sumY += 6 + r * (cell + GAP) + cell / 2;
      }
      const cx = sumX / m.size;
      const cy = sumY / m.size;
      spawnScoreFloat("+" + points, cx, cy);

      // Mark matched tiles for clearing animation
      for (const key of m) {
        const [r, c] = key.split(",").map(Number);
        const tile = state.board[r][c];
        if (tile) {
          const el = els.board.querySelector('[data-id="' + tile.id + '"]');
          if (el) el.classList.add("clearing");
          state.board[r][c] = null;
        }
      }
      updateStats();
      await wait(280);

      // Remove cleared elements from DOM
      els.board.querySelectorAll(".tile.clearing").forEach((el) => el.remove());

      applyDrop(state.board);
      render({ spawnNew: true });
      await wait(260);
    }

    state.busy = false;

    if (state.moves <= 0) {
      finishGame();
    }
  }

  function spawnScoreFloat(text, x, y) {
    const el = document.createElement("div");
    el.className = "score-float";
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    els.board.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  function newGame() {
    // Clear old DOM
    els.board.querySelectorAll(".tile").forEach((el) => el.remove());
    state.board = makeBoard();
    state.score = 0;
    state.moves = MAX_MOVES;
    state.selected = null;
    state.busy = false;
    state.finished = false;
    hideOverlay();
    clearLBSlot();
    render({ spawnNew: false });
  }

  async function finishGame() {
    state.finished = true;
    await new Promise((r) => setTimeout(r, 400));
    const isNewBest = state.score > 0 && state.score >= state.best;
    els.overlayTitle.textContent = isNewBest ? "🏆 Yeni Rekor!" : "Süre Doldu";
    let text = "Toplam: " + state.score + "\nRekor: " + state.best;
    if (window.Leaderboard && state.score > 0 && Leaderboard.qualifies("monster", state.score)) {
      const name = await Leaderboard.promptName({
        message: state.score + " puanla ilk 10'a girdin!",
      });
      if (name) {
        const rank = Leaderboard.add("monster", name, state.score);
        if (rank) text += "\nLiderlik: #" + rank;
      }
    }
    els.overlayText.textContent = text;
    renderLBSlot();
    els.overlayBtn.textContent = "Tekrar Oyna";
    els.overlay.classList.remove("hidden");
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML = '<div class="lb-title">🏆 İlk 10</div>' + Leaderboard.renderHTML("monster");
  }

  function clearLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (slot) slot.innerHTML = "";
  }

  function hideOverlay() {
    els.overlay.classList.add("hidden");
  }

  // ==========================================================================
  // Bind & boot
  // ==========================================================================
  function bindEvents() {
    els.newGameBtn.addEventListener("click", newGame);
    els.overlayBtn.addEventListener("click", newGame);

    // Re-position tiles on resize
    window.addEventListener("resize", () => {
      els.board.querySelectorAll(".tile").forEach((el) => {
        const id = el.dataset.id;
        const pos = findTilePos(id);
        if (pos) positionEl(el, pos.r, pos.c);
      });
    });
  }

  function boot() {
    bindEvents();
    // Initial board for visual; overlay covers until user starts
    state.board = makeBoard();
    render({ spawnNew: false });
    updateStats();

    els.overlayTitle.textContent = "Canavar Eşleştir";
    els.overlayText.textContent =
      "Komşu canavarları yer değiştir. 3 ya da daha fazla aynı türü yan yana getir.\n25 hamle var, en yüksek skoru topla!";
    els.overlayBtn.textContent = "Başla";
    els.overlay.classList.remove("hidden");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
