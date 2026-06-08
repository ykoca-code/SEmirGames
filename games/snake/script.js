/* ==========================================================================
   Yılan (Snake)
   - Grid-based movement on a canvas
   - Swipe / arrow keys / on-screen buttons to change direction
   - Score = food eaten; speed ramps up every few foods
   ========================================================================== */

(function () {
  "use strict";

  const COLS = 20;
  const ROWS = 20;
  const CANVAS_PX = 420; // logical drawing buffer
  const CELL = CANVAS_PX / COLS; // 21

  const START_INTERVAL = 160; // ms between ticks
  const MIN_INTERVAL = 60;
  const SPEEDUP_PER_FOOD = 4;
  const STORAGE_KEY = "semirk_snake_best";

  const state = {
    snake: [], // array of {x, y}; head = first
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: null,
    score: 0,
    best: +(localStorage.getItem(STORAGE_KEY) || 0),
    running: false,
    paused: false,
    finished: true,
    interval: START_INTERVAL,
    lastTick: 0,
  };

  const els = {
    canvas: document.getElementById("board"),
    score: document.getElementById("score"),
    length: document.getElementById("length"),
    best: document.getElementById("best"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
    newGameBtn: document.getElementById("newGameBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    touchBtns: document.querySelectorAll(".touch-btn"),
  };
  const ctx = els.canvas.getContext("2d");

  // ==========================================================================
  // Init
  // ==========================================================================
  function newGame() {
    state.snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    state.dir = { x: 1, y: 0 };
    state.nextDir = { x: 1, y: 0 };
    state.score = 0;
    state.interval = START_INTERVAL;
    state.lastTick = 0;
    state.paused = false;
    state.finished = false;
    state.running = true;
    spawnFood();
    updateStats();
    hideOverlay();
    clearLBSlot();
    els.pauseBtn.textContent = "Duraklat";
    requestAnimationFrame(loop);
  }

  function spawnFood() {
    while (true) {
      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(Math.random() * ROWS);
      if (!state.snake.some((s) => s.x === x && s.y === y)) {
        state.food = { x, y };
        return;
      }
    }
  }

  // ==========================================================================
  // Game loop
  // ==========================================================================
  function loop(ts) {
    if (!state.running) return;
    if (!state.paused && !state.finished) {
      if (ts - state.lastTick >= state.interval) {
        state.lastTick = ts;
        step();
      }
    }
    render();
    requestAnimationFrame(loop);
  }

  function step() {
    // Apply queued direction if it's not a reverse of the current one
    if (
      !(state.nextDir.x === -state.dir.x && state.nextDir.y === -state.dir.y)
    ) {
      state.dir = state.nextDir;
    }

    const head = state.snake[0];
    const nx = head.x + state.dir.x;
    const ny = head.y + state.dir.y;

    // Wall collision
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return gameOver();

    // Self collision (skip tail because it will move)
    for (let i = 0; i < state.snake.length - 1; i++) {
      if (state.snake[i].x === nx && state.snake[i].y === ny) return gameOver();
    }

    const newHead = { x: nx, y: ny };
    state.snake.unshift(newHead);

    // Food
    if (nx === state.food.x && ny === state.food.y) {
      state.score += 10;
      const eaten = state.snake.length - 3;
      if (eaten % SPEEDUP_PER_FOOD === 0) {
        state.interval = Math.max(MIN_INTERVAL, state.interval - 8);
      }
      spawnFood();
    } else {
      state.snake.pop();
    }
    updateStats();
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  function render() {
    ctx.fillStyle = "#1a1d29";
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

    // Grid (subtle)
    ctx.strokeStyle = "#23273a";
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL + 0.5, 0);
      ctx.lineTo(i * CELL + 0.5, CANVAS_PX);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL + 0.5);
      ctx.lineTo(CANVAS_PX, i * CELL + 0.5);
      ctx.stroke();
    }

    // Food
    const f = state.food;
    if (f) {
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(f.x * CELL + CELL / 2, f.y * CELL + CELL / 2, CELL * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fca5a5";
      ctx.beginPath();
      ctx.arc(f.x * CELL + CELL * 0.4, f.y * CELL + CELL * 0.4, CELL * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Snake
    for (let i = state.snake.length - 1; i >= 0; i--) {
      const s = state.snake[i];
      ctx.fillStyle = i === 0 ? "#34d399" : "#10b981";
      const pad = 1;
      ctx.fillRect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2);
      if (i === 0) {
        // Eyes
        ctx.fillStyle = "#0d0f18";
        const eyeR = Math.max(1.5, CELL * 0.08);
        const e1x = s.x * CELL + CELL * 0.35;
        const e2x = s.x * CELL + CELL * 0.65;
        const ey = s.y * CELL + CELL * 0.35;
        ctx.beginPath(); ctx.arc(e1x, ey, eyeR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(e2x, ey, eyeR, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ==========================================================================
  // Game over
  // ==========================================================================
  async function gameOver() {
    state.finished = true;
    state.running = false;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(STORAGE_KEY, String(state.best));
      updateStats();
    }

    let extra = "";
    if (window.Leaderboard && state.score > 0 && Leaderboard.qualifies("snake", state.score)) {
      const name = await Leaderboard.promptName({
        message: state.score + " puanla ilk 10'a girdin!",
      });
      if (name) {
        const rank = Leaderboard.add("snake", name, state.score, {
          length: state.snake.length,
        });
        if (rank) extra = " · Liderlik: #" + rank;
      }
    }

    els.overlayTitle.textContent = "Oyun Bitti";
    els.overlayText.textContent =
      "Skor: " + state.score + " · Uzunluk: " + state.snake.length + extra;
    els.overlayBtn.textContent = "Tekrar Oyna";
    renderLBSlot();
    els.overlay.classList.remove("hidden");
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML = '<div class="lb-title">🏆 İlk 10</div>' + Leaderboard.renderHTML("snake");
  }

  function clearLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (slot) slot.innerHTML = "";
  }

  function showOverlay() { els.overlay.classList.remove("hidden"); }
  function hideOverlay() { els.overlay.classList.add("hidden"); }

  function updateStats() {
    els.score.textContent = state.score;
    els.length.textContent = state.snake.length;
    els.best.textContent = state.best;
  }

  function togglePause() {
    if (state.finished || !state.running) return;
    state.paused = !state.paused;
    els.pauseBtn.textContent = state.paused ? "Devam" : "Duraklat";
    if (state.paused) {
      els.overlayTitle.textContent = "Duraklatıldı";
      els.overlayText.textContent = "Devam etmek için tuşa bas.";
      els.overlayBtn.textContent = "Devam";
      clearLBSlot();
      showOverlay();
    } else {
      hideOverlay();
      state.lastTick = performance.now();
    }
  }

  // ==========================================================================
  // Input
  // ==========================================================================
  function setDir(dx, dy) {
    if (state.finished) return;
    // Prevent immediate reverse
    if (dx === -state.dir.x && dy === -state.dir.y) return;
    state.nextDir = { x: dx, y: dy };
  }

  function bindEvents() {
    els.newGameBtn.addEventListener("click", newGame);
    els.overlayBtn.addEventListener("click", () => {
      if (state.paused && !state.finished) togglePause();
      else newGame();
    });
    els.pauseBtn.addEventListener("click", togglePause);

    els.touchBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const d = btn.dataset.dir;
        if (d === "up") setDir(0, -1);
        if (d === "down") setDir(0, 1);
        if (d === "left") setDir(-1, 0);
        if (d === "right") setDir(1, 0);
      });
    });

    document.addEventListener("keydown", (e) => {
      if (!state.running && e.key === "Enter") return newGame();
      switch (e.key) {
        case "ArrowUp":    setDir(0, -1); e.preventDefault(); break;
        case "ArrowDown":  setDir(0,  1); e.preventDefault(); break;
        case "ArrowLeft":  setDir(-1, 0); e.preventDefault(); break;
        case "ArrowRight": setDir( 1, 0); e.preventDefault(); break;
        case "p": case "P": togglePause(); break;
      }
    });

    // Swipe on canvas
    let touchStart = null;
    els.canvas.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    els.canvas.addEventListener("touchend", (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      const threshold = 18;
      if (Math.max(adx, ady) < threshold) return;
      if (adx > ady) setDir(dx > 0 ? 1 : -1, 0);
      else setDir(0, dy > 0 ? 1 : -1);
      touchStart = null;
    }, { passive: true });
  }

  function boot() {
    bindEvents();
    updateStats();
    // Show initial state with snake mid-board
    state.snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    spawnFood();
    render();
    showOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
