/* ==========================================================================
   Pong (portrait, mobile-first)
   - Canvas 300x500 logical units, vertical layout
   - Player paddle at bottom, opponent (bot or P2) at top
   - Modes: bot easy/medium/hard, 2-player (drag both halves)
   - First to 7 points wins
   ========================================================================== */

(function () {
  "use strict";

  const W = 300;
  const H = 500;
  const PAD_W = 70;
  const PAD_H = 10;
  const BALL_R = 7;
  const WIN_SCORE = 7;

  const BOT_LEVELS = {
    "bot-easy":   { speed: 2.6, react: 0.35, miss: 0.18 },
    "bot-medium": { speed: 3.6, react: 0.6,  miss: 0.08 },
    "bot-hard":   { speed: 4.8, react: 0.85, miss: 0.02 },
  };

  const state = {
    mode: "bot-easy",
    topPad: { x: W / 2 - PAD_W / 2, y: 20 },
    botPad: { x: W / 2 - PAD_W / 2, y: H - 20 - PAD_H },
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    speed: 4,
    topScore: 0,
    botScore: 0,
    running: false,
    paused: false,
    finished: true,
    lastTs: 0,
    serveTimer: 0,
  };

  const els = {
    canvas: document.getElementById("board"),
    topLabel: document.getElementById("topLabel"),
    topScore: document.getElementById("topScore"),
    botScore: document.getElementById("botScore"),
    targetScore: document.getElementById("targetScore"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
    newGameBtn: document.getElementById("newGameBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    modeBtns: document.querySelectorAll(".mode-btn"),
  };
  const ctx = els.canvas.getContext("2d");

  // ==========================================================================
  // Setup
  // ==========================================================================
  function newGame() {
    state.topScore = 0;
    state.botScore = 0;
    state.topPad.x = W / 2 - PAD_W / 2;
    state.botPad.x = W / 2 - PAD_W / 2;
    state.finished = false;
    state.paused = false;
    state.running = true;
    state.speed = state.mode === "bot-hard" ? 6.4 : state.mode === "bot-medium" ? 5.6 : 5.0;
    state.rallyTime = 0;
    els.targetScore.textContent = WIN_SCORE;
    els.topLabel.textContent = state.mode === "two-player" ? "Üst Oyuncu" : "Rakip";
    els.pauseBtn.textContent = "Duraklat";
    updateScores();
    hideOverlay();
    serve(Math.random() < 0.5 ? 1 : -1);
    state.lastTs = 0;
    requestAnimationFrame(loop);
  }

  function serve(direction) {
    state.ball.x = W / 2;
    state.ball.y = H / 2;
    const angle = (Math.random() - 0.5) * 0.6 + (direction > 0 ? Math.PI / 2 : -Math.PI / 2);
    state.ball.vx = Math.sin(angle) * state.speed;
    state.ball.vy = Math.cos(angle) * state.speed;
    state.serveTimer = 800; // 800ms grace
    state.rallyTime = 0;
  }

  // ==========================================================================
  // Loop
  // ==========================================================================
  function loop(ts) {
    if (!state.running) return;
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(33, ts - state.lastTs);
    state.lastTs = ts;

    if (!state.paused && !state.finished) {
      step(dt);
    }
    render();
    requestAnimationFrame(loop);
  }

  function step(dt) {
    if (state.serveTimer > 0) {
      state.serveTimer -= dt;
      return; // brief pause after each serve so the player can prepare
    }

    // Continuous speed ramp during a rally — direction-preserving boost
    state.rallyTime += dt;
    const v = Math.hypot(state.ball.vx, state.ball.vy);
    const MAX_V = 14;
    if (v > 0.1 && v < MAX_V) {
      const k = 1 + 0.00018 * dt; // ≈ +1.1%/sec → noticeable in long rallies
      state.ball.vx *= k;
      state.ball.vy *= k;
    }

    // Bot AI for top paddle (if not two-player)
    if (state.mode !== "two-player") {
      const level = BOT_LEVELS[state.mode] || BOT_LEVELS["bot-easy"];
      const target = state.ball.x - PAD_W / 2;
      const dx = target - state.topPad.x;
      const move = Math.max(-level.speed * (dt / 16), Math.min(level.speed * (dt / 16), dx * level.react));
      // Occasional sloppy frames
      if (Math.random() > level.miss) state.topPad.x += move;
      state.topPad.x = clamp(state.topPad.x, 0, W - PAD_W);
    }

    // Ball motion (substeps for stability)
    const SUB = 6;
    const sx = (state.ball.vx * dt) / 16 / SUB;
    const sy = (state.ball.vy * dt) / 16 / SUB;
    for (let i = 0; i < SUB; i++) {
      state.ball.x += sx;
      state.ball.y += sy;
      handleCollisions();
      if (state.serveTimer > 0) break;
    }
  }

  function handleCollisions() {
    const b = state.ball;
    // Side walls
    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
    if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); }

    // Top paddle — preserve speed, set angle by hit position
    const top = state.topPad;
    if (b.y - BALL_R <= top.y + PAD_H && b.y - BALL_R >= top.y && b.vy < 0) {
      if (b.x >= top.x && b.x <= top.x + PAD_W) {
        b.y = top.y + PAD_H + BALL_R;
        const rel = (b.x - (top.x + PAD_W / 2)) / (PAD_W / 2); // -1..1
        const speed = Math.hypot(b.vx, b.vy);
        const angle = rel * (Math.PI / 3); // ±60° from straight down
        b.vx = Math.sin(angle) * speed;
        b.vy = Math.cos(angle) * speed; // positive (downward)
        nudgeSpeed();
      }
    }
    // Bottom paddle
    const bot = state.botPad;
    if (b.y + BALL_R >= bot.y && b.y + BALL_R <= bot.y + PAD_H && b.vy > 0) {
      if (b.x >= bot.x && b.x <= bot.x + PAD_W) {
        b.y = bot.y - BALL_R;
        const rel = (b.x - (bot.x + PAD_W / 2)) / (PAD_W / 2);
        const speed = Math.hypot(b.vx, b.vy);
        const angle = rel * (Math.PI / 3);
        b.vx = Math.sin(angle) * speed;
        b.vy = -Math.cos(angle) * speed; // negative (upward)
        nudgeSpeed();
      }
    }

    // Enforce a minimum vertical speed so the ball can never stay
    // pinging horizontally between the side walls.
    const MIN_VY = 1.6;
    if (Math.abs(b.vy) < MIN_VY) {
      b.vy = (b.vy >= 0 ? 1 : -1) * MIN_VY;
    }

    // Top miss → bottom player scores
    if (b.y < -BALL_R) {
      state.botScore++;
      checkWin();
      if (!state.finished) serve(1);
      updateScores();
    }
    // Bottom miss → top player scores
    if (b.y > H + BALL_R) {
      state.topScore++;
      checkWin();
      if (!state.finished) serve(-1);
      updateScores();
    }
  }

  function nudgeSpeed() {
    // Cap the magnitude so balls don't tunnel
    const v = Math.hypot(state.ball.vx, state.ball.vy);
    const maxV = 14;
    if (v > maxV) {
      state.ball.vx = (state.ball.vx / v) * maxV;
      state.ball.vy = (state.ball.vy / v) * maxV;
    } else {
      // Bigger speed-up after each paddle hit
      state.ball.vx *= 1.08;
      state.ball.vy *= 1.08;
    }
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ==========================================================================
  // Score / finish
  // ==========================================================================
  function updateScores() {
    els.topScore.textContent = state.topScore;
    els.botScore.textContent = state.botScore;
  }

  function checkWin() {
    if (state.topScore >= WIN_SCORE) finish("top");
    else if (state.botScore >= WIN_SCORE) finish("bot");
  }

  function finish(winner) {
    state.finished = true;
    const youWin = winner === "bot";
    if (state.mode === "two-player") {
      els.overlayTitle.textContent = winner === "top" ? "🏆 Üst Oyuncu Kazandı!" : "🏆 Alt Oyuncu Kazandı!";
    } else {
      els.overlayTitle.textContent = youWin ? "🏆 Kazandın!" : "Maalesef Kaybettin";
    }
    els.overlayText.textContent =
      "Skor: " + state.topScore + " - " + state.botScore;
    els.overlayBtn.textContent = "Tekrar Oyna";
    els.overlay.classList.remove("hidden");
  }

  function togglePause() {
    if (state.finished || !state.running) return;
    state.paused = !state.paused;
    els.pauseBtn.textContent = state.paused ? "Devam" : "Duraklat";
    if (state.paused) {
      els.overlayTitle.textContent = "Duraklatıldı";
      els.overlayText.textContent = "Devam etmek için tuşa bas.";
      els.overlayBtn.textContent = "Devam";
      els.overlay.classList.remove("hidden");
    } else {
      hideOverlay();
    }
  }

  function hideOverlay() { els.overlay.classList.add("hidden"); }

  // ==========================================================================
  // Render
  // ==========================================================================
  function render() {
    ctx.fillStyle = "#0d0f18";
    ctx.fillRect(0, 0, W, H);

    // Center dashed line
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = "#23273a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Paddles
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(state.topPad.x, state.topPad.y, PAD_W, PAD_H);
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(state.botPad.x, state.botPad.y, PAD_W, PAD_H);

    // Ball
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(state.ball.x - 2, state.ball.y - 2, BALL_R / 2.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ==========================================================================
  // Input
  // ==========================================================================
  function getCoord(e) {
    const rect = els.canvas.getBoundingClientRect();
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    const x = ((t.clientX - rect.left) / rect.width) * W;
    const y = ((t.clientY - rect.top) / rect.height) * H;
    return { x, y };
  }

  function movePaddleTo(target, x) {
    target.x = clamp(x - PAD_W / 2, 0, W - PAD_W);
  }

  function bindEvents() {
    let activeTouches = {}; // pointerId → which paddle ("top" | "bot")

    els.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const { x, y } = getCoord(e);
      if (state.mode === "two-player") {
        const which = y < H / 2 ? "top" : "bot";
        activeTouches[e.pointerId] = which;
        movePaddleTo(which === "top" ? state.topPad : state.botPad, x);
      } else {
        activeTouches[e.pointerId] = "bot";
        movePaddleTo(state.botPad, x);
      }
    });

    els.canvas.addEventListener("pointermove", (e) => {
      const which = activeTouches[e.pointerId];
      if (!which) return;
      const { x } = getCoord(e);
      movePaddleTo(which === "top" ? state.topPad : state.botPad, x);
    });

    els.canvas.addEventListener("pointerup", (e) => {
      delete activeTouches[e.pointerId];
    });
    els.canvas.addEventListener("pointercancel", (e) => {
      delete activeTouches[e.pointerId];
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        state.botPad.x = clamp(state.botPad.x - 20, 0, W - PAD_W);
      } else if (e.key === "ArrowRight") {
        state.botPad.x = clamp(state.botPad.x + 20, 0, W - PAD_W);
      } else if (e.key === "p" || e.key === "P") {
        togglePause();
      }
    });

    els.newGameBtn.addEventListener("click", newGame);
    els.pauseBtn.addEventListener("click", togglePause);
    els.overlayBtn.addEventListener("click", () => {
      if (state.paused && !state.finished) togglePause();
      else newGame();
    });

    els.modeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.mode = btn.dataset.mode;
        els.modeBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        newGame();
      });
    });
  }

  // ==========================================================================
  // Boot
  // ==========================================================================
  function boot() {
    bindEvents();
    render();
    els.overlay.classList.remove("hidden");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
