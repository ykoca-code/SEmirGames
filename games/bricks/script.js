/* ==========================================================================
   Tuğla Patlat (Brick Blaster)
   - Portrait 320x500 logical canvas
   - Paddle at bottom; drag to move. Tap board to launch / shoot.
   - Brick types:
       N = normal (1 hit)
       T = tough (2 hits, lighter on second)
       B = bomb (explodes 3x3 area)
       P = power-up dropper (releases a falling capsule)
   - Power-ups (drop from broken bricks):
       💣 Bomba       — next paddle hit fires an exploding ball
       🔵 Çoklu Top   — splits each ball into 3
       📏 Uzun Palet  — paddle 1.5x for 12s
       ❤️ Can         — +1 life
       ⚡ Hızlı Top   — temporary speed boost (5s)
   - Lives, level progression, leaderboard hook (semirk_lb_bricks)
   ========================================================================== */

(function () {
  "use strict";

  const W = 320;
  const H = 500;
  const COLS = 8;
  const TOP_PAD = 40;
  const SIDE_PAD = 8;
  const BRICK_GAP = 3;
  const BRICK_W = (W - SIDE_PAD * 2 - BRICK_GAP * (COLS - 1)) / COLS; // ~36px
  const BRICK_H = 16;

  const PADDLE_BASE_W = 70;
  const PADDLE_H = 10;
  const PADDLE_Y = H - 26;
  const PADDLE_LONG_MS = 12000;
  const FAST_MS = 5000;

  const BALL_R = 6;
  const BALL_BASE_SPEED = 4.0;
  const BALL_MAX_SPEED = 9.0;
  const BALL_FAST_SPEED = 6.2;

  const CAPSULE_W = 22;
  const CAPSULE_H = 14;
  const CAPSULE_FALL = 1.6;

  const COLORS = {
    1: "#ef4444", // row 0
    2: "#f59e0b",
    3: "#84cc16",
    4: "#06b6d4",
    5: "#a855f7",
    6: "#ec4899",
    bomb: "#fef3c7",
    tough1: "#94a3b8",
    tough2: "#475569",
    power: "#22c55e",
  };

  const POWER_TYPES = ["multi", "long", "life", "fast", "bomb"];
  const POWER_LABEL = {
    multi: "×3",
    long: "📏",
    life: "❤",
    fast: "⚡",
    bomb: "💣",
  };
  const POWER_COLOR = {
    multi: "#3b82f6",
    long: "#a855f7",
    life: "#ef4444",
    fast: "#fbbf24",
    bomb: "#f97316",
  };

  const BEST_KEY = "semirk_bricks_best";

  // ----- State -----
  const state = {
    level: 1,
    score: 0,
    lives: 3,
    best: +(localStorage.getItem(BEST_KEY) || 0),
    paddle: { x: W / 2 - PADDLE_BASE_W / 2, w: PADDLE_BASE_W },
    longUntil: 0,
    fastUntil: 0,
    bombShots: 0,           // count of "next paddle hit = explosive ball"
    balls: [],              // { x, y, vx, vy, exploding: bool }
    bricks: [],             // { col, row, type, hp, x, y, w, h, alive }
    capsules: [],           // { x, y, type }
    particles: [],          // { x, y, vx, vy, life, max, color }
    running: false,
    paused: false,
    finished: true,
    awaitingLaunch: true,   // ball stuck on paddle until first tap
    lastTs: 0,
    levelClearAnim: 0,
  };

  // ----- DOM -----
  const els = {
    canvas: document.getElementById("board"),
    score: document.getElementById("score"),
    level: document.getElementById("level"),
    lives: document.getElementById("lives"),
    best: document.getElementById("best"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
    newGameBtn: document.getElementById("newGameBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
  };
  const ctx = els.canvas.getContext("2d");

  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  function newGame() {
    state.level = 1;
    state.score = 0;
    state.lives = 3;
    state.paddle.w = PADDLE_BASE_W;
    state.paddle.x = W / 2 - state.paddle.w / 2;
    state.longUntil = 0;
    state.fastUntil = 0;
    state.bombShots = 0;
    state.capsules = [];
    state.particles = [];
    state.finished = false;
    state.paused = false;
    state.running = true;
    state.awaitingLaunch = true;
    state.lastTs = 0;
    state.levelClearAnim = 0;
    buildLevel(state.level);
    resetBallOnPaddle();
    els.pauseBtn.textContent = "Duraklat";
    updateStats();
    hideOverlay();
    requestAnimationFrame(loop);
  }

  function resetBallOnPaddle() {
    state.balls = [{
      x: state.paddle.x + state.paddle.w / 2,
      y: PADDLE_Y - BALL_R - 1,
      vx: 0,
      vy: 0,
      exploding: false,
      stuck: true,
    }];
    state.awaitingLaunch = true;
  }

  function launchBall() {
    if (!state.awaitingLaunch) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const speed = ballSpeed();
    const angle = (Math.PI / 3) * dir + (Math.random() - 0.5) * 0.4;
    for (const b of state.balls) {
      b.stuck = false;
      b.vx = Math.sin(angle) * speed;
      b.vy = -Math.cos(angle) * speed;
    }
    state.awaitingLaunch = false;
  }

  function ballSpeed() {
    const base = BALL_BASE_SPEED + Math.min(2, (state.level - 1) * 0.25);
    return performance.now() < state.fastUntil ? Math.max(base, BALL_FAST_SPEED) : base;
  }

  function loseLife() {
    state.lives--;
    updateStats();
    if (state.lives <= 0) {
      gameOver();
      return;
    }
    state.paddle.w = PADDLE_BASE_W;
    state.longUntil = 0;
    state.fastUntil = 0;
    state.bombShots = 0;
    resetBallOnPaddle();
  }

  async function gameOver() {
    state.finished = true;
    state.running = false;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(BEST_KEY, String(state.best));
      updateStats();
    }

    let extra = "";
    if (window.Leaderboard && state.score > 0 && Leaderboard.qualifies("bricks", state.score)) {
      const name = await Leaderboard.promptName({
        message: state.score + " puanla ilk 10'a girdin!",
      });
      if (name) {
        const rank = Leaderboard.add("bricks", name, state.score, { level: state.level });
        if (rank) extra = " · Liderlik: #" + rank;
      }
    }

    els.overlayTitle.textContent = "💥 Oyun Bitti";
    els.overlayText.textContent =
      "Skor: " + state.score + " · Seviye: " + state.level + extra;
    els.overlayBtn.textContent = "Tekrar Oyna";
    renderLBSlot();
    showOverlay();
  }

  function levelCleared() {
    state.score += 200 + state.level * 50;
    state.level++;
    state.paddle.w = PADDLE_BASE_W;
    state.longUntil = 0;
    state.fastUntil = 0;
    state.bombShots = 0;
    state.capsules = [];
    state.particles = [];
    buildLevel(state.level);
    resetBallOnPaddle();
    updateStats();
  }

  // ==========================================================================
  // Level generation
  // ==========================================================================
  function buildLevel(level) {
    state.bricks = [];
    const rows = Math.min(7, 4 + Math.floor(level / 2));
    const bombChance = Math.min(0.12, 0.04 + level * 0.01);
    const toughChance = Math.min(0.25, 0.08 + level * 0.02);
    const powerChance = 0.16; // any brick has chance to drop a power-up

    for (let r = 0; r < rows; r++) {
      // Some rows have gaps for variety
      const gapEvery = level >= 3 ? (level >= 6 ? 0 : 5) : 0;
      for (let c = 0; c < COLS; c++) {
        if (gapEvery && (c + r) % gapEvery === 0 && r > 0) continue;

        let type = "normal";
        let hp = 1;
        const roll = Math.random();
        if (roll < bombChance) {
          type = "bomb"; hp = 1;
        } else if (roll < bombChance + toughChance) {
          type = "tough"; hp = 2;
        }
        const drops = type !== "bomb" && Math.random() < powerChance
          ? POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)]
          : null;

        const x = SIDE_PAD + c * (BRICK_W + BRICK_GAP);
        const y = TOP_PAD + r * (BRICK_H + BRICK_GAP);
        state.bricks.push({
          col: c, row: r, type, hp, drops,
          x, y, w: BRICK_W, h: BRICK_H,
          alive: true,
          colorRow: r + 1,
        });
      }
    }
  }

  // ==========================================================================
  // Main loop
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
    const frameAdj = dt / 16.67;

    // If ball is stuck, follow paddle
    if (state.awaitingLaunch) {
      for (const b of state.balls) {
        if (b.stuck) {
          b.x = state.paddle.x + state.paddle.w / 2;
          b.y = PADDLE_Y - BALL_R - 1;
        }
      }
    } else {
      moveBalls(frameAdj);
    }

    moveCapsules(frameAdj);
    updateParticles(frameAdj);
    expirePowerups();

    // Did we clear the level?
    const remaining = state.bricks.some((br) => br.alive);
    if (!remaining && !state.awaitingLaunch) {
      levelCleared();
    }
  }

  function moveBalls(frameAdj) {
    const SUB = 4;
    for (const b of state.balls) {
      const sx = (b.vx * frameAdj) / SUB;
      const sy = (b.vy * frameAdj) / SUB;
      for (let i = 0; i < SUB; i++) {
        b.x += sx;
        b.y += sy;
        ballCollide(b);
      }
    }
    // Cull balls that fell off
    state.balls = state.balls.filter((b) => b.y < H + 20);
    if (state.balls.length === 0) {
      loseLife();
    }
  }

  function ballCollide(b) {
    // Walls
    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
    if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); }
    if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); }

    // Paddle
    const p = state.paddle;
    if (
      b.vy > 0 &&
      b.y + BALL_R >= PADDLE_Y &&
      b.y + BALL_R <= PADDLE_Y + PADDLE_H + 2 &&
      b.x >= p.x - 2 && b.x <= p.x + p.w + 2
    ) {
      b.y = PADDLE_Y - BALL_R;
      const rel = (b.x - (p.x + p.w / 2)) / (p.w / 2); // -1..1
      const speed = Math.max(BALL_BASE_SPEED, Math.min(BALL_MAX_SPEED, Math.hypot(b.vx, b.vy)));
      const angle = rel * (Math.PI / 3); // ±60°
      b.vx = Math.sin(angle) * speed;
      b.vy = -Math.abs(Math.cos(angle) * speed);
      if (state.bombShots > 0) {
        state.bombShots--;
        b.exploding = true;
      }
    }

    // Bricks
    for (const br of state.bricks) {
      if (!br.alive) continue;
      if (b.x + BALL_R < br.x || b.x - BALL_R > br.x + br.w) continue;
      if (b.y + BALL_R < br.y || b.y - BALL_R > br.y + br.h) continue;

      // Choose collision side by smallest overlap
      const overL = b.x + BALL_R - br.x;
      const overR = br.x + br.w - (b.x - BALL_R);
      const overT = b.y + BALL_R - br.y;
      const overB = br.y + br.h - (b.y - BALL_R);
      const minH = Math.min(overL, overR);
      const minV = Math.min(overT, overB);

      if (minH < minV) {
        b.vx = overL < overR ? -Math.abs(b.vx) : Math.abs(b.vx);
      } else {
        b.vy = overT < overB ? -Math.abs(b.vy) : Math.abs(b.vy);
      }

      hitBrick(br, b);
      break; // only one brick per micro-step
    }
  }

  function hitBrick(br, ball) {
    if (ball && ball.exploding) {
      // Explosive ball wipes a 3x3 region around the brick
      explode(br);
      ball.exploding = false;
      return;
    }
    if (br.type === "bomb") {
      explode(br);
      return;
    }
    br.hp--;
    if (br.hp <= 0) {
      destroyBrick(br);
    } else {
      // small spark
      pushParticles(br.x + br.w / 2, br.y + br.h / 2, "#cbd5e1", 5);
    }
  }

  function destroyBrick(br) {
    if (!br.alive) return;
    br.alive = false;
    state.score += 10 + state.level * 2;
    pushParticles(br.x + br.w / 2, br.y + br.h / 2, brickColor(br), 12);
    if (br.drops) {
      state.capsules.push({
        x: br.x + br.w / 2,
        y: br.y + br.h / 2,
        type: br.drops,
      });
    }
    updateStats();
  }

  function explode(centerBr) {
    if (!centerBr.alive && centerBr.type !== "bomb") return;
    centerBr.alive = false;
    state.score += 30 + state.level * 3;
    pushParticles(centerBr.x + centerBr.w / 2, centerBr.y + centerBr.h / 2, "#fbbf24", 28);
    // Big shockwave particles
    for (let i = 0; i < 18; i++) {
      const ang = (Math.PI * 2 * i) / 18;
      state.particles.push({
        x: centerBr.x + centerBr.w / 2,
        y: centerBr.y + centerBr.h / 2,
        vx: Math.cos(ang) * 4,
        vy: Math.sin(ang) * 4,
        life: 0, max: 28,
        color: "#f97316",
      });
    }

    // Take out neighbours in a 3x3 grid
    for (const br of state.bricks) {
      if (!br.alive || br === centerBr) continue;
      if (
        Math.abs(br.col - centerBr.col) <= 1 &&
        Math.abs(br.row - centerBr.row) <= 1
      ) {
        if (br.type === "bomb") {
          explode(br); // chain explosions
        } else {
          destroyBrick(br);
        }
      }
    }
    updateStats();
  }

  // ==========================================================================
  // Capsules / power-ups
  // ==========================================================================
  function moveCapsules(frameAdj) {
    for (const c of state.capsules) {
      c.y += CAPSULE_FALL * frameAdj;
    }
    // Catch with paddle
    const p = state.paddle;
    for (let i = state.capsules.length - 1; i >= 0; i--) {
      const c = state.capsules[i];
      if (
        c.y + CAPSULE_H / 2 >= PADDLE_Y &&
        c.y - CAPSULE_H / 2 <= PADDLE_Y + PADDLE_H &&
        c.x >= p.x - CAPSULE_W / 2 && c.x <= p.x + p.w + CAPSULE_W / 2
      ) {
        applyPower(c.type);
        state.capsules.splice(i, 1);
        continue;
      }
      if (c.y > H + 30) state.capsules.splice(i, 1);
    }
  }

  function applyPower(type) {
    const now = performance.now();
    switch (type) {
      case "multi": {
        const newBalls = [];
        for (const b of state.balls) {
          if (b.stuck) continue;
          const speed = Math.hypot(b.vx, b.vy) || BALL_BASE_SPEED;
          const baseAng = Math.atan2(b.vy, b.vx);
          for (const da of [-0.45, 0.45]) {
            newBalls.push({
              x: b.x, y: b.y,
              vx: Math.cos(baseAng + da) * speed,
              vy: Math.sin(baseAng + da) * speed,
              exploding: false, stuck: false,
            });
          }
        }
        state.balls.push(...newBalls);
        if (state.balls.length > 12) state.balls.length = 12;
        state.score += 20;
        break;
      }
      case "long":
        state.paddle.w = PADDLE_BASE_W * 1.5;
        state.paddle.x = clamp(state.paddle.x - PADDLE_BASE_W * 0.25, 0, W - state.paddle.w);
        state.longUntil = now + PADDLE_LONG_MS;
        state.score += 15;
        break;
      case "life":
        state.lives = Math.min(state.lives + 1, 9);
        state.score += 25;
        break;
      case "fast":
        state.fastUntil = now + FAST_MS;
        for (const b of state.balls) {
          if (b.stuck) continue;
          const speed = Math.hypot(b.vx, b.vy);
          const k = BALL_FAST_SPEED / (speed || 1);
          b.vx *= k; b.vy *= k;
        }
        state.score += 15;
        break;
      case "bomb":
        state.bombShots = Math.min(state.bombShots + 2, 6);
        state.score += 20;
        break;
    }
    updateStats();
    pushParticles(state.paddle.x + state.paddle.w / 2, PADDLE_Y - 4, POWER_COLOR[type], 18);
  }

  function expirePowerups() {
    const now = performance.now();
    if (state.longUntil && now > state.longUntil) {
      state.longUntil = 0;
      const cx = state.paddle.x + state.paddle.w / 2;
      state.paddle.w = PADDLE_BASE_W;
      state.paddle.x = clamp(cx - state.paddle.w / 2, 0, W - state.paddle.w);
    }
    // fast effect just naturally fades when ball speed isn't recomputed; nothing to do
  }

  // ==========================================================================
  // Particles
  // ==========================================================================
  function pushParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.6;
      state.particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0, max: 22 + Math.random() * 14,
        color,
      });
    }
  }
  function updateParticles(frameAdj) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * frameAdj;
      p.y += p.vy * frameAdj;
      p.vx *= 0.94;
      p.vy = p.vy * 0.94 + 0.08; // slight gravity
      p.life += frameAdj;
      if (p.life >= p.max) state.particles.splice(i, 1);
    }
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  function brickColor(br) {
    if (br.type === "bomb") return COLORS.bomb;
    if (br.type === "tough") return br.hp >= 2 ? COLORS.tough2 : COLORS.tough1;
    return COLORS[br.colorRow] || COLORS[1];
  }

  function render() {
    // Background
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#0f172a");
    grd.addColorStop(1, "#0a0e1a");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Decorative starfield
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let i = 0; i < 24; i++) {
      ctx.fillRect((i * 53) % W, (i * 91) % H, 1, 1);
    }

    // Bricks
    for (const br of state.bricks) {
      if (!br.alive) continue;
      drawBrick(br);
    }

    // Capsules
    for (const c of state.capsules) drawCapsule(c);

    // Particles
    for (const p of state.particles) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;

    // Paddle
    drawPaddle();

    // Balls
    for (const b of state.balls) drawBall(b);

    // Bomb-shot indicator
    if (state.bombShots > 0) {
      ctx.fillStyle = "#f97316";
      ctx.font = "bold 11px Helvetica, Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("💣 ×" + state.bombShots, 6, 6);
    }
    if (state.fastUntil && performance.now() < state.fastUntil) {
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 11px Helvetica, Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("⚡ HIZ", W - 6, 6);
    }

    // "Tap to launch" hint
    if (state.awaitingLaunch && !state.finished) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "bold 13px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Fırlatmak için dokun", W / 2, PADDLE_Y - 30);
    }
  }

  function drawBrick(br) {
    const fill = brickColor(br);
    ctx.fillStyle = fill;
    roundRect(br.x, br.y, br.w, br.h, 3);
    ctx.fill();
    // Top highlight
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(br.x + 2, br.y + 2, br.w - 4, 2);
    // Type indicator
    if (br.type === "bomb") {
      ctx.fillStyle = "#0d0f18";
      ctx.font = "bold 12px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("💣", br.x + br.w / 2, br.y + br.h / 2 + 1);
    } else if (br.drops) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(br.x + br.w - 6, br.y + 5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCapsule(c) {
    ctx.fillStyle = POWER_COLOR[c.type] || "#22c55e";
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    roundRect(c.x - CAPSULE_W / 2, c.y - CAPSULE_H / 2, CAPSULE_W, CAPSULE_H, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(POWER_LABEL[c.type] || "?", c.x, c.y + 0.5);
  }

  function drawPaddle() {
    const p = state.paddle;
    ctx.fillStyle = state.longUntil ? "#a855f7" : "#3b82f6";
    roundRect(p.x, PADDLE_Y, p.w, PADDLE_H, 5);
    ctx.fill();
    // Highlight strip
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(p.x + 4, PADDLE_Y + 2, p.w - 8, 2);
  }

  function drawBall(b) {
    const grad = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, BALL_R);
    grad.addColorStop(0, b.exploding ? "#fed7aa" : "#fef3c7");
    grad.addColorStop(1, b.exploding ? "#f97316" : "#fbbf24");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    if (b.exploding) {
      ctx.strokeStyle = "rgba(249,115,22,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R + 2 + Math.sin(performance.now() / 60) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function roundRect(x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ==========================================================================
  // UI helpers
  // ==========================================================================
  function updateStats() {
    els.score.textContent = state.score;
    els.level.textContent = state.level;
    els.lives.textContent = "♥".repeat(Math.max(0, state.lives));
    els.best.textContent = state.best;
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML = '<div class="lb-title">🏆 İlk 10</div>' + Leaderboard.renderHTML("bricks");
  }
  function clearLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (slot) slot.innerHTML = "";
  }
  function showOverlay() { els.overlay.classList.remove("hidden"); }
  function hideOverlay() { els.overlay.classList.add("hidden"); }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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

  function movePaddle(x) {
    state.paddle.x = clamp(x - state.paddle.w / 2, 0, W - state.paddle.w);
  }

  function bindEvents() {
    let dragging = false;

    els.canvas.addEventListener("pointerdown", (e) => {
      if (!state.running || state.finished) return;
      e.preventDefault();
      const { x } = getCoord(e);
      dragging = true;
      movePaddle(x);
      // Single tap also launches the ball
      if (state.awaitingLaunch) {
        launchBall();
      }
    });

    els.canvas.addEventListener("pointermove", (e) => {
      if (!dragging || !state.running || state.finished) return;
      const { x } = getCoord(e);
      movePaddle(x);
    });

    els.canvas.addEventListener("pointerup", () => { dragging = false; });
    els.canvas.addEventListener("pointercancel", () => { dragging = false; });

    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        state.paddle.x = clamp(state.paddle.x - 20, 0, W - state.paddle.w);
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        state.paddle.x = clamp(state.paddle.x + 20, 0, W - state.paddle.w);
        e.preventDefault();
      } else if (e.key === " " || e.key === "Enter") {
        if (state.awaitingLaunch) launchBall();
        e.preventDefault();
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
  }

  // ==========================================================================
  // Boot
  // ==========================================================================
  function boot() {
    bindEvents();
    buildLevel(1);
    resetBallOnPaddle();
    updateStats();
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
