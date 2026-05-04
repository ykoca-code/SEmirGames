/* ==========================================================================
   Emoji Quiz
   - Loads QUESTIONS from questions.js (window.QUESTIONS)
   - Round = 10 random questions, 4 multiple-choice each
   - Distractors come from same category when possible
   - Score: 10 per correct + 5 * current streak (streak resets on wrong)
   ========================================================================== */

(function () {
  "use strict";

  const QUESTIONS_PER_ROUND = 10;
  const STORAGE_KEY = "semirk_emoji_best";

  const CATEGORY_LABELS = {
    yemek: "Türk Yemeği",
    sehir: "Türkiye Şehri",
    deyim: "Atasözü / Deyim",
    film:  "Film / Dizi",
    dunya: "Dünya / Genel",
  };

  // ---- State ----
  const state = {
    pool: [],            // shuffled subset for current round
    current: null,       // { question, choices, correctIdx }
    qIndex: 0,           // 0..QUESTIONS_PER_ROUND-1
    score: 0,
    streak: 0,
    best: +(localStorage.getItem(STORAGE_KEY) || 0),
    locked: false,
    finished: true,
  };

  // ---- DOM ----
  const els = {
    qNum:      document.getElementById("qNum"),
    score:     document.getElementById("score"),
    streak:    document.getElementById("streak"),
    best:      document.getElementById("best"),
    pill:      document.getElementById("categoryPill"),
    display:   document.getElementById("emojiDisplay"),
    choices:   Array.from(document.querySelectorAll(".choice")),
    newGameBtn:document.getElementById("newGameBtn"),
    overlay:   document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText:  document.getElementById("overlayText"),
    overlayBtn:   document.getElementById("overlayBtn"),
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

  function pickDistractors(question, all) {
    const sameCat = all.filter(
      (q) => q.category === question.category && q.answer !== question.answer
    );
    const pool = shuffle(sameCat);
    const picks = [];
    for (const q of pool) {
      if (picks.indexOf(q.answer) === -1) picks.push(q.answer);
      if (picks.length >= 3) break;
    }
    if (picks.length < 3) {
      const rest = shuffle(all);
      for (const q of rest) {
        if (q.answer === question.answer) continue;
        if (picks.indexOf(q.answer) !== -1) continue;
        picks.push(q.answer);
        if (picks.length >= 3) break;
      }
    }
    return picks;
  }

  // ==========================================================================
  // Round flow
  // ==========================================================================
  function startRound() {
    const all = window.QUESTIONS || [];
    if (all.length < 4) {
      els.display.textContent = "⚠️";
      return;
    }
    state.pool = shuffle(all).slice(0, QUESTIONS_PER_ROUND);
    state.qIndex = 0;
    state.score = 0;
    state.streak = 0;
    state._correct = 0;
    state.locked = false;
    state.finished = false;
    hideOverlay();
    nextQuestion();
  }

  function nextQuestion() {
    if (state.qIndex >= state.pool.length) {
      finishRound();
      return;
    }
    const q = state.pool[state.qIndex];
    const distractors = pickDistractors(q, window.QUESTIONS);
    const allChoices = shuffle([q.answer, ...distractors]);
    const correctIdx = allChoices.indexOf(q.answer);
    state.current = { question: q, choices: allChoices, correctIdx };

    els.pill.textContent = CATEGORY_LABELS[q.category] || q.category;
    els.display.textContent = q.emojis;
    // Re-trigger emoji pop animation
    els.display.style.animation = "none";
    void els.display.offsetWidth;
    els.display.style.animation = "";

    els.choices.forEach((btn, i) => {
      btn.textContent = allChoices[i];
      btn.disabled = false;
      btn.classList.remove("correct", "wrong");
    });

    state.locked = false;
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
      state._correct += 1;
      pickedBtn.classList.add("correct");
      spawnPop("+" + points, pickedBtn);
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
    }, correct ? 700 : 1200);
  }

  function finishRound() {
    state.finished = true;
    const isNewBest = state.score > 0 && state.score >= state.best;
    els.overlayTitle.textContent = isNewBest ? "🏆 Yeni Rekor!" : "Tur Bitti";
    els.overlayText.textContent =
      `Toplam: ${state.score}\nRekor: ${state.best}\nDoğru: ${countCorrect()}/${state.pool.length}`;
    els.overlayBtn.textContent = "Tekrar Oyna";
    showOverlay();
  }

  function countCorrect() {
    // Approximate from score: each correct = at least 10
    // Actually we don't track per-question, so estimate via streak math.
    // Simpler: track explicitly.
    return state._correct || 0;
  }

  function showOverlay() { els.overlay.classList.remove("hidden"); }
  function hideOverlay() { els.overlay.classList.add("hidden"); }

  function updateStats() {
    els.qNum.textContent = Math.min(state.qIndex + 1, state.pool.length || QUESTIONS_PER_ROUND) + "/" + (state.pool.length || QUESTIONS_PER_ROUND);
    els.score.textContent = state.score;
    els.streak.textContent = state.streak;
    els.best.textContent = state.best;
  }

  function spawnPop(text, anchorEl) {
    const pop = document.createElement("div");
    pop.className = "score-pop";
    pop.textContent = text;
    const rect = anchorEl.getBoundingClientRect();
    const containerRect = anchorEl.parentElement.getBoundingClientRect();
    pop.style.left = (rect.left + rect.width / 2 - containerRect.left) + "px";
    pop.style.top = (rect.top - containerRect.top - 8) + "px";
    anchorEl.parentElement.appendChild(pop);
    setTimeout(() => pop.remove(), 1000);
  }

  // ==========================================================================
  // Wiring
  // ==========================================================================
  function bindEvents() {
    els.choices.forEach((btn, i) => {
      btn.addEventListener("click", () => answer(i));
    });
    els.newGameBtn.addEventListener("click", startRound);
    els.overlayBtn.addEventListener("click", startRound);
  }

  // ---- Boot ----
  function boot() {
    bindEvents();
    state._correct = 0;
    updateStats();
    showOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
