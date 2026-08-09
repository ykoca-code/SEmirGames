const fillElement = document.getElementById('shape-fill');
const feedback = document.getElementById('feedback-message');
const mainShape = document.getElementById('main-shape');
const levelInfo = document.getElementById('level-info');
const targetFill = document.getElementById('target-fill');
const targetPct = document.getElementById('target-pct');
const moveCounter = document.getElementById('move-counter');

// Renkler: 0 Kırmızı, 1 Mor, 2 Mavi (GitHub Dark tema tonları)
const colors = ['#ff7b72', '#d2a8ff', '#58a6ff'];
const maxRadius = 45;
const SAVE_KEY = 'karakutu_level';

/* ============================================================
   BÖLÜMLER — her bölümün gizli bir kuralı var.
   Varsayılan davranış:
     btn1: veri +25   btn2: renk döngüsü (ileri)   btn3: veri -25
     reset: veri=0, renk=kırmızı
   Bölüm nesnesi varsayılanı override ederek kuralı değiştirir.
   ============================================================ */
const LEVELS = [
    { // 1 — Klasik: doluyken renk kilitlenir
        target: { fill: 100, color: 2 },
        color(s) {
            if (s.fill === 100) return { err: 'HATA: Modül kilitli' };
            s.color = (s.color + 1) % 3;
            return { msg: 'Dalga boyu değiştirildi' };
        }
    },
    { // 2 — Renk değişimi veri sızdırır
        target: { fill: 50, color: 1 },
        color(s) {
            s.color = (s.color + 1) % 3;
            s.fill = Math.max(0, s.fill - 25);
            return { msg: 'Dalga boyu değiştirildi' };
        }
    },
    { // 3 — Düğmeler ters bağlanmış
        target: { fill: 100, color: 0 },
        inc(s) {
            if (s.fill <= 0) return { err: 'Veri zaten yok' };
            s.fill -= 25;
            return { msg: 'Veri azaltıldı' };
        },
        dec(s) {
            if (s.fill >= 100) return { err: 'Kapasite dolu' };
            s.fill += 25;
            return { msg: 'Veri artırıldı' };
        }
    },
    { // 4 — Renk döngüsü geriye doğru + %75 ve üstünde kilit
        target: { fill: 75, color: 2 },
        color(s) {
            if (s.fill >= 75) return { err: 'HATA: Modül kilitli' };
            s.color = (s.color + 2) % 3;
            return { msg: 'Dalga boyu değiştirildi' };
        }
    },
    { // 5 — Veri girişi çift akıyor
        target: { fill: 25, color: 1 },
        inc(s) {
            if (s.fill >= 100) return { err: 'Kapasite dolu' };
            s.fill = Math.min(100, s.fill + 50);
            return { msg: 'Veri artırıldı' };
        }
    },
    { // 6 — Filtre kilidi: %50 üstüne sadece mavi çıkabilir
        target: { fill: 100, color: 2 },
        inc(s) {
            if (s.fill >= 100) return { err: 'Kapasite dolu' };
            if (s.fill >= 50 && s.color !== 2) return { err: 'HATA: Filtre kilidi' };
            s.fill += 25;
            return { msg: 'Veri artırıldı' };
        }
    },
    { // 7 — Sinyal yokken renk değişmez (hedef: boş ama mavi)
        target: { fill: 0, color: 2 },
        color(s) {
            if (s.fill === 0) return { err: 'HATA: Sinyal yok' };
            s.color = (s.color + 1) % 3;
            return { msg: 'Dalga boyu değiştirildi' };
        }
    },
    { // 8 — Renk modülü ölü; sıfırlama rengi kaydırır
        target: { fill: 100, color: 1 },
        color() { return { err: 'HATA: Modül yanıt vermiyor' }; },
        reset(s) {
            s.fill = 0;
            s.color = (s.color + 1) % 3;
            return { msg: 'Sistem sıfırlandı' };
        }
    }
];

// Varsayılan eylemler
const DEFAULTS = {
    inc(s) {
        if (s.fill >= 100) return { err: 'Kapasite dolu' };
        s.fill += 25;
        return { msg: 'Veri artırıldı' };
    },
    dec(s) {
        if (s.fill <= 0) return { err: 'Veri zaten yok' };
        s.fill -= 25;
        return { msg: 'Veri azaltıldı' };
    },
    color(s) {
        s.color = (s.color + 1) % 3;
        return { msg: 'Dalga boyu değiştirildi' };
    },
    reset(s) {
        s.fill = 0;
        s.color = 0;
        return { msg: 'Sistem sıfırlandı' };
    }
};

// ---- Ses efektleri (Web Audio, sentezlenmiş) ----
let audioCtx = null;
function ac() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}
function tone(freq, dur, delay, type, vol) {
    const ctx = ac();
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur);
}
const sfx = {
    click() { tone(660, 0.07, 0, 'square', 0.05); },
    error() { tone(180, 0.12, 0, 'sawtooth', 0.07); tone(140, 0.15, 0.1, 'sawtooth', 0.07); },
    success() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, i * 0.12, 'triangle', 0.09)); }
};

// ---- Titreşim ----
function triggerHaptic(type) {
    if (!navigator.vibrate) return;
    if (type === 'light') navigator.vibrate(40);
    if (type === 'error') navigator.vibrate([30, 50, 30]);
    if (type === 'success') navigator.vibrate([100, 50, 100, 50, 200]);
}

// ---- Başarı ekranı ----
const overlay = document.createElement('div');
overlay.className = 'success-overlay';
overlay.innerHTML = '<h1>SİSTEM ÇÖZÜLDÜ</h1><p id="ov-text"></p><button id="ov-btn" type="button">SONRAKİ SİSTEM →</button>';
document.body.appendChild(overlay);
const ovText = overlay.querySelector('#ov-text');
const ovBtn = overlay.querySelector('#ov-btn');

// ---- Oyun durumu ----
let levelIndex = 0;
try {
    const saved = parseInt(localStorage.getItem(SAVE_KEY), 10);
    if (!isNaN(saved) && saved >= 0 && saved < LEVELS.length) levelIndex = saved;
} catch (e) { /* localStorage kapalı olabilir */ }

const state = { fill: 0, color: 0 };
let moves = 0;
let won = false;

function pad2(n) { return String(n).padStart(2, '0'); }

function loadLevel(i) {
    levelIndex = i;
    state.fill = 0;
    state.color = 0;
    moves = 0;
    won = false;
    overlay.classList.remove('visible');
    const t = LEVELS[i].target;
    levelInfo.textContent = 'Bölüm ' + pad2(i + 1) + '/' + pad2(LEVELS.length);
    targetFill.setAttribute('fill', colors[t.color]);
    targetFill.setAttribute('r', (t.fill / 100) * maxRadius);
    targetPct.textContent = '%' + t.fill;
    showMessage('Sistemi çöz...', false, true);
    updateUI();
}

function updateUI() {
    fillElement.setAttribute('r', (state.fill / 100) * maxRadius);
    fillElement.setAttribute('fill', colors[state.color]);
    moveCounter.textContent = 'Hamle: ' + moves;
}

let messageTimeout;
function showMessage(msg, isError, sticky) {
    clearTimeout(messageTimeout);
    feedback.innerText = msg;
    feedback.style.color = isError ? '#ff7b72' : '#8b949e';
    if (!sticky) {
        messageTimeout = setTimeout(() => {
            feedback.innerText = 'Sistemi çöz...';
            feedback.style.color = '#8b949e';
        }, 2000);
    }
}

function shake() {
    mainShape.classList.remove('shake');
    void mainShape.offsetWidth; // reflow → animasyonu yeniden tetikle
    mainShape.classList.add('shake');
}

function act(name) {
    if (won) return;
    moves++;
    const lvl = LEVELS[levelIndex];
    const fn = lvl[name] || DEFAULTS[name];
    const r = fn(state);
    if (r.err) {
        showMessage(r.err, true);
        triggerHaptic('error');
        sfx.error();
        shake();
    } else {
        showMessage(r.msg);
        triggerHaptic('light');
        sfx.click();
    }
    updateUI();
    checkWin();
}

function checkWin() {
    const t = LEVELS[levelIndex].target;
    if (!won && state.fill === t.fill && state.color === t.color) {
        won = true;
        const last = levelIndex === LEVELS.length - 1;
        try { localStorage.setItem(SAVE_KEY, String(last ? 0 : levelIndex + 1)); } catch (e) {}
        setTimeout(() => {
            overlay.querySelector('h1').textContent = last ? 'TÜM SİSTEMLER ÇÖZÜLDÜ' : 'SİSTEM ÇÖZÜLDÜ';
            ovText.textContent = 'Bölüm ' + pad2(levelIndex + 1) + ' tamamlandı — ' + moves + ' hamle';
            ovBtn.textContent = last ? 'BAŞTAN OYNA' : 'SONRAKİ SİSTEM →';
            overlay.classList.add('visible');
            triggerHaptic('success');
            sfx.success();
        }, 450);
    }
}

ovBtn.addEventListener('click', () => {
    loadLevel(levelIndex === LEVELS.length - 1 ? 0 : levelIndex + 1);
});

document.getElementById('btn-1').addEventListener('click', () => act('inc'));
document.getElementById('btn-2').addEventListener('click', () => act('color'));
document.getElementById('btn-3').addEventListener('click', () => act('dec'));
document.getElementById('btn-reset').addEventListener('click', () => act('reset'));

// Test API'si
window._kk = { state, LEVELS, DEFAULTS, act, loadLevel, get levelIndex() { return levelIndex; }, get won() { return won; }, get moves() { return moves; } };

// Başlangıç
loadLevel(levelIndex);
