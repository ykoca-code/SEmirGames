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
    jumpsUsed: 0,                      // double jump: 0 = grounded, max 2
    respawn: { x: 0, y: 2, z: 0 },     // where loseLife puts you back
    checkpoint: null,                  // { x, y, z, active, flagMat }
    invulnUntil: 0,                    // i-frames after taking a hit
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
  let groundMat = null, exitMat = null, exitMesh = null;
  let wolfParts = { legs: [], tail: null };
  let animT = 0; // shared clock for decor animations

  // Per-level pastel theme (stylized, kid-friendly)
  const LEVEL_THEME = {
    1: { sky: 0x7cc5ff, ground: 0x6abf69, platform: 0x8bd17c }, // orman — yeşil
    2: { sky: 0x9db8ff, ground: 0x6d9bc4, platform: 0x7eb6e8 }, // dağ — mavi
    3: { sky: 0xb79df0, ground: 0x8a6fc0, platform: 0xa78bdb }, // kale — mor
  };

  // Input
  const keys = {};
  const touchVec = { x: 0, z: 0 }; // mobile drag joystick, -1..1

  // ==========================================================================
  // Sound FX — tiny WebAudio synth, no external files
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
      const a = ac();
      if (!a) return;
      opts = opts || {};
      const o = a.createOscillator();
      const g = a.createGain();
      const t0 = a.currentTime + (opts.delay || 0);
      o.type = opts.type || "square";
      o.frequency.setValueAtTime(freq, t0);
      if (opts.slide) {
        o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + opts.slide), t0 + dur);
      }
      g.gain.setValueAtTime(opts.vol || 0.07, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(a.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }
    return {
      unlock: ac, // call on first user gesture (autoplay policy)
      jump() { tone(300, 0.14, { slide: 250 }); },
      doubleJump() { tone(450, 0.16, { slide: 350 }); },
      star() {
        tone(880, 0.09, { type: "triangle", vol: 0.09 });
        tone(1320, 0.12, { type: "triangle", vol: 0.09, delay: 0.07 });
      },
      checkpoint() {
        tone(523, 0.1); tone(659, 0.1, { delay: 0.09 }); tone(784, 0.18, { delay: 0.18 });
      },
      hurt() { tone(220, 0.28, { type: "sawtooth", slide: -140, vol: 0.09 }); },
      clear() {
        tone(523, 0.12); tone(659, 0.12, { delay: 0.1 });
        tone(784, 0.12, { delay: 0.2 }); tone(1047, 0.26, { delay: 0.3 });
      },
      win() {
        tone(523, 0.15); tone(659, 0.15, { delay: 0.12 }); tone(784, 0.15, { delay: 0.24 });
        tone(1047, 0.3, { delay: 0.36 }); tone(1319, 0.4, { delay: 0.52 });
      },
      over() {
        tone(330, 0.2, { type: "sawtooth" });
        tone(262, 0.2, { type: "sawtooth", delay: 0.18 });
        tone(196, 0.4, { type: "sawtooth", delay: 0.36 });
      },
    };
  })();

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
    groundMat = new THREE.MeshStandardMaterial({ color: 0x6abf69 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    scene.add(ground);

    // Wolf character
    createWolf();
  }

  function createWolf() {
    const group = new THREE.Group();

    const furMat = new THREE.MeshStandardMaterial({ color: 0x9d5c3f, roughness: 0.8 }); // warm brown
    const furDarkMat = new THREE.MeshStandardMaterial({ color: 0x7d4630, roughness: 0.8 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: 0xffb6c1, roughness: 0.9 }); // pink belly
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xf5e6d3, roughness: 0.9 }); // snout/tail tip

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.3, 0.85), furMat);
    body.position.y = 0.75;
    group.add(body);

    // Belly panel (front)
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.1), bellyMat);
    belly.position.set(0, 0.65, 0.41);
    group.add(belly);

    // Legs (animated while walking)
    const legGeo = new THREE.BoxGeometry(0.28, 0.5, 0.28);
    wolfParts.legs = [];
    for (const [lx, lz] of [[-0.35, 0.22], [0.35, 0.22], [-0.35, -0.22], [0.35, -0.22]]) {
      const leg = new THREE.Mesh(legGeo, furDarkMat);
      leg.position.set(lx, 0.05, lz);
      group.add(leg);
      wolfParts.legs.push(leg);
    }

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.8, 0.75), furMat);
    head.position.set(0, 1.55, 0);
    group.add(head);

    // Snout (cream muzzle + black nose)
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), creamMat);
    snout.position.set(0, 1.42, 0.48);
    group.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    nose.position.set(0, 1.46, 0.65);
    group.add(nose);

    // Ears — outer brown, inner pink
    const earGeo = new THREE.ConeGeometry(0.26, 0.55, 4);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, furDarkMat);
      ear.position.set(0.38 * sx, 2.1, 0);
      ear.rotation.z = -0.25 * sx;
      group.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 4), bellyMat);
      inner.position.set(0.38 * sx, 2.08, 0.08);
      inner.rotation.z = -0.25 * sx;
      group.add(inner);
    }

    // Big cartoon eyes — white sclera + black pupil
    const scleraGeo = new THREE.SphereGeometry(0.17, 10, 10);
    const pupilGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    for (const sx of [-1, 1]) {
      const sclera = new THREE.Mesh(scleraGeo, whiteMat);
      sclera.position.set(0.22 * sx, 1.68, 0.32);
      group.add(sclera);
      const pupil = new THREE.Mesh(pupilGeo, blackMat);
      pupil.position.set(0.22 * sx, 1.68, 0.46);
      group.add(pupil);
    }

    // Fluffy tail — brown cone with cream tip (wags while walking)
    const tail = new THREE.Group();
    const tailBase = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 8), furMat);
    tailBase.rotation.x = Math.PI / 2.6;
    tail.add(tailBase);
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), creamMat);
    tailTip.position.set(0, 0.28, -0.28);
    tail.add(tailTip);
    tail.position.set(0, 0.9, -0.5);
    group.add(tail);
    wolfParts.tail = tail;

    wolfMesh = group;
    scene.add(wolfMesh);
  }

  // ==========================================================================
  // Level Builder
  // ==========================================================================
  const LEVEL_DATA = {
    1: {
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
      checkpoint: { x: 9, y: 1, z: 3 },
      exit: { x: 13, y: 1, z: 2 },
    },
    2: {
      platforms: [
        { x: 0, y: 0, z: 0, w: 4, d: 4, h: 1 },
        { x: 4.5, y: 0, z: 2, w: 3, d: 3, h: 1, moving: true, moveAxis: "x", moveRange: 3, moveSpeed: 0.015 },
        { x: 8.5, y: 0, z: 3, w: 2.5, d: 2.5, h: 1 },
        { x: 12, y: 0, z: 2, w: 3, d: 3, h: 1, moving: true, moveAxis: "z", moveRange: 2.5, moveSpeed: 0.012 },
        { x: 16, y: 0, z: 1, w: 4, d: 4, h: 1 },
      ],
      stars: [
        { x: 4.5, y: 2, z: 2 },
        { x: 8.5, y: 2, z: 3 },
        { x: 12, y: 2, z: 2 },
        { x: 16, y: 2, z: 1 },
        { x: 10, y: 3, z: 2.5 },
      ],
      enemies: [
        { x: 8.5, y: 1, z: 3, vx: 1.5, vz: 0 },
      ],
      checkpoint: { x: 8.5, y: 1, z: 3 },
      exit: { x: 16, y: 1, z: 1 },
    },
    3: {
      platforms: [
        { x: 0, y: 0, z: 0, w: 4, d: 4, h: 1 },
        { x: 4.5, y: 0, z: 1, w: 3, d: 3, h: 1 },
        { x: 8.5, y: 1, z: 2, w: 2.5, d: 2.5, h: 1, spike: true },
        { x: 12, y: 0, z: 1.5, w: 3, d: 3, h: 1 },
        { x: 15.5, y: 0.8, z: 2.5, w: 3, d: 3, h: 1, moving: true, moveAxis: "y", moveRange: 1.5, moveSpeed: 0.008 },
        { x: 19, y: 0, z: 1, w: 4, d: 4, h: 1 },
      ],
      stars: [
        { x: 4.5, y: 2, z: 1 },
        { x: 8.5, y: 2.5, z: 2 },
        { x: 12, y: 2, z: 1.5 },
        { x: 15.5, y: 2.5, z: 2.5 },
        { x: 19, y: 2, z: 1 },
        { x: 10.5, y: 2.5, z: 1.5 },
        { x: 17, y: 1.5, z: 0.5 },
      ],
      enemies: [
        { x: 8.5, y: 1.5, z: 2, vx: 1.2, vz: 0.8 },
        { x: 15.5, y: 1.5, z: 2.5, vx: -1.2, vz: 0.4 },
      ],
      checkpoint: { x: 12, y: 1, z: 1.5 },
      exit: { x: 19, y: 1, z: 1 },
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
    state.platforms = []; // must reset — otherwise ghost platforms pile up

    const data = LEVEL_DATA[levelNum] || LEVEL_DATA[1];
    state.starsRequired = data.stars.length;
    state.starsCollected = 0;
    updateHUD();

    // Apply level theme — sky, fog, ground tint
    const theme = LEVEL_THEME[levelNum] || LEVEL_THEME[1];
    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(theme.sky, 80, 100);
    if (groundMat) groundMat.color.setHex(theme.ground);

    // Platforms
    for (let i = 0; i < data.platforms.length; i++) {
      const p = data.platforms[i];
      const gizmo = new THREE.Group();
      const platGeo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const platMat = new THREE.MeshStandardMaterial({
        color: p.spike ? 0xffd166 : theme.platform,
        roughness: 0.7,
      });
      const platMesh = new THREE.Mesh(platGeo, platMat);
      platMesh.position.y = p.h / 2;
      gizmo.add(platMesh);
      // Spike platforms get visible warning spikes on top
      if (p.spike) {
        const spikeMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
        const n = Math.max(2, Math.floor(p.w));
        for (let sx = 0; sx < n; sx++) {
          for (let sz = 0; sz < n; sz++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 4), spikeMat);
            spike.position.set(
              -p.w / 2 + (sx + 0.5) * (p.w / n),
              p.h + 0.25,
              -p.d / 2 + (sz + 0.5) * (p.d / n)
            );
            gizmo.add(spike);
          }
        }
      }
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

    // Stars — glowing, pulsing (animated in step)
    for (let i = 0; i < data.stars.length; i++) {
      const s = data.stars[i];
      const starGeo = new THREE.DodecahedronGeometry(0.4, 0);
      const starMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0xffa500,
        emissiveIntensity: 1,
      });
      const starMesh = new THREE.Mesh(starGeo, starMat);
      starMesh.position.set(s.x, s.y, s.z);
      // Soft glow halo (slightly larger transparent shell)
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.25 })
      );
      starMesh.add(halo);
      scene.add(starMesh);
      starMeshes.push(starMesh);

      state.stars.push({
        x: s.x, y: s.y, z: s.z,
        radius: 0.4,
        collected: false,
        mesh: starMesh,
      });
    }

    // Enemies — cute-evil: soft red cone with googly eyes (bobs in step)
    for (let i = 0; i < data.enemies.length; i++) {
      const e = data.enemies[i];
      const enemyGroup = new THREE.Group();
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.4, 1, 8),
        new THREE.MeshStandardMaterial({ color: 0xff6b6b })
      );
      enemyGroup.add(cone);
      const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const eyeBlack = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
      for (const sx of [-1, 1]) {
        const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeWhite);
        sclera.position.set(0.14 * sx, 0.15, 0.3);
        enemyGroup.add(sclera);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeBlack);
        pupil.position.set(0.14 * sx, 0.15, 0.39);
        enemyGroup.add(pupil);
      }
      enemyGroup.position.set(e.x, e.y, e.z);
      scene.add(enemyGroup);
      enemyMeshes.push(enemyGroup);

      state.enemies.push({
        x: e.x, y: e.y, z: e.z,
        vx: e.vx, vz: e.vz,
        radius: 0.5,
        mesh: enemyMesh,
      });
    }

    // Exit — rainbow portal (hue cycles in step)
    state.exit = data.exit;
    const exitGeo = new THREE.BoxGeometry(2, 1.5, 2);
    exitMat = new THREE.MeshStandardMaterial({
      color: 0x22cc22,
      emissive: 0x00ff00,
      emissiveIntensity: 0.6,
    });
    exitMesh = new THREE.Mesh(exitGeo, exitMat);
    exitMesh.position.set(state.exit.x, state.exit.y + 0.75, state.exit.z);
    scene.add(exitMesh);
    platformMeshes.exit = exitMesh;

    // Checkpoint flag — gray until touched, then green
    state.checkpoint = null;
    if (data.checkpoint) {
      const cp = data.checkpoint;
      const flagGroup = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0xd9d9d9 })
      );
      pole.position.y = 0.8;
      flagGroup.add(pole);
      const flagMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, side: THREE.DoubleSide });
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.4, 0.04), flagMat);
      flag.position.set(0.38, 1.3, 0);
      flagGroup.add(flag);
      flagGroup.position.set(cp.x, cp.y, cp.z);
      scene.add(flagGroup);
      platformMeshes.checkpoint = flagGroup;
      state.checkpoint = { x: cp.x, y: cp.y, z: cp.z, active: false, flagMat: flagMat };
    }

    // Reset wolf position + respawn point + jump/invuln state
    state.wolf.x = 0;
    state.wolf.z = 0;
    state.wolf.y = 2;
    state.wolf.vx = 0;
    state.wolf.vy = 0;
    state.wolf.vz = 0;
    state.respawn = { x: 0, y: 2, z: 0 };
    state.jumpsUsed = 0;
    state.invulnUntil = 0;
  }

  // ==========================================================================
  // Physics & Collision
  // ==========================================================================
  const GRAVITY = 30;
  const JUMP_POWER = 15;
  const MOVE_SPEED = 13;
  const FRICTION = 0.15;

  function step(dt) {
    const frameAdj = dt / 16.67;          // per-frame factor (friction, spin)
    const dt_s = Math.min(0.05, dt / 1000); // per-second factor (physics)

    // Input — keyboard first, then mobile drag joystick
    if (keys["ArrowLeft"] || keys["a"]) state.wolf.vx = -MOVE_SPEED;
    else if (keys["ArrowRight"] || keys["d"]) state.wolf.vx = MOVE_SPEED;
    else if (touchVec.x !== 0) state.wolf.vx = touchVec.x * MOVE_SPEED;
    else state.wolf.vx *= Math.max(0, 1 - FRICTION * frameAdj);

    if (keys["ArrowUp"] || keys["w"]) state.wolf.vz = -MOVE_SPEED;
    else if (keys["ArrowDown"] || keys["s"]) state.wolf.vz = MOVE_SPEED;
    else if (touchVec.z !== 0) state.wolf.vz = touchVec.z * MOVE_SPEED;
    else state.wolf.vz *= Math.max(0, 1 - FRICTION * frameAdj);

    // Gravity (units/s²)
    state.wolf.vy -= GRAVITY * dt_s;

    // Position update (velocities are in units/s)
    state.wolf.x += state.wolf.vx * dt_s;
    state.wolf.z += state.wolf.vz * dt_s;
    state.wolf.y += state.wolf.vy * dt_s;

    // Fell off the world → lose a life, respawn at checkpoint
    if (state.wolf.y < -10) {
      loseLife();
      return;
    }

    const invulnerable = performance.now() < state.invulnUntil;

    // Collision with platforms
    state.wolf.grounded = false;
    for (const plat of state.platforms) {
      if (collidePlatform(plat)) {
        state.wolf.grounded = true;
        state.wolf.vy = 0;
        state.wolf.y = plat.y + plat.h;
        state.jumpsUsed = 0; // landing refills both jumps

        // Spike damage
        if (plat.spike && !invulnerable) {
          loseLife();
          return;
        }
      }
    }

    // Collision with enemies
    for (const enemy of state.enemies) {
      enemy.x += enemy.vx * dt_s;
      enemy.z += enemy.vz * dt_s;

      const dx = state.wolf.x - enemy.x;
      const dz = state.wolf.z - enemy.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 1.0 && !invulnerable) {
        loseLife();
        return;
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
        SFX.star();
        updateHUD();
      }
    }

    // Touch the checkpoint flag → activate it (respawn moves here)
    if (state.checkpoint && !state.checkpoint.active) {
      const dx = state.wolf.x - state.checkpoint.x;
      const dz = state.wolf.z - state.checkpoint.z;
      if (Math.sqrt(dx * dx + dz * dz) < 1.3) {
        state.checkpoint.active = true;
        state.checkpoint.flagMat.color.setHex(0x22c55e);
        state.respawn = {
          x: state.checkpoint.x,
          y: state.checkpoint.y + 1,
          z: state.checkpoint.z,
        };
        state.score += 25;
        SFX.checkpoint();
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

    // Stylized animations
    animT += dt / 1000;

    // Blink while invulnerable after a hit
    wolfMesh.visible = !invulnerable || Math.floor(animT * 12) % 2 === 0;
    const moving = Math.abs(state.wolf.vx) + Math.abs(state.wolf.vz) > 1;

    // Face movement direction
    if (moving) {
      wolfMesh.rotation.y = Math.atan2(state.wolf.vx, state.wolf.vz);
    }
    // Leg sway + tail wag while walking; gentle idle tail otherwise
    const swing = moving ? Math.sin(animT * 12) * 0.35 : 0;
    for (let i = 0; i < wolfParts.legs.length; i++) {
      wolfParts.legs[i].rotation.x = i % 2 === 0 ? swing : -swing;
    }
    if (wolfParts.tail) {
      wolfParts.tail.rotation.y = Math.sin(animT * (moving ? 10 : 3)) * (moving ? 0.5 : 0.2);
    }

    // Stars: spin + size pulse
    for (let i = 0; i < starMeshes.length; i++) {
      const m = starMeshes[i];
      if (!m.parent) continue; // collected
      m.rotation.y += 0.04 * frameAdj;
      const pulse = 1 + Math.sin(animT * 4 + i) * 0.12;
      m.scale.set(pulse, pulse, pulse);
    }

    // Exit: rainbow shine + soft pulse
    if (exitMat && exitMesh) {
      const hue = (animT * 0.15) % 1;
      exitMat.color.setHSL(hue, 0.7, 0.55);
      exitMat.emissive.setHSL(hue, 0.8, 0.4);
      const ep = 1 + Math.sin(animT * 3) * 0.05;
      exitMesh.scale.set(ep, ep, ep);
    }

    // Update enemy visuals — bob up and down as they patrol
    for (let i = 0; i < state.enemies.length; i++) {
      const enemy = state.enemies[i];
      if (enemyMeshes[i]) {
        enemyMeshes[i].position.set(
          enemy.x,
          enemy.y + Math.sin(animT * 5 + i * 2) * 0.12,
          enemy.z
        );
        // Face patrol direction
        enemyMeshes[i].rotation.y = Math.atan2(enemy.vx, enemy.vz);
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
      state.wolf.y - 0.5 < py + plat.h && state.wolf.y > py + plat.h - 1.5 &&
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
      SFX.clear();
      buildLevel(state.level);
      updateHUD();
    } else {
      gameOver(true);
    }
  }

  function loseLife() {
    state.lives--;
    updateHUD();
    SFX.hurt();
    if (state.lives <= 0) {
      gameOver(false);
      return;
    }
    // Respawn at last checkpoint (level start if none touched).
    // Collected stars and enemy positions are preserved.
    state.wolf.x = state.respawn.x;
    state.wolf.y = state.respawn.y;
    state.wolf.z = state.respawn.z;
    state.wolf.vx = 0;
    state.wolf.vy = 0;
    state.wolf.vz = 0;
    state.jumpsUsed = 0;
    state.invulnUntil = performance.now() + 1500; // brief safety window
  }

  async function gameOver(won) {
    state.finished = true;
    state.running = false;
    if (won) SFX.win(); else SFX.over();

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
  function tryJump() {
    if (!state.running || state.finished || state.paused) return;
    if (state.wolf.grounded) {
      state.wolf.vy = JUMP_POWER;
      state.wolf.grounded = false;
      state.jumpsUsed = 1;
      SFX.jump();
    } else if (state.jumpsUsed < 2) {
      // Double jump — slightly weaker, resets fall speed
      state.wolf.vy = JUMP_POWER * 0.9;
      state.jumpsUsed = 2;
      SFX.doubleJump();
    }
  }

  function bindEvents() {
    // Unlock WebAudio on the first user gesture (browser autoplay policy)
    document.addEventListener("pointerdown", () => SFX.unlock(), { once: true });
    document.addEventListener("keydown", () => SFX.unlock(), { once: true });

    document.addEventListener("keydown", (e) => {
      keys[e.key] = true;
      if (e.key === " " || e.key === "Enter") {
        if (!e.repeat) tryJump();
        e.preventDefault();
      } else if (e.key === "p" || e.key === "P") {
        togglePause();
      }
    });
    document.addEventListener("keyup", (e) => {
      keys[e.key] = false;
    });

    // Touch input — drag = virtual joystick (move), quick tap = jump
    let touchStart = null;
    els.canvas.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    }, { passive: true });

    els.canvas.addEventListener("touchmove", (e) => {
      if (!touchStart) return;
      const t = e.touches[0];
      const DEAD = 12, FULL = 60; // px: deadzone → full speed
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      const norm = (v) =>
        Math.abs(v) < DEAD ? 0 : Math.max(-1, Math.min(1, v / FULL));
      // Screen drag right → +x, drag down → +z (matches isometric view)
      touchVec.x = norm(dx);
      touchVec.z = norm(dy);
    }, { passive: true });

    els.canvas.addEventListener("touchend", (e) => {
      touchVec.x = 0;
      touchVec.z = 0;
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      const dt = Date.now() - touchStart.time;
      touchStart = null;

      if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && dt < 250) {
        tryJump(); // tap = jump / double jump
      }
    }, { passive: true });

    els.canvas.addEventListener("touchcancel", () => {
      touchVec.x = 0;
      touchVec.z = 0;
      touchStart = null;
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
    try {
      if (typeof THREE === "undefined") {
        throw new Error("Three.js kütüphanesi yüklenemedi");
      }
      initThree();
      buildLevel(1);
      bindEvents();
      updateHUD();
      renderLBSlot();
      showOverlay();
    } catch (err) {
      // Never leave the player staring at a dead black canvas —
      // surface the actual error so it can be reported and fixed.
      els.overlayTitle.textContent = "Oyun yüklenemedi 😞";
      els.overlayText.textContent =
        "Hata: " + (err && err.message ? err.message : err) +
        "\nSayfayı yenilemeyi dene. Sorun sürerse bize bildir!";
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
