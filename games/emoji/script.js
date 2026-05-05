/* ==========================================================================
   Emoji Quiz
   - Loads QUESTIONS from questions.js (window.QUESTIONS)
   - Round = 10 random questions, 4 multiple-choice each
   - Per-question timer (15s); time-out counts as wrong
   - One hint per question (eliminates a wrong answer, costs 10 points)
   - Category filter on the start overlay
   ========================================================================== */

(function () {
  "use strict";

  const QUESTIONS_PER_ROUND = 10;
  const QUESTION_TIME = 15; // seconds
  const HINT_COST = 10;
  const STORAGE_KEY = "semirk_emoji_best";
  const CAT_PREF_KEY = "semirk_emoji_cat";

  const CATEGORY_LABELS = {
    yemek:   "Yemek",
    sehir:   "Şehir",
    deyim:   "Atasözü",
    film:    "Film/Dizi",
    dunya:   "Dünya",
    hayvan:  "Hayvan",
    spor:    "Spor",
    meslek:  "Meslek",
    doga:    "Doğa",
    renk:    "Renk",
    vucut:   "Vücut",
    giysi:   "Giysi",
    arac:    "Araç",
    esya:    "Eşya",
    muzik:   "Müzik",
    okul:    "Okul",
    duygu:   "Duygu",
  };

  // ---- State ----
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
    timeLeft: 0,
    timerId: null,
    hintUsed: false,
  };

  // ---- DOM ----
  const els = {
    qNum:         document.getElementById("qNum"),
    score:        document.getElementById("score"),
    streak:       document.getElementById("streak"),
    best:         document.getElementById("best"),
    pill:         document.getElementById("categoryPill"),
    display:      document.getElementById("emojiDisplay"),
    choices:      Array.from(document.querySelectorAll(".choice")),
    timerBar:     document.getElementById("timerBar"),
    hintBtn:      document.getElementById("hintBtn"),
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

  function getQuestionsForCategory(cat) {
    const all = window.QUESTIONS || [];
    if (!cat || cat === "all") return all;
    return all.filter((q) => q.category === cat);
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
      const rest = shuffle(window.QUESTIONS || []);
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
  // Category chips
  // ==========================================================================
  function renderCategoryChips() {
    const all = window.QUESTIONS || [];
    const counts = { all: all.length };
    for (const q of all) counts[q.category] = (counts[q.category] || 0) + 1;

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
      btn.textContent = `${c.label} (${counts[c.id]})`;
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
  // Timer
  // ==========================================================================
  function startQuestionTimer() {
    stopTimer();
    state.timeLeft = QUESTION_TIME;
    setTimerBar(1);
    state.timerId = setInterval(() => {
      state.timeLeft -= 0.1;
      const ratio = Math.max(0, state.timeLeft / QUESTION_TIME);
      setTimerBar(ratio);
      if (state.timeLeft <= 0) {
        stopTimer();
        timeOut();
      }
    }, 100);
  }

  function setTimerBar(ratio) {
    els.timerBar.style.transform = "scaleX(" + ratio + ")";
    els.timerBar.classList.toggle("warning", ratio < 0.5 && ratio >= 0.25);
    els.timerBar.classList.toggle("danger", ratio < 0.25);
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function timeOut() {
    if (state.locked || state.finished) return;
    state.locked = true;
    state.streak = 0;
    const correctBtn = els.choices[state.current.correctIdx];
    correctBtn.classList.add("correct");
    els.choices.forEach((b) => (b.disabled = true));
    els.hintBtn.disabled = true;
    updateStats();
    setTimeout(() => {
      state.qIndex += 1;
      nextQuestion();
    }, 1100);
  }

  // ==========================================================================
  // Hint
  // ==========================================================================
  function useHint() {
    if (state.hintUsed || state.locked || state.finished) return;
    const candidates = [];
    for (let i = 0; i < 4; i++) {
      if (i === state.current.correctIdx) continue;
      const btn = els.choices[i];
      if (!btn.disabled && !btn.classList.contains("eliminated")) candidates.push(i);
    }
    if (candidates.length === 0) return;
    const elim = candidates[Math.floor(Math.random() * candidates.length)];
    els.choices[elim].classList.add("eliminated");
    els.choices[elim].disabled = true;

    state.hintUsed = true;
    state.score = Math.max(0, state.score - HINT_COST);
    els.hintBtn.disabled = true;
    updateStats();
  }

  // ==========================================================================
  // Round flow
  // ==========================================================================
  function startRound() {
    const all = getQuestionsForCategory(state.selectedCategory);
    if (all.length < 4) {
      els.overlayText.textContent = "Bu kategoride yeterli soru yok. Başka bir kategori seç.";
      return;
    }
    state.pool = shuffle(all).slice(0, QUESTIONS_PER_ROUND);
    state.qIndex = 0;
    state.score = 0;
    state.streak = 0;
    state.correct = 0;
    state.locked = false;
    state.finished = false;
    hideOverlay();
    nextQuestion();
  }

  function nextQuestion() {
    stopTimer();
    if (state.qIndex >= state.pool.length) {
      finishRound();
      return;
    }
    const q = state.pool[state.qIndex];
    const distractors = pickDistractors(q, window.QUESTIONS);
    const allChoices = shuffle([q.answer, ...distractors]);
    const correctIdx = allChoices.indexOf(q.answer);
    state.current = { question: q, choices: allChoices, correctIdx };
    state.hintUsed = false;
    state.locked = false;

    els.pill.textContent = CATEGORY_LABELS[q.category] || q.category;
    els.display.textContent = q.emojis;
    els.display.style.animation = "none";
    void els.display.offsetWidth;
    els.display.style.animation = "";

    els.choices.forEach((btn, i) => {
      btn.textContent = allChoices[i];
      btn.disabled = false;
      btn.classList.remove("correct", "wrong", "eliminated");
    });
    els.hintBtn.disabled = false;

    updateStats();
    startQuestionTimer();
  }

  function answer(idx) {
    if (state.locked || state.finished) return;
    state.locked = true;
    stopTimer();

    const correct = idx === state.current.correctIdx;
    const correctBtn = els.choices[state.current.correctIdx];
    const pickedBtn = els.choices[idx];

    els.choices.forEach((b) => (b.disabled = true));
    els.hintBtn.disabled = true;

    if (correct) {
      const points = 10 + state.streak * 5;
      state.score += points;
      state.streak += 1;
      state.correct += 1;
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
    }, correct ? 700 : 1100);
  }

  function finishRound() {
    state.finished = true;
    stopTimer();
    const isNewBest = state.score > 0 && state.score >= state.best;
    els.overlayTitle.textContent = isNewBest ? "🏆 Yeni Rekor!" : "Tur Bitti";
    els.overlayText.textContent =
      `Toplam: ${state.score}\nRekor: ${state.best}\nDoğru: ${state.correct}/${state.pool.length}`;
    els.overlayBtn.textContent = "Tekrar Oyna";
    showOverlay();
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
    els.newGameBtn.addEventListener("click", () => {
      stopTimer();
      state.finished = true;
      renderCategoryChips();
      els.overlayTitle.textContent = "Emoji Quiz";
      els.overlayText.textContent = "Kategori seç ve başla. Her sorunun süresi 15 saniye.";
      els.overlayBtn.textContent = "Başla";
      showOverlay();
    });
    els.overlayBtn.addEventListener("click", startRound);
    els.hintBtn.addEventListener("click", useHint);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopTimer();
      else if (!state.finished && !state.locked) startQuestionTimer();
    });
  }

  // ---- Boot ----
  function boot() {
    bindEvents();
    renderCategoryChips();
    updateStats();
    showOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
