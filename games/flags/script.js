/* Bayrak Bilmece — multiple choice flag-to-country */
(function () {
  "use strict";

  const ROUND = 10;
  const QUESTION_TIME = 12; // seconds (harder mode)
  const STORAGE_KEY = "semirk_flags_best";
  const REGION_KEY = "semirk_flags_region";

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
    // Harder mode: when region is "all", mix distractors across the world so
    // players can't narrow down by continent. When a region is filtered, stay
    // inside that region (otherwise the answer would always be obvious).
    let pool;
    if (state.region === "all") {
      pool = all.filter((c) => c.code !== country.code);
    } else {
      pool = all.filter((c) => c.region === country.region && c.code !== country.code);
    }
    pool = shuffle(pool);
    const picks = [];
    for (const c of pool) {
      if (!picks.find((p) => p.code === c.code)) picks.push(c);
      if (picks.length >= 3) break;
    }
    return picks;
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
    const dis = distractors(c, window.COUNTRIES);
    const allChoices = shuffle([c, ...dis]);
    const correctIdx = allChoices.findIndex((x) => x.code === c.code);
    state.current = { country: c, choices: allChoices, correctIdx };
    state.locked = false;

    els.flagDisplay.textContent = c.flag;
    els.flagDisplay.style.animation = "none";
    void els.flagDisplay.offsetWidth;
    els.flagDisplay.style.animation = "";

    els.choices.forEach((btn, i) => {
      btn.textContent = allChoices[i].name;
      btn.disabled = false;
      btn.classList.remove("correct", "wrong");
    });
    updateStats();
    startTimer();
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
    els.choices[state.current.correctIdx].classList.add("correct");
    els.choices.forEach((b) => (b.disabled = true));
    updateStats();
    setTimeout(() => { state.qIndex += 1; nextQuestion(); }, 1100);
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
    document.querySelector(".region-select").style.display = "none";
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
    els.newGameBtn.addEventListener("click", () => {
      state.finished = true;
      renderRegionChips();
      els.overlayTitle.textContent = "Bayrak Bilmece";
      els.overlayText.textContent = "Kıtayı seç ve başla!";
      els.overlayBtn.textContent = "Başla";
      document.querySelector(".region-select").style.display = "";
      clearLBSlot();
      showOverlay();
    });
    els.overlayBtn.addEventListener("click", startRound);
    renderRegionChips();
    updateStats();
    showOverlay();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
