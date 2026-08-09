const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game Constants
const GRAVITY = 0.6;
const JUMP_FORCE = -14;
const MOVE_SPEED = 5;
const TILE_SIZE = 40;

// Input handling
const keys = {};
document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyR') game.restart();
});
document.addEventListener('keyup', (e) => keys[e.code] = false);

// Touch controls for mobile: on-screen buttons drive the same keys object
function bindTouchBtn(id, code) {
    const el = document.getElementById(id);
    if (!el) return;
    const on = (e) => { e.preventDefault(); keys[code] = true; el.classList.add('pressed'); };
    const off = (e) => { e.preventDefault(); keys[code] = false; el.classList.remove('pressed'); };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', (e) => { keys[code] = false; el.classList.remove('pressed'); });
}
bindTouchBtn('btnLeft', 'ArrowLeft');
bindTouchBtn('btnRight', 'ArrowRight');
bindTouchBtn('btnJump', 'Space');
// Stop the page from scrolling/zooming while touching the canvas
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

class Particle {
    constructor(x, y, color, type = 'sparkle') {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = (Math.random() - 0.5) * 6;
        this.life = 30;
        this.color = color;
        this.type = type;
        this.size = Math.random() * 4 + 2;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.2;
        this.life--;
        this.size *= 0.95;
    }
    draw() {
        ctx.globalAlpha = this.life / 30;
        ctx.fillStyle = this.color;
        if (this.type === 'coin') {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(this.x, this.y, this.size, this.size);
        }
        ctx.globalAlpha = 1;
    }
}

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 30;
        this.h = 40;
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;
        this.facing = 1;
        this.invincible = 0;
        this.animFrame = 0;
        this.animTimer = 0;
    }

    update() {
        // Movement
        if (keys['ArrowLeft']) { this.vx = -MOVE_SPEED; this.facing = -1; }
        else if (keys['ArrowRight']) { this.vx = MOVE_SPEED; this.facing = 1; }
        else { this.vx *= 0.8; }

        // Jump
        if (keys['Space'] && this.onGround) {
            this.vy = JUMP_FORCE;
            this.onGround = false;
            game.createParticles(this.x + this.w/2, this.y + this.h, '#90EE90', 'dust');
        }

        // Physics
        this.vy += GRAVITY;
        this.x += this.vx;
        this.y += this.vy;

        // Animation
        if (Math.abs(this.vx) > 0.5) {
            this.animTimer++;
            if (this.animTimer > 6) {
                this.animFrame = (this.animFrame + 1) % 3;
                this.animTimer = 0;
            }
        } else {
            this.animFrame = 0;
        }

        if (this.invincible > 0) this.invincible--;

        // Screen boundaries
        if (this.x < 0) this.x = 0;
        if (this.x > canvas.width - this.w) this.x = canvas.width - this.w;
        if (this.y > canvas.height) game.playerDie();
    }

    draw() {
        if (this.invincible > 0 && Math.floor(this.invincible / 4) % 2 === 0) return;

        ctx.save();
        ctx.translate(this.x + this.w/2, this.y + this.h/2);
        ctx.scale(this.facing, 1);

        // Özgün karakter "Zıpzıp": turkuaz bere + turuncu şişme mont
        // Pantolon (lacivert)
        ctx.fillStyle = '#1e3a5f';
        ctx.fillRect(-12, -5, 24, 20);

        // Şişme mont (turuncu, dikiş çizgili)
        ctx.fillStyle = '#f97316';
        ctx.fillRect(-12, -20, 24, 18);
        ctx.strokeStyle = '#c2560d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-12, -14); ctx.lineTo(12, -14);
        ctx.moveTo(-12, -8);  ctx.lineTo(12, -8);
        ctx.stroke();

        // Kafa
        ctx.fillStyle = '#ffd9b3';
        ctx.fillRect(-10, -32, 20, 14);

        // Bere (turkuaz, ponponlu — kasket değil)
        ctx.fillStyle = '#0d9488';
        ctx.fillRect(-11, -37, 22, 9);
        ctx.fillStyle = '#5eead4';
        ctx.beginPath();
        ctx.arc(0, -39, 4, 0, Math.PI * 2);
        ctx.fill();

        // Gözler (iki göz, bıyık yok)
        ctx.fillStyle = '#000';
        ctx.fillRect(1, -28, 3, 4);
        ctx.fillRect(6, -28, 3, 4);
        // Gülümseme
        ctx.strokeStyle = '#7c2d12';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(1, -21);
        ctx.quadraticCurveTo(5, -19, 8, -21);
        ctx.stroke();

        // Kollar (mont rengi)
        ctx.fillStyle = '#ea6a0c';
        const armOffset = this.animFrame === 1 ? -3 : (this.animFrame === 2 ? 3 : 0);
        ctx.fillRect(-16, -15 + armOffset, 4, 12);
        ctx.fillRect(12, -15 - armOffset, 4, 12);

        // Bacaklar (pantolon rengi)
        ctx.fillStyle = '#1e3a5f';
        const legOffset = Math.abs(this.vx) > 0.5 ? (Math.sin(Date.now() / 100) * 4) : 0;
        ctx.fillRect(-10, 12, 8, 8 + legOffset);
        ctx.fillRect(2, 12, 8, 8 - legOffset);

        // Shoes
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(-11, 18 + legOffset, 10, 4);
        ctx.fillRect(1, 18 - legOffset, 10, 4);

        ctx.restore();
    }
}

class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 30;
        this.h = 30;
        this.vx = 1.5;
        this.animFrame = 0;
    }

    update() {
        this.x += this.vx;
        this.animFrame = (this.animFrame + 1) % 60;

        // Turn at edges or walls
        const nextX = this.x + this.vx + (this.vx > 0 ? this.w : 0);
        const tileX = Math.floor(nextX / TILE_SIZE);
        const tileY = Math.floor((this.y + this.h + 5) / TILE_SIZE);

        if (!game.getTile(tileX, tileY) || game.getTile(tileX, Math.floor(this.y / TILE_SIZE))) {
            this.vx *= -1;
        }

        // Screen bounds
        if (this.x <= 0 || this.x >= canvas.width - this.w) this.vx *= -1;
    }

    draw() {
        const bounce = Math.sin(this.animFrame * 0.1) * 2;
        ctx.save();
        ctx.translate(this.x + this.w/2, this.y + this.h/2 + bounce);

        // Özgün düşman: tek gözlü yeşil sümüklü canavar (damla gövde)
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.moveTo(-15, 14);
        ctx.quadraticCurveTo(-16, -8, 0, -14);
        ctx.quadraticCurveTo(16, -8, 15, 14);
        ctx.closePath();
        ctx.fill();

        // Gövde parlaklığı
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(-6, -6, 4, 6, -0.4, 0, Math.PI * 2);
        ctx.fill();

        // Alt ıslak iz
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.ellipse(0, 13, 15, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tek büyük göz
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(0, -3, 7, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#14532d';
        ctx.beginPath();
        ctx.arc(this.vx >= 0 ? 2 : -2, -3, 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Küçük ağız
        ctx.strokeStyle = '#14532d';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-3, 7);
        ctx.quadraticCurveTo(0, 9, 3, 7);
        ctx.stroke();

        ctx.restore();
    }
}

class Coin {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 24;
        this.h = 24;
        this.collected = false;
        this.bobOffset = Math.random() * Math.PI * 2;
    }

    draw() {
        if (this.collected) return;
        const bob = Math.sin(Date.now() / 200 + this.bobOffset) * 3;
        ctx.save();
        ctx.translate(this.x + this.w/2, this.y + this.h/2 + bob);

        // Outer ring
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner shine
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(-3, -3, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

class Block {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.w = TILE_SIZE;
        this.h = TILE_SIZE;
        this.type = type; // 'ground', 'brick', 'question', 'pipe', 'empty'
        this.bumped = false;
        this.bumpY = 0;
        this.coinInside = type === 'question';
    }

    bump() {
        if (this.bumped) return;
        this.bumped = true;
        this.bumpY = -8;
        if (this.coinInside) {
            this.coinInside = false;
            this.type = 'empty';
            game.score += 100;
            game.createParticles(this.x + this.w/2, this.y, '#FFD700', 'coin');
        }
        setTimeout(() => { this.bumpY = 0; }, 150);
    }

    draw() {
        const y = this.y + this.bumpY;

        if (this.type === 'ground') {
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(this.x, y, this.w, this.h);
            ctx.fillStyle = '#228B22';
            ctx.fillRect(this.x, y, this.w, 6);
            // Grass details
            ctx.fillStyle = '#32CD32';
            for (let i = 0; i < 4; i++) {
                ctx.fillRect(this.x + i * 10 + 2, y + 2, 4, 4);
            }
        } else if (this.type === 'brick') {
            ctx.fillStyle = '#CD853F';
            ctx.fillRect(this.x, y, this.w, this.h);
            ctx.strokeStyle = '#8B4513';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, y, this.w, this.h);
            // Brick pattern
            ctx.beginPath();
            ctx.moveTo(this.x + this.w/2, y); ctx.lineTo(this.x + this.w/2, y + this.h);
            ctx.moveTo(this.x, y + this.h/2); ctx.lineTo(this.x + this.w/2, y + this.h/2);
            ctx.moveTo(this.x + this.w/2, y + this.h/4); ctx.lineTo(this.x + this.w, y + this.h/4);
            ctx.moveTo(this.x + this.w/2, y + this.h*3/4); ctx.lineTo(this.x + this.w, y + this.h*3/4);
            ctx.stroke();
        } else if (this.type === 'question') {
            const flash = Math.sin(Date.now() / 150) > 0;
            ctx.fillStyle = flash ? '#FFD700' : '#FFA500';
            ctx.fillRect(this.x, y, this.w, this.h);
            ctx.strokeStyle = '#B8860B';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, y, this.w, this.h);
            // Question mark
            ctx.fillStyle = '#8B4513';
            ctx.font = 'bold 22px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('?', this.x + this.w/2, y + this.h/2 + 8);
        } else if (this.type === 'empty') {
            ctx.fillStyle = '#654321';
            ctx.fillRect(this.x, y, this.w, this.h);
            ctx.strokeStyle = '#4a3018';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, y, this.w, this.h);
        } else if (this.type === 'pipe') {
            // Stone chimney body
            ctx.fillStyle = '#8d99ae';
            ctx.fillRect(this.x + 2, y, this.w - 4, this.h);
            // Stone joint lines
            ctx.strokeStyle = '#5c677d';
            ctx.lineWidth = 2;
            for (let sy = y + 28; sy < y + this.h - 4; sy += 14) {
                ctx.beginPath();
                ctx.moveTo(this.x + 2, sy);
                ctx.lineTo(this.x + this.w - 2, sy);
                ctx.stroke();
            }
            // Chimney cap
            ctx.fillStyle = '#adb5bd';
            ctx.fillRect(this.x - 2, y, this.w + 4, 16);
            ctx.strokeStyle = '#5c677d';
            ctx.strokeRect(this.x - 2, y, this.w + 4, 16);
            ctx.strokeRect(this.x + 2, y + 16, this.w - 4, this.h - 16);
        } else if (this.type === 'flag') {
            // Pole
            ctx.fillStyle = '#ccc';
            ctx.fillRect(this.x + 18, y, 4, this.h);
            // Flag
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.moveTo(this.x + 22, y);
            ctx.lineTo(this.x + 50, y + 15);
            ctx.lineTo(this.x + 22, y + 30);
            ctx.fill();
            // Ball on top
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(this.x + 20, y, 6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

class Game {
    constructor() {
        this.level = 1;
        this.score = 0;
        this.lives = 3;
        this.particles = [];
        this.state = 'playing'; // playing, gameover, victory
        this.loadLevel(this.level);
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    loadLevel(lvl) {
        this.player = new Player(50, 300);
        this.blocks = [];
        this.enemies = [];
        this.coins = [];
        this.particles = [];

        const levels = [
            // Level 1
            [
                "GGGGGGGGGGGGGGGGGGGG",
                "G...................G",
                "G...................G",
                "G...???.............G",
                "G...................G",
                "G.........E.........G",
                "G.......BBBB........G",
                "G...................G",
                "G....E..............G",
                "G...BBBB............G",
                "G...................G",
                "G...........???.....G",
                "G...................G",
                "G.......E...........G",
                "GGGGGGGGGGGGGGGGGGGGG"
            ],
            // Level 2
            [
                "GGGGGGGGGGGGGGGGGGGG",
                "G.........C.........G",
                "G.......BBBB........G",
                "G...................G",
                "G...???.......???...G",
                "G...................G",
                "G.....E.............G",
                "G...BBBB............G",
                "G.........E.........G",
                "G.......BBBB........G",
                "G.............E.....G",
                "G...........BBBB....G",
                "G...E...............G",
                "G.BBBB..............G",
                "GGGGGGGGGGGGGGGGGGGGG"
            ],
            // Level 3
            [
                "GGGGGGGGGGGGGGGGGGGG",
                "G.C.................G",
                "GBBB................G",
                "G.......???.........G",
                "G...................G",
                "G...E.......E.......G",
                "G..BBB.....BBB......G",
                "G...................G",
                "G.......E...........G",
                "G.....BBBB..........G",
                "G...........E.......G",
                "G.........BBBB......G",
                "G...E...........E...G",
                "G..BBB.........BBB..G",
                "GGGGGGGGGGGGGGGGGGGGG"
            ],
            // Level 4
            [
                "GGGGGGGGGGGGGGGGGGGG",
                "G.........C.........G",
                "G.......BBBBB.......G",
                "G...???.......???...G",
                "G...................G",
                "G....E.........E....G",
                "G..BBBB.......BBBB..G",
                "G...................G",
                "G.........E.........G",
                "G........BBBB.......G",
                "G..E.............E..G",
                "G.BBB...........BBB.G",
                "G......E....E.......G",
                "G....BBBB..BBBB.....G",
                "GGGGGGGGGGGGGGGGGGGGG"
            ],
            // Level 5 — final
            [
                "GGGGGGGGGGGGGGGGGGGG",
                "G.C....???....C.....G",
                "GBBB..........BBB...G",
                "G...................G",
                "G....E....E....E....G",
                "G..BBBB..BBB..BBBB..G",
                "G...................G",
                "G...................G",
                "G..E.....E......E...G",
                "G.BBB...BBB....BBB..G",
                "G...................G",
                "G....E.......E......G",
                "G...BBBB....BBBB....G",
                "G........E..........G",
                "GGGGGGGGGGGGGGGGGGGGG"
            ]
        ];

        const map = levels[(lvl - 1) % levels.length];

        for (let row = 0; row < map.length; row++) {
            for (let col = 0; col < map[row].length; col++) {
                const char = map[row][col];
                const x = col * TILE_SIZE;
                const y = row * TILE_SIZE;

                if (char === 'G') this.blocks.push(new Block(x, y, 'ground'));
                else if (char === 'B') this.blocks.push(new Block(x, y, 'brick'));
                else if (char === '?') this.blocks.push(new Block(x, y, 'question'));
                else if (char === 'C') this.coins.push(new Coin(x + 8, y + 8));
                else if (char === 'E') this.enemies.push(new Enemy(x, y));
            }
        }

        // Add some floating coins
        for (let i = 0; i < 5; i++) {
            this.coins.push(new Coin(150 + i * 120, 200 + (i % 2) * 80));
        }

        // Flag at the end
        this.blocks.push(new Block(760, 360, 'flag'));
    }

    getTile(col, row) {
        return this.blocks.find(b => 
            Math.floor(b.x / TILE_SIZE) === col && 
            Math.floor(b.y / TILE_SIZE) === row &&
            b.type !== 'flag'
        );
    }

    createParticles(x, y, color, type) {
        for (let i = 0; i < 8; i++) {
            this.particles.push(new Particle(x, y, color, type));
        }
    }

    checkCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.w &&
               rect1.x + rect1.w > rect2.x &&
               rect1.y < rect2.y + rect2.h &&
               rect1.y + rect1.h > rect2.y;
    }

    playerDie() {
        this.lives--;
        if (this.lives <= 0) {
            this.state = 'gameover';
            document.getElementById('finalScore').textContent = this.score;
            document.getElementById('gameOver').classList.remove('hidden');
        } else {
            this.player.x = 50;
            this.player.y = 300;
            this.player.vx = 0;
            this.player.vy = 0;
            this.player.invincible = 120;
        }
        this.updateUI();
    }

    nextLevel() {
        this.level++;
        if (this.level > 5) {
            this.state = 'victory';
            document.getElementById('victoryScore').textContent = this.score;
            document.getElementById('victory').classList.remove('hidden');
        } else {
            this.loadLevel(this.level);
            this.updateUI();
        }
    }

    restart() {
        this.level = 1;
        this.score = 0;
        this.lives = 3;
        this.state = 'playing';
        document.getElementById('gameOver').classList.add('hidden');
        document.getElementById('victory').classList.add('hidden');
        this.loadLevel(1);
        this.updateUI();
    }

    updateUI() {
        document.getElementById('score').textContent = `SKOR: ${this.score}`;
        document.getElementById('lives').textContent = `CAN: ${this.lives}`;
        document.getElementById('level').textContent = `BÖLÜM: ${this.level}`;
    }

    update() {
        if (this.state !== 'playing') return;

        this.player.update();

        // Block collisions
        this.player.onGround = false;
        for (let block of this.blocks) {
            if (block.type === 'flag') {
                if (this.checkCollision(this.player, block)) {
                    this.nextLevel();
                    return;
                }
                continue;
            }

            if (!this.checkCollision(this.player, {x: block.x, y: block.y + block.bumpY, w: block.w, h: block.h})) continue;

            const overlapX = (this.player.x + this.player.w/2) - (block.x + block.w/2);
            const overlapY = (this.player.y + this.player.h/2) - (block.y + block.bumpY + block.h/2);
            const combinedHalfWidths = (this.player.w + block.w) / 2;
            const combinedHalfHeights = (this.player.h + block.h) / 2;
            const overlapXAbs = combinedHalfWidths - Math.abs(overlapX);
            const overlapYAbs = combinedHalfHeights - Math.abs(overlapY);

            if (overlapXAbs < overlapYAbs) {
                if (overlapX > 0) this.player.x = block.x + block.w;
                else this.player.x = block.x - this.player.w;
                this.player.vx = 0;
            } else {
                if (overlapY > 0) {
                    this.player.y = block.y + block.bumpY + block.h;
                    this.player.vy = 0;
                    if (block.type === 'question' || block.type === 'brick') block.bump();
                } else {
                    this.player.y = block.y + block.bumpY - this.player.h;
                    this.player.vy = 0;
                    this.player.onGround = true;
                }
            }
        }

        // Enemy collisions
        for (let enemy of this.enemies) {
            enemy.update();
            if (this.checkCollision(this.player, enemy)) {
                if (this.player.vy > 0 && this.player.y + this.player.h - this.player.vy <= enemy.y + 5) {
                    // Stomp enemy
                    this.player.vy = -8;
                    this.score += 200;
                    this.createParticles(enemy.x + enemy.w/2, enemy.y + enemy.h/2, '#8B4513', 'sparkle');
                    enemy.x = -1000; // Remove enemy
                } else if (this.player.invincible <= 0) {
                    this.playerDie();
                    return;
                }
            }
        }

        // Coin collection
        for (let coin of this.coins) {
            if (!coin.collected && this.checkCollision(this.player, coin)) {
                coin.collected = true;
                this.score += 50;
                this.createParticles(coin.x + coin.w/2, coin.y + coin.h/2, '#FFD700', 'coin');
            }
        }

        // Particles
        this.particles = this.particles.filter(p => {
            p.update();
            return p.life > 0;
        });

        this.updateUI();
    }

    draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background - already set in CSS, but add clouds
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for (let i = 0; i < 5; i++) {
            const cx = (i * 180 + Date.now() * 0.02) % (canvas.width + 100) - 50;
            const cy = 50 + i * 30;
            ctx.beginPath();
            ctx.arc(cx, cy, 25, 0, Math.PI * 2);
            ctx.arc(cx + 20, cy - 10, 20, 0, Math.PI * 2);
            ctx.arc(cx + 35, cy, 22, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw game objects
        for (let block of this.blocks) block.draw();
        for (let coin of this.coins) coin.draw();
        for (let enemy of this.enemies) enemy.draw();
        this.player.draw();
        for (let p of this.particles) p.draw();
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(this.loop);
    }
}

const game = new Game();
