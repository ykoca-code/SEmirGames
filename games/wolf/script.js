/* ==========================================================================
   Kurt Maceraları (Wolf Adventure) — 3D Platformer
   - Three.js + isometric camera
   - Level-based: collect stars, reach exit
   - Physics: gravity, AABB collision
   - Enemies: avoid contact (−1 life)
   ========================================================================== */

(function () {
  "use strict";

  const W = 320;
  const H = 500;
  const WORLD_SCALE = 1;

  // Game state
  const state = {
    level: 1,
    score: 0,
    lives: 3,
    best: +(localStorage.getItem("semirk_wolf_best") || 0),
    starsCollected: 0,
    starsRequired: 3,
    wolf: { x: 0, y: 0, z: 2, vx: 0, vy: 0, vz: 0, grounded: false, jumping: false },
    platforms: [],
    stars: [],
    enemies: [],
    exit: null,
    running: false,
    paused: false,
    finished: true,
    lastTs: 0,
  };

  // DOM
  const els = {
    canvas: document.getElementById("board"),
    level: document.getElementById("level"),
    stars: document.getElementById("stars"),
    lives: document.getElementById("lives"),
    score: document.getElementById("score"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
    newGameBtn: document.getElementById("newGameBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
  };

  // Three.js scene
  let scene, camera, renderer;
  let wolfMesh, platformMeshes = {}, starMeshes = [], enemyMeshes = [];

  // Input
  const keys = {};

  // ==========================================================================
  // Three.js Setup
  // ==========================================================================
  function initThree() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x5aa5d9); // Sky blue
    scene.fog = new THREE.Fog(0x5aa5d9, 80, 100);

    // Camera — isometric 45°
    camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 1000);
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(1);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    // Ground plane (visual)
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7c3a });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    scene.add(ground);

    // Wolf character
    createWolf();
  }

  function createWolf() {
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(1.2, 1.4, 0.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8b8b7b });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    group.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.8, 0.8, 0.7);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x9a9a8a });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.5, 0);
    group.add(head);

    // Ears (cones)
    const earGeo = new THREE.ConeGeometry(0.3, 0.6, 8);
    const earMat = new THREE.MeshStandardMaterial({ color: 0x7a7a6a });
    const earL = new THREE.Mesh(earGeo, earMat);
    earL.position.set(-0.4, 2.0, 0);
    earL.rotation.z = -0.3;
    group.add(earL);
    const earR = new THREE.Mesh(earGeo, earMat);
    earR.position.set(0.4, 2.0, 0);
    earR.rotation.z = 0.3;
    group.add(earR);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.2, 1.6, 0.35);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.2, 1.6, 0.35);
    group.add(eyeR);

    wolfMesh = group;
    scene.add(wolfMesh);
  }

  // ==========================================================================
  // Level Builder
  // ==========================================================================
  const LEVEL_DATA = {
    1: {
      stars: 3,
      platforms: [
        { x: 0, y: 0, z: 0, w: 4, d: 4, h: 1 }, // start
        { x: 5, y: 0, z: 2, w: 3, d: 3, h: 1 },
        { x: 9, y: 0, z: 3, w: 3, d: 3, h: 1 },
        { x: 13, y: 0, z: 2, w: 4, d: 4, h: 1 }, // end
      ],
      stars: [
        { x: 5, y: 2, z: 2 },
        { x: 9, y: 2, z: 3 },
        { x: 13, y: 2, z: 2 },
      ],
      enemies: [],
      exit: { x: 13, y: 1, z: 2 },
    },
    2: {
      stars: 5,
      platforms: [
        { x: 0, y: 0, z: 0, w: 4, d: 4, h: 1 },
        { x: 5, y: 0, z: 2, w: 3, d: 3, h: 1, moving: true, moveAxis: "x", moveRange: 4, moveSpeed: 0.02 },
        { x: 10, y: 0, z: 3, w: 2.5, d: 2.5, h: 1 },
        { x: 14, y: 0, z: 2, w: 3, d: 3, h: 1, moving: true, moveAxis: "z", moveRange: 3, moveSpeed: 0.015 },
        { x: 19, y: 0, z: 1, w: 4, d: 4, h: 1 },
      ],
      stars: [
        { x: 5, y: 2, z: 2 },
        { x: 10, y: 2, z: 3 },
        { x: 14, y: 2, z: 2 },
        { x: 19, y: 2, z: 1 },
        { x: 7, y: 3, z: 1.5 },
      ],
      enemies: [
        { x: 10, y: 1, z: 3, vx: 2, vz: 0 },
      ],
      exit: { x: 19, y: 1, z: 1 },
    },
    3: {
      stars: 7,
      platforms: [
        { x: 0, y: 0, z: 0, w: 4, d: 4, h: 1 },
        { x: 5, y: 0, z: 1, w: 3, d: 3, h: 1 },
        { x: 9, y: 1.5, z: 2, w: 2.5, d: 2.5, h: 1, spike: true },
        { x: 13, y: 0, z: 1.5, w: 3, d: 3, h: 1 },
        { x: 17, y: 1, z: 2.5, w: 3, d: 3, h: 1, moving: true, moveAxis: "y", moveRange: 2, moveSpeed: 0.01 },
        { x: 21, y: 0, z: 1, w: 4, d: 4, h: 1 },
      ],
      stars: [
        { x: 5, y: 2, z: 1 },
        { x: 9, y: 3, z: 2 },
        { x: 13, y: 2, z: 1.5 },
        { x: 17, y: 2.5, z: 2.5 },
        { x: 21, y: 2, z: 1 },
        { x: 7, y: 2, z: 0.5 },
        { x: 15, y: 2.5, z: 0.5 },
      ],
      enemies: [
        { x: 9, y: 2, z: 2, vx: 1.5, vz: 1 },
        { x: 17, y: 2, z: 2.5, vx: -1.5, vz: 0.5 },
      ],
      exit: { x: 21, y: 1, z: 1 },
    },
  };

  function buildLevel(levelNum) {
    // Clear scene
    for (const mesh of starMeshes) scene.remove(mesh);
    for (const mesh of enemyMeshes) scene.remove(mesh);
    for (const key in platformMeshes) scene.remove(platformMeshes[key]);
    starMeshes = [];
    enemyMeshes = [];
    platformMeshes = {};
    state.stars = [];
    state.enemies = [];

    const data = LEVEL_DATA[levelNum] || LEVEL_DATA[1];
    state.starsRequired = data.stars;
    state.starsCollected = 0;
    updateHUD();

    // Platforms
    for (let i = 0; i < data.platforms.length; i++) {
      const p = data.platforms[i];
      const gizmo = new THREE.Group();
      const platGeo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const platMat = new THREE.MeshStandardMaterial({
        color: p.spike ? 0xffcc00 : 0x6b8e23,
        roughness: 0.7,
      });
      const platMesh = new THREE.Mesh(platGeo, platMat);
      platMesh.position.y = p.h / 2;
      gizmo.add(platMesh);
      gizmo.position.set(p.x, p.y, p.z);
      scene.add(gizmo);
      platformMeshes[i] = gizmo;

      state.platforms.push({
        id: i,
        x: p.x, y: p.y, z: p.z,
        w: p.w, d: p.d, h: p.h,
        mesh: gizmo,
        moving: p.moving || false,
        moveAxis: p.moveAxis || "x",
        moveRange: p.moveRange || 0,
        moveSpeed: p.moveSpeed || 0,
        moveOffset: 0,
        spike: p.spike || false,
      });
    }

    // Stars
    for (let i = 0; i < data.stars.length; i++) {
      const s = data.stars[i];
      const starGeo = new THREE.DodecahedronGeometry(0.4, 0);
      const starMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffa500 });
      const starMesh = new THREE.Mesh(starGeo, starMat);
      starMesh.position.set(s.x, s.y, s.z);
      scene.add(starMesh);
      starMeshes.push(starMesh);

      state.stars.push({
        x: s.x, y: s.y, z: s.z,
        radius: 0.4,
        collected: false,
        mesh: starMesh,
      });
    }

    // Enemies
    for (let i = 0; i < data.enemies.length; i++) {
      const e = data.enemies[i];
      const enemyGeo = new THREE.ConeGeometry(0.4, 1, 8);
      const enemyMat = new THREE.MeshStandardMaterial({ color: 0xff4444 });
      const enemyMesh = new THREE.Mesh(enemyGeo, enemyMat);
      enemyMesh.position.set(e.x, e.y, e.z);
      scene.add(enemyMesh);
      enemyMeshes.push(enemyMesh);

      state.enemies.push({
        x: e.x, y: e.y, z: e.z,
        vx: e.vx, vz: e.vz,
        radius: 0.5,
        mesh: enemyMesh,
      });
    }

    // Exit
    state.exit = data.exit;
    const exitGeo = new THREE.BoxGeometry(2, 1.5, 2);
    const exitMat = new THREE.MeshStandardMaterial({ color: 0x22cc22, emissive: 0x00ff00 });
    const exitMesh = new THREE.Mesh(exitGeo, exitMat);
    exitMesh.position.set(state.exit.x, state.exit.y + 0.75, state.exit.z);
    scene.add(exitMesh);
    platformMeshes.exit = exitMesh;

    // Reset wolf position
    state.wolf.x = 0;
    state.wolf.z = 0;
    state.wolf.y = 2;
    state.wolf.vx = 0;
    state.wolf.vy = 0;
    state.wolf.vz = 0;
  }

  // ==========================================================================
  // Physics & Collision
  // ==========================================================================
  const GRAVITY = 30;
  const JUMP_POWER = 16;
  const MOVE_SPEED = 15;
  const FRICTION = 0.15;

  function step(dt) {
    const frameAdj = dt / 16.67; // 60fps normalization

    // Input
    if (keys["ArrowLeft"] || keys["a"]) state.wolf.vx = -MOVE_SPEED;
    else if (keys["ArrowRight"] || keys["d"]) state.wolf.vx = MOVE_SPEED;
    else state.wolf.vx *= (1 - FRICTION);

    if (keys["ArrowUp"] || keys["w"]) state.wolf.vz = -MOVE_SPEED;
    else if (keys["ArrowDown"] || keys["s"]) state.wolf.vz = MOVE_SPEED;
    else state.wolf.vz *= (1 - FRICTION);

    // Gravity
    state.wolf.vy -= GRAVITY * frameAdj;

    // Position update
    state.wolf.x += state.wolf.vx * frameAdj;
    state.wolf.z += state.wolf.vz * frameAdj;
    state.wolf.y += state.wolf.vy * frameAdj;

    // Collision with platforms
    state.wolf.grounded = false;
    for (const plat of state.platforms) {
      if (collidePlatform(plat)) {
        state.wolf.grounded = true;
        state.wolf.vy = 0;
        state.wolf.y = plat.y + plat.h;

        // Spike damage
        if (plat.spike) {
          loseLife();
        }
      }
    }

    // Collision with enemies
    for (const enemy of state.enemies) {
      enemy.x += enemy.vx * frameAdj;
      enemy.z += enemy.vz * frameAdj;

      const dx = state.wolf.x - enemy.x;
      const dz = state.wolf.z - enemy.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 1.0) {
        loseLife();
      }

      // Bounce off level bounds
      if (enemy.x < -15 || enemy.x > 30) enemy.vx *= -1;
      if (enemy.z < -15 || enemy.z > 20) enemy.vz *= -1;
    }

    // Collect stars
    for (const star of state.stars) {
      if (star.collected) continue;
      const dx = state.wolf.x - star.x;
      const dy = state.wolf.y - star.y;
      const dz = state.wolf.z - star.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 1.0) {
        star.collected = true;
        state.starsCollected++;
        state.score += 50;
        scene.remove(star.mesh);
        updateHUD();
      }
    }

    // Check exit
    if (state.starsCollected >= state.starsRequired) {
      const dx = state.wolf.x - state.exit.x;
      const dz = state.wolf.z - state.exit.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 1.5) {
        levelClear();
      }
    }

    // Update moving platforms
    for (const plat of state.platforms) {
      if (!plat.moving) continue;
      plat.moveOffset += plat.moveSpeed;
      if (plat.moveOffset > plat.moveRange) plat.moveOffset = 0;

      const offset = Math.sin(plat.moveOffset) * plat.moveRange;
      if (plat.moveAxis === "x") plat.mesh.position.x = plat.x + offset;
      else if (plat.moveAxis === "z") plat.mesh.position.z = plat.z + offset;
      else if (plat.moveAxis === "y") plat.mesh.position.y = plat.y + offset;
    }

    // Camera follow wolf (offset back)
    camera.position.x = state.wolf.x + 15;
    camera.position.z = state.wolf.z + 15;
    camera.position.y = state.wolf.y + 15;
    camera.lookAt(state.wolf.x, state.wolf.y, state.wolf.z);

    // Update wolf visual
    wolfMesh.position.set(state.wolf.x, state.wolf.y, state.wolf.z);

    // Update enemy visuals
    for (const enemy of state.enemies) {
      const idx = state.enemies.indexOf(enemy);
      if (enemyMeshes[idx]) {
        enemyMeshes[idx].position.set(enemy.x, enemy.y, enemy.z);
      }
    }
  }

  function collidePlatform(plat) {
    const px = plat.moving ? plat.mesh.position.x : plat.x;
    const pz = plat.moving ? plat.mesh.position.z : plat.z;
    const py = plat.moving ? plat.mesh.position.y : plat.y;

    return (
      state.wolf.x + 0.4 > px - plat.w / 2 && state.wolf.x - 0.4 < px + plat.w / 2 &&
      state.wolf.z + 0.4 > pz - plat.d / 2 && state.wolf.z - 0.4 < pz + plat.d / 2 &&
      state.wolf.y - 0.5 < py + plat.h && state.wolf.y > py + plat.h - 0.8 &&
      state.wolf.vy <= 0
    );
  }

  // ==========================================================================
  // Game Logic
  // ==========================================================================
  function newGame() {
    state.level = 1;
    state.score = 0;
    state.lives = 3;
    state.starsCollected = 0;
    state.running = true;
    state.paused = false;
    state.finished = false;
    state.lastTs = 0;
    buildLevel(state.level);
    updateHUD();
    hideOverlay();
    requestAnimationFrame(loop);
  }

  function levelClear() {
    state.score += 200 + state.level * 50;
    state.level++;
    if (state.level <= 3) {
      buildLevel(state.level);
      updateHUD();
    } else {
      gameOver(true);
    }
  }

  function loseLife() {
    state.lives--;
    updateHUD();
    if (state.lives <= 0) {
      gameOver(false);
      return;
    }
    buildLevel(state.level);
  }

  async function gameOver(won) {
    state.finished = true;
    state.running = false;

    if (won) {
      if (state.score > state.best) {
        state.best = state.score;
        localStorage.setItem("semirk_wolf_best", String(state.best));
      }

      els.overlayTitle.textContent = "🎉 Tebrikler!";
      els.overlayText.textContent = "Tüm seviyeleri tamamladın!\nSkor: " + state.score;

      if (window.Leaderboard && state.score > 0 && Leaderboard.qualifies("wolf", state.score)) {
        const name = await Leaderboard.promptName({
          message: state.score + " puanla ilk 10'a girdin!",
        });
        if (name) {
          const rank = Leaderboard.add("wolf", name, state.score, { level: state.level });
        }
      }
    } else {
      els.overlayTitle.textContent = "💥 Oyun Bitti";
      els.overlayText.textContent = "Skor: " + state.score + " · Seviye: " + state.level;
    }

    els.overlayBtn.textContent = "Tekrar Oyna";
    renderLBSlot();
    showOverlay();
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
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  // ==========================================================================
  // Input
  // ==========================================================================
  function bindEvents() {
    document.addEventListener("keydown", (e) => {
      keys[e.key] = true;
      if (e.key === " " || e.key === "Enter") {
        if (state.grounded && state.running && !state.finished) {
          state.wolf.vy = JUMP_POWER;
          state.wolf.grounded = false;
        }
        e.preventDefault();
      } else if (e.key === "p" || e.key === "P") {
        togglePause();
      }
    });
    document.addEventListener("keyup", (e) => {
      keys[e.key] = false;
    });

    // Touch input
    let touchStart = null;
    els.canvas.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    }, { passive: true });

    els.canvas.addEventListener("touchend", (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      const dt = Date.now() - touchStart.time;
      touchStart = null;

      if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && dt < 200) {
        // Tap → jump
        if (state.wolf.grounded && state.running && !state.finished) {
          state.wolf.vy = JUMP_POWER;
          state.wolf.grounded = false;
        }
      }
    }, { passive: true });

    els.newGameBtn.addEventListener("click", newGame);
    els.pauseBtn.addEventListener("click", togglePause);
    els.overlayBtn.addEventListener("click", () => {
      if (state.paused && !state.finished) togglePause();
      else newGame();
    });
  }

  function togglePause() {
    if (state.finished || !state.running) return;
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

  // ==========================================================================
  // UI
  // ==========================================================================
  function updateHUD() {
    els.level.textContent = state.level;
    els.stars.textContent = state.starsCollected + "/" + state.starsRequired;
    els.lives.textContent = "❤".repeat(Math.max(0, state.lives));
    els.score.textContent = state.score;
  }

  function renderLBSlot() {
    const slot = document.getElementById("leaderboardSlot");
    if (!slot || !window.Leaderboard) return;
    slot.innerHTML = '<div class="lb-title">🏆 İlk 10</div>' + Leaderboard.renderHTML("wolf");
  }

  function showOverlay() { els.overlay.classList.remove("hidden"); }
  function hideOverlay() { els.overlay.classList.add("hidden"); }

  // ==========================================================================
  // Boot
  // ==========================================================================
  function boot() {
    initThree();
    buildLevel(1);
    bindEvents();
    updateHUD();
    renderLBSlot();
    showOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
