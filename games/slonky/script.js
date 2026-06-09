/* ==========================================================================
   Slonky — Plinko-style ball drop
   - Triangular peg field, ball physics with gravity + circle-circle bounce
   - 9 slots at the bottom with point values, middle slot is the jackpot
   - 10 balls per round, personal best stored in localStorage
   ========================================================================== */

(function () {
  "use strict";

  // ---- Constants (logical canvas units, 400 x 600) ----
  const W = 400;
  const H = 600;
  const PEG_R = 4;
  const BALL_R = 8;
  const GRAVITY = 900;
  const PEG_DAMPING = 0.55;
  const WALL_DAMPING = 0.55;
  const AIR_FRICTION = 0.999;
  const SUBSTEPS = 6;
  const TOTAL_BALLS = 10;
  const STORAGE_KEY = "semirk_slonky_best";

  const PEG_AREA_TOP = 90;
  const SLOT_HEIGHT = 70;
  const PEG_AREA_BOTTOM = H - SLOT_HEIGHT;

  const SLOT_VALUES = [5, 10, 25, 100, 500, 100, 25, 10, 5];
  const SLOT_COLORS = [
    "#ef4444", "#f97316", "#f59e0b",
    "#84cc16", "#10b981",
    "#84cc16", "#f59e0b", "#f97316", "#ef4444",
  ];

  const BALL_COLORS = ["#6c5ce7", "#00b8d9", "#ffb400", "#ef4444", "#10b981", "#a855f7", "#f97316"];

  // ---- State ----
  const state = {
    pegs: [],
    ball: null,
    score: 0,
    ballsPlayed: 0,
    best: +(localStorage.getItem(STORAGE_KEY) || 0),
    aimX: null,
    floats: [],
    finished: false,
    ballSeq: 0,
  };

  // ---- DOM ----
  const els = {
    canvas: document.getElementById("board"),
    score: document.getElementById("score"),
    balls: document.getElementById("balls"),
    best: document.getElementById("best"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
    newGameBtn: document.getElementById("newGameBtn"),
  };
  const ctx = els.canvas.getContext("2d");

  // ==========================================================================
  // Pegs
  // ==========================================================================
  function generatePegs() {
    const pegs = [];
    const spacingX = 40;
    const spacingY = 36;
    const colsEven = 9;
    const colsOdd = 8;

    let row = 0;
    let y = PEG_AREA_TOP + 24;
    while (y < PEG_AREA_BOTTOM - 30) {
      const cols = row % 2 === 0 ? colsEven : colsOdd;
      const totalWidth = (cols - 1) * spacingX;
      const xStart = (W - totalWidth) / 2;
      for (let i = 0; i < cols; i++) {
        pegs.push({ x: xStart + i * spacingX, y });
      }
      row++;
      y += spacingY;
    }
    return pegs;
  }

  // ==========================================================================
  // Physics
  // ==========================================================================
  function step(dt) {
    if (!state.ball) return;
    const b = state.ball;

    b.vy += GRAVITY * dt;
    b.vx *= AIR_FRICTION;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Walls
    if (b.x < BALL_R) {
      b.x = BALL_R;
      b.vx = -b.vx * WALL_DAMPING;
    }
    if (b.x > W - BALL_R) {
      b.x = W - BALL_R;
      b.vx = -b.vx * WALL_DAMPING;
    }

    // Pegs
    for (const peg of state.pegs) {
      const dx = b.x - peg.x;
      const dy = b.y - peg.y;
      const dist2 = dx * dx + dy * dy;
      const r = BALL_R + PEG_R;
      if (dist2 < r * r && dist2 > 0.0001) {
        const dist = Math.sqrt(dist2);
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = r - dist;
        b.x += nx * overlap;
        b.y += ny * overlap;
        const dot = b.vx * nx + b.vy * ny;
        if (dot < 0) {
          b.vx = (b.vx - 2 * dot * nx) * PEG_DAMPING;
          b.vy = (b.vy - 2 * dot * ny) * PEG_DAMPING;
          // Small randomness to avoid stuck oscillations
          b.vx += (Math.random() - 0.5) * 30;
          b.bounces++;
        }
      }
    }

    // Bottom: landed in slot
    if (b.y > PEG_AREA_BOTTOM + 6) {
      landBall();
    }

    // Safety: cap velocity to prevent tunneling
    const maxV = 1500;
    if (b.vx > maxV) b.vx = maxV;
    if (b.vx < -maxV) b.vx = -maxV;
    if (b.vy > maxV) b.vy = maxV;
  }

  function landBall() {
    const slotW = W / SLOT_VALUES.length;
    let idx = Math.floor(state.ball.x / slotW);
    if (idx < 0) idx = 0;
    if (idx >= SLOT_VALUES.length) idx = SLOT_VALUES.length - 1;
    const value = SLOT_VALUES[idx];

    state.score += value;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(STORAGE_KEY, String(state.best));
    }

    state.floats.push({
      text: "+" + value,
      x: idx * slotW + slotW / 2,
      y: PEG_AREA_BOTTOM + SLOT_HEIGHT / 2,
      age: 0,
      color: SLOT_COLORS[idx],
    });

    state.ball = null;
    updateStats();

    if (state.ballsPlayed >= TOTAL_BALLS && !state.finished) {
      finish();
    }
  }

  // ==========================================================================
  // Game flow
  // ==========================================================================
  function newGame() {
    state.pegs = generatePegs();
    state.ball = null;
    state.score = 0;
    state.ballsPlayed = 0;
    state.aimX = null;
    state.floats = [];
    state.finished = false;
    hideOverlay();
    clearLBSlot();
    updateStats();
  }

  function dropBall(x) {
    if (state.ball || state.finished) return;
    if (state.ballsPlayed >= TOTAL_BALLS) return;
    state.ballsPlayed++;
    state.ball = {
      x,
      y: 30,
      vx: (Math.random() - 0.5) * 12,
      vy: 0,
      color: BALL_COLORS[state.ballSeq++ % BALL_COLORS.length],
      bounces: 0,
    };
    state.aimX = null;
    updateStats();
  }

  async function finish() {
    state.finished = true;
    await new Promise((r) => setTimeout(r, 600));
    const isNewBest = state.score >= state.best;
    els.overlayTitle.textContent =
      isNewBest && state.score > 0 ? "🏆 Yeni Rekor!" : "Round Bitti";
    let text = "Toplam: " + state.score + "\nRekor: " + state.best;
    if (window.Leaderboard && state.score > 0 && Leaderboard.qualifies("slonky", state.score)) {
      const name = await Leaderboard.promptName({
        message: state.score + " puanla ilk 10'a girdin!",
      });
      if (name) {
        const rank = Leaderboard.add("slonky", name, state.score);
        if (rank) text += "\nLiderlik: #" + rank;
      }
    }
    els.overlayText.textContent = text;
    renderLBSlot();
    els.overlayBtn.textContent = "Tekrar Oyna";
    els.overlay.classList.remove("hidden");
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML = '<div class="lb-title">🏆 İlk 10</div>' + Leaderboard.renderHTML("slonky");
  }

  function clearLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (slot) slot.innerHTML = "";
  }

  function hideOverlay() {
    els.overlay.classList.add("hidden");
  }

  function updateStats() {
    els.score.textContent = state.score;
    els.balls.textContent = state.ballsPlayed + "/" + TOTAL_BALLS;
    els.best.textContent = state.best;
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  function render() {
    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#1a1d29");
    grad.addColorStop(1, "#0d0f18");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Drop zone hint band
    ctx.fillStyle = "rgba(108, 92, 231, 0.05)";
    ctx.fillRect(0, 0, W, PEG_AREA_TOP);
    ctx.fillStyle = "rgba(108, 92, 231, 0.18)";
    ctx.fillRect(0, PEG_AREA_TOP - 2, W, 2);

    // Slots
    drawSlots();

    // Pegs
    for (const peg of state.pegs) {
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, PEG_R, 0, Math.PI * 2);
      ctx.fillStyle = "#cbd5e1";
      ctx.fill();
      // Subtle highlight
      ctx.beginPath();
      ctx.arc(peg.x - 1, peg.y - 1, PEG_R / 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fill();
    }

    // Aim indicator
    if (
      state.aimX !== null &&
      !state.ball &&
      !state.finished &&
      state.ballsPlayed < TOTAL_BALLS
    ) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(state.aimX, 0);
      ctx.lineTo(state.aimX, PEG_AREA_TOP - 4);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(state.aimX, 30, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.fill();
    }

    // Ball
    if (state.ball) {
      const b = state.ball;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x - 2.5, b.y - 2.5, BALL_R / 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fill();
    }

    // Floating score texts
    ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    for (const f of state.floats) {
      const t = f.age / 900;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - t * 40);
      ctx.globalAlpha = 1;
    }
  }

  function drawSlots() {
    const slotW = W / SLOT_VALUES.length;
    for (let i = 0; i < SLOT_VALUES.length; i++) {
      const x = i * slotW;
      const y = PEG_AREA_BOTTOM;
      // Background band
      ctx.fillStyle = SLOT_COLORS[i];
      ctx.globalAlpha = 0.22;
      ctx.fillRect(x + 1, y, slotW - 2, SLOT_HEIGHT);
      ctx.globalAlpha = 1;

      // Top accent line
      ctx.fillStyle = SLOT_COLORS[i];
      ctx.fillRect(x + 1, y, slotW - 2, 4);

      // Divider walls (small)
      ctx.fillStyle = "#0d0f18";
      ctx.fillRect(x - 1, PEG_AREA_BOTTOM - 8, 2, 14);

      // Value
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(SLOT_VALUES[i]), x + slotW / 2, y + SLOT_HEIGHT / 2 + 6);
    }
  }

  // ==========================================================================
  // Game loop
  // ==========================================================================
  let lastTs = 0;
  function loop(ts) {
    const dtRaw = lastTs ? (ts - lastTs) / 1000 : 0.016;
    lastTs = ts;
    const dt = Math.min(0.033, dtRaw);

    // Substepped physics
    const sub = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) step(sub);

    // Floats age
    state.floats = state.floats.filter((f) => {
      f.age += dtRaw * 1000;
      return f.age < 900;
    });

    render();
    requestAnimationFrame(loop);
  }

  // ==========================================================================
  // Input
  // ==========================================================================
  function getCanvasCoord(e) {
    const rect = els.canvas.getBoundingClientRect();
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    const cx = ((t.clientX - rect.left) / rect.width) * W;
    return Math.max(BALL_R + 2, Math.min(W - BALL_R - 2, cx));
  }

  function bindEvents() {
    els.newGameBtn.addEventListener("click", newGame);
    els.overlayBtn.addEventListener("click", newGame);

    // Pointer events cover both mouse and touch on modern browsers.
    els.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (state.finished || state.ball) return;
      if (state.ballsPlayed >= TOTAL_BALLS) return;
      const x = getCanvasCoord(e);
      dropBall(x);
    });

    els.canvas.addEventListener("pointermove", (e) => {
      if (state.finished || state.ball) {
        state.aimX = null;
        return;
      }
      if (state.ballsPlayed >= TOTAL_BALLS) {
        state.aimX = null;
        return;
      }
      // Show aim only when pointer is "active" (mouse hover or touch held)
      // For touch with pointer events, only show during pointermove with buttons pressed.
      if (e.pointerType === "mouse" || e.buttons > 0) {
        state.aimX = getCanvasCoord(e);
      }
    });

    els.canvas.addEventListener("pointerleave", () => {
      state.aimX = null;
    });

    els.canvas.addEventListener("pointercancel", () => {
      state.aimX = null;
    });
  }

  // ==========================================================================
  // Boot
  // ==========================================================================
  function boot() {
    bindEvents();
    state.pegs = generatePegs();
    updateStats();
    // Show start overlay
    els.overlayTitle.textContent = "Slonky";
    els.overlayText.textContent = "Topu düşürmek için tahtanın üst kısmına dokun. 10 topla en yüksek skoru yapmaya çalış!";
    els.overlayBtn.textContent = "Başla";
    renderLBSlot();
    els.overlay.classList.remove("hidden");

    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
