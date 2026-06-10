/* Bayrak Bilmece — multiple choice flag-to-country */
(function () {
  "use strict";

  const ROUND = 10;
  const QUESTION_TIME = 12; // seconds (harder mode)
  const STORAGE_KEY = "semirk_flags_best";
  const REGION_KEY = "semirk_flags_region";
  const DIFF_KEY = "semirk_flags_diff";

  // Difficulty score multipliers: easy 1×, medium 1.5×, hard 2×.
  const DIFF_MUL = { easy: 1, medium: 1.5, hard: 2 };

  const REGION_LABELS = {
    europe:  "Avrupa",
    asia:    "Asya",
    africa:  "Afrika",
    america: "Amerika",
    oceania: "Okyanusya",
  };

  const state = {
    pool: [],
    current: null,
    qIndex: 0,
    score: 0,
    streak: 0,
    correct: 0,
    best: +(localStorage.getItem(STORAGE_KEY) || 0),
    region: localStorage.getItem(REGION_KEY) || "all",
    diff: localStorage.getItem(DIFF_KEY) || "easy",
    locked: false,
    finished: true,
    timeLeft: 0,
    timerId: null,
  };

  const els = {
    qNum: document.getElementById("qNum"),
    score: document.getElementById("score"),
    streak: document.getElementById("streak"),
    best: document.getElementById("best"),
    flagDisplay: document.getElementById("flagDisplay"),
    timerBar: document.getElementById("timerBar"),
    choices: Array.from(document.querySelectorAll(".choice")),
    newGameBtn: document.getElementById("newGameBtn"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
    regionChips: document.getElementById("regionChips"),
    diffChips: document.querySelectorAll("#diffChips .cat-chip"),
    choicesWrap: document.getElementById("choices"),
    typeAnswer: document.getElementById("typeAnswer"),
    answerInput: document.getElementById("answerInput"),
    submitAnswer: document.getElementById("submitAnswer"),
  };

  function shuffle(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pickFromRegion() {
    const all = window.COUNTRIES || [];
    if (state.region === "all") return all;
    return all.filter((c) => c.region === state.region);
  }

  function distractors(country, all) {
    // Easy: distractors from across the world (least related)
    // Medium: distractors from the SAME REGION (look-alike continent)
    let pool;
    if (state.diff === "medium") {
      pool = all.filter((c) => c.region === country.region && c.code !== country.code);
      if (pool.length < 3) pool = all.filter((c) => c.code !== country.code);
    } else if (state.region !== "all") {
      pool = all.filter((c) => c.region === country.region && c.code !== country.code);
    } else {
      pool = all.filter((c) => c.code !== country.code);
    }
    pool = shuffle(pool);
    const picks = [];
    for (const c of pool) {
      if (!picks.find((p) => p.code === c.code)) picks.push(c);
      if (picks.length >= 3) break;
    }
    return picks;
  }

  // Loose Turkish-aware name match for type-the-answer mode
  function normalizeName(s) {
    return String(s || "")
      .toLocaleLowerCase("tr")
      .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c")
      .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o")
      .replace(/[^a-z]/g, "");
  }

  function renderRegionChips() {
    const all = window.COUNTRIES || [];
    const counts = { all: all.length };
    for (const c of all) counts[c.region] = (counts[c.region] || 0) + 1;
    const regions = [{ id: "all", label: "Tümü" }];
    for (const id of Object.keys(REGION_LABELS)) {
      if (counts[id]) regions.push({ id, label: REGION_LABELS[id] });
    }
    els.regionChips.innerHTML = "";
    for (const r of regions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cat-chip" + (r.id === state.region ? " active" : "");
      btn.textContent = r.label + " (" + counts[r.id] + ")";
      btn.addEventListener("click", () => {
        state.region = r.id;
        localStorage.setItem(REGION_KEY, r.id);
        els.regionChips.querySelectorAll(".cat-chip").forEach((el) => el.classList.remove("active"));
        btn.classList.add("active");
      });
      els.regionChips.appendChild(btn);
    }
  }

  function startRound() {
    const pool = pickFromRegion();
    if (pool.length < 4) {
      els.overlayText.textContent = "Bu kıtada yeterli ülke yok.";
      return;
    }
    state.pool = shuffle(pool).slice(0, ROUND);
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
    stopTimer();
    if (state.qIndex >= state.pool.length) return finishRound();
    const c = state.pool[state.qIndex];
    state.current = { country: c };
    state.locked = false;

    els.flagDisplay.textContent = c.flag;
    els.flagDisplay.style.animation = "none";
    void els.flagDisplay.offsetWidth;
    els.flagDisplay.style.animation = "";

    if (state.diff === "hard") {
      // Type-the-answer mode
      els.choicesWrap.classList.add("hidden");
      els.typeAnswer.classList.remove("hidden");
      els.answerInput.value = "";
      els.answerInput.disabled = false;
      els.answerInput.classList.remove("correct", "wrong");
      els.submitAnswer.disabled = false;
      setTimeout(() => els.answerInput.focus(), 50);
    } else {
      els.choicesWrap.classList.remove("hidden");
      els.typeAnswer.classList.add("hidden");
      const dis = distractors(c, window.COUNTRIES);
      const allChoices = shuffle([c, ...dis]);
      const correctIdx = allChoices.findIndex((x) => x.code === c.code);
      state.current.choices = allChoices;
      state.current.correctIdx = correctIdx;
      els.choices.forEach((btn, i) => {
        btn.textContent = allChoices[i].name;
        btn.disabled = false;
        btn.classList.remove("correct", "wrong");
      });
    }
    updateStats();
    startTimer();
  }

  function submitTyped() {
    if (state.locked || state.finished) return;
    const guess = normalizeName(els.answerInput.value);
    if (!guess) return;
    state.locked = true;
    stopTimer();
    const target = normalizeName(state.current.country.name);
    const ok = guess === target;
    els.answerInput.disabled = true;
    els.submitAnswer.disabled = true;
    els.answerInput.classList.add(ok ? "correct" : "wrong");

    if (ok) {
      // Type mode is always hard (2× multiplier).
      const mul = DIFF_MUL[state.diff] || 2;
      const points = Math.floor((10 + state.streak * 5) * mul);
      state.score += points;
      state.streak += 1;
      state.correct += 1;
    } else {
      state.streak = 0;
      els.answerInput.value = els.answerInput.value + " → " + state.current.country.name;
    }
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(STORAGE_KEY, String(state.best));
    }
    updateStats();
    setTimeout(() => { state.qIndex += 1; nextQuestion(); }, ok ? 700 : 1300);
  }

  function startTimer() {
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

  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

  function setTimerBar(ratio) {
    if (!els.timerBar) return;
    els.timerBar.style.transform = "scaleX(" + ratio + ")";
    els.timerBar.classList.toggle("warning", ratio < 0.5 && ratio >= 0.25);
    els.timerBar.classList.toggle("danger", ratio < 0.25);
  }

  function timeOut() {
    if (state.locked || state.finished) return;
    state.locked = true;
    state.streak = 0;
    if (state.diff === "hard") {
      // Type-the-answer mode: no choices, just reveal the answer in the input.
      els.answerInput.disabled = true;
      els.submitAnswer.disabled = true;
      els.answerInput.classList.add("wrong");
      els.answerInput.value = "⏱ Süre doldu → " + state.current.country.name;
    } else {
      els.choices[state.current.correctIdx].classList.add("correct");
      els.choices.forEach((b) => (b.disabled = true));
    }
    updateStats();
    setTimeout(() => { state.qIndex += 1; nextQuestion(); }, 1300);
  }

  function answer(idx) {
    if (state.locked || state.finished) return;
    state.locked = true;
    stopTimer();
    const ok = idx === state.current.correctIdx;
    const correctBtn = els.choices[state.current.correctIdx];
    const pickedBtn = els.choices[idx];
    els.choices.forEach((b) => (b.disabled = true));

    if (ok) {
      const mul = DIFF_MUL[state.diff] || 1;
      const points = Math.floor((10 + state.streak * 5) * mul);
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
    }, ok ? 600 : 1100);
  }

  async function finishRound() {
    state.finished = true;
    stopTimer();
    const isBest = state.score > 0 && state.score >= state.best;
    els.overlayTitle.textContent = isBest ? "🏆 Yeni Rekor!" : "Tur Bitti";
    let lines = [
      "Toplam: " + state.score,
      "Rekor: " + state.best,
      "Doğru: " + state.correct + "/" + state.pool.length,
    ];
    if (window.Leaderboard && state.score > 0 && Leaderboard.qualifies("flags", state.score)) {
      const name = await Leaderboard.promptName({ message: state.score + " puanla ilk 10'a girdin!" });
      if (name) {
        const rank = Leaderboard.add("flags", name, state.score);
        if (rank) lines.push("Liderlik: #" + rank);
      }
    }
    els.overlayText.textContent = lines.join("\n");
    renderLBSlot();
    document.querySelectorAll(".region-select").forEach((el) => (el.style.display = "none"));
    els.overlayBtn.textContent = "Tekrar Oyna";
    showOverlay();
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML = '<div class="lb-title">🏆 İlk 10</div>' + Leaderboard.renderHTML("flags");
  }
  function clearLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (slot) slot.innerHTML = "";
  }
  function showOverlay() { els.overlay.classList.remove("hidden"); }
  function hideOverlay() { els.overlay.classList.add("hidden"); }

  function updateStats() {
    const total = state.pool.length || ROUND;
    const idx = Math.min(state.qIndex + (state.finished ? 0 : 1), total);
    els.qNum.textContent = idx + "/" + total;
    els.score.textContent = state.score;
    els.streak.textContent = state.streak;
    els.best.textContent = state.best;
  }

  function boot() {
    els.choices.forEach((btn, i) => btn.addEventListener("click", () => answer(i)));
    els.submitAnswer.addEventListener("click", submitTyped);
    els.answerInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submitTyped(); }
    });
    // Difficulty chips
    els.diffChips.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.diff = btn.dataset.diff;
        localStorage.setItem(DIFF_KEY, state.diff);
        els.diffChips.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
      btn.classList.toggle("active", btn.dataset.diff === state.diff);
    });
    els.newGameBtn.addEventListener("click", () => {
      stopTimer();
      state.finished = true;
      renderRegionChips();
      els.overlayTitle.textContent = "Bayrak Bilmece";
      els.overlayText.textContent = "Kıtayı seç ve başla!";
      els.overlayBtn.textContent = "Başla";
      document.querySelectorAll(".region-select").forEach((el) => (el.style.display = ""));
      renderLBSlot();
      showOverlay();
    });
    els.overlayBtn.addEventListener("click", startRound);
    renderRegionChips();
    renderLBSlot();
    updateStats();
    showOverlay();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
