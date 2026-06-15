/* ==========================================================================
   Sınavdan Kaçış (Chrome Dino-style endless runner)
   - Student runs at the left; obstacles scroll in from the right
   - Space / ↑ / tap canvas → jump
   - ↓ / hold "Eğil" button → duck (slide under flying obstacles)
   - Ground obstacles (books, exam papers, BÜTE sign): jump over
   - Flying obstacles (paper plane): duck under
   - Speed ramps with score; spawn interval shrinks
   - Per-game leaderboard, persistent best score
   ========================================================================== */
(function () {
  "use strict";

  // Canvas logical dimensions
  const W = 360;
  const H = 500;

  // World layout
  const GROUND_Y = 410;          // y of the ground line (in canvas coords)
  const PLAYER_X = 60;           // fixed horizontal position of the player
  const PLAYER_STAND_W = 34;
  const PLAYER_STAND_H = 52;
  const PLAYER_DUCK_W = 50;
  const PLAYER_DUCK_H = 30;

  // Physics
  const GRAVITY = 2200;          // px/s² (pulls player down toward ground)
  const JUMP_VY = -780;          // px/s upward impulse (negative = up on canvas)
  const DUCK_FAST_FALL = 1800;   // px/s extra downward pull while ducking mid-air

  // Speed / spawn
  const START_SPEED = 220;       // px/s
  const MAX_SPEED = 620;         // px/s
  const SPEED_PER_SECOND = 6;    // px/s² ramp
  const MIN_SPAWN_GAP = 0.7;     // seconds between obstacles at top speed
  const MAX_SPAWN_GAP = 1.7;     // seconds at start speed

  const BEST_KEY = "semirk_runner_best";

  // Game state
  const state = {
    score: 0,
    bestScore: +(localStorage.getItem(BEST_KEY) || 0),
    distance: 0,                // total px traveled (for parallax + score)
    speed: START_SPEED,
    spawnTimer: 0,
    nextSpawnGap: 0,
    obstacles: [],              // { kind, x, y, w, h, anim }
    clouds: [],                 // { x, y, w, scale }
    player: {
      y: GROUND_Y - PLAYER_STAND_H, // top of player (canvas coords)
      vy: 0,
      grounded: true,
      ducking: false,
      runT: 0,                  // animation timer
    },
    running: false,
    paused: false,
    finished: true,
    lastTs: 0,
    shakeT: 0,
  };

  const els = {
    canvas: document.getElementById("board"),
    score: document.getElementById("score"),
    best: document.getElementById("best"),
    speed: document.getElementById("speed"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
    newGameBtn: document.getElementById("newGameBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    jumpBtn: document.getElementById("jumpBtn"),
    duckBtn: document.getElementById("duckBtn"),
  };
  const ctx = els.canvas.getContext("2d");

  // ==========================================================================
  // SFX (WebAudio, no asset files)
  // ==========================================================================
  const SFX = (function () {
    let actx = null;
    function ac() {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
      }
      if (actx.state === "suspended") actx.resume();
      return actx;
    }
    function tone(freq, dur, opts) {
      const a = ac(); if (!a) return;
      opts = opts || {};
      const o = a.createOscillator(), g = a.createGain();
      const t0 = a.currentTime + (opts.delay || 0);
      o.type = opts.type || "square";
      o.frequency.setValueAtTime(freq, t0);
      if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + opts.slide), t0 + dur);
      g.gain.setValueAtTime(opts.vol || 0.06, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(a.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
    return {
      unlock: ac,
      jump() { tone(540, 0.10, { type: "triangle", slide: 220 }); },
      milestone() {
        tone(660, 0.08, { type: "triangle" });
        tone(990, 0.12, { type: "triangle", delay: 0.07 });
      },
      crash() {
        tone(220, 0.25, { type: "sawtooth", slide: -160, vol: 0.09 });
        tone(140, 0.4, { type: "sawtooth", delay: 0.18, vol: 0.08 });
      },
    };
  })();

  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  function newGame() {
    state.score = 0;
    state.distance = 0;
    state.speed = START_SPEED;
    state.spawnTimer = 0;
    state.nextSpawnGap = 1.1;   // first obstacle a bit early but not instant
    state.obstacles = [];
    state.clouds = [
      { x: 100, y: 80, w: 56, scale: 1 },
      { x: 240, y: 140, w: 44, scale: 0.8 },
      { x: 320, y: 60, w: 64, scale: 1.1 },
    ];
    state.player.y = GROUND_Y - PLAYER_STAND_H;
    state.player.vy = 0;
    state.player.grounded = true;
    state.player.ducking = false;
    state.player.runT = 0;
    state.shakeT = 0;
    state.running = true;
    state.paused = false;
    state.finished = false;
    state.lastTs = 0;
    els.pauseBtn.textContent = "Duraklat";
    updateHUD();
    hideOverlay();
    requestAnimationFrame(loop);
  }

  function togglePause() {
    if (!state.running || state.finished) return;
    state.paused = !state.paused;
    els.pauseBtn.textContent = state.paused ? "Devam" : "Duraklat";
    if (state.paused) {
      els.overlayTitle.textContent = "Duraklatıldı";
      els.overlayText.textContent = "Devam etmek için tuşa bas.";
      els.overlayBtn.textContent = "Devam";
      showOverlay();
    } else {
      hideOverlay();
      state.lastTs = performance.now();
    }
  }

  async function gameOver() {
    state.finished = true;
    state.running = false;
    SFX.crash();
    state.shakeT = 0.4;

    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      localStorage.setItem(BEST_KEY, String(state.bestScore));
    }

    let extra = "";
    if (window.Leaderboard && state.score > 0 && Leaderboard.qualifies("runner", state.score)) {
      const name = await Leaderboard.promptName({
        message: state.score + " puanla ilk 10'a girdin!",
      });
      if (name) {
        const rank = Leaderboard.add("runner", name, state.score);
        if (rank) extra = " · Liderlik: #" + rank;
      }
    }

    els.overlayTitle.textContent = "💥 Sınavlara Yakalandın!";
    els.overlayText.textContent = "BÜTE KALDIN!\nSkor: " + state.score + " · Rekor: " + state.bestScore + extra;
    els.overlayBtn.textContent = "Tekrar Oyna";
    renderLBSlot();
    showOverlay();
  }

  // ==========================================================================
  // Step
  // ==========================================================================
  function jump() {
    if (!state.running || state.finished || state.paused) return;
    if (state.player.grounded) {
      state.player.vy = JUMP_VY;
      state.player.grounded = false;
      state.player.ducking = false; // jumping cancels duck
      SFX.jump();
    }
  }

  function setDuck(on) {
    if (!state.running || state.finished || state.paused) return;
    state.player.ducking = !!on;
  }

  function step(dt) {
    const dt_s = Math.min(0.05, dt / 1000);

    // Speed ramp
    state.speed = Math.min(MAX_SPEED, state.speed + SPEED_PER_SECOND * dt_s);
    state.distance += state.speed * dt_s;

    // Score = floor(distance / 4) so it climbs roughly at the chrome dino pace
    const prevScore = state.score;
    state.score = Math.floor(state.distance / 4);
    // Milestone chirp every 100 points
    if (Math.floor(prevScore / 100) !== Math.floor(state.score / 100) && state.score > 0) {
      SFX.milestone();
    }

    // Player physics
    const p = state.player;
    if (!p.grounded) {
      p.vy += GRAVITY * dt_s;
      // Hold-to-fast-fall while ducking in mid-air
      if (p.ducking && p.vy > 0) p.vy += DUCK_FAST_FALL * dt_s;
      p.y += p.vy * dt_s;
      const targetH = p.ducking ? PLAYER_DUCK_H : PLAYER_STAND_H;
      if (p.y + targetH >= GROUND_Y) {
        p.y = GROUND_Y - targetH;
        p.vy = 0;
        p.grounded = true;
      }
    } else {
      // On the ground, snap top based on duck state
      const targetH = p.ducking ? PLAYER_DUCK_H : PLAYER_STAND_H;
      p.y = GROUND_Y - targetH;
    }
    p.runT += dt_s * 12; // leg cycle

    // Cloud parallax
    for (const c of state.clouds) {
      c.x -= state.speed * 0.15 * dt_s;
      if (c.x + c.w < -10) {
        c.x = W + Math.random() * 80;
        c.y = 40 + Math.random() * 120;
        c.w = 40 + Math.random() * 40;
        c.scale = 0.8 + Math.random() * 0.5;
      }
    }

    // Spawn obstacles
    state.spawnTimer += dt_s;
    if (state.spawnTimer >= state.nextSpawnGap) {
      spawnObstacle();
      state.spawnTimer = 0;
      // Spawn gap shrinks as speed grows
      const speedFrac = (state.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
      const base = MAX_SPAWN_GAP - (MAX_SPAWN_GAP - MIN_SPAWN_GAP) * speedFrac;
      state.nextSpawnGap = base * (0.85 + Math.random() * 0.4); // jitter ±15%
    }

    // Move obstacles, cull off-screen, check collision
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const o = state.obstacles[i];
      o.x -= state.speed * dt_s;
      if (o.kind === "plane") o.anim += dt_s * 4; // bobbing flying obstacle
      if (o.x + o.w < -20) {
        state.obstacles.splice(i, 1);
        continue;
      }
      if (collides(o)) {
        gameOver();
        return;
      }
    }

    // Camera shake decay
    if (state.shakeT > 0) state.shakeT = Math.max(0, state.shakeT - dt_s);

    updateHUD();
  }

  function spawnObstacle() {
    // Pick obstacle kind. Flying obstacles only appear once speed has ramped a bit.
    const speedFrac = (state.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
    const r = Math.random();
    let kind;
    if (speedFrac > 0.25 && r < 0.22) kind = "plane";          // duck
    else if (r < 0.4) kind = "book";                            // single
    else if (r < 0.65) kind = "paper";                          // single low
    else if (r < 0.85) kind = "bute";                           // tall
    else kind = "double-book";                                  // 2 books in a row

    let w, h, y;
    switch (kind) {
      case "book":
        w = 26; h = 38; y = GROUND_Y - h; break;
      case "paper":
        w = 30; h = 22; y = GROUND_Y - h; break;
      case "bute":
        w = 30; h = 56; y = GROUND_Y - h; break;
      case "double-book":
        w = 56; h = 38; y = GROUND_Y - h; break;
      case "plane":
        w = 40; h = 22;
        // Plane height — must be duckable: low enough that ducking clears,
        // but high enough that running tall would clip.
        y = GROUND_Y - PLAYER_STAND_H - 4;
        break;
    }
    state.obstacles.push({
      kind, x: W + 10, y, w, h, anim: 0,
    });
  }

  function collides(o) {
    // Forgiving hitbox: shrink player slightly so glancing edges don't trip.
    const p = state.player;
    const pw = p.ducking ? PLAYER_DUCK_W : PLAYER_STAND_W;
    const ph = p.ducking ? PLAYER_DUCK_H : PLAYER_STAND_H;
    const px = PLAYER_X + 3;
    const py = p.y + 3;
    const pright = px + pw - 6;
    const pbottom = py + ph - 3;

    const ox = o.x + 2;
    const oy = o.y + 2;
    const oright = o.x + o.w - 2;
    const obottom = o.y + o.h - 2;

    return px < oright && pright > ox && py < obottom && pbottom > oy;
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  function render() {
    let shakeX = 0, shakeY = 0;
    if (state.shakeT > 0) {
      shakeX = (Math.random() - 0.5) * 6 * (state.shakeT / 0.4);
      shakeY = (Math.random() - 0.5) * 6 * (state.shakeT / 0.4);
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Sky
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#fef3c7");
    grd.addColorStop(1, "#fde68a");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Clouds
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const c of state.clouds) {
      const r = c.w * 0.4 * c.scale;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.arc(c.x + r * 0.8, c.y - r * 0.3, r * 0.85, 0, Math.PI * 2);
      ctx.arc(c.x + r * 1.5, c.y, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distant school silhouette (parallax)
    const off = -((state.distance * 0.1) % 360);
    ctx.fillStyle = "rgba(120,90,60,0.25)";
    for (let i = -1; i < 4; i++) {
      const sx = i * 180 + off;
      ctx.fillRect(sx + 20, GROUND_Y - 80, 60, 60);
      ctx.fillRect(sx + 90, GROUND_Y - 110, 40, 90);
      ctx.beginPath();
      ctx.moveTo(sx + 90, GROUND_Y - 110);
      ctx.lineTo(sx + 110, GROUND_Y - 130);
      ctx.lineTo(sx + 130, GROUND_Y - 110);
      ctx.closePath();
      ctx.fill();
    }

    // Ground line + dashed pattern (scrolls)
    ctx.fillStyle = "#7c5e3a";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.strokeStyle = "#3f2d1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();
    // Dashed tile marks
    ctx.fillStyle = "rgba(63,45,26,0.5)";
    const dashOff = -((state.distance) % 40);
    for (let x = dashOff; x < W; x += 40) {
      ctx.fillRect(x, GROUND_Y + 8, 20, 2);
    }

    // Obstacles
    for (const o of state.obstacles) drawObstacle(o);

    // Player
    drawPlayer();

    // Game-over flash (handled by overlay too, but tint canvas briefly)
    if (state.finished) {
      ctx.fillStyle = "rgba(13,15,24,0.35)";
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  function drawObstacle(o) {
    ctx.save();
    switch (o.kind) {
      case "book": {
        ctx.fillStyle = "#3b82f6";
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = "#dbeafe";
        ctx.fillRect(o.x + 3, o.y + 6, o.w - 6, 2);
        ctx.fillRect(o.x + 3, o.y + 12, o.w - 8, 2);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px Helvetica, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("📚", o.x + o.w / 2, o.y + o.h - 6);
        break;
      }
      case "paper": {
        ctx.fillStyle = "#fff";
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = "#94a3b8";
        ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 10px Helvetica, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("F", o.x + o.w / 2, o.y + 14);
        break;
      }
      case "bute": {
        // Tall sign: post + sign with "BÜTE"
        ctx.fillStyle = "#92400e";
        ctx.fillRect(o.x + o.w / 2 - 2, o.y + 14, 4, o.h - 14);
        ctx.fillStyle = "#facc15";
        ctx.fillRect(o.x, o.y, o.w, 22);
        ctx.strokeStyle = "#713f12";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, 21);
        ctx.fillStyle = "#7c2d12";
        ctx.font = "bold 11px Helvetica, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("BÜTE", o.x + o.w / 2, o.y + 11);
        break;
      }
      case "double-book": {
        // Two stacked books
        ctx.fillStyle = "#3b82f6";
        ctx.fillRect(o.x, o.y, 26, o.h);
        ctx.fillStyle = "#10b981";
        ctx.fillRect(o.x + 30, o.y, 26, o.h);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillRect(o.x + 3, o.y + 6, 20, 2);
        ctx.fillRect(o.x + 33, o.y + 6, 20, 2);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 10px Helvetica, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("📚📚", o.x + o.w / 2, o.y + o.h - 4);
        break;
      }
      case "plane": {
        // Paper airplane that bobs while flying
        const bob = Math.sin(o.anim) * 3;
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2 + bob;
        ctx.fillStyle = "#f8fafc";
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy);
        ctx.lineTo(cx + 18, cy - 8);
        ctx.lineTo(cx + 6, cy);
        ctx.lineTo(cx + 18, cy + 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 6, cy);
        ctx.lineTo(cx - 8, cy + 2);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
    const pw = p.ducking ? PLAYER_DUCK_W : PLAYER_STAND_W;
    const ph = p.ducking ? PLAYER_DUCK_H : PLAYER_STAND_H;
    const x = PLAYER_X, y = p.y;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x + pw / 2, GROUND_Y + 4, pw * 0.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = "#1e40af"; // blue uniform
    ctx.fillRect(x, y + ph * 0.35, pw, ph * 0.65);
    // Head
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.arc(x + pw / 2, y + ph * 0.18, ph * 0.18, 0, Math.PI * 2);
    ctx.fill();
    // Hair
    ctx.fillStyle = "#1f2937";
    ctx.beginPath();
    ctx.arc(x + pw / 2, y + ph * 0.12, ph * 0.18, Math.PI, 0);
    ctx.fill();
    // Backpack
    ctx.fillStyle = "#dc2626";
    if (p.ducking) {
      ctx.fillRect(x + pw - 10, y + 6, 10, ph - 8);
    } else {
      ctx.fillRect(x - 4, y + ph * 0.35, 8, ph * 0.45);
    }
    // Eyes
    ctx.fillStyle = "#1f2937";
    if (p.ducking) {
      ctx.fillRect(x + pw - 12, y + 6, 2, 2);
    } else {
      ctx.fillRect(x + pw / 2 + 2, y + ph * 0.16, 2, 2);
    }

    // Legs (animated when grounded and not ducking)
    if (p.grounded && !p.ducking) {
      const phase = Math.sin(p.runT);
      ctx.fillStyle = "#1f2937";
      const legY = y + ph;
      ctx.fillRect(x + 6, legY - 6, 6, 6 + phase * 3);
      ctx.fillRect(x + pw - 12, legY - 6, 6, 6 - phase * 3);
    } else if (!p.grounded) {
      // tuck legs while airborne
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(x + 8, y + ph - 6, 18, 6);
    }
  }

  // ==========================================================================
  // Loop
  // ==========================================================================
  function loop(ts) {
    if (!state.running) return;
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(50, ts - state.lastTs);
    state.lastTs = ts;
    if (!state.paused && !state.finished) step(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ==========================================================================
  // UI / Input
  // ==========================================================================
  function updateHUD() {
    els.score.textContent = state.score;
    els.best.textContent = state.bestScore;
    const mult = (state.speed / START_SPEED).toFixed(1) + "×";
    els.speed.textContent = mult;
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML = '<div class="lb-title">🏆 İlk 10</div>' + Leaderboard.renderHTML("runner");
  }
  function showOverlay() { els.overlay.classList.remove("hidden"); }
  function hideOverlay() { els.overlay.classList.add("hidden"); }

  function bindEvents() {
    document.addEventListener("pointerdown", () => SFX.unlock(), { once: true });
    document.addEventListener("keydown", () => SFX.unlock(), { once: true });

    // Tap canvas = jump
    els.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      jump();
    });

    // Keyboard
    document.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        jump(); e.preventDefault();
      } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        setDuck(true); e.preventDefault();
      } else if (e.key === "p" || e.key === "P") {
        togglePause();
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        setDuck(false);
      }
    });

    // Touch buttons
    const startJump = (e) => { e.preventDefault(); jump(); };
    els.jumpBtn.addEventListener("pointerdown", startJump);

    const startDuck = (e) => { e.preventDefault(); setDuck(true); };
    const stopDuck = (e) => { e.preventDefault(); setDuck(false); };
    els.duckBtn.addEventListener("pointerdown", startDuck);
    els.duckBtn.addEventListener("pointerup", stopDuck);
    els.duckBtn.addEventListener("pointercancel", stopDuck);
    els.duckBtn.addEventListener("pointerleave", stopDuck);

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
    try {
      bindEvents();
      updateHUD();
      renderLBSlot();
      // Render a quiescent first frame so the canvas isn't black behind the
      // overlay (player standing on the ground, no obstacles yet)
      render();
      showOverlay();
    } catch (err) {
      els.overlayTitle.textContent = "Oyun yüklenemedi 😞";
      els.overlayText.textContent = "Hata: " + (err && err.message ? err.message : err);
      els.overlayBtn.textContent = "Yeniden Dene";
      els.overlayBtn.addEventListener("click", () => location.reload());
      showOverlay();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
