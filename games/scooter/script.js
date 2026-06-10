/* ==========================================================================
   Scooter Yarışı — endless runner (3-lane top-down)
   - Swipe left/right or arrow keys / on-screen buttons to change lane
   - Swipe up / tap board / space / jump button to jump
   - Coins +score, obstacles end the run
   - Speed ramps with distance, leaderboard on game over
   ========================================================================== */

(function () {
  "use strict";

  const W = 300;
  const H = 500;
  const LANES = 3;
  const LANE_W = W / LANES;
  const LANE_X = [LANE_W / 2, LANE_W * 1.5, LANE_W * 2.5];

  const PLAYER_Y = H - 80;
  const PLAYER_R = 18;
  const OB_R = 22;
  const COIN_R = 11;

  const JUMP_MS = 600;
  const LANE_MS = 140;
  const SPAWN_BASE = 720;     // ms between spawns at speed=1
  const COIN_VALUE = 10;

  const STORAGE_KEY = "semirk_scooter_best";

  // ----- State -----
  const state = {
    lane: 1,
    fromLane: 1,
    toLane: 1,
    laneAnim: 0,
    laneAnimating: false,
    jumping: false,
    jumpT: 0,
    obstacles: [],   // { lane, y, type: "cone"|"barrier" }
    coins: [],       // { lane, y }
    speed: 3.2,      // pixels per frame at 60fps
    distance: 0,
    score: 0,
    coinsCollected: 0,
    best: +(localStorage.getItem(STORAGE_KEY) || 0),
    spawnTimer: 0,
    laneStreak: { lane: -1, count: 0 }, // avoid spawning 3 obstacles in same lane
    finished: false,
    paused: false,
    running: false,
    lastTs: 0,
    roadOffset: 0,
  };

  // ----- DOM -----
  const els = {
    canvas: document.getElementById("board"),
    score: document.getElementById("score"),
    coins: document.getElementById("coins"),
    distance: document.getElementById("distance"),
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
  // Lifecycle
  // ==========================================================================
  function newGame() {
    state.lane = 1;
    state.fromLane = 1;
    state.toLane = 1;
    state.laneAnim = 0;
    state.laneAnimating = false;
    state.jumping = false;
    state.jumpT = 0;
    state.obstacles = [];
    state.coins = [];
    state.speed = 3.2;
    state.distance = 0;
    state.score = 0;
    state.coinsCollected = 0;
    state.spawnTimer = 0;
    state.laneStreak = { lane: -1, count: 0 };
    state.finished = false;
    state.paused = false;
    state.running = true;
    state.lastTs = 0;
    state.roadOffset = 0;
    els.pauseBtn.textContent = "Duraklat";
    updateStats();
    hideOverlay();
    clearLBSlot();
    requestAnimationFrame(loop);
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
      state.lastTs = performance.now();
    }
  }

  async function gameOver() {
    state.finished = true;
    state.running = false;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(STORAGE_KEY, String(state.best));
      updateStats();
    }

    let extra = "";
    if (window.Leaderboard && state.score > 0 && Leaderboard.qualifies("scooter", state.score)) {
      const name = await Leaderboard.promptName({
        message: state.score + " puanla ilk 10'a girdin!",
      });
      if (name) {
        const rank = Leaderboard.add("scooter", name, state.score, {
          distance: Math.round(state.distance / 10),
          coins: state.coinsCollected,
        });
        if (rank) extra = " · Liderlik: #" + rank;
      }
    }

    els.overlayTitle.textContent = "💥 Çarpıştın!";
    els.overlayText.textContent =
      "Skor: " + state.score + " · Altın: " + state.coinsCollected +
      " · Mesafe: " + Math.round(state.distance / 10) + "m" + extra;
    els.overlayBtn.textContent = "Tekrar Oyna";
    renderLBSlot();
    els.overlay.classList.remove("hidden");
  }

  // ==========================================================================
  // Loop
  // ==========================================================================
  function loop(ts) {
    if (!state.running) return;
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(33, ts - state.lastTs);
    state.lastTs = ts;

    if (!state.paused && !state.finished) step(dt);
    render();
    requestAnimationFrame(loop);
  }

  function step(dt) {
    const frameAdj = dt / 16.67; // normalize to 60fps

    // Lane transition
    if (state.laneAnimating) {
      state.laneAnim += dt;
      if (state.laneAnim >= LANE_MS) state.laneAnimating = false;
    }
    // Jump
    if (state.jumping) {
      state.jumpT += dt;
      if (state.jumpT >= JUMP_MS) {
        state.jumping = false;
        state.jumpT = 0;
      }
    }

    // Speed ramp
    state.distance += state.speed * frameAdj;
    state.speed = Math.min(10, 3.2 + state.distance * 0.00025);

    // Road scroll for visual
    state.roadOffset = (state.roadOffset + state.speed * frameAdj) % 40;

    // Move objects
    const dy = state.speed * frameAdj;
    for (const o of state.obstacles) o.y += dy;
    for (const c of state.coins) c.y += dy;

    // Cleanup off-screen
    state.obstacles = state.obstacles.filter((o) => o.y < H + 60);
    state.coins = state.coins.filter((c) => c.y < H + 60);

    // Spawn
    state.spawnTimer += dt;
    const spawnInterval = Math.max(280, SPAWN_BASE - state.speed * 35);
    if (state.spawnTimer >= spawnInterval) {
      state.spawnTimer = 0;
      spawn();
    }

    // Score per distance (1 point per ~50px)
    state.score = state.coinsCollected * COIN_VALUE + Math.floor(state.distance / 50);

    checkCollisions();
    updateStats();
  }

  function spawn() {
    // Pick a lane; avoid same-lane streak >2
    let lane;
    do {
      lane = Math.floor(Math.random() * LANES);
    } while (state.laneStreak.lane === lane && state.laneStreak.count >= 2);

    if (state.laneStreak.lane === lane) state.laneStreak.count++;
    else state.laneStreak = { lane, count: 1 };

    // 60% obstacle, 40% coin line
    if (Math.random() < 0.6) {
      const type = Math.random() < 0.6 ? "cone" : "barrier";
      state.obstacles.push({ lane, y: -OB_R, type });
    } else {
      const count = Math.random() < 0.5 ? 3 : Math.random() < 0.7 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        state.coins.push({ lane, y: -COIN_R - i * 32 });
      }
    }
  }

  function checkCollisions() {
    const px = getPlayerX();
    const py = PLAYER_Y;
    const currentLane = Math.round(getPlayerLane());

    // Coins (any lane, near player y)
    for (let i = state.coins.length - 1; i >= 0; i--) {
      const c = state.coins[i];
      if (c.lane !== currentLane) continue;
      if (Math.abs(c.y - py) < PLAYER_R + COIN_R) {
        state.coins.splice(i, 1);
        state.coinsCollected++;
      }
    }
    // Obstacles
    if (state.jumping) return; // mid-air, safe
    for (const o of state.obstacles) {
      if (o.lane !== currentLane) continue;
      if (Math.abs(o.y - py) < PLAYER_R + OB_R - 4) {
        gameOver();
        return;
      }
    }
  }

  function getPlayerLane() {
    if (!state.laneAnimating) return state.lane;
    const t = Math.min(1, state.laneAnim / LANE_MS);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    return state.fromLane + (state.toLane - state.fromLane) * eased;
  }

  function getPlayerX() {
    const l = getPlayerLane();
    return LANE_X[0] + l * LANE_W;
  }

  function jumpHeight() {
    // 0 at start, peak at JUMP_MS/2, 0 at end
    if (!state.jumping) return 0;
    const t = state.jumpT / JUMP_MS; // 0..1
    return Math.sin(t * Math.PI) * 28;
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  function render() {
    // Road background gradient
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#1f2937");
    grd.addColorStop(1, "#0f172a");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Side stripes
    ctx.fillStyle = "#fef3c7";
    ctx.fillRect(0, 0, 3, H);
    ctx.fillRect(W - 3, 0, 3, H);

    // Lane dividers (scrolling dashes)
    ctx.strokeStyle = "#fef3c7";
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 14]);
    ctx.lineDashOffset = -state.roadOffset;
    for (let i = 1; i < LANES; i++) {
      const x = i * LANE_W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Obstacles
    for (const o of state.obstacles) {
      drawObstacle(o);
    }
    // Coins
    for (const c of state.coins) {
      drawCoin(c);
    }

    // Player shadow
    const px = getPlayerX();
    const py = PLAYER_Y;
    const jh = jumpHeight();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(px, py + 14, PLAYER_R - (jh > 0 ? jh / 3 : 0), 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Player + scooter
    drawPlayer(px, py - jh);
  }

  function drawObstacle(o) {
    const x = LANE_X[0] + o.lane * LANE_W;
    if (o.type === "cone") {
      ctx.fillStyle = "#f97316";
      ctx.strokeStyle = "#7c2d12";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, o.y - 20);
      ctx.lineTo(x - 16, o.y + 14);
      ctx.lineTo(x + 16, o.y + 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // White ring
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8, o.y - 2);
      ctx.lineTo(x + 8, o.y - 2);
      ctx.stroke();
      // Base
      ctx.fillStyle = "#7c2d12";
      ctx.fillRect(x - 18, o.y + 13, 36, 4);
    } else {
      // Barrier
      ctx.fillStyle = "#ef4444";
      ctx.strokeStyle = "#7f1d1d";
      ctx.lineWidth = 1.5;
      ctx.fillRect(x - 26, o.y - 8, 52, 16);
      ctx.strokeRect(x - 26, o.y - 8, 52, 16);
      // Stripes
      ctx.fillStyle = "#fff";
      ctx.fillRect(x - 22, o.y - 8, 8, 16);
      ctx.fillRect(x - 6, o.y - 8, 8, 16);
      ctx.fillRect(x + 10, o.y - 8, 8, 16);
    }
  }

  function drawCoin(c) {
    const x = LANE_X[0] + c.lane * LANE_W;
    ctx.fillStyle = "#fbbf24";
    ctx.strokeStyle = "#92400e";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, c.y, COIN_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Inner ring
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, c.y, COIN_R - 3, 0, Math.PI * 2);
    ctx.stroke();
    // Symbol
    ctx.fillStyle = "#92400e";
    ctx.font = "bold 13px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("₺", x, c.y + 1);
  }

  function drawPlayer(x, y) {
    ctx.save();
    ctx.translate(x, y);

    // Scooter deck
    ctx.fillStyle = "#0ea5e9";
    ctx.fillRect(-14, 14, 28, 6);
    // Wheels
    ctx.fillStyle = "#0f172a";
    ctx.beginPath(); ctx.arc(-12, 22, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(12, 22, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fafafa";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(-12, 22, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(12, 22, 5, 0, Math.PI * 2); ctx.stroke();
    // Handle bar
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(10, -14, 4, 28);
    ctx.fillRect(4, -16, 16, 4);
    // Body (blue tshirt)
    ctx.fillStyle = "#0054b4";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-9, -8, 18, 22, 6) : ctx.rect(-9, -8, 18, 22);
    ctx.fill();
    // Head
    ctx.fillStyle = "#fca5a5";
    ctx.beginPath();
    ctx.arc(0, -20, 9, 0, Math.PI * 2);
    ctx.fill();
    // Hair
    ctx.fillStyle = "#0c192c";
    ctx.beginPath();
    ctx.moveTo(-8, -22);
    ctx.quadraticCurveTo(0, -32, 8, -22);
    ctx.closePath();
    ctx.fill();
    // Eyes
    ctx.fillStyle = "#0c192c";
    ctx.beginPath(); ctx.arc(-2, -20, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -20, 1.4, 0, Math.PI * 2); ctx.fill();
    // Arm
    ctx.strokeStyle = "#fca5a5";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(6, -4);
    ctx.lineTo(14, -10);
    ctx.stroke();
    ctx.lineCap = "butt";

    ctx.restore();
  }

  // ==========================================================================
  // UI updates
  // ==========================================================================
  function updateStats() {
    els.score.textContent = state.score;
    els.coins.textContent = state.coinsCollected;
    els.distance.textContent = Math.round(state.distance / 10) + "m";
    els.best.textContent = state.best;
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML = '<div class="lb-title">🏆 İlk 10</div>' + Leaderboard.renderHTML("scooter");
  }
  function clearLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (slot) slot.innerHTML = "";
  }
  function showOverlay() { els.overlay.classList.remove("hidden"); }
  function hideOverlay() { els.overlay.classList.add("hidden"); }

  // ==========================================================================
  // Input
  // ==========================================================================
  function changeLane(dir) {
    if (state.finished || state.paused || !state.running) return;
    if (state.laneAnimating) return;
    const target = state.lane + dir;
    if (target < 0 || target >= LANES) return;
    state.fromLane = state.lane;
    state.toLane = target;
    state.lane = target;
    state.laneAnim = 0;
    state.laneAnimating = true;
  }

  function jump() {
    if (state.finished || state.paused || !state.running) return;
    if (state.jumping) return;
    state.jumping = true;
    state.jumpT = 0;
  }

  function bindEvents() {
    els.newGameBtn.addEventListener("click", newGame);
    els.pauseBtn.addEventListener("click", togglePause);
    els.overlayBtn.addEventListener("click", () => {
      if (state.paused && !state.finished) togglePause();
      else newGame();
    });

    els.touchBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const a = btn.dataset.action;
        if (a === "left") changeLane(-1);
        else if (a === "right") changeLane(1);
        else if (a === "jump") jump();
      });
    });

    document.addEventListener("keydown", (e) => {
      if (!state.running && e.key === "Enter") return newGame();
      switch (e.key) {
        case "ArrowLeft": changeLane(-1); e.preventDefault(); break;
        case "ArrowRight": changeLane(1); e.preventDefault(); break;
        case "ArrowUp":
        case " ": jump(); e.preventDefault(); break;
        case "p": case "P": togglePause(); break;
      }
    });

    // Swipe on canvas
    let touchStart = null;
    els.canvas.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    }, { passive: true });

    els.canvas.addEventListener("touchend", (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      const dt = Date.now() - touchStart.time;
      touchStart = null;
      if (Math.max(adx, ady) < 18 && dt < 300) {
        // Tap → jump
        jump();
        return;
      }
      if (adx > ady) changeLane(dx > 0 ? 1 : -1);
      else if (dy < 0) jump();
      // Swipe down does nothing for now
    }, { passive: true });
  }

  function boot() {
    bindEvents();
    updateStats();
    // Initial render
    state.lane = 1;
    render();
    renderLBSlot();
    showOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
