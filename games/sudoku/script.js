/* ==========================================================================
   Sudoku game logic
   - Generates a solved 9x9 grid via randomized backtracking
   - Removes cells by difficulty to create the puzzle
   - Handles input, validation, timer, mistakes, hints, win-state
   ========================================================================== */

(function () {
  "use strict";

  const SIZE = 9;
  const BOX = 3;
  const MAX_MISTAKES = 3;

  const DIFFICULTY_HOLES = {
    easy: 36,
    medium: 46,
    hard: 54,
  };

  // ---- State ----
  const state = {
    solution: [],
    puzzle: [],
    given: [],
    user: [],
    selected: null,
    mistakes: 0,
    startedAt: null,
    timerId: null,
    finished: false,
  };

  // ---- DOM ----
  const els = {
    board: document.getElementById("board"),
    difficulty: document.getElementById("difficulty"),
    timer: document.getElementById("timer"),
    mistakes: document.getElementById("mistakes"),
    newGameBtn: document.getElementById("newGameBtn"),
    checkBtn: document.getElementById("checkBtn"),
    hintBtn: document.getElementById("hintBtn"),
    numpad: document.querySelectorAll(".num-btn"),
    winModal: document.getElementById("winModal"),
    winText: document.getElementById("winText"),
    modalNewBtn: document.getElementById("modalNewBtn"),
  };

  // ==========================================================================
  // Sudoku generator
  // ==========================================================================

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function cloneGrid(g) {
    return g.map((row) => row.slice());
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function isSafe(grid, row, col, num) {
    for (let i = 0; i < SIZE; i++) {
      if (grid[row][i] === num || grid[i][col] === num) return false;
    }
    const br = Math.floor(row / BOX) * BOX;
    const bc = Math.floor(col / BOX) * BOX;
    for (let r = br; r < br + BOX; r++) {
      for (let c = bc; c < bc + BOX; c++) {
        if (grid[r][c] === num) return false;
      }
    }
    return true;
  }

  function fillGrid(grid) {
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (grid[row][col] === 0) {
          const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
          for (const n of nums) {
            if (isSafe(grid, row, col, n)) {
              grid[row][col] = n;
              if (fillGrid(grid)) return true;
              grid[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  function countSolutions(grid, limit = 2) {
    let count = 0;
    function solve() {
      for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
          if (grid[row][col] === 0) {
            for (let n = 1; n <= 9; n++) {
              if (isSafe(grid, row, col, n)) {
                grid[row][col] = n;
                solve();
                grid[row][col] = 0;
                if (count >= limit) return;
              }
            }
            return;
          }
        }
      }
      count++;
    }
    solve();
    return count;
  }

  function generatePuzzle(holes) {
    const solution = emptyGrid();
    fillGrid(solution);

    const puzzle = cloneGrid(solution);
    const cells = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) cells.push([r, c]);
    }
    shuffle(cells);

    let removed = 0;
    for (const [r, c] of cells) {
      if (removed >= holes) break;
      const backup = puzzle[r][c];
      puzzle[r][c] = 0;
      const test = cloneGrid(puzzle);
      if (countSolutions(test, 2) === 1) {
        removed++;
      } else {
        puzzle[r][c] = backup;
      }
    }
    return { puzzle, solution };
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  function renderBoard() {
    els.board.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.setAttribute("role", "gridcell");
        cell.dataset.row = r;
        cell.dataset.col = c;

        const val = state.user[r][c];
        if (state.given[r][c]) {
          cell.classList.add("given");
        }
        if (val !== 0) cell.textContent = val;

        cell.addEventListener("click", () => selectCell(r, c));
        els.board.appendChild(cell);
      }
    }
    refreshHighlights();
  }

  function refreshHighlights() {
    const cells = els.board.querySelectorAll(".cell");
    cells.forEach((cell) => {
      cell.classList.remove("selected", "related", "same-number");
    });
    if (!state.selected) return;

    const [sr, sc] = state.selected;
    const sVal = state.user[sr][sc];

    cells.forEach((cell) => {
      const r = +cell.dataset.row;
      const c = +cell.dataset.col;
      const sameRow = r === sr;
      const sameCol = c === sc;
      const sameBox =
        Math.floor(r / BOX) === Math.floor(sr / BOX) &&
        Math.floor(c / BOX) === Math.floor(sc / BOX);

      if (r === sr && c === sc) {
        cell.classList.add("selected");
      } else if (sameRow || sameCol || sameBox) {
        cell.classList.add("related");
      }
      if (sVal !== 0 && state.user[r][c] === sVal && !(r === sr && c === sc)) {
        cell.classList.add("same-number");
      }
    });
  }

  function getCellEl(r, c) {
    return els.board.children[r * SIZE + c];
  }

  // ==========================================================================
  // Game flow
  // ==========================================================================

  function newGame() {
    const diff = els.difficulty.value;
    const holes = DIFFICULTY_HOLES[diff] ?? DIFFICULTY_HOLES.medium;

    // Loading hint while generating
    els.board.innerHTML = '<div style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;color:#5c6478;">Oluşturuluyor…</div>';

    // Defer to allow paint
    setTimeout(() => {
      const { puzzle, solution } = generatePuzzle(holes);
      state.solution = solution;
      state.puzzle = puzzle;
      state.user = cloneGrid(puzzle);
      state.given = puzzle.map((row) => row.map((v) => v !== 0));
      state.selected = null;
      state.mistakes = 0;
      state.finished = false;

      els.mistakes.textContent = `0 / ${MAX_MISTAKES}`;
      startTimer();
      renderBoard();
      hideWinModal();
    }, 30);
  }

  function selectCell(r, c) {
    if (state.finished) return;
    state.selected = [r, c];
    refreshHighlights();
  }

  function inputNumber(num) {
    if (state.finished || !state.selected) return;
    const [r, c] = state.selected;
    if (state.given[r][c]) return;

    if (num === 0) {
      state.user[r][c] = 0;
      const cell = getCellEl(r, c);
      cell.textContent = "";
      cell.classList.remove("error", "solved");
      refreshHighlights();
      return;
    }

    state.user[r][c] = num;
    const cell = getCellEl(r, c);
    cell.textContent = num;

    if (state.solution[r][c] === num) {
      cell.classList.remove("error");
    } else {
      cell.classList.add("error");
      state.mistakes++;
      els.mistakes.textContent = `${state.mistakes} / ${MAX_MISTAKES}`;
      if (state.mistakes >= MAX_MISTAKES) {
        return gameOver();
      }
    }

    refreshHighlights();

    if (isComplete() && isCorrect()) win();
  }

  function isComplete() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (state.user[r][c] === 0) return false;
      }
    }
    return true;
  }

  function isCorrect() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (state.user[r][c] !== state.solution[r][c]) return false;
      }
    }
    return true;
  }

  function checkBoard() {
    let wrong = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = getCellEl(r, c);
        if (state.user[r][c] === 0 || state.given[r][c]) continue;
        if (state.user[r][c] === state.solution[r][c]) {
          cell.classList.remove("error");
        } else {
          cell.classList.add("error");
          wrong++;
        }
      }
    }
    if (wrong === 0 && !isComplete()) {
      flashMessage("Şimdiye kadar her şey doğru! Devam et.");
    } else if (wrong > 0) {
      flashMessage(`${wrong} hatalı kare bulundu.`);
    }
  }

  function giveHint() {
    if (state.finished) return;
    const empty = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (state.user[r][c] !== state.solution[r][c]) empty.push([r, c]);
      }
    }
    if (empty.length === 0) return;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    state.user[r][c] = state.solution[r][c];
    state.given[r][c] = true;
    const cell = getCellEl(r, c);
    cell.textContent = state.solution[r][c];
    cell.classList.add("given");
    cell.classList.remove("error");
    refreshHighlights();
    if (isComplete() && isCorrect()) win();
  }

  function gameOver() {
    stopTimer();
    state.finished = true;
    els.winText.textContent = "Maalesef hata sınırını aştın. Yeni bir oyuna ne dersin?";
    els.winModal.querySelector("h2").textContent = "Oyun Bitti";
    els.winModal.classList.remove("hidden");
  }

  function win() {
    stopTimer();
    state.finished = true;
    // Highlight all as solved
    els.board.querySelectorAll(".cell").forEach((c) => c.classList.add("solved"));
    els.winText.textContent = `Sudoku'yu ${els.timer.textContent} sürede tamamladın! Hata: ${state.mistakes}`;
    els.winModal.querySelector("h2").textContent = "🎉 Tebrikler!";
    els.winModal.classList.remove("hidden");
  }

  function hideWinModal() {
    els.winModal.classList.add("hidden");
  }

  function flashMessage(msg) {
    // Lightweight feedback via title attribute on check button
    const original = els.checkBtn.textContent;
    els.checkBtn.textContent = msg;
    els.checkBtn.disabled = true;
    setTimeout(() => {
      els.checkBtn.textContent = original;
      els.checkBtn.disabled = false;
    }, 1600);
  }

  // ==========================================================================
  // Timer
  // ==========================================================================

  function startTimer() {
    stopTimer();
    state.startedAt = Date.now();
    els.timer.textContent = "00:00";
    state.timerId = setInterval(() => {
      const sec = Math.floor((Date.now() - state.startedAt) / 1000);
      const m = String(Math.floor(sec / 60)).padStart(2, "0");
      const s = String(sec % 60).padStart(2, "0");
      els.timer.textContent = `${m}:${s}`;
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  function bindEvents() {
    els.newGameBtn.addEventListener("click", newGame);
    els.checkBtn.addEventListener("click", checkBoard);
    els.hintBtn.addEventListener("click", giveHint);
    els.modalNewBtn.addEventListener("click", newGame);
    els.difficulty.addEventListener("change", newGame);

    els.numpad.forEach((btn) => {
      btn.addEventListener("click", () => inputNumber(+btn.dataset.num));
    });

    document.addEventListener("keydown", (e) => {
      if (state.finished) return;
      if (!state.selected) return;
      if (e.key >= "1" && e.key <= "9") {
        inputNumber(+e.key);
        e.preventDefault();
      } else if (e.key === "0" || e.key === "Backspace" || e.key === "Delete") {
        inputNumber(0);
        e.preventDefault();
      } else if (e.key.startsWith("Arrow")) {
        moveSelection(e.key);
        e.preventDefault();
      }
    });
  }

  function moveSelection(key) {
    let [r, c] = state.selected;
    if (key === "ArrowUp") r = (r + 8) % 9;
    else if (key === "ArrowDown") r = (r + 1) % 9;
    else if (key === "ArrowLeft") c = (c + 8) % 9;
    else if (key === "ArrowRight") c = (c + 1) % 9;
    selectCell(r, c);
  }

  // ==========================================================================
  // Boot
  // ==========================================================================

  function boot() {
    bindEvents();
    newGame();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
