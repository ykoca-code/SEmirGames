/* ==========================================================================
   Kule Kur (Tower Bloxx-style)
   - Crane swings left/right at the top of the canvas
   - Tap / Space → block drops; gravity pulls it onto the tower
   - Landing trims overhang (classic Tower Bloxx), perfect snap restores
     full width and starts a combo
   - Tower scrolls down (camera follows) so new blocks always appear on
     screen
   - 20 levels: crane gets faster, target block count grows
   ========================================================================== */
(function () {
  "use strict";

  const W = 320;
  const H = 540;

  // World coordinates: y = 0 is the ground line, +y is up.
  // Render: screenY = H - GROUND_SCREEN_Y - worldY + cameraScroll
  const GROUND_SCREEN_Y = 40;       // pixels from canvas bottom that ground sits
  const BLOCK_H = 22;
  const BASE_BLOCK_W = 64;
  const SWING_GAP = 140;            // world units above tower top
  const GRAVITY = 1800;             // px/s²
  const MIN_BLOCK_W = 6;            // narrower than this and tower topples
  const PERFECT_TOL = 2.5;          // px overhang treated as perfect snap

  const COLORS = [
    "#ef4444", "#f59e0b", "#84cc16", "#06b6d4",
    "#3b82f6", "#a855f7", "#ec4899", "#22c55e",
  ];

  const BEST_KEY = "semirk_tower_best";

  const state = {
    level: 1,
    score: 0,
    combo: 0,
    bestScore: +(localStorage.getItem(BEST_KEY) || 0),
    blocks: [],       // {worldY, centerX, width, color} — sorted bottom→top
    swing: null,      // current crane payload: {worldY, centerX, width, color, t, dir}
    falling: null,    // detached: {worldY, centerX, width, color, vy}
    scraps: [],       // overhang pieces falling off: {worldY, centerX, width, color, vy, vx, rot, vrot}
    cameraScroll: 0,  // px the world has been scrolled down for view
    targetBlocks: 5,
    placedThisLevel: 0,
    running: false,
    paused: false,
    finished: true,
    lastTs: 0,
    flash: 0,         // visual cue for landings
    flashText: "",
  };

  const els = {
    canvas: document.getElementById("board"),
    level: document.getElementById("level"),
    blocks: document.getElementById("blocks"),
    score: document.getElementById("score"),
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
      },
      clear() {
        tone(523, 0.12); tone(659, 0.12, { delay: 0.1 });
        tone(784, 0.12, { delay: 0.2 }); tone(1047, 0.22, { delay: 0.3 });
      },
      win() {
        tone(523, 0.15); tone(659, 0.15, { delay: 0.12 });
        tone(784, 0.15, { delay: 0.24 }); tone(1047, 0.3, { delay: 0.36 });
        tone(1319, 0.4, { delay: 0.52 });
      },
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
    state.level = 1;
    state.score = 0;
    state.combo = 0;
    state.finished = false;
    state.paused = false;
    state.running = true;
    state.lastTs = 0;
    initLevel();
    updateHUD();
    hideOverlay();
    requestAnimationFrame(loop);
  }

  function initLevel() {
    state.blocks = [];
    state.scraps = [];
    state.falling = null;
    state.cameraScroll = 0;
    state.placedThisLevel = 0;
    // Target grows from 5 (level 1) to 24 (level 20)
    state.targetBlocks = 4 + state.level;

    // Foundation block — slightly wider than normal
    state.blocks.push({
      worldY: 0,
      centerX: W / 2,
      width: BASE_BLOCK_W + 12,
      color: "#475569",
    });
    spawnSwing();
  }

  function spawnSwing() {
    const top = topBlock();
    state.swing = {
      worldY: top.worldY + BLOCK_H + SWING_GAP,
      centerX: W / 2,
      width: BASE_BLOCK_W,           // crane payload is always full base width
      color: COLORS[state.blocks.length % COLORS.length],
      t: 0,
      dir: Math.random() < 0.5 ? -1 : 1,
    };
  }

  function topBlock() {
    return state.blocks[state.blocks.length - 1];
  }

  // Crane swing speed grows with level (1.6 rad/s → ~3.5 rad/s at level 20).
  function swingSpeed() {
    return 1.6 + (state.level - 1) * 0.1;
  }

  function swingAmplitude() {
    // Keeps payload fully on screen.
    return (W - BASE_BLOCK_W) / 2 - 6;
  }

  function dropSwingBlock() {
    if (!state.swing || state.falling) return;
    const s = state.swing;
    // Velocity at the moment of release = derivative of sin(speed*t)*amp.
    const vxRelease = swingAmplitude() * swingSpeed() * Math.cos(s.t * swingSpeed()) * s.dir;
    state.falling = {
      worldY: s.worldY,
      centerX: s.centerX,
      width: s.width,
      color: s.color,
      vx: vxRelease,
      vy: 0, // starts from rest vertically; gravity pulls it down
    };
    state.swing = null;
    SFX.drop();
  }

  // ==========================================================================
  // Step / Physics
  // ==========================================================================
  function step(dt) {
    const dt_s = Math.min(0.05, dt / 1000);

    // Smooth camera: target keeps tower top around y = H/2 in screen coords
    const top = topBlock();
    const towerScreenY = H - GROUND_SCREEN_Y - top.worldY + state.cameraScroll;
    const desired = state.cameraScroll + Math.max(0, H / 2 - towerScreenY);
    state.cameraScroll += (desired - state.cameraScroll) * Math.min(1, dt_s * 4);

    // Swing animation
    if (state.swing) {
      state.swing.t += dt_s;
      state.swing.centerX = W / 2 + Math.sin(state.swing.t * swingSpeed()) * swingAmplitude() * state.swing.dir;
    }

    // Falling block
    if (state.falling) {
      state.falling.vy -= GRAVITY * dt_s;             // gravity pulls worldY down
      state.falling.worldY += state.falling.vy * dt_s;
      state.falling.centerX += state.falling.vx * dt_s;
      // Walls
      const half = state.falling.width / 2;
      if (state.falling.centerX - half < 0) {
        state.falling.centerX = half; state.falling.vx = Math.abs(state.falling.vx) * 0.5;
      } else if (state.falling.centerX + half > W) {
        state.falling.centerX = W - half; state.falling.vx = -Math.abs(state.falling.vx) * 0.5;
      }
      // Landed when bottom touches top block's top surface
      const targetY = top.worldY + BLOCK_H;
      if (state.falling.worldY <= targetY) {
        landFalling(targetY);
      }
    }

    // Scraps (overhang pieces falling away)
    for (let i = state.scraps.length - 1; i >= 0; i--) {
      const s = state.scraps[i];
      s.vy -= GRAVITY * dt_s;
      s.worldY += s.vy * dt_s;
      s.centerX += s.vx * dt_s;
      s.rot += s.vrot * dt_s;
      // Off-screen below the ground? remove.
      if (s.worldY < -200) state.scraps.splice(i, 1);
    }

    // Flash timer
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt_s);
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

    if (overlap <= 0) {
      // Missed entirely → falling scrap, game over
      state.scraps.push({
        worldY: f.worldY, centerX: f.centerX, width: f.width, color: f.color,
        vy: f.vy, vx: f.vx, rot: 0, vrot: 6 * (Math.random() - 0.5),
      });
      state.falling = null;
      gameOver(false);
      return;
    }

    // Detect perfect (within tolerance on BOTH sides)
    const leftOverhang = tL - fL;   // >0 → block sticks out left of tower
    const rightOverhang = fR - tR;  // >0 → block sticks out right of tower
    const totalOverhang = Math.max(0, leftOverhang) + Math.max(0, rightOverhang);
    const perfect = totalOverhang <= PERFECT_TOL && f.width >= top.width - PERFECT_TOL;

    let placedWidth, placedCenter;
    if (perfect) {
      // Snap exactly and restore full width (combo bonus)
      placedWidth = Math.max(top.width, f.width);
      placedCenter = top.centerX;
      state.combo++;
      const bonus = 100 + (state.combo - 1) * 25;
      state.score += bonus;
      state.flashText = "MÜKEMMEL +" + bonus + (state.combo > 1 ? " ×" + state.combo : "");
      state.flash = 0.9;
      SFX.perfect();
    } else {
      placedWidth = overlap;
      placedCenter = (overlapL + overlapR) / 2;
      // Spawn the overhang as scraps
      if (leftOverhang > 0) {
        const sw = leftOverhang;
        state.scraps.push({
          worldY: f.worldY, centerX: fL + sw / 2, width: sw, color: f.color,
          vy: 0, vx: -60 - Math.random() * 40, rot: 0, vrot: -3,
        });
      }
      if (rightOverhang > 0) {
        const sw = rightOverhang;
        state.scraps.push({
          worldY: f.worldY, centerX: tR + sw / 2, width: sw, color: f.color,
          vy: 0, vx: 60 + Math.random() * 40, rot: 0, vrot: 3,
        });
      }
      const accuracy = overlap / f.width;
      state.score += Math.floor(40 + 60 * accuracy);
      state.combo = 0;
      state.flashText = "";
      SFX.land();
    }

    state.blocks.push({
      worldY: targetY,
      centerX: placedCenter,
      width: placedWidth,
      color: f.color,
    });
    state.falling = null;
    state.placedThisLevel++;
    updateHUD();

    if (placedWidth < MIN_BLOCK_W) {
      gameOver(false);
      return;
    }

    if (state.placedThisLevel >= state.targetBlocks) {
      levelClear();
    } else {
      spawnSwing();
    }
  }

  function levelClear() {
    state.score += 200 + state.level * 50;
    updateHUD();
    if (state.level >= 20) {
      gameOver(true);
      return;
    }
    state.level++;
    SFX.clear();
    initLevel();
    updateHUD();
  }

  async function gameOver(won) {
    state.finished = true;
    state.running = false;
    if (won) SFX.win(); else SFX.over();

    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      localStorage.setItem(BEST_KEY, String(state.bestScore));
    }

    let extra = "";
    if (window.Leaderboard && state.score > 0 && Leaderboard.qualifies("tower", state.score)) {
      const name = await Leaderboard.promptName({
        message: state.score + " puanla ilk 10'a girdin!",
      });
      if (name) {
        const rank = Leaderboard.add("tower", name, state.score, { level: state.level });
        if (rank) extra = " · Liderlik: #" + rank;
      }
    }

    if (won) {
      els.overlayTitle.textContent = "🏆 Kuleyi Tamamladın!";
      els.overlayText.textContent = "20 seviyenin hepsi tamam!\nSkor: " + state.score + extra;
    } else {
      els.overlayTitle.textContent = "💥 Kule Yıkıldı";
      els.overlayText.textContent = "Skor: " + state.score + " · Seviye: " + state.level + extra;
    }
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

  function drawBlock(worldY, centerX, width, color, opts) {
    const screenY = worldToScreenY(worldY + BLOCK_H); // top of block in screen coords
    if (screenY > H + 40 || screenY + BLOCK_H < -40) return;
    const x = centerX - width / 2;
    ctx.save();
    if (opts && opts.rotation) {
      const cy = screenY + BLOCK_H / 2;
      ctx.translate(centerX, cy);
      ctx.rotate(opts.rotation);
      ctx.translate(-centerX, -cy);
    }
    ctx.fillStyle = color;
    ctx.fillRect(x, screenY, width, BLOCK_H);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(x + 2, screenY + 2, width - 4, 3);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, screenY + 0.5, width - 1, BLOCK_H - 1);
    ctx.restore();
  }

  function render() {
    // Sky gradient — shifts color with altitude
    const alt = Math.min(1, (state.blocks.length - 1) / 80);
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, lerpColor("#1a2b4a", "#0a0e1f", alt));
    grd.addColorStop(1, lerpColor("#2d4a7a", "#1a2240", alt));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Stars (parallax with cameraScroll)
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    for (let i = 0; i < 18; i++) {
      const sx = (i * 47 + 13) % W;
      const sy = ((i * 73 + state.cameraScroll * 0.3) % H + H) % H;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    // Ground line
    const groundScreen = worldToScreenY(0);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(0, groundScreen, W, H - groundScreen);
    ctx.strokeStyle = "#475569";
    ctx.beginPath();
    ctx.moveTo(0, groundScreen);
    ctx.lineTo(W, groundScreen);
    ctx.stroke();

    // Tower blocks
    for (const b of state.blocks) drawBlock(b.worldY, b.centerX, b.width, b.color);

    // Scraps
    for (const s of state.scraps) drawBlock(s.worldY, s.centerX, s.width, s.color, { rotation: s.rot });

    // Falling block
    if (state.falling) {
      drawBlock(state.falling.worldY, state.falling.centerX, state.falling.width, state.falling.color);
    }

    // Crane + swinging payload
    if (state.swing) {
      const s = state.swing;
      const blockTopScreen = worldToScreenY(s.worldY + BLOCK_H);
      // Crane rail
      const railY = Math.max(8, blockTopScreen - 60);
      ctx.fillStyle = "#6b7280";
      ctx.fillRect(20, railY, W - 40, 4);
      // Rope
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s.centerX, railY + 4);
      ctx.lineTo(s.centerX, blockTopScreen);
      ctx.stroke();
      // Block
      drawBlock(s.worldY, s.centerX, s.width, s.color);

      // Alignment guide — vertical line from payload down to tower top
      const topBlk = topBlock();
      const topScreen = worldToScreenY(topBlk.worldY + BLOCK_H);
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(s.centerX, blockTopScreen + BLOCK_H);
      ctx.lineTo(s.centerX, topScreen);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Flash text
    if (state.flash > 0 && state.flashText) {
      ctx.globalAlpha = Math.min(1, state.flash * 2);
      ctx.fillStyle = "#fde047";
      ctx.font = "bold 18px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(state.flashText, W / 2, 60);
      ctx.globalAlpha = 1;
    }

    // Combo indicator
    if (state.combo > 1) {
      ctx.fillStyle = "#22c55e";
      ctx.font = "bold 12px Helvetica, Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("KOMBO ×" + state.combo, 8, 8);
    }
  }

  function lerpColor(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ar = (pa >> 16) & 0xff, ag = (pa >> 8) & 0xff, ab = pa & 0xff;
    const br = (pb >> 16) & 0xff, bg = (pb >> 8) & 0xff, bb = pb & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
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
    els.level.textContent = state.level;
    els.blocks.textContent = state.placedThisLevel + "/" + state.targetBlocks;
    els.score.textContent = state.score;
    els.best.textContent = state.bestScore;
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML = '<div class="lb-title">🏆 İlk 10</div>' + Leaderboard.renderHTML("tower");
  }
  function showOverlay() { els.overlay.classList.remove("hidden"); }
  function hideOverlay() { els.overlay.classList.add("hidden"); }

  function bindEvents() {
    document.addEventListener("pointerdown", () => SFX.unlock(), { once: true });
    document.addEventListener("keydown", () => SFX.unlock(), { once: true });

    els.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (state.running && !state.finished && !state.paused) dropSwingBlock();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        if (state.running && !state.finished && !state.paused) {
          if (!e.repeat) dropSwingBlock();
        }
        e.preventDefault();
      } else if (e.key === "p" || e.key === "P") {
        togglePause();
      }
    });

    els.newGameBtn.addEventListener("click", newGame);
    els.dropBtn.addEventListener("click", () => {
      if (state.running && !state.finished && !state.paused) dropSwingBlock();
    });
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
      initLevel();
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
