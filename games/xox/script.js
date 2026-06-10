/* ==========================================================================
   XOX (Tic-Tac-Toe)
   - Modes: Kolay Bot (random), Zor Bot (minimax), 2 Kişilik
   - 9-cell board, X always starts (player), O is opponent/second player
   ========================================================================== */

(function () {
  "use strict";

  const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  const STORAGE_KEY = "semirk_xox_scores";

  const MODE_KEY = "semirk_xox_mode";
  const DIFF_KEY = "semirk_xox_diff";

  const state = {
    board: Array(9).fill(""),
    turn: "X",
    mode: localStorage.getItem(MODE_KEY) || "bot",      // "bot" | "two-player"
    diff: localStorage.getItem(DIFF_KEY) || "easy",      // "easy" | "hard"
    finished: false,
    scores: { x: 0, o: 0, tie: 0 },
  };

  const els = {
    board: document.getElementById("board"),
    turnLine: document.getElementById("turnLine"),
    xWins: document.getElementById("xWins"),
    oWins: document.getElementById("oWins"),
    ties: document.getElementById("ties"),
    xLabel: document.getElementById("xLabel"),
    oLabel: document.getElementById("oLabel"),
    newGameBtn: document.getElementById("newGameBtn"),
    resetScoreBtn: document.getElementById("resetScoreBtn"),
    modeBtns: document.querySelectorAll(".mode-btn"),
    diffBtns: document.querySelectorAll(".diff-btn"),
    diffRow: document.getElementById("diffRow"),
  };

  function loadScores() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s) state.scores = s;
    } catch (e) {}
  }

  function saveScores() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scores));
  }

  function updateScoreUI() {
    els.xWins.textContent = state.scores.x;
    els.oWins.textContent = state.scores.o;
    els.ties.textContent = state.scores.tie;
  }

  // ==========================================================================
  // Board
  // ==========================================================================
  function buildBoard() {
    els.board.innerHTML = "";
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "xox-cell";
      cell.dataset.i = String(i);
      els.board.appendChild(cell);
    }
    // Event delegation — survives any re-render and avoids stale closures.
    els.board.addEventListener("click", (e) => {
      const cell = e.target.closest(".xox-cell");
      if (!cell || cell.disabled) return;
      const i = +cell.dataset.i;
      if (Number.isInteger(i) && i >= 0 && i < 9) onCellClick(i);
    });
  }

  function render() {
    for (let i = 0; i < 9; i++) {
      const cell = els.board.children[i];
      const v = state.board[i];
      cell.textContent = v;
      cell.className = "xox-cell" + (v === "X" ? " x" : v === "O" ? " o" : "");
      cell.disabled = !!v || state.finished ||
        (state.mode === "bot" && state.turn === "O");
    }
  }

  function checkWin(board) {
    for (const line of WIN_LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], line };
      }
    }
    if (board.every((v) => v)) return { winner: "tie", line: null };
    return null;
  }

  function highlightWin(line) {
    if (!line) return;
    for (const i of line) {
      els.board.children[i].classList.add("win");
    }
  }

  // ==========================================================================
  // Bots
  // ==========================================================================
  function botMoveEasy(board) {
    const empty = [];
    for (let i = 0; i < 9; i++) if (!board[i]) empty.push(i);
    return empty[Math.floor(Math.random() * empty.length)];
  }

  function minimax(board, depth, isMax, alpha, beta) {
    const res = checkWin(board);
    if (res) {
      if (res.winner === "O") return 10 - depth;
      if (res.winner === "X") return depth - 10;
      return 0;
    }
    if (isMax) {
      let best = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i]) continue;
        board[i] = "O";
        best = Math.max(best, minimax(board, depth + 1, false, alpha, beta));
        board[i] = "";
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i]) continue;
        board[i] = "X";
        best = Math.min(best, minimax(board, depth + 1, true, alpha, beta));
        board[i] = "";
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  function botMoveHard(board) {
    let bestScore = -Infinity;
    let bestMove = -1;
    const order = [4, 0, 2, 6, 8, 1, 3, 5, 7]; // prefer center/corners
    for (const i of order) {
      if (board[i]) continue;
      board[i] = "O";
      const sc = minimax(board, 0, false, -Infinity, Infinity);
      board[i] = "";
      if (sc > bestScore) {
        bestScore = sc;
        bestMove = i;
      }
    }
    return bestMove;
  }

  // ==========================================================================
  // Turn flow
  // ==========================================================================
  function onCellClick(i) {
    if (state.finished || state.board[i]) return;
    if (state.mode === "bot" && state.turn !== "X") return;

    state.board[i] = state.turn;
    afterMove();
  }

  function afterMove() {
    render();
    const result = checkWin(state.board);
    if (result) return finishRound(result);

    state.turn = state.turn === "X" ? "O" : "X";
    setTurnLine();
    // Re-render so cells reflect the NEW turn's disabled state. Without this
    // pass, after the bot moves and we flip back to "X" the cells stay
    // disabled from the previous render (which ran while turn was "O").
    render();

    if (state.mode === "bot" && state.turn === "O" && !state.finished) {
      setTimeout(() => {
        const move = state.diff === "hard"
          ? botMoveHard(state.board.slice())
          : botMoveEasy(state.board);
        if (move >= 0) state.board[move] = "O";
        afterMove();
      }, 350);
    }
  }

  function setTurnLine() {
    els.turnLine.className = "turn-line";
    if (state.mode === "two-player") {
      els.turnLine.textContent = state.turn === "X" ? "1. Oyuncu (X)" : "2. Oyuncu (O)";
    } else {
      els.turnLine.textContent = state.turn === "X" ? "Sıra sende (X)" : "Rakip düşünüyor… (O)";
    }
  }

  function finishRound(result) {
    state.finished = true;
    if (result.winner === "X") {
      state.scores.x++;
      els.turnLine.textContent =
        state.mode === "two-player" ? "1. Oyuncu kazandı! 🎉" : "Kazandın! 🎉";
      els.turnLine.classList.add("win");
    } else if (result.winner === "O") {
      state.scores.o++;
      els.turnLine.textContent =
        state.mode === "two-player" ? "2. Oyuncu kazandı! 🎉" : "Rakip kazandı.";
      els.turnLine.classList.add(state.mode === "two-player" ? "win" : "lose");
    } else {
      state.scores.tie++;
      els.turnLine.textContent = "Berabere.";
      els.turnLine.classList.add("tie");
    }
    saveScores();
    updateScoreUI();
    highlightWin(result.line);
    render();
  }

  function applyMode() {
    // Update mode button active state
    els.modeBtns.forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === state.mode)
    );
    // Show/hide difficulty row
    els.diffRow.classList.toggle("hidden", state.mode !== "bot");
    // Update player labels
    if (state.mode === "two-player") {
      els.xLabel.innerHTML = '1. Oyuncu: <b id="xWins">' + state.scores.x + "</b>";
      els.oLabel.innerHTML = '2. Oyuncu: <b id="oWins">' + state.scores.o + "</b>";
    } else {
      els.xLabel.innerHTML = 'Sen: <b id="xWins">' + state.scores.x + "</b>";
      els.oLabel.innerHTML = 'Rakip: <b id="oWins">' + state.scores.o + "</b>";
    }
    // Re-grab refs since innerHTML replaced them
    els.xWins = document.getElementById("xWins");
    els.oWins = document.getElementById("oWins");
  }

  function applyDiff() {
    els.diffBtns.forEach((b) =>
      b.classList.toggle("active", b.dataset.diff === state.diff)
    );
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  function newGame() {
    state.board = Array(9).fill("");
    state.turn = "X";
    state.finished = false;
    render();
    setTurnLine();
  }

  function bindEvents() {
    els.newGameBtn.addEventListener("click", newGame);
    els.resetScoreBtn.addEventListener("click", () => {
      state.scores = { x: 0, o: 0, tie: 0 };
      saveScores();
      updateScoreUI();
      applyMode();
    });
    els.modeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state.mode === btn.dataset.mode) return;
        state.mode = btn.dataset.mode;
        localStorage.setItem(MODE_KEY, state.mode);
        applyMode();
        newGame();
      });
    });
    els.diffBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state.diff === btn.dataset.diff) return;
        state.diff = btn.dataset.diff;
        localStorage.setItem(DIFF_KEY, state.diff);
        applyDiff();
        newGame();
      });
    });
  }

  function boot() {
    loadScores();
    updateScoreUI();
    buildBoard();
    bindEvents();
    applyMode();
    applyDiff();
    newGame();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
