/* ==========================================================================
   Hedef Sayı (Target Number)
   - a×a grid filled with digits 1-9
   - Computer picks a target each turn
   - Player chains adjacent cells (4-neighborhood) whose values sum exactly
     to the target. Confirming scores +<cellCount> points; cells are removed.
   - 2 players alternate; new target announced each turn.
   - Game ends when both players pass consecutively or the grid empties.
   ========================================================================== */

(function () {
  "use strict";

  const MIN_TARGET = 8;
  const MAX_TARGET = 22;

  const state = {
    size: 6,
    grid: [],           // grid[r][c] = digit or null
    target: 0,
    selected: [],       // [{r, c, value}]
    scores: [0, 0],
    turn: 0,            // 0 = player 1, 1 = player 2
    passStreak: 0,
    finished: true,
  };

  const els = {
    board: document.getElementById("board"),
    p1Box: document.getElementById("p1Box"),
    p2Box: document.getElementById("p2Box"),
    p1Score: document.getElementById("p1Score"),
    p2Score: document.getElementById("p2Score"),
    targetValue: document.getElementById("targetValue"),
    runSum: document.getElementById("runSum"),
    runTarget: document.getElementById("runTarget"),
    confirmBtn: document.getElementById("confirmBtn"),
    clearBtn: document.getElementById("clearBtn"),
    passBtn: document.getElementById("passBtn"),
    sizeSelect: document.getElementById("sizeSelect"),
    newGameBtn: document.getElementById("newGameBtn"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
  };

  // ==========================================================================
  // Setup
  // ==========================================================================
  function randDigit() {
    // Weighted toward smaller digits so the game stays solvable
    const r = Math.random();
    if (r < 0.4) return 1 + Math.floor(Math.random() * 3); // 1-3
    if (r < 0.8) return 4 + Math.floor(Math.random() * 3); // 4-6
    return 7 + Math.floor(Math.random() * 3); // 7-9
  }

  function newTarget() {
    return MIN_TARGET + Math.floor(Math.random() * (MAX_TARGET - MIN_TARGET + 1));
  }

  function newGame() {
    state.size = +els.sizeSelect.value;
    state.grid = [];
    for (let r = 0; r < state.size; r++) {
      const row = [];
      for (let c = 0; c < state.size; c++) row.push(randDigit());
      state.grid.push(row);
    }
    state.target = newTarget();
    state.selected = [];
    state.scores = [0, 0];
    state.turn = 0;
    state.passStreak = 0;
    state.finished = false;
    hideOverlay();
    buildBoard();
    render();
  }

  function buildBoard() {
    els.board.style.gridTemplateColumns = "repeat(" + state.size + ", 1fr)";
    els.board.style.gridTemplateRows = "repeat(" + state.size + ", 1fr)";
    els.board.innerHTML = "";
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        const cell = document.createElement("div");
        cell.className = "t-cell";
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.addEventListener("click", () => onCellTap(r, c));
        els.board.appendChild(cell);
      }
    }
  }

  // ==========================================================================
  // Selection (chain)
  // ==========================================================================
  function lastSelected() {
    return state.selected[state.selected.length - 1] || null;
  }

  function isAdjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  function indexOfSelected(r, c) {
    return state.selected.findIndex((s) => s.r === r && s.c === c);
  }

  function onCellTap(r, c) {
    if (state.finished) return;
    if (state.grid[r][c] === null) return;

    const idx = indexOfSelected(r, c);

    // Tap the last selected → undo
    if (idx === state.selected.length - 1 && idx !== -1) {
      state.selected.pop();
      render();
      return;
    }
    // Tapping an already-selected cell that isn't the tail → no-op
    if (idx !== -1) return;

    // First selection: anywhere
    if (state.selected.length === 0) {
      state.selected.push({ r, c, value: state.grid[r][c] });
      render();
      return;
    }

    // Subsequent: must be adjacent to tail
    if (!isAdjacent(lastSelected(), { r, c })) return;

    // Don't allow exceeding target — keep UX honest
    const newSum = currentSum() + state.grid[r][c];
    if (newSum > state.target) {
      // Visual nudge instead of silent fail
      flashOver();
      return;
    }

    state.selected.push({ r, c, value: state.grid[r][c] });
    render();
  }

  function currentSum() {
    let s = 0;
    for (const x of state.selected) s += x.value;
    return s;
  }

  // ==========================================================================
  // Confirm / clear / pass
  // ==========================================================================
  function confirmSelection() {
    if (state.finished) return;
    if (currentSum() !== state.target) return;
    if (state.selected.length === 0) return;

    state.scores[state.turn] += state.selected.length;
    for (const s of state.selected) state.grid[s.r][s.c] = null;
    state.selected = [];
    state.passStreak = 0;

    if (gridEmpty()) return finishGame();

    state.turn = 1 - state.turn;
    state.target = newTarget();
    render();
  }

  function clearSelection() {
    if (state.selected.length === 0) return;
    state.selected = [];
    render();
  }

  function passTurn() {
    if (state.finished) return;
    state.selected = [];
    state.passStreak += 1;
    if (state.passStreak >= 2) return finishGame();
    state.turn = 1 - state.turn;
    state.target = newTarget();
    render();
  }

  function gridEmpty() {
    for (let r = 0; r < state.size; r++)
      for (let c = 0; c < state.size; c++)
        if (state.grid[r][c] !== null) return false;
    return true;
  }

  // ==========================================================================
  // Finish
  // ==========================================================================
  function finishGame() {
    state.finished = true;
    const [s1, s2] = state.scores;
    let title, body;
    if (s1 > s2) {
      title = "🏆 1. Oyuncu Kazandı!";
      body = makeFinalBoard(true, false);
    } else if (s2 > s1) {
      title = "🏆 2. Oyuncu Kazandı!";
      body = makeFinalBoard(false, true);
    } else {
      title = "Berabere!";
      body = makeFinalBoard(false, false);
    }
    els.overlayTitle.textContent = title;
    els.overlayText.innerHTML = body;
    els.overlayBtn.textContent = "Yeni Oyun";
    els.overlay.classList.remove("hidden");
  }

  function makeFinalBoard(p1Win, p2Win) {
    return (
      '<div class="final-scores">' +
        '<div class="final-score' + (p1Win ? " winner" : "") + '">' +
          '<div class="fs-label" style="color:#ef4444">1. Oyuncu</div>' +
          '<div class="fs-value">' + state.scores[0] + '</div>' +
        '</div>' +
        '<div class="final-score' + (p2Win ? " winner" : "") + '">' +
          '<div class="fs-label" style="color:#3b82f6">2. Oyuncu</div>' +
          '<div class="fs-value">' + state.scores[1] + '</div>' +
        '</div>' +
      '</div>' +
      '<p style="margin:0;color:#94a3b8;font-size:13px">' +
        'Skor = ulaşmak için kullandığın kare sayısı' +
      '</p>'
    );
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  function render() {
    const tail = lastSelected();
    const cls = state.turn === 0 ? "p1-active" : "p2-active";

    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        const el = els.board.children[r * state.size + c];
        const v = state.grid[r][c];
        el.className = "t-cell";
        if (v === null) {
          el.classList.add("empty");
          el.textContent = "";
          continue;
        }
        el.textContent = v;
        const sel = indexOfSelected(r, c);
        if (sel !== -1) {
          el.classList.add("selected", cls);
          if (tail && tail.r === r && tail.c === c) el.classList.add("tip");
        }
      }
    }

    els.p1Box.classList.toggle("active", state.turn === 0 && !state.finished);
    els.p2Box.classList.toggle("active", state.turn === 1 && !state.finished);

    els.p1Score.textContent = state.scores[0];
    els.p2Score.textContent = state.scores[1];
    els.targetValue.textContent = state.target;
    els.runTarget.textContent = state.target;

    const sum = currentSum();
    els.runSum.textContent = sum;
    const rv = els.runSum.parentElement;
    rv.classList.remove("exact", "over");
    if (sum === state.target && state.selected.length > 0) rv.classList.add("exact");
    if (sum > state.target) rv.classList.add("over");

    els.confirmBtn.disabled = !(sum === state.target && state.selected.length > 0);
    els.clearBtn.disabled = state.selected.length === 0;
  }

  function flashOver() {
    els.runSum.parentElement.classList.add("over");
    setTimeout(() => {
      if (currentSum() <= state.target) {
        els.runSum.parentElement.classList.remove("over");
      }
    }, 300);
  }

  function hideOverlay() { els.overlay.classList.add("hidden"); }

  // ==========================================================================
  // Bind & boot
  // ==========================================================================
  function bindEvents() {
    els.confirmBtn.addEventListener("click", confirmSelection);
    els.clearBtn.addEventListener("click", clearSelection);
    els.passBtn.addEventListener("click", passTurn);
    els.sizeSelect.addEventListener("change", () => {
      if (!state.finished) {
        if (!confirm("Devam eden oyun var. Boyut değiştirip yeniden başlamak ister misin?")) {
          els.sizeSelect.value = state.size;
          return;
        }
      }
      newGame();
    });
    els.newGameBtn.addEventListener("click", newGame);
    els.overlayBtn.addEventListener("click", newGame);
  }

  function boot() {
    bindEvents();
    state.size = +els.sizeSelect.value;
    buildBoard();
    // initial values for display before user starts
    state.target = newTarget();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
