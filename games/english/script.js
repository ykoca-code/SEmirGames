/* ==========================================================================
   İngilizce Kelimeler
   - WORDS from words.js (window.WORDS)
   - English word + emoji shown → pick correct Turkish translation
   - Round = 10 random words, 4 multiple-choice
   - No timer (primary school audience). Hint not needed.
   - Category selector + score + streak + leaderboard
   ========================================================================== */

(function () {
  "use strict";

  const QUESTIONS_PER_ROUND = 10;
  const STORAGE_KEY = "semirk_english_best";
  const CAT_PREF_KEY = "semirk_english_cat";

  const CATEGORY_LABELS = {
    animals: "Hayvanlar",
    colors:  "Renkler",
    numbers: "Sayılar",
    food:    "Yemek",
    family:  "Aile",
    body:    "Vücut",
    clothes: "Giysi",
    school:  "Okul",
    nature:  "Doğa",
    home:    "Ev",
    verbs:   "Fiiller",
  };

  const state = {
    pool: [],
    current: null,
    qIndex: 0,
    score: 0,
    streak: 0,
    correct: 0,
    best: +(localStorage.getItem(STORAGE_KEY) || 0),
    selectedCategory: localStorage.getItem(CAT_PREF_KEY) || "all",
    locked: false,
    finished: true,
  };

  const els = {
    qNum:         document.getElementById("qNum"),
    score:        document.getElementById("score"),
    streak:       document.getElementById("streak"),
    best:         document.getElementById("best"),
    catPill:      document.getElementById("catPill"),
    wordEmoji:    document.getElementById("wordEmoji"),
    wordEn:       document.getElementById("wordEn"),
    choices:      Array.from(document.querySelectorAll(".choice")),
    newGameBtn:   document.getElementById("newGameBtn"),
    overlay:      document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText:  document.getElementById("overlayText"),
    overlayBtn:   document.getElementById("overlayBtn"),
    catChips:     document.getElementById("catChips"),
  };

  // ==========================================================================
  // Helpers
  // ==========================================================================
  function shuffle(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function getWords(cat) {
    const all = window.WORDS || [];
    if (!cat || cat === "all") return all;
    return all.filter((w) => w.category === cat);
  }

  function pickDistractors(word, all) {
    const sameCat = all.filter(
      (w) => w.category === word.category && w.tr !== word.tr
    );
    const pool = shuffle(sameCat);
    const picks = [];
    for (const w of pool) {
      if (picks.indexOf(w.tr) === -1) picks.push(w.tr);
      if (picks.length >= 3) break;
    }
    if (picks.length < 3) {
      const rest = shuffle(window.WORDS || []);
      for (const w of rest) {
        if (w.tr === word.tr) continue;
        if (picks.indexOf(w.tr) !== -1) continue;
        picks.push(w.tr);
        if (picks.length >= 3) break;
      }
    }
    return picks;
  }

  function renderCategoryChips() {
    const all = window.WORDS || [];
    const counts = { all: all.length };
    for (const w of all) counts[w.category] = (counts[w.category] || 0) + 1;

    const cats = [{ id: "all", label: "Tümü" }];
    for (const id of Object.keys(CATEGORY_LABELS)) {
      if (counts[id]) cats.push({ id, label: CATEGORY_LABELS[id] });
    }

    els.catChips.innerHTML = "";
    for (const c of cats) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cat-chip" + (c.id === state.selectedCategory ? " active" : "");
      btn.dataset.cat = c.id;
      btn.textContent = c.label + " (" + counts[c.id] + ")";
      btn.addEventListener("click", () => {
        state.selectedCategory = c.id;
        localStorage.setItem(CAT_PREF_KEY, c.id);
        els.catChips.querySelectorAll(".cat-chip").forEach((el) => el.classList.remove("active"));
        btn.classList.add("active");
      });
      els.catChips.appendChild(btn);
    }
  }

  // ==========================================================================
  // Round flow
  // ==========================================================================
  function startRound() {
    const all = getWords(state.selectedCategory);
    if (all.length < 4) {
      els.overlayText.textContent = "Bu kategoride yeterli kelime yok.";
      return;
    }
    state.pool = shuffle(all).slice(0, QUESTIONS_PER_ROUND);
    state.qIndex = 0;
    state.score = 0;
    state.streak = 0;
    state.correct = 0;
    state.locked = false;
    state.finished = false;
    clearLBSlot();
    hideOverlay();
    nextQuestion();
  }

  function nextQuestion() {
    if (state.qIndex >= state.pool.length) {
      finishRound();
      return;
    }
    const w = state.pool[state.qIndex];
    const distractors = pickDistractors(w, window.WORDS);
    const allChoices = shuffle([w.tr, ...distractors]);
    const correctIdx = allChoices.indexOf(w.tr);
    state.current = { word: w, choices: allChoices, correctIdx };
    state.locked = false;

    els.catPill.textContent = CATEGORY_LABELS[w.category] || w.category;
    els.wordEmoji.textContent = w.emoji;
    els.wordEn.textContent = w.en;
    // Re-trigger animation
    const display = els.wordEmoji.parentElement;
    display.style.animation = "none";
    void display.offsetWidth;
    display.style.animation = "";

    els.choices.forEach((btn, i) => {
      btn.textContent = allChoices[i];
      btn.disabled = false;
      btn.classList.remove("correct", "wrong");
    });
    updateStats();
  }

  function answer(idx) {
    if (state.locked || state.finished) return;
    state.locked = true;
    const correct = idx === state.current.correctIdx;
    const correctBtn = els.choices[state.current.correctIdx];
    const pickedBtn = els.choices[idx];

    els.choices.forEach((b) => (b.disabled = true));

    if (correct) {
      const points = 10 + state.streak * 5;
      state.score += points;
      state.streak += 1;
      state.correct += 1;
      pickedBtn.classList.add("correct");
    } else {
      state.streak = 0;
      pickedBtn.classList.add("wrong");
      correctBtn.classList.add("correct");
    }

    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(STORAGE_KEY, String(state.best));
    }
    updateStats();

    setTimeout(() => {
      state.qIndex += 1;
      nextQuestion();
    }, correct ? 600 : 1100);
  }

  async function finishRound() {
    state.finished = true;
    const isNewBest = state.score > 0 && state.score >= state.best;
    els.overlayTitle.textContent = isNewBest ? "🏆 Yeni Rekor!" : "Tur Bitti";
    let lines = [
      "Toplam: " + state.score,
      "Rekor: " + state.best,
      "Doğru: " + state.correct + "/" + state.pool.length,
    ];

    if (window.Leaderboard && state.score > 0 && Leaderboard.qualifies("english", state.score)) {
      const name = await Leaderboard.promptName({
        message: state.score + " puanla ilk 10'a girdin!",
      });
      if (name) {
        const rank = Leaderboard.add("english", name, state.score);
        if (rank) lines.push("Liderlik: #" + rank);
      }
    }
    els.overlayText.textContent = lines.join("\n");

    renderLBSlot();
    document.querySelector(".category-select").style.display = "none";
    els.overlayBtn.textContent = "Tekrar Oyna";
    showOverlay();
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML = '<div class="lb-title">🏆 İlk 10</div>' + Leaderboard.renderHTML("english");
  }

  function clearLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (slot) slot.innerHTML = "";
  }

  function showOverlay() { els.overlay.classList.remove("hidden"); }
  function hideOverlay() { els.overlay.classList.add("hidden"); }

  function updateStats() {
    const total = state.pool.length || QUESTIONS_PER_ROUND;
    const idx = Math.min(state.qIndex + (state.finished ? 0 : 1), total);
    els.qNum.textContent = idx + "/" + total;
    els.score.textContent = state.score;
    els.streak.textContent = state.streak;
    els.best.textContent = state.best;
  }

  function bindEvents() {
    els.choices.forEach((btn, i) => {
      btn.addEventListener("click", () => answer(i));
    });
    els.newGameBtn.addEventListener("click", () => {
      state.finished = true;
      renderCategoryChips();
      els.overlayTitle.textContent = "İngilizce Kelimeler";
      els.overlayText.textContent =
        "Kategori seç ve başla. İngilizce kelimenin Türkçesini bul!";
      els.overlayBtn.textContent = "Başla";
      document.querySelector(".category-select").style.display = "";
      clearLBSlot();
      showOverlay();
    });
    els.overlayBtn.addEventListener("click", startRound);
  }

  function boot() {
    bindEvents();
    renderCategoryChips();
    renderLBSlot();
    updateStats();
    showOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
