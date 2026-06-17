/* ==========================================================================
   Kule Kur Ultra
   - Pendulum-swinging block at the top (real θ"=-(g/L)sin(θ) physics, not
     a sine wave) hangs from a crane rope
   - Tap / Space / "Bırak" releases the block — it inherits the pendulum's
     horizontal speed and falls under gravity
   - Pseudo-3D building blocks with side and roof faces, windows
   - Overhang shaved off as scrap. Perfect snap (≤2.5px) restores full
     width and starts a combo
   - 3 lives: full miss OR block trimmed below MIN_W = lose a life and
     the swing respawns at full width. Out of lives → game over.
   - Endless: no level cap, difficulty ramps with floor count
   - Camera scrolls so the tower top stays mid-canvas
   ========================================================================== */
(function () {
  "use strict";

  const W = 320;
  const H = 540;

  // World y = 0 is the ground line, +y is up.
  // Render: screenY = H - GROUND_SCREEN_Y - worldY + cameraScroll
  const GROUND_SCREEN_Y = 60;
  const BLOCK_H = 28;                // taller blocks → more 3D space
  const BASE_BLOCK_W = 78;
  const ROPE_LEN = 110;              // pendulum string length, world units
  const PIVOT_GAP = 60;              // distance from tower top to pivot
  const GRAVITY_FALL = 1900;         // px/s² downward gravity for falling block
  const PENDULUM_G = 60;             // tunable g for the pendulum (rad/s²)
  const MIN_BLOCK_W = 8;
  const PERFECT_TOL = 2.5;
  const START_LIVES = 3;

  // Pseudo-3D depth (offset of back face from front face in screen px)
  const DEPTH = 12;

  // Pleasant building palette — front face + darker side face per block
  const PALETTES = [
    { front: "#e85d4a", side: "#9c3b2b", win: "#fff5d6" },   // brick red
    { front: "#3aa6c9", side: "#21657a", win: "#fff5d6" },   // teal blue
    { front: "#e8b339", side: "#9a7421", win: "#3a2a05" },   // golden ochre
    { front: "#6ec1a5", side: "#3c7a66", win: "#fff5d6" },   // mint green
    { front: "#a06bc9", side: "#5e3a7a", win: "#fff5d6" },   // soft purple
    { front: "#f48a64", side: "#a85230", win: "#fff5d6" },   // coral
    { front: "#5a7ec9", side: "#324b85", win: "#fff5d6" },   // sky blue
  ];

  const BEST_KEY = "semirk_towerultra_best";

  const state = {
    score: 0,
    combo: 0,
    lives: START_LIVES,
    bestScore: +(localStorage.getItem(BEST_KEY) || 0),
    blocks: [],       // { worldY, centerX, width, palette }
    swing: null,      // pendulum payload: { worldY of pivot, theta, omega, width, palette }
    falling: null,    // released block: { worldY, centerX, vx, vy, width, palette }
    scraps: [],       // shaved overhang pieces
    cameraScroll: 0,
    running: false,
    paused: false,
    finished: true,
    lastTs: 0,
    flash: 0,
    flashText: "",
    flashColor: "#fde047",
    shakeT: 0,
  };

  const els = {
    canvas: document.getElementById("board"),
    floor: document.getElementById("floor"),
    score: document.getElementById("score"),
    lives: document.getElementById("lives"),
    best: document.getElementById("best"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
    newGameBtn: document.getElementById("newGameBtn"),
    dropBtn: document.getElementById("dropBtn"),
  };
  const ctx = els.canvas.getContext("2d");

  // ==========================================================================
  // SFX
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
      g.gain.setValueAtTime(opts.vol || 0.07, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(a.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
    return {
      unlock: ac,
      drop() { tone(220, 0.12, { slide: -100 }); },
      land() { tone(440, 0.08, { type: "triangle" }); },
      perfect() {
        tone(660, 0.08, { type: "triangle" });
        tone(990, 0.12, { type: "triangle", delay: 0.07 });
        tone(1320, 0.18, { type: "triangle", delay: 0.16, vol: 0.05 });
      },
      milestone() {
        tone(523, 0.1); tone(784, 0.14, { delay: 0.08 });
      },
      hurt() { tone(200, 0.3, { type: "sawtooth", slide: -120, vol: 0.09 }); },
      over() {
        tone(330, 0.2, { type: "sawtooth" });
        tone(262, 0.2, { type: "sawtooth", delay: 0.18 });
        tone(196, 0.4, { type: "sawtooth", delay: 0.36 });
      },
    };
  })();

  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  function newGame() {
    state.score = 0;
    state.combo = 0;
    state.lives = START_LIVES;
    state.blocks = [];
    state.scraps = [];
    state.falling = null;
    state.swing = null;
    state.cameraScroll = 0;
    state.flash = 0;
    state.shakeT = 0;
    state.finished = false;
    state.paused = false;
    state.running = true;
    state.lastTs = 0;

    // Foundation: wide base, neutral grey palette
    state.blocks.push({
      worldY: 0,
      centerX: W / 2,
      width: BASE_BLOCK_W + 18,
      palette: { front: "#4f6d8a", side: "#2c405e", win: "#1f2937" },
    });
    spawnSwing();
    updateHUD();
    hideOverlay();
    requestAnimationFrame(loop);
  }

  function spawnSwing() {
    const top = topBlock();
    // Start the pendulum at one side, with zero angular velocity, so it
    // swings freely under gravity. Side alternates every block for variety.
    const startAngle = (state.blocks.length % 2 === 0 ? -1 : 1) * 0.7;
    const idx = state.blocks.length;
    state.swing = {
      pivotWorldY: top.worldY + BLOCK_H + PIVOT_GAP + ROPE_LEN,
      theta: startAngle,    // radians, 0 = straight down, + = right
      omega: 0,             // angular velocity
      width: BASE_BLOCK_W,
      palette: PALETTES[idx % PALETTES.length],
    };
  }

  function topBlock() { return state.blocks[state.blocks.length - 1]; }

  // Pendulum gets faster as the tower grows, by tweaking the effective
  // gravity for the pendulum ODE. Starts at 60 rad/s² (~7s/period) and
  // ramps to ~220 (~4s/period) over the first 50 floors.
  function pendulumG() {
    const floors = state.blocks.length - 1;
    return Math.min(220, PENDULUM_G + floors * 3.2);
  }

  function pendulumCenterX(s) {
    return W / 2 + Math.sin(s.theta) * ROPE_LEN;
  }
  function pendulumWorldY(s) {
    // The block hangs at pivot − ROPE_LEN * cos(theta) (block bottom)
    return s.pivotWorldY - ROPE_LEN * Math.cos(s.theta);
  }
  function pendulumVX(s) {
    // horizontal speed of the block = d/dt[L sin θ] = L cos θ ω
    return ROPE_LEN * Math.cos(s.theta) * s.omega;
  }

  function dropSwingBlock() {
    if (!state.swing || state.falling || !state.running || state.finished || state.paused) return;
    const s = state.swing;
    const cx = pendulumCenterX(s);
    const wy = pendulumWorldY(s);
    const vx = pendulumVX(s);
    state.falling = {
      worldY: wy,
      centerX: cx,
      width: s.width,
      palette: s.palette,
      vx: vx,
      vy: 0,
    };
    state.swing = null;
    SFX.drop();
  }

  // ==========================================================================
  // Step / Physics
  // ==========================================================================
  function step(dt) {
    const dt_s = Math.min(0.05, dt / 1000);

    // Smooth camera follows tower top
    const top = topBlock();
    const towerScreenY = H - GROUND_SCREEN_Y - top.worldY + state.cameraScroll;
    const desired = state.cameraScroll + Math.max(0, H * 0.55 - towerScreenY);
    state.cameraScroll += (desired - state.cameraScroll) * Math.min(1, dt_s * 4);

    // Pendulum integration — semi-implicit Euler for stability
    if (state.swing) {
      const s = state.swing;
      const alpha = -(pendulumG() / ROPE_LEN) * Math.sin(s.theta);
      s.omega += alpha * dt_s;
      // Tiny damping so the swing never builds up indefinitely.
      s.omega *= 1 - 0.002;
      s.theta += s.omega * dt_s;
    }

    // Falling block
    if (state.falling) {
      const f = state.falling;
      f.vy -= GRAVITY_FALL * dt_s;            // gravity pulls worldY DOWN
      f.worldY += f.vy * dt_s;
      f.centerX += f.vx * dt_s;
      // Side walls
      const half = f.width / 2;
      if (f.centerX - half < 0) { f.centerX = half; f.vx = Math.abs(f.vx) * 0.5; }
      else if (f.centerX + half > W) { f.centerX = W - half; f.vx = -Math.abs(f.vx) * 0.5; }
      // Landed?
      const targetY = top.worldY + BLOCK_H;
      if (f.worldY <= targetY) landFalling(targetY);
    }

    // Scraps
    for (let i = state.scraps.length - 1; i >= 0; i--) {
      const s = state.scraps[i];
      s.vy -= GRAVITY_FALL * dt_s;
      s.worldY += s.vy * dt_s;
      s.centerX += s.vx * dt_s;
      s.rot += s.vrot * dt_s;
      if (s.worldY < -300) state.scraps.splice(i, 1);
    }

    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt_s);
    if (state.shakeT > 0) state.shakeT = Math.max(0, state.shakeT - dt_s);
  }

  function landFalling(targetY) {
    const f = state.falling;
    const top = topBlock();
    const fL = f.centerX - f.width / 2;
    const fR = f.centerX + f.width / 2;
    const tL = top.centerX - top.width / 2;
    const tR = top.centerX + top.width / 2;
    const overlapL = Math.max(fL, tL);
    const overlapR = Math.min(fR, tR);
    const overlap = overlapR - overlapL;

    state.falling = null;

    if (overlap <= 0) {
      // Total miss → spawn the whole block as scrap, lose a life
      state.scraps.push({
        worldY: f.worldY, centerX: f.centerX, width: f.width, palette: f.palette,
        vy: 0, vx: f.vx + 60 * (Math.random() - 0.5), rot: 0, vrot: 4 * (Math.random() - 0.5),
      });
      loseLife("Tamamen ıskaladın!");
      return;
    }

    const leftOverhang = tL - fL;
    const rightOverhang = fR - tR;
    const totalOverhang = Math.max(0, leftOverhang) + Math.max(0, rightOverhang);
    const perfect = totalOverhang <= PERFECT_TOL && f.width >= top.width - PERFECT_TOL;

    let placedWidth, placedCenter;
    if (perfect) {
      placedWidth = Math.max(top.width, f.width);
      placedCenter = top.centerX;
      state.combo++;
      const bonus = 100 + (state.combo - 1) * 25;
      state.score += bonus;
      state.flashText = "MÜKEMMEL +" + bonus + (state.combo > 1 ? " ×" + state.combo : "");
      state.flashColor = "#fde047";
      state.flash = 1.0;
      SFX.perfect();
    } else {
      placedWidth = overlap;
      placedCenter = (overlapL + overlapR) / 2;
      // Spawn overhang scraps
      if (leftOverhang > 0) {
        state.scraps.push({
          worldY: f.worldY, centerX: fL + leftOverhang / 2, width: leftOverhang, palette: f.palette,
          vy: 30, vx: -80 - Math.random() * 40, rot: 0, vrot: -2.5,
        });
      }
      if (rightOverhang > 0) {
        state.scraps.push({
          worldY: f.worldY, centerX: tR + rightOverhang / 2, width: rightOverhang, palette: f.palette,
          vy: 30, vx: 80 + Math.random() * 40, rot: 0, vrot: 2.5,
        });
      }
      const accuracy = overlap / f.width;
      state.score += Math.floor(35 + 55 * accuracy);
      state.combo = 0;
      state.flashText = "";
      SFX.land();
    }

    if (placedWidth < MIN_BLOCK_W) {
      // Block too thin to place sensibly → lose a life, do NOT push it
      loseLife("Blok çok inceldi!");
      return;
    }

    state.blocks.push({
      worldY: targetY,
      centerX: placedCenter,
      width: placedWidth,
      palette: f.palette,
    });

    // Every 10 floors → milestone chirp + bonus
    const floors = state.blocks.length - 1;
    if (floors > 0 && floors % 10 === 0) {
      state.score += 250;
      state.flashText = floors + ". KAT! +250";
      state.flashColor = "#34d399";
      state.flash = 1.2;
      SFX.milestone();
    }

    updateHUD();
    spawnSwing();
  }

  function loseLife(reason) {
    state.lives--;
    state.combo = 0;
    state.shakeT = 0.45;
    SFX.hurt();
    state.flashText = "−1 CAN · " + reason;
    state.flashColor = "#ef4444";
    state.flash = 1.4;
    updateHUD();
    if (state.lives <= 0) {
      gameOver();
      return;
    }
    // Respawn pendulum at full width — tower stays as-is
    spawnSwing();
  }

  async function gameOver() {
    state.finished = true;
    state.running = false;
    SFX.over();

    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      localStorage.setItem(BEST_KEY, String(state.bestScore));
    }

    let extra = "";
    if (window.Leaderboard && state.score > 0 && Leaderboard.qualifies("towerultra", state.score)) {
      const name = await Leaderboard.promptName({
        message: state.score + " puanla ilk 10'a girdin!",
      });
      if (name) {
        const rank = Leaderboard.add("towerultra", name, state.score, { floors: state.blocks.length - 1 });
        if (rank) extra = " · Liderlik: #" + rank;
      }
    }

    els.overlayTitle.textContent = "🏢 Kule Devrildi";
    els.overlayText.textContent = "Skor: " + state.score +
      " · Kat: " + (state.blocks.length - 1) + extra;
    els.overlayBtn.textContent = "Tekrar Oyna";
    renderLBSlot();
    showOverlay();
  }

  function togglePause() {
    if (!state.running || state.finished) return;
    state.paused = !state.paused;
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

  // ==========================================================================
  // Render
  // ==========================================================================
  function worldToScreenY(worldY) {
    return H - GROUND_SCREEN_Y - worldY + state.cameraScroll;
  }

  // Pseudo-3D block: front face + dark right side + dark top + windows
  function drawBuilding(worldY, centerX, width, palette, opts) {
    const topScreenY = worldToScreenY(worldY + BLOCK_H);
    if (topScreenY > H + 60 || topScreenY + BLOCK_H < -60) return;
    const x = centerX - width / 2;
    const y = topScreenY;
    const rot = (opts && opts.rotation) || 0;

    ctx.save();
    if (rot) {
      const cy = y + BLOCK_H / 2;
      ctx.translate(centerX, cy);
      ctx.rotate(rot);
      ctx.translate(-centerX, -cy);
    }

    const d = DEPTH;

    // Right side face (parallelogram)
    ctx.fillStyle = palette.side;
    ctx.beginPath();
    ctx.moveTo(x + width, y);
    ctx.lineTo(x + width + d, y - d);
    ctx.lineTo(x + width + d, y - d + BLOCK_H);
    ctx.lineTo(x + width, y + BLOCK_H);
    ctx.closePath();
    ctx.fill();

    // Top face
    ctx.fillStyle = lightenColor(palette.front, 0.18);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + d, y - d);
    ctx.lineTo(x + width + d, y - d);
    ctx.lineTo(x + width, y);
    ctx.closePath();
    ctx.fill();

    // Front face
    ctx.fillStyle = palette.front;
    ctx.fillRect(x, y, width, BLOCK_H);

    // Outline
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, BLOCK_H - 1);

    // Windows: rows of small lit panes, density ∝ width
    if (width >= 16) {
      const cols = Math.max(2, Math.min(6, Math.floor(width / 14)));
      const padX = 6;
      const padY = 4;
      const winW = (width - padX * 2) / cols - 3;
      const winH = 5;
      ctx.fillStyle = palette.win;
      // Top row
      for (let c = 0; c < cols; c++) {
        const wx = x + padX + c * (winW + 3);
        ctx.fillRect(wx, y + padY, winW, winH);
      }
      // Bottom row (if there's room)
      if (BLOCK_H >= 22) {
        for (let c = 0; c < cols; c++) {
          const wx = x + padX + c * (winW + 3);
          ctx.fillRect(wx, y + padY + winH + 6, winW, winH);
        }
      }
    }

    ctx.restore();
  }

  function lightenColor(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    r = Math.min(255, Math.round(r + (255 - r) * amount));
    g = Math.min(255, Math.round(g + (255 - g) * amount));
    b = Math.min(255, Math.round(b + (255 - b) * amount));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function lerpColor(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 0xff) + (((pb >> 16) & 0xff) - ((pa >> 16) & 0xff)) * t);
    const g = Math.round(((pa >> 8) & 0xff) + (((pb >> 8) & 0xff) - ((pa >> 8) & 0xff)) * t);
    const bl = Math.round((pa & 0xff) + ((pb & 0xff) - (pa & 0xff)) * t);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }

  function render() {
    let shakeX = 0, shakeY = 0;
    if (state.shakeT > 0) {
      const k = state.shakeT / 0.45;
      shakeX = (Math.random() - 0.5) * 8 * k;
      shakeY = (Math.random() - 0.5) * 8 * k;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Sky gradient — shifts with altitude
    const alt = Math.min(1, (state.blocks.length - 1) / 80);
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, lerpColor("#aee6f5", "#1e3a5f", alt));
    grd.addColorStop(1, lerpColor("#d1eef7", "#3a5378", alt));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Sun (decorative)
    ctx.fillStyle = lerpColor("#fef3c7", "#fcd34d", alt);
    ctx.beginPath();
    ctx.arc(W - 50, 60, 18, 0, Math.PI * 2);
    ctx.fill();

    // Distant city silhouette — parallax with camera
    const cityOff = -((state.cameraScroll * 0.15) % 1000);
    const cityScreenY = worldToScreenY(0) - 4;
    drawCitySilhouette(cityOff, cityScreenY);

    // Ground / sidewalk
    const groundScreen = worldToScreenY(0);
    ctx.fillStyle = "#7a6b5a";
    ctx.fillRect(0, groundScreen, W, H - groundScreen);
    ctx.fillStyle = "#5e4f3f";
    ctx.fillRect(0, groundScreen + 6, W, 2);

    // Tower
    for (const b of state.blocks) drawBuilding(b.worldY, b.centerX, b.width, b.palette);

    // Scraps
    for (const s of state.scraps) drawBuilding(s.worldY, s.centerX, s.width, s.palette, { rotation: s.rot });

    // Falling block
    if (state.falling) {
      drawBuilding(state.falling.worldY, state.falling.centerX, state.falling.width, state.falling.palette);
    }

    // Crane + pendulum block
    if (state.swing) {
      const s = state.swing;
      const cx = pendulumCenterX(s);
      const blockWY = pendulumWorldY(s);
      const blockScreenY = worldToScreenY(blockWY + BLOCK_H);
      const pivotScreenY = worldToScreenY(s.pivotWorldY);

      // Crane rail across the top of the screen
      const railY = Math.max(8, pivotScreenY - 14);
      ctx.fillStyle = "#475569";
      ctx.fillRect(10, railY, W - 20, 5);
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(20, railY + 5, 12, 8);
      ctx.fillRect(W - 32, railY + 5, 12, 8);

      // Crane trolley (where the rope hangs)
      ctx.fillStyle = "#facc15";
      ctx.fillRect(W / 2 - 16, railY - 6, 32, 8);
      ctx.strokeStyle = "#a16207";
      ctx.strokeRect(W / 2 - 16, railY - 6, 32, 8);

      // Rope
      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2, pivotScreenY);
      ctx.lineTo(cx, blockScreenY);
      ctx.stroke();

      // Block
      drawBuilding(blockWY, cx, s.width, s.palette);

      // Alignment guide — dashed line down to current tower top
      const topBlk = topBlock();
      const topScreen = worldToScreenY(topBlk.worldY + BLOCK_H);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(cx, blockScreenY + BLOCK_H);
      ctx.lineTo(cx, topScreen);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Flash text
    if (state.flash > 0 && state.flashText) {
      ctx.globalAlpha = Math.min(1, state.flash * 1.4);
      ctx.fillStyle = state.flashColor;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 3;
      ctx.font = "bold 18px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeText(state.flashText, W / 2, 80);
      ctx.fillText(state.flashText, W / 2, 80);
      ctx.globalAlpha = 1;
    }

    // Combo badge
    if (state.combo > 1) {
      ctx.fillStyle = "#16a34a";
      ctx.fillRect(8, 8, 90, 22);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("KOMBO ×" + state.combo, 53, 19);
    }

    ctx.restore();
  }

  function drawCitySilhouette(off, baseY) {
    ctx.fillStyle = "rgba(50, 64, 100, 0.55)";
    for (let i = -1; i < 6; i++) {
      const sx = i * 120 + off;
      ctx.fillRect(sx + 4, baseY - 38, 24, 38);
      ctx.fillRect(sx + 32, baseY - 52, 30, 52);
      ctx.fillRect(sx + 66, baseY - 30, 22, 30);
      ctx.fillRect(sx + 92, baseY - 60, 26, 60);
    }
    // tiny window lights
    ctx.fillStyle = "rgba(255, 235, 150, 0.5)";
    for (let i = -1; i < 6; i++) {
      const sx = i * 120 + off;
      for (let r = 0; r < 4; r++) {
        ctx.fillRect(sx + 38, baseY - 48 + r * 10, 3, 4);
        ctx.fillRect(sx + 48, baseY - 48 + r * 10, 3, 4);
        ctx.fillRect(sx + 98, baseY - 54 + r * 10, 3, 4);
        ctx.fillRect(sx + 108, baseY - 54 + r * 10, 3, 4);
      }
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
    els.floor.textContent = state.blocks.length - 1;
    els.score.textContent = state.score;
    els.lives.textContent = "❤".repeat(Math.max(0, state.lives));
    els.best.textContent = state.bestScore;
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML = '<div class="lb-title">🏆 İlk 10</div>' + Leaderboard.renderHTML("towerultra");
  }
  function showOverlay() { els.overlay.classList.remove("hidden"); }
  function hideOverlay() { els.overlay.classList.add("hidden"); }

  function bindEvents() {
    document.addEventListener("pointerdown", () => SFX.unlock(), { once: true });
    document.addEventListener("keydown", () => SFX.unlock(), { once: true });

    els.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      dropSwingBlock();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        if (!e.repeat) dropSwingBlock();
        e.preventDefault();
      } else if (e.key === "p" || e.key === "P") {
        togglePause();
      }
    });

    els.newGameBtn.addEventListener("click", newGame);
    els.dropBtn.addEventListener("click", () => dropSwingBlock());
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
      // Seed an idle scene so the canvas isn't black behind the overlay
      state.blocks.push({
        worldY: 0, centerX: W / 2,
        width: BASE_BLOCK_W + 18,
        palette: { front: "#4f6d8a", side: "#2c405e", win: "#1f2937" },
      });
      spawnSwing();
      bindEvents();
      updateHUD();
      renderLBSlot();
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
