/* ==========================================================================
   Hafıza (Memory)
   - Configurable grid (3x4, 4x4, 4x6) of card pairs.
   - Click to flip; match removes pairs. Tracks moves, time, pairs found.
   ========================================================================== */

(function () {
  "use strict";

  // Non-emoji unicode symbols + colors. Keep enough variety for largest grid (12 pairs).
  const SYMBOLS = [
    { char: "★", color: "#fbbf24" },
    { char: "♥", color: "#ef4444" },
    { char: "♦", color: "#3b82f6" },
    { char: "♣", color: "#10b981" },
    { char: "♠", color: "#1a1d29" },
    { char: "●", color: "#a855f7" },
    { char: "▲", color: "#f97316" },
    { char: "■", color: "#06b6d4" },
    { char: "◆", color: "#ec4899" },
    { char: "✿", color: "#8b5cf6" },
    { char: "❄", color: "#0ea5e9" },
    { char: "✚", color: "#dc2626" },
  ];

  const SIZES = {
    "3x4": { rows: 3, cols: 4 },
    "4x4": { rows: 4, cols: 4 },
    "4x6": { rows: 4, cols: 6 },
  };

  const state = {
    cards: [], // {id, symbolIdx, flipped, matched}
    first: null,
    second: null,
    locked: false,
    moves: 0,
    matches: 0,
    totalPairs: 0,
    startedAt: null,
    timerId: null,
  };

  const els = {
    board: document.getElementById("board"),
    sizeSelect: document.getElementById("size"),
    timer: document.getElementById("timer"),
    moves: document.getElementById("moves"),
    pairs: document.getElementById("pairs"),
    newGameBtn: document.getElementById("newGameBtn"),
    winModal: document.getElementById("winModal"),
    winText: document.getElementById("winText"),
    modalNewBtn: document.getElementById("modalNewBtn"),
  };

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function newGame() {
    const sizeKey = els.sizeSelect.value;
    const { rows, cols } = SIZES[sizeKey] || SIZES["4x4"];
    const total = rows * cols;
    if (total % 2 !== 0) return; // safety
    const pairCount = total / 2;
    state.totalPairs = pairCount;

    const symbolIndices = [];
    for (let i = 0; i < pairCount; i++) {
      symbolIndices.push(i % SYMBOLS.length, i % SYMBOLS.length);
    }
    shuffle(symbolIndices);

    state.cards = symbolIndices.map((symbolIdx, id) => ({
      id,
      symbolIdx,
      flipped: false,
      matched: false,
    }));
    state.first = null;
    state.second = null;
    state.locked = false;
    state.moves = 0;
    state.matches = 0;
    els.moves.textContent = "0";
    els.pairs.textContent = `0 / ${pairCount}`;
    els.winModal.classList.add("hidden");
    clearLBSlot();
    startTimer();
    render(cols);
  }

  function render(cols) {
    els.board.className = "memory-board cols-" + cols;
    els.board.innerHTML = "";
    for (const card of state.cards) {
      const sym = SYMBOLS[card.symbolIdx];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card" + (card.flipped ? " flipped" : "") + (card.matched ? " matched" : "");
      btn.setAttribute("aria-label", "Kart " + (card.id + 1));
      btn.dataset.id = card.id;

      const inner = document.createElement("div");
      inner.className = "card-inner";

      const back = document.createElement("div");
      back.className = "card-face card-back";

      const front = document.createElement("div");
      front.className = "card-face card-front";
      front.textContent = sym.char;
      front.style.color = sym.color;

      inner.append(back, front);
      btn.appendChild(inner);

      btn.addEventListener("click", () => onCardClick(card.id));
      els.board.appendChild(btn);
    }
  }

  function onCardClick(id) {
    if (state.locked) return;
    const card = state.cards[id];
    if (card.flipped || card.matched) return;

    flip(card, true);

    if (!state.first) {
      state.first = card;
      return;
    }
    if (state.first.id === card.id) return;

    state.second = card;
    state.moves++;
    els.moves.textContent = state.moves;
    state.locked = true;

    if (state.first.symbolIdx === state.second.symbolIdx) {
      // match
      setTimeout(() => {
        state.first.matched = true;
        state.second.matched = true;
        markMatched(state.first.id);
        markMatched(state.second.id);
        state.matches++;
        els.pairs.textContent = `${state.matches} / ${state.totalPairs}`;
        state.first = null;
        state.second = null;
        state.locked = false;
        if (state.matches === state.totalPairs) win();
      }, 280);
    } else {
      // mismatch
      setTimeout(() => {
        flip(state.first, false);
        flip(state.second, false);
        state.first = null;
        state.second = null;
        state.locked = false;
      }, 750);
    }
  }

  function flip(card, on) {
    card.flipped = on;
    const el = els.board.querySelector(`.card[data-id="${card.id}"]`);
    if (!el) return;
    if (on) el.classList.add("flipped");
    else el.classList.remove("flipped");
  }

  function markMatched(id) {
    const el = els.board.querySelector(`.card[data-id="${id}"]`);
    if (el) el.classList.add("matched");
  }

  async function win() {
    stopTimer();
    const sec = Math.floor((Date.now() - state.startedAt) / 1000);
    const sizeKey = els.sizeSelect.value;
    const sizeMul = sizeKey === "4x6" ? 2.5 : sizeKey === "4x4" ? 1.5 : 1;
    const score = Math.max(
      0,
      Math.floor((3000 - sec * 6 - state.moves * 25) * sizeMul)
    );

    let extra = "";
    if (window.Leaderboard && score > 0 && Leaderboard.qualifies("memory", score)) {
      const name = await Leaderboard.promptName({
        message: score + " puanla ilk 10'a girdin!",
      });
      if (name) {
        const rank = Leaderboard.add("memory", name, score, {
          time: els.timer.textContent,
          moves: state.moves,
          size: sizeKey,
        });
        if (rank) extra = " · Liderlik: #" + rank;
      }
    }

    els.winText.textContent =
      state.moves + " hamle · " + els.timer.textContent +
      " · Skor: " + score + extra;
    renderLBSlot();
    els.winModal.classList.remove("hidden");
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML =
      '<div class="lb-title">🏆 İlk 10</div>' +
      Leaderboard.renderHTML("memory", (e) =>
        e.score + " <span style=\"opacity:.55;font-size:.8em;font-weight:400\">(" +
        (e.time || "") + ")</span>"
      );
  }

  function clearLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (slot) slot.innerHTML = "";
  }

  // ---- Timer ----
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
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
  }

  // ---- Bind ----
  function bindEvents() {
    els.newGameBtn.addEventListener("click", newGame);
    els.modalNewBtn.addEventListener("click", newGame);
    els.sizeSelect.addEventListener("change", newGame);
  }

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
