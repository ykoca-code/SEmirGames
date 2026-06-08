/* ==========================================================================
   Mayın Tarlası (Minesweeper)
   - 3 zorluk: 9x9/10, 12x12/22, 14x14/38
   - Tek mod toggle: aç / bayrakla işaretle
   - Boş hücre açılınca komşu boşlar flood-fill ile açılır
   - İlk dokunuş HER ZAMAN güvenli (mayın varsa yeniden dağıtılır)
   - Skor = (boyut * 100 - süre) — yüksek = iyi
   ========================================================================== */

(function () {
  "use strict";

  const DIFFICULTIES = {
    easy:   { cols: 9,  rows: 9,  mines: 10, mul: 1.0 },
    medium: { cols: 12, rows: 12, mines: 22, mul: 1.5 },
    hard:   { cols: 14, rows: 14, mines: 38, mul: 2.0 },
  };

  const state = {
    cols: 9, rows: 9, mines: 10, mul: 1.0,
    board: [],     // 2D: { mine, n, revealed, flagged }
    flagMode: false,
    firstClick: true,
    revealed: 0,
    flagged: 0,
    startedAt: 0,
    timerId: null,
    finished: false,
    difficulty: "medium",
  };

  const els = {
    board: document.getElementById("board"),
    timer: document.getElementById("timer"),
    minesLeft: document.getElementById("minesLeft"),
    flagToggle: document.getElementById("flagToggle"),
    newGameBtn: document.getElementById("newGameBtn"),
    difficulty: document.getElementById("difficulty"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
  };

  // ==========================================================================
  // Board generation
  // ==========================================================================
  function emptyBoard(rows, cols) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        mine: false, n: 0, revealed: false, flagged: false,
      }))
    );
  }

  function placeMines(board, cols, rows, mineCount, avoid) {
    const cells = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) cells.push([r, c]);
    // Shuffle
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    let placed = 0;
    for (const [r, c] of cells) {
      if (placed >= mineCount) break;
      // Avoid first click and its 8 neighbours
      if (
        avoid && Math.abs(r - avoid.r) <= 1 && Math.abs(c - avoid.c) <= 1
      ) continue;
      board[r][c].mine = true;
      placed++;
    }
    // Compute numbers
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].mine) continue;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (board[nr][nc].mine) n++;
          }
        }
        board[r][c].n = n;
      }
    }
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  function buildGrid() {
    els.board.style.gridTemplateColumns = "repeat(" + state.cols + ", 1fr)";
    els.board.style.gridTemplateRows = "repeat(" + state.rows + ", 1fr)";
    els.board.innerHTML = "";
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const el = document.createElement("div");
        el.className = "cell";
        el.dataset.r = r;
        el.dataset.c = c;
        el.addEventListener("click", onCellClick);
        els.board.appendChild(el);
      }
    }
  }

  function renderCell(r, c) {
    const cell = state.board[r][c];
    const el = els.board.children[r * state.cols + c];
    el.className = "cell";
    el.textContent = "";
    if (cell.flagged) {
      el.classList.add("flagged");
      el.textContent = "🚩";
    } else if (cell.revealed) {
      el.classList.add("revealed");
      if (cell.mine) {
        el.classList.add("bomb");
        el.textContent = "💣";
      } else if (cell.n > 0) {
        el.dataset.n = cell.n;
        el.textContent = cell.n;
      } else {
        delete el.dataset.n;
      }
    } else {
      delete el.dataset.n;
    }
  }

  function renderAll() {
    for (let r = 0; r < state.rows; r++)
      for (let c = 0; c < state.cols; c++) renderCell(r, c);
    updateMineCounter();
  }

  function updateMineCounter() {
    els.minesLeft.textContent = state.mines - state.flagged;
  }

  // ==========================================================================
  // Interaction
  // ==========================================================================
  function onCellClick(e) {
    if (state.finished) return;
    const el = e.currentTarget;
    const r = +el.dataset.r;
    const c = +el.dataset.c;
    const cell = state.board[r][c];

    if (state.flagMode) {
      if (cell.revealed) return;
      cell.flagged = !cell.flagged;
      state.flagged += cell.flagged ? 1 : -1;
      renderCell(r, c);
      updateMineCounter();
      return;
    }

    if (cell.flagged || cell.revealed) return;

    if (state.firstClick) {
      state.firstClick = false;
      placeMines(state.board, state.cols, state.rows, state.mines, { r, c });
      startTimer();
    }

    if (cell.mine) {
      reveal(r, c);
      revealAllMines();
      gameOver(false);
      return;
    }

    floodReveal(r, c);
    if (state.revealed === state.cols * state.rows - state.mines) {
      gameOver(true);
    }
  }

  function reveal(r, c) {
    const cell = state.board[r][c];
    if (cell.revealed || cell.flagged) return;
    cell.revealed = true;
    state.revealed++;
    renderCell(r, c);
  }

  function floodReveal(r, c) {
    const stack = [[r, c]];
    while (stack.length) {
      const [cr, cc] = stack.pop();
      const cell = state.board[cr][cc];
      if (cell.revealed || cell.flagged) continue;
      cell.revealed = true;
      state.revealed++;
      renderCell(cr, cc);
      if (cell.n === 0 && !cell.mine) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
            if (!state.board[nr][nc].revealed) stack.push([nr, nc]);
          }
        }
      }
    }
  }

  function revealAllMines() {
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        if (state.board[r][c].mine) {
          state.board[r][c].revealed = true;
          renderCell(r, c);
        }
      }
    }
  }

  // ==========================================================================
  // Game over
  // ==========================================================================
  async function gameOver(won) {
    state.finished = true;
    stopTimer();
    const sec = Math.floor((Date.now() - state.startedAt) / 1000);

    let score = 0;
    let extra = "";
    if (won) {
      // Composite: bigger board + faster = higher score
      const sizeBonus = state.cols * state.rows;
      score = Math.max(0, Math.floor((sizeBonus * 20 - sec * 10) * state.mul));
    }

    if (won && window.Leaderboard && score > 0 && Leaderboard.qualifies("mines", score)) {
      const name = await Leaderboard.promptName({
        message: score + " puanla ilk 10'a girdin!",
      });
      if (name) {
        const rank = Leaderboard.add("mines", name, score, {
          time: els.timer.textContent,
          difficulty: state.difficulty,
        });
        if (rank) extra = " · Liderlik: #" + rank;
      }
    }

    els.overlayTitle.textContent = won ? "🏆 Kazandın!" : "💥 Mayına Bastın";
    els.overlayText.textContent = won
      ? "Süre: " + els.timer.textContent + " · Skor: " + score + extra
      : "Süre: " + els.timer.textContent + " · Tekrar dene!";
    renderLBSlot();
    els.overlayBtn.textContent = "Yeni Oyun";
    els.overlay.classList.remove("hidden");
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML =
      '<div class="lb-title">🏆 İlk 10</div>' +
      Leaderboard.renderHTML("mines", (e) =>
        e.score + " <span style=\"opacity:.55;font-size:.8em;font-weight:400\">(" +
        (e.time || "") + ")</span>"
      );
  }

  function clearLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (slot) slot.innerHTML = "";
  }

  // ==========================================================================
  // Timer
  // ==========================================================================
  function startTimer() {
    stopTimer();
    state.startedAt = Date.now();
    state.timerId = setInterval(() => {
      const sec = Math.floor((Date.now() - state.startedAt) / 1000);
      const m = String(Math.floor(sec / 60)).padStart(2, "0");
      const s = String(sec % 60).padStart(2, "0");
      els.timer.textContent = m + ":" + s;
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  function newGame() {
    const d = DIFFICULTIES[els.difficulty.value] || DIFFICULTIES.medium;
    state.cols = d.cols;
    state.rows = d.rows;
    state.mines = d.mines;
    state.mul = d.mul;
    state.difficulty = els.difficulty.value;
    state.board = emptyBoard(d.rows, d.cols);
    state.firstClick = true;
    state.revealed = 0;
    state.flagged = 0;
    state.finished = false;
    state.flagMode = false;
    els.flagToggle.classList.remove("flag-mode");
    els.flagToggle.querySelector(".ft-icon").textContent = "🔍";
    els.flagToggle.querySelector(".ft-label").textContent = "Aç";
    stopTimer();
    els.timer.textContent = "00:00";
    buildGrid();
    renderAll();
    els.overlay.classList.add("hidden");
    clearLBSlot();
  }

  function toggleFlagMode() {
    state.flagMode = !state.flagMode;
    els.flagToggle.classList.toggle("flag-mode", state.flagMode);
    els.flagToggle.querySelector(".ft-icon").textContent = state.flagMode ? "🚩" : "🔍";
    els.flagToggle.querySelector(".ft-label").textContent = state.flagMode ? "Bayrak" : "Aç";
  }

  // ==========================================================================
  // Bind & boot
  // ==========================================================================
  function boot() {
    els.newGameBtn.addEventListener("click", newGame);
    els.overlayBtn.addEventListener("click", newGame);
    els.flagToggle.addEventListener("click", toggleFlagMode);
    els.difficulty.addEventListener("change", newGame);

    newGame();
    // Start overlay
    els.overlayTitle.textContent = "Mayın Tarlası";
    els.overlayText.textContent =
      "Tüm güvenli kareleri aç, mayınlara dokunma!\n🔍 Aç modunda dokun açar.\n🚩 Bayrak modunda dokun şüpheli karayı işaretler.";
    els.overlayBtn.textContent = "Başla";
    els.overlay.classList.remove("hidden");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
