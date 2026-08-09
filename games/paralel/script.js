const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreDisplay = document.getElementById('score-display');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreDisplay = document.getElementById('final-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const bestStart = document.getElementById('best-start');
const bestOver = document.getElementById('best-over');
const newRecordEl = document.getElementById('new-record');

// Ekran ölçüleri (CSS piksel cinsinden)
let W = window.innerWidth;
let H = window.innerHeight;

// Cihazın piksel yoğunluğuna göre canvas'ı boyutlandır (keskin grafikler için)
function resizeCanvas() {
    W = window.innerWidth;
    H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    // canvas.width ataması dönüşümü sıfırlar; tek seferlik ölçekle
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (gameState !== 'playing') {
        player.y = H / 2;
        drawScene();
    }
}

// Oyun Değişkenleri
let gameState = 'start'; // start, playing, gameover
let score = 0;
let best = 0;
try { best = parseInt(localStorage.getItem('paralel_best'), 10) || 0; } catch (e) { best = 0; }
let baseSpeed = 6;
let currentSpeed = baseSpeed;
let frameCount = 0;
let animationId;

// Renk Temaları (Boyutlar)
const DIMENSIONS = [
    { name: 'Mavi', color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.06)' },
    { name: 'Kırmızı', color: '#ff7b72', bg: 'rgba(255, 123, 114, 0.06)' }
];
let currentDim = 0;

// Oyuncu Objesi
const player = {
    x: 80,
    y: 0,
    size: 40,
    dim: 0
};

// Engeller, partiküller, yıldızlar
let obstacles = [];
let particles = [];
let stars = [];

function initStars() {
    stars = [];
    const count = Math.round((W * H) / 9000);
    for (let i = 0; i < count; i++) {
        stars.push({
            x: Math.random() * W,
            y: Math.random() * H,
            z: Math.random() * 0.8 + 0.2, // derinlik: hız ve boyut
            r: Math.random() * 1.5 + 0.4
        });
    }
}

// ---- Ses (Web Audio, sentezlenmiş) ----
let audioCtx = null;
function ac() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}
function tone(freq, dur, delay, type, vol) {
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol || 0.06, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur);
}
function noiseBurst(dur, vol) {
    const c = ac();
    if (!c) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = vol || 0.12;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start();
}
const sfx = {
    swap() { tone(currentDim === 0 ? 520 : 400, 0.12, 0, 'triangle', 0.06); },
    pass() { tone(880, 0.06, 0, 'sine', 0.03); },
    crash() { noiseBurst(0.35, 0.14); tone(120, 0.4, 0, 'sawtooth', 0.08); }
};

// ---- Titreşim ----
function triggerHaptic(type = 'light') {
    if (!navigator.vibrate) return;
    if (type === 'light') navigator.vibrate(20);
    if (type === 'heavy') navigator.vibrate([40, 60, 40]);
}

// ---- Oyunu başlat/sıfırla ----
function initGame() {
    score = 0;
    currentSpeed = baseSpeed;
    frameCount = 0;
    obstacles = [];
    particles = [];
    currentDim = 0;
    player.dim = 0;
    player.y = H / 2;

    scoreDisplay.innerText = score;
    scoreDisplay.style.color = DIMENSIONS[currentDim].color;

    startScreen.classList.remove('visible');
    gameOverScreen.classList.remove('visible');
    newRecordEl.classList.add('hidden');

    gameState = 'playing';
    cancelAnimationFrame(animationId);
    ac(); // ses bağlamını kullanıcı jestiyle uyandır
    loop();
}

// ---- Boyut değiştirme (tek dokunuş) ----
function switchDimension() {
    if (gameState !== 'playing') return;
    currentDim = 1 - currentDim;
    player.dim = currentDim;
    scoreDisplay.style.color = DIMENSIONS[currentDim].color;
    triggerHaptic('light');
    sfx.swap();
    createParticles(player.x + player.size / 2, player.y, DIMENSIONS[currentDim].color, 10);
}

// ---- Dokunma dinleyicileri ----
window.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    switchDimension();
});
startBtn.addEventListener('click', initGame);
restartBtn.addEventListener('click', initGame);
window.addEventListener('resize', resizeCanvas);

// ---- Engel oluşturma ----
function spawnObstacle() {
    const isTop = Math.random() > 0.5;
    const height = (H / 2) - (player.size / 2) + (Math.random() * 40 - 20);
    const typeDim = Math.random() > 0.5 ? 0 : 1;
    obstacles.push({
        x: W + 50,
        y: isTop ? 0 : H - height,
        width: 40,
        height: height,
        dim: typeDim,
        passed: false
    });
}

// ---- Partikül efekti ----
function createParticles(x, y, color, amount) {
    for (let i = 0; i < amount; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1,
            color: color
        });
    }
}

// ---- Oyun sonu ----
function gameOver() {
    if (gameState !== 'playing') return;
    gameState = 'gameover';
    triggerHaptic('heavy');
    sfx.crash();
    createParticles(player.x + player.size / 2, player.y, '#fff', 30);

    const isRecord = score > best;
    if (isRecord) {
        best = score;
        try { localStorage.setItem('paralel_best', String(best)); } catch (e) {}
    }

    setTimeout(() => {
        finalScoreDisplay.innerText = score;
        bestOver.innerText = best;
        if (isRecord && score > 0) newRecordEl.classList.remove('hidden');
        gameOverScreen.classList.add('visible');
    }, 500);
}

// ---- Ana döngü ----
function loop() {
    if (gameState === 'playing') {
        update();
        drawScene();
        animationId = requestAnimationFrame(loop);
    } else if (gameState === 'gameover') {
        updateParticlesOnly();
        drawScene();
        if (particles.length > 0) {
            animationId = requestAnimationFrame(loop);
        }
    }
}

function updateStars() {
    for (const s of stars) {
        s.x -= (currentSpeed * 0.25) * s.z;
        if (s.x < 0) { s.x = W; s.y = Math.random() * H; }
    }
}

function updateParticlesOnly() {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].x += particles[i].vx;
        particles[i].y += particles[i].vy;
        particles[i].life -= 0.05;
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
    updateStars();
}

function update() {
    frameCount++;

    // Zorluk artışı
    if (frameCount % 600 === 0) currentSpeed += 1;

    // Engel üretimi (hıza göre sıklık)
    let spawnRate = Math.max(40, 100 - (currentSpeed * 2));
    if (frameCount % Math.floor(spawnRate) === 0) spawnObstacle();

    updateStars();

    // Engelleri güncelle
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];
        obs.x -= currentSpeed;

        // Çarpışma (AABB)
        if (
            player.x < obs.x + obs.width &&
            player.x + player.size > obs.x &&
            player.y - player.size / 2 < obs.y + obs.height &&
            player.y + player.size / 2 > obs.y
        ) {
            if (player.dim !== obs.dim) {
                gameOver();
                return;
            }
        }

        // Skoru artır
        if (!obs.passed && obs.x + obs.width < player.x) {
            obs.passed = true;
            score++;
            scoreDisplay.innerText = score;
            sfx.pass();
            if (player.dim === obs.dim) {
                createParticles(player.x + player.size / 2, player.y, DIMENSIONS[obs.dim].color, 5);
            }
        }

        if (obs.x + obs.width < 0) obstacles.splice(i, 1);
    }

    // Partikülleri güncelle
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].x += particles[i].vx;
        particles[i].y += particles[i].vy;
        particles[i].life -= 0.05;
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
}

function drawBackground() {
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);
    // yıldız alanı — mevcut boyutun renginde
    const col = DIMENSIONS[currentDim].color;
    for (const s of stars) {
        ctx.globalAlpha = s.z * 0.7;
        ctx.fillStyle = s.z > 0.6 ? col : '#8b949e';
        ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    // boyut tenti
    ctx.fillStyle = DIMENSIONS[currentDim].bg;
    ctx.fillRect(0, 0, W, H);
}

function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;
}

function drawScene() {
    drawBackground();

    obstacles.forEach(obs => {
        ctx.fillStyle = DIMENSIONS[obs.dim].color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = DIMENSIONS[obs.dim].color;
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.fillRect(obs.x + obs.width / 2 - 1, obs.y, 2, obs.height);
    });

    if (gameState === 'playing') {
        ctx.fillStyle = DIMENSIONS[player.dim].color;
        ctx.shadowBlur = 20;
        ctx.shadowColor = DIMENSIONS[player.dim].color;
        ctx.fillRect(player.x, player.y - player.size / 2, player.size, player.size);
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(player.x + 8, player.y - player.size / 2 + 8, player.size - 16, player.size - 16);
        ctx.shadowBlur = 0;
    }

    drawParticles();
}

// Test API'si
window._paralel = {
    initGame, switchDimension, update, spawnObstacle,
    get state() { return gameState; },
    get score() { return score; },
    get best() { return best; },
    get dim() { return currentDim; },
    get obstacles() { return obstacles; },
    get particles() { return particles; },
    player,
    setSize(w, h) { W = w; H = h; player.y = H / 2; }
};

// ---- Başlangıç ----
player.y = H / 2;
bestStart.innerText = best;
resizeCanvas();
initStars();
drawScene();
