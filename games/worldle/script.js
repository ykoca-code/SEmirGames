/* ==========================================================================
   Sıcak Soğuk Ülke (Worldle-tarzı)
   - Bilgisayar bir hedef ülke seçer
   - Oyuncu en fazla 6 ülke tahmin eder
   - Her tahminden sonra: km mesafe + yön (oklar) + sıcaklık emoji
   - Skor = (target reveal index) bazlı; az tahminle bul = yüksek skor
   ========================================================================== */

(function () {
  "use strict";

  const MAX_GUESSES = 6;
  const STORAGE_KEY = "semirk_worldle_best";
  const EARTH_R = 6371; // km

  const state = {
    target: null,
    guesses: [], // { country, distance, bearing }
    finished: true,
    won: false,
    score: 0,
    best: +(localStorage.getItem(STORAGE_KEY) || 0),
  };

  const MAP_PREF_KEY = "semirk_worldle_map";
  const els = {
    guesses: document.getElementById("guesses"),
    search: document.getElementById("search"),
    suggest: document.getElementById("suggest"),
    guessNum: document.getElementById("guessNum"),
    score: document.getElementById("score"),
    best: document.getElementById("best"),
    newGameBtn: document.getElementById("newGameBtn"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
    mapToggle: document.getElementById("mapToggle"),
    mapWrap: document.getElementById("mapWrap"),
    mapGuesses: document.getElementById("mapGuesses"),
  };

  // ==========================================================================
  // Geometry
  // ==========================================================================
  function toRad(d) { return (d * Math.PI) / 180; }
  function toDeg(r) { return (r * 180) / Math.PI; }

  function haversine(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function bearing(lat1, lon1, lat2, lon2) {
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  // 8-point compass arrow
  function arrowFor(b) {
    const arrows = ["⬆️", "↗️", "➡️", "↘️", "⬇️", "↙️", "⬅️", "↖️"];
    const idx = Math.round(b / 45) % 8;
    return arrows[idx];
  }

  function tempFor(dist) {
    if (dist < 100)   return "🎯";
    if (dist < 500)   return "🔥";
    if (dist < 1500)  return "🥵";
    if (dist < 3000)  return "😐";
    if (dist < 6000)  return "🥶";
    return "❄️";
  }

  // ==========================================================================
  // Game flow
  // ==========================================================================
  function newGame() {
    const all = window.COUNTRIES || [];
    if (all.length === 0) return;
    state.target = all[Math.floor(Math.random() * all.length)];
    state.guesses = [];
    state.finished = false;
    state.won = false;
    state.score = 0;
    els.search.disabled = false;
    els.search.value = "";
    hideSuggest();
    els.guesses.innerHTML = "";
    updateStats();
    hideOverlay();
    clearLBSlot();
    setTimeout(() => els.search.focus(), 50);
  }

  function makeGuess(country) {
    if (state.finished) return;
    if (state.guesses.find((g) => g.country.code === country.code)) return;

    const dist = haversine(country.lat, country.lon, state.target.lat, state.target.lon);
    const b = bearing(country.lat, country.lon, state.target.lat, state.target.lon);
    const won = country.code === state.target.code;

    const entry = { country, distance: dist, bearing: b, won };
    state.guesses.push(entry);
    renderGuess(entry);
    updateStats();
    els.search.value = "";
    hideSuggest();

    if (won) {
      finishGame(true);
    } else if (state.guesses.length >= MAX_GUESSES) {
      finishGame(false);
    }
  }

  function renderGuess(g) {
    const row = document.createElement("div");
    row.className = "w-guess" + (g.won ? " correct" : "");
    const dKm = Math.round(g.distance);
    const dStr = dKm >= 1000
      ? Math.round(g.distance / 100) / 10 + "K"
      : dKm + "";
    row.innerHTML =
      '<span class="g-flag">' + g.country.flag + '</span>' +
      '<span class="g-name">' + g.country.name + '</span>' +
      '<span class="g-distance">' + dStr + ' km</span>' +
      '<span class="g-dir">' + (g.won ? "🎯" : arrowFor(g.bearing)) + '</span>' +
      '<span class="g-temp">' + tempFor(g.distance) + '</span>';
    els.guesses.appendChild(row);
    els.guesses.scrollTop = els.guesses.scrollHeight;
    renderMap();
  }

  // Equirectangular projection -> 720×360 SVG viewBox (2 px per degree)
  function projLon(lon) { return (lon + 180) * 2; }
  function projLat(lat) { return (90 - lat) * 2; }

  function renderMap() {
    if (!els.mapGuesses) return;
    els.mapGuesses.innerHTML = "";
    const fragments = [];
    for (const g of state.guesses) {
      const cx = projLon(g.country.lon);
      const cy = projLat(g.country.lat);
      const color = g.won ? "#10b981" : tempColor(g.distance);
      fragments.push(
        '<circle class="map-dot" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) +
        '" r="4.5" fill="' + color + '" stroke="#fff" stroke-width="0.7"/>'
      );
    }
    // Reveal target after game finishes
    if (state.finished && state.target) {
      const tx = projLon(state.target.lon);
      const ty = projLat(state.target.lat);
      fragments.push(
        '<circle class="map-dot target" cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) +
        '" r="7" fill="#fbbf24" stroke="#1a1d29" stroke-width="1"/>'
      );
    }
    els.mapGuesses.innerHTML = fragments.join("");
  }

  function tempColor(dist) {
    if (dist < 500)   return "#ef4444";
    if (dist < 1500)  return "#f97316";
    if (dist < 3000)  return "#fbbf24";
    if (dist < 6000)  return "#60a5fa";
    return "#1e3a8a";
  }

  async function finishGame(won) {
    state.finished = true;
    state.won = won;
    els.search.disabled = true;

    let score = 0;
    if (won) {
      const left = MAX_GUESSES - state.guesses.length + 1;
      score = left * 100; // 600 max (first try) → 100 (last try)
    }
    state.score = score;
    if (score > state.best) {
      state.best = score;
      localStorage.setItem(STORAGE_KEY, String(state.best));
    }
    updateStats();

    let extra = "";
    if (won && window.Leaderboard && score > 0 && Leaderboard.qualifies("worldle", score)) {
      const name = await Leaderboard.promptName({ message: score + " puanla ilk 10'a girdin!" });
      if (name) {
        const rank = Leaderboard.add("worldle", name, score, {
          target: state.target.name,
          guesses: state.guesses.length,
        });
        if (rank) extra = " · Liderlik: #" + rank;
      }
    }

    els.overlayTitle.textContent = won ? "🎯 Buldun!" : "🌍 Süre Doldu";
    els.overlayText.textContent =
      "Hedef: " + state.target.flag + " " + state.target.name +
      "\nTahmin: " + state.guesses.length + "/" + MAX_GUESSES +
      (won ? "\nSkor: " + score + extra : "");
    els.overlayBtn.textContent = "Yeni Oyun";
    renderLBSlot();
    renderMap();
    els.overlay.classList.remove("hidden");
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML = '<div class="lb-title">🏆 İlk 10</div>' + Leaderboard.renderHTML("worldle");
  }
  function clearLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (slot) slot.innerHTML = "";
  }

  function updateStats() {
    els.guessNum.textContent = state.guesses.length + "/" + MAX_GUESSES;
    els.score.textContent = state.score;
    els.best.textContent = state.best;
  }

  function hideOverlay() { els.overlay.classList.add("hidden"); }
  function showOverlay() { els.overlay.classList.remove("hidden"); }

  // ==========================================================================
  // Search / suggest
  // ==========================================================================
  function normalize(s) {
    return s.toLocaleLowerCase("tr")
      .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c")
      .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o");
  }

  function showSuggest(q) {
    const all = window.COUNTRIES || [];
    const nq = normalize(q.trim());
    if (!nq) return hideSuggest();
    const used = new Set(state.guesses.map((g) => g.country.code));
    const matches = all
      .filter((c) => !used.has(c.code) && normalize(c.name).includes(nq))
      .slice(0, 6);
    if (matches.length === 0) return hideSuggest();
    els.suggest.innerHTML = "";
    for (const c of matches) {
      const item = document.createElement("div");
      item.className = "sg-item";
      item.innerHTML = '<span class="sg-flag">' + c.flag + '</span><span>' + c.name + '</span>';
      item.addEventListener("click", () => makeGuess(c));
      els.suggest.appendChild(item);
    }
    els.suggest.classList.remove("hidden");
  }

  function hideSuggest() {
    els.suggest.classList.add("hidden");
    els.suggest.innerHTML = "";
  }

  function boot() {
    // Map toggle (persisted)
    const savedMap = localStorage.getItem(MAP_PREF_KEY) === "1";
    els.mapToggle.checked = savedMap;
    els.mapWrap.classList.toggle("hidden", !savedMap);
    els.mapToggle.addEventListener("change", () => {
      els.mapWrap.classList.toggle("hidden", !els.mapToggle.checked);
      localStorage.setItem(MAP_PREF_KEY, els.mapToggle.checked ? "1" : "0");
      if (els.mapToggle.checked) renderMap();
    });

    els.search.addEventListener("input", (e) => showSuggest(e.target.value));
    els.search.addEventListener("focus", (e) => {
      if (e.target.value) showSuggest(e.target.value);
    });
    document.addEventListener("click", (e) => {
      if (!els.search.contains(e.target) && !els.suggest.contains(e.target)) hideSuggest();
    });
    els.search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const first = els.suggest.querySelector(".sg-item");
        if (first) first.click();
      }
    });

    els.newGameBtn.addEventListener("click", newGame);
    els.overlayBtn.addEventListener("click", newGame);

    updateStats();
    renderLBSlot();
    showOverlay();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
