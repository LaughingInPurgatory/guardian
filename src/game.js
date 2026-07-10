'use strict';
(function () {
const { wrap, wrapDelta, circleCollision, computeDifficulty } = window.GuardianLogic;
const { AudioEngine } = window.GuardianAudio;
const { getHighScores, addHighScore, isHighScore } = window.GuardianHighScores;
const { randomPun } = window.GuardianPuns;

const WORLD_SEG = 60;
const WORLD_SEGS = 150;
const WORLD_W = WORLD_SEG * WORLD_SEGS; // 9000
const GROUND_MARGIN = 60;
const TOP_MARGIN = 46; // room for minimap/HUD
const HUMANOID_COUNT = 14;
const TURRET_COUNT = 8;
const MIN_HUMANOIDS_REPLENISH = 4;
const WAVE_DURATION = 35;
const MAX_BOMBS = 3;
const BOMB_REGEN_TIME = 22;
const HYPER_COOLDOWN = 5;
const BULLET_SPEED = 1100;
const BULLET_TTL = 1.1;
const BEAM_LENGTH = 60;
const PLAYER_ACCEL = 950;
const PLAYER_DRAG = 2.4;
const PLAYER_MAX_SPEED = 480;
const PLAYER_RADIUS = 12;
const DEATH_RESPAWN_DELAY = 1.6;
const IMPLOSION_DURATION = 0.8;
const GROUND_CLEARANCE = 40;

function rand(min, max) { return min + Math.random() * (max - min); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function choice(arr) { return arr[(Math.random() * arr.length) | 0]; }

function generateTerrain() {
  const elev = new Array(WORLD_SEGS);
  elev[0] = 90;
  for (let i = 1; i < WORLD_SEGS; i++) elev[i] = clamp(elev[i - 1] + rand(-45, 45), 20, 230);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < WORLD_SEGS - 1; i++) elev[i] = (elev[i - 1] + elev[i] + elev[i + 1]) / 3;
  }
  const blend = 10;
  for (let i = 0; i < blend; i++) {
    const t = (i + 1) / (blend + 1);
    const idx = WORLD_SEGS - blend + i;
    elev[idx] = elev[idx] * (1 - t) + elev[i] * t;
  }
  return elev;
}

function groundHeightAt(elev, xWorld) {
  const local = wrap(xWorld, WORLD_W);
  const f = local / WORLD_SEG;
  const i0 = Math.floor(f) % WORLD_SEGS;
  const i1 = (i0 + 1) % WORLD_SEGS;
  const t = f - Math.floor(f);
  return elev[i0] * (1 - t) + elev[i1] * t;
}

const ENEMY_STATS = {
  lander: { hp: 2, speed: 90, radius: 14, score: 150, fireChance: 0.15 },
  mutant: { hp: 3, speed: 150, radius: 13, score: 220, fireChance: 0.3 },
  bomber: { hp: 4, speed: 55, radius: 16, score: 260, fireChance: 0 },
  pod: { hp: 5, speed: 30, radius: 18, score: 120, fireChance: 0 },
  swarmer: { hp: 1, speed: 220, radius: 7, score: 60, fireChance: 0 },
  turret: { hp: 3, speed: 0, radius: 12, score: 300, fireChance: 0.25 },
  tank: { hp: 6, speed: 35, radius: 15, score: 280, fireChance: 0.22 },
};

const POWERUP_TYPES = ['rapid', 'shield', 'multishot', 'bomb', 'life', 'score'];

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = new AudioEngine();
    this.state = 'title'; // title | playing | paused | gameover
    this.viewW = 0;
    this.viewH = 0;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.time = 0;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, active: false };
    this.gamepadFireLatch = false;
    this.gamepadBombLatch = false;
    this.gamepadHyperLatch = false;
    this.gamepadPauseLatch = false;
    this._bindInput();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  _resize() {
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.canvas.width = this.viewW * this.dpr;
    this.canvas.height = this.viewH * this.dpr;
    this.canvas.style.width = this.viewW + 'px';
    this.canvas.style.height = this.viewH + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _bindInput() {
    window.addEventListener('keydown', (e) => {
      this.audio.init();
      if (e.code === 'Escape') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
        return;
      }
      this.keys.add(e.code);
      if (this.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) this.startNewGame();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.active = true;
    });
    this.canvas.addEventListener('mousedown', () => {
      this.audio.init();
      this.mouse.down = true;
      if (this.state === 'title') this.startNewGame();
    });
    window.addEventListener('mouseup', () => (this.mouse.down = false));
    window.addEventListener('gamepadconnected', () => this.audio.init());
  }

  _readCombinedInput() {
    let ax = 0, ay = 0, fire = false, bombPressed = false, hyperPressed = false, pausePressed = false;
    const up = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const down = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    ax += (right ? 1 : 0) - (left ? 1 : 0);
    ay += (down ? 1 : 0) - (up ? 1 : 0);
    fire = fire || this.keys.has('Space');
    bombPressed = bombPressed || this.keys.has('KeyB');
    hyperPressed = hyperPressed || this.keys.has('KeyH');

    if (this.mouse.active && this.player) {
      const dx = this.mouse.x - this.viewW / 2;
      const dy = this.mouse.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 12) {
        const mag = clamp(dist / 140, 0, 1);
        ax += (dx / dist) * mag;
        ay += (dy / dist) * mag;
      }
      fire = fire || this.mouse.down;
    }

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const gx = gp.axes[0] || 0, gy = gp.axes[1] || 0;
      if (Math.abs(gx) > 0.15) ax += gx;
      if (Math.abs(gy) > 0.15) ay += gy;
      const fireBtn = gp.buttons[7]?.pressed || gp.buttons[0]?.pressed;
      const bombBtn = gp.buttons[1]?.pressed;
      const hyperBtn = gp.buttons[4]?.pressed || gp.buttons[5]?.pressed;
      const pauseBtn = gp.buttons[9]?.pressed;
      fire = fire || fireBtn;
      if (bombBtn && !this.gamepadBombLatch) bombPressed = true;
      if (hyperBtn && !this.gamepadHyperLatch) hyperPressed = true;
      if (pauseBtn && !this.gamepadPauseLatch) pausePressed = true;
      this.gamepadBombLatch = bombBtn;
      this.gamepadHyperLatch = hyperBtn;
      this.gamepadPauseLatch = pauseBtn;
    }

    const len = Math.hypot(ax, ay);
    if (len > 1) { ax /= len; ay /= len; }
    return { ax, ay, fire, bombPressed, hyperPressed, pausePressed };
  }

  // ---------- lifecycle ----------
  startNewGame() {
    this.audio.init();
    this.elev = generateTerrain();
    this.humanoids = [];
    for (let i = 0; i < HUMANOID_COUNT; i++) {
      const x = wrap((i / HUMANOID_COUNT) * WORLD_W + rand(-80, 80), WORLD_W);
      this.humanoids.push({ x, y: this.viewH - GROUND_MARGIN - groundHeightAt(this.elev, x) - 8, state: 'ground' });
    }
    this.turrets = [];
    for (let i = 0; i < TURRET_COUNT; i++) {
      const x = wrap((i / TURRET_COUNT) * WORLD_W + rand(-60, 60), WORLD_W);
      this.turrets.push({ type: 'turret', x, y: 0, hp: ENEMY_STATS.turret.hp, fireCooldown: rand(0, 1.5), facing: 1 });
    }
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.particles = [];
    this.powerups = [];
    this.banner = null;
    this.player = { x: WORLD_W / 2, y: this.viewH / 2, vx: 0, vy: 0, facing: 1, invuln: 2, effects: {}, hidden: false, respawnTimer: 0, implosionSpawned: false };
    this.score = 0;
    this.lives = 3;
    this.bombs = MAX_BOMBS;
    this.bombRegenTimer = 0;
    this.lastHyperTime = -999;
    this.wave = 1;
    this.waveTimer = 0;
    this.spawnTimer = 600;
    this.allHumanoidsGone = false;
    this.state = 'playing';
    this.audio.setIntensity(1);
    this.audio.startMusic();
    this._setScreen('title', false);
    this._setScreen('pause', false);
    this._setScreen('gameover', false);
    document.getElementById('hud').classList.remove('hidden');
  }

  pause() {
    this.state = 'paused';
    this.audio.ctx && this.audio.ctx.suspend();
    document.getElementById('punLine').textContent = randomPun();
    this._renderHighScoreList('pauseScores');
    this._setScreen('pause', true);
  }

  resume() {
    this.state = 'playing';
    this.audio.ctx && this.audio.ctx.resume();
    this._setScreen('pause', false);
  }

  quitToDesktop() {
    window.guardian && window.guardian.quitToDesktop();
  }

  _setScreen(name, visible) {
    const el = document.getElementById(name + 'Screen');
    if (el) el.classList.toggle('hidden', !visible);
  }

  _renderHighScoreList(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const list = getHighScores();
    el.innerHTML = list.length
      ? list.map((e, i) => `<li><span>${i + 1}. ${e.name}</span><span>${e.score}</span></li>`).join('')
      : '<li><span>No scores yet</span></li>';
  }

  enterGameOver() {
    this.state = 'gameover';
    this.audio.stopMusic();
    this.audio.gameOverJingle();
    document.getElementById('finalScore').textContent = `Score: ${this.score} — Wave ${this.wave}`;
    const qualifies = isHighScore(this.score);
    const entryBox = document.getElementById('initialsEntry');
    entryBox.classList.toggle('hidden', !qualifies);
    if (qualifies) {
      const input = document.getElementById('initialsInput');
      input.value = '';
      setTimeout(() => input.focus(), 50);
    }
    this._renderHighScoreList('gameoverScores');
    document.getElementById('hud').classList.add('hidden');
    this._setScreen('gameover', true);
  }

  submitInitials(name) {
    addHighScore(name || 'AAA', this.score, this.wave);
    document.getElementById('initialsEntry').classList.add('hidden');
    this._renderHighScoreList('gameoverScores');
  }

  // ---------- spawning ----------
  spawnEnemy() {
    let type;
    if (this.allHumanoidsGone) {
      type = choice(['mutant', 'mutant', 'mutant', 'mutant', 'mutant', 'mutant', 'bomber', 'tank']);
    } else {
      const w = this.wave;
      type = choice([
        'lander', 'lander', 'lander',
        ...(w > 2 ? ['mutant', 'mutant'] : []),
        ...(w > 4 ? ['bomber'] : []),
        ...(w > 5 ? ['tank'] : []),
        ...(w > 6 ? ['pod'] : []),
      ]);
    }
    const stats = ENEMY_STATS[type];
    const x = wrap(this.player.x + rand(-1, 1) * (WORLD_W / 2 - 200) + WORLD_W / 4, WORLD_W);

    if (type === 'tank') {
      const y = this.viewH - GROUND_MARGIN - groundHeightAt(this.elev, x) - 14;
      this.enemies.push({ type, x, y, vx: 0, vy: 0, hp: stats.hp, facing: 1, state: 'patrol', fireCooldown: rand(0.5, 2), phase: rand(0, Math.PI * 2) });
      return;
    }

    const minY = TOP_MARGIN + 40;
    const groundY = this.viewH - GROUND_MARGIN - groundHeightAt(this.elev, x) - GROUND_CLEARANCE;
    const maxY = Math.max(minY + 10, groundY);
    const y = rand(minY, maxY);
    this.enemies.push({
      type, x, y, vx: 0, vy: 0, hp: stats.hp, facing: Math.random() < 0.5 ? -1 : 1,
      state: 'seeking', fireCooldown: rand(0.5, 2), phase: rand(0, Math.PI * 2),
    });
  }

  spawnPowerup(x, y) {
    if (Math.random() > 0.16) return;
    this.powerups.push({ x, y, vy: 40, kind: choice(POWERUP_TYPES) });
  }

  spawnExplosion(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(30, 220);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), maxLife: 0.7, color });
    }
  }

  showBanner(text) {
    this.banner = { text, t: 2.2 };
  }

  // ---------- main loop ----------
  _loop(now) {
    const dt = clamp((now - this.lastFrame) / 1000, 0, 0.05);
    this.lastFrame = now;
    this.time += dt;
    if (this.state === 'playing') this._update(dt);
    this._render();
    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    const input = this._readCombinedInput();
    if (input.pausePressed) { this.pause(); return; }
    this._updatePlayer(dt, input);
    this._updateEnemies(dt);
    this._updateTurrets(dt);
    this._updateBullets(dt);
    this._updateHumanoids(dt);
    this._updatePowerups(dt);
    this._updateParticles(dt);
    this._handleCollisions();
    this._updateWaveAndSpawns(dt);
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
  }

  _updatePlayer(dt, input) {
    const p = this.player;
    if (p.respawnTimer > 0) {
      p.respawnTimer -= dt;
      if (!p.implosionSpawned && p.respawnTimer <= IMPLOSION_DURATION) {
        this._spawnImplosion(p.x, p.y);
        p.implosionSpawned = true;
      }
      if (p.respawnTimer <= 0) {
        p.hidden = false;
        p.invuln = 2;
      }
      return;
    }
    if (p.invuln > 0) p.invuln -= dt;
    p.vx += input.ax * PLAYER_ACCEL * dt;
    p.vy += input.ay * PLAYER_ACCEL * dt;
    p.vx -= p.vx * PLAYER_DRAG * dt;
    p.vy -= p.vy * PLAYER_DRAG * dt;
    const speed = Math.hypot(p.vx, p.vy);
    const maxSpeed = PLAYER_MAX_SPEED * (p.effects.rapid ? 1 : 1);
    if (speed > maxSpeed) { p.vx = (p.vx / speed) * maxSpeed; p.vy = (p.vy / speed) * maxSpeed; }
    p.x = wrap(p.x + p.vx * dt, WORLD_W);
    p.y = clamp(p.y + p.vy * dt, TOP_MARGIN + PLAYER_RADIUS, this.viewH - 10);
    if (Math.abs(input.ax) > 0.12) p.facing = input.ax > 0 ? 1 : -1;
    if (Math.hypot(input.ax, input.ay) > 0.1) this._spawnExhaust();

    const groundY = this.viewH - GROUND_MARGIN - groundHeightAt(this.elev, p.x);
    if (p.y + PLAYER_RADIUS > groundY && p.invuln <= 0) this._killPlayer();

    for (const key in p.effects) { p.effects[key] -= dt; if (p.effects[key] <= 0) delete p.effects[key]; }

    p.fireCooldown = (p.fireCooldown || 0) - dt;
    const fireRate = p.effects.rapid ? 0.09 : 0.2;
    if (input.fire && p.fireCooldown <= 0) {
      p.fireCooldown = fireRate;
      this._fireBullet(p.x, p.y, p.facing, 0);
      if (p.effects.multishot) {
        this._fireBullet(p.x, p.y, p.facing, -0.25);
        this._fireBullet(p.x, p.y, p.facing, 0.25);
      }
      this.audio.shoot();
    }

    if (input.bombPressed && this.bombs > 0) this._useSmartBomb();
    if (input.hyperPressed && this.time - this.lastHyperTime > HYPER_COOLDOWN) this._useHyperspace();
  }

  _fireBullet(x, y, facing, angleOffset) {
    const vx = Math.cos(angleOffset) * BULLET_SPEED * facing;
    const vy = Math.sin(angleOffset) * BULLET_SPEED;
    this.playerBullets.push({ x, y, vx, vy, ttl: BULLET_TTL });
  }

  _useSmartBomb() {
    this.bombs--;
    this.audio.smartBomb();
    for (const e of this.enemies) {
      const dx = wrapDelta(e.x - this.player.x, WORLD_W);
      if (Math.abs(dx) < this.viewW / 2 + 100) { e.hp -= 99; }
    }
    this.enemyBullets = [];
    this.spawnExplosion(this.player.x, this.player.y, 40, '#8ff');
  }

  _useHyperspace() {
    this.lastHyperTime = this.time;
    this.audio.hyperspace();
    this.player.x = wrap(rand(0, WORLD_W), WORLD_W);
    this.player.y = rand(TOP_MARGIN + 40, this.viewH - GROUND_MARGIN - 60);
    this.player.invuln = 1.2;
    if (Math.random() < 0.15) this._killPlayer();
  }

  _spawnExhaust() {
    const p = this.player;
    const tailX = p.x - p.facing * 14;
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        x: tailX, y: p.y + rand(-2, 2),
        vx: -p.facing * rand(60, 140) + rand(-20, 20), vy: rand(-20, 20),
        life: rand(0.15, 0.3), maxLife: 0.3,
        color: choice(['#ffcc33', '#ff8844', '#ff4422']),
      });
    }
  }

  _spawnImplosion(x, y) {
    const n = 50;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(50, 110);
      const speed = r / IMPLOSION_DURATION;
      this.particles.push({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
        vx: -Math.cos(a) * speed, vy: -Math.sin(a) * speed,
        life: IMPLOSION_DURATION, maxLife: IMPLOSION_DURATION, color: '#4df0ff',
      });
    }
  }

  _killPlayer() {
    if (this.player.invuln > 0 || this.player.hidden) return;
    this.audio.playerHit();
    this.spawnExplosion(this.player.x, this.player.y, 90, '#f84');
    this.spawnExplosion(this.player.x, this.player.y, 40, '#ff0');
    this.lives--;
    if (this.lives <= 0) { this.enterGameOver(); return; }
    this.player.vx = 0; this.player.vy = 0;
    this.player.hidden = true;
    this.player.implosionSpawned = false;
    this.player.respawnTimer = DEATH_RESPAWN_DELAY;
  }

  _updateEnemies(dt) {
    const diff = computeDifficulty(this.wave);
    for (const e of this.enemies) {
      const stats = ENEMY_STATS[e.type];
      const speed = stats.speed * diff.speedMult;
      if (e.type === 'lander') this._updateLander(e, dt, speed);
      else if (e.type === 'mutant') this._updateMutant(e, dt, speed);
      else if (e.type === 'bomber') this._updateBomber(e, dt, speed);
      else if (e.type === 'pod') this._updatePod(e, dt, speed);
      else if (e.type === 'swarmer') this._updateSwarmer(e, dt, speed);
      else if (e.type === 'tank') this._updateTank(e, dt, speed);

      e.fireCooldown -= dt;
      if (stats.fireChance > 0 && e.fireCooldown <= 0) {
        const dx = wrapDelta(this.player.x - e.x, WORLD_W);
        if (Math.abs(dx) < 500 && Math.random() < stats.fireChance) {
          this._enemyFire(e, dx);
        }
        e.fireCooldown = rand(1.2, 2.2) / diff.speedMult;
      }
    }
    this.enemies = this.enemies.filter((e) => {
      if (e.hp <= 0) {
        this.score += ENEMY_STATS[e.type].score;
        this.audio.explosion(e.type === 'pod' ? 1.5 : 1);
        this.spawnExplosion(e.x, e.y, 18, '#fc5');
        this.spawnPowerup(e.x, e.y);
        if (e.type === 'pod') {
          const n = 3 + ((Math.random() * 3) | 0);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            this.enemies.push({ type: 'swarmer', x: e.x, y: e.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, hp: 1, facing: 1, state: 'seeking', fireCooldown: 99, phase: 0 });
          }
        }
        if (e.carriedHumanoid) { e.carriedHumanoid.state = 'falling'; e.carriedHumanoid.vy = 0; }
        return false;
      }
      return true;
    });
  }

  _updateLander(e, dt, speed) {
    if (e.state === 'seeking') {
      const target = this.humanoids.find((h) => h.state === 'ground');
      if (!target) { e.state = 'roaming'; return; }
      const dx = wrapDelta(target.x - e.x, WORLD_W);
      const dy = target.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      e.x = wrap(e.x + (dx / dist) * speed * dt, WORLD_W);
      e.y += (dy / dist) * speed * dt;
      e.facing = dx >= 0 ? 1 : -1;
      if (dist < 16) { target.state = 'carried'; e.carriedHumanoid = target; e.state = 'carrying'; this.audio.abductAlarm(); }
    } else if (e.state === 'carrying') {
      e.y -= speed * dt;
      if (e.carriedHumanoid) { e.carriedHumanoid.x = e.x; e.carriedHumanoid.y = e.y + 14; }
      if (e.y < TOP_MARGIN + 30) {
        if (e.carriedHumanoid) { e.carriedHumanoid.state = 'lost'; }
        this._loseHumanoid();
        e.type = 'mutant';
        e.state = 'seeking';
        e.carriedHumanoid = null;
      }
    } else {
      e.phase += dt;
      e.x = wrap(e.x + Math.sin(e.phase) * speed * dt, WORLD_W);
      e.y += Math.cos(e.phase * 0.7) * speed * 0.3 * dt;
    }
  }

  _updateMutant(e, dt, speed) {
    e.phase += dt * 2;
    const dx = wrapDelta(this.player.x - e.x, WORLD_W);
    const dy = this.player.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const wob = Math.sin(e.phase) * 0.6;
    e.x = wrap(e.x + ((dx / dist) + wob) * speed * dt, WORLD_W);
    e.y += (dy / dist) * speed * dt;
    e.facing = dx >= 0 ? 1 : -1;
  }

  _updateBomber(e, dt, speed) {
    e.phase += dt;
    e.x = wrap(e.x + Math.sin(e.phase * 0.5) * speed * dt, WORLD_W);
    e.dropCooldown = (e.dropCooldown || rand(1, 3)) - dt;
    if (e.dropCooldown <= 0) {
      e.dropCooldown = rand(1.5, 3);
      this.enemyBullets.push({ x: e.x, y: e.y, vx: 0, vy: 140, ttl: 3, mine: true });
    }
  }

  _updatePod(e, dt, speed) {
    e.phase += dt * 0.5;
    e.x = wrap(e.x + Math.sin(e.phase) * speed * dt, WORLD_W);
    e.y += Math.cos(e.phase * 0.6) * speed * dt;
  }

  _updateSwarmer(e, dt, speed) {
    const dx = wrapDelta(this.player.x - e.x, WORLD_W);
    const dy = this.player.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    e.x = wrap(e.x + (dx / dist) * speed * dt, WORLD_W);
    e.y += (dy / dist) * speed * dt;
    e.facing = dx >= 0 ? 1 : -1;
  }

  _updateTank(e, dt, speed) {
    e.phase += dt;
    const dir = Math.sin(e.phase * 0.3);
    e.x = wrap(e.x + dir * speed * dt, WORLD_W);
    e.facing = dir >= 0 ? 1 : -1;
    e.y = this.viewH - GROUND_MARGIN - groundHeightAt(this.elev, e.x) - 14;
  }

  _updateTurrets(dt) {
    const diff = computeDifficulty(this.wave);
    for (const t of this.turrets) {
      t.fireCooldown -= dt;
      const dx = wrapDelta(this.player.x - t.x, WORLD_W);
      if (Math.abs(dx) < 420 && t.fireCooldown <= 0) {
        t.fireCooldown = rand(1, 2) / diff.speedMult;
        this._enemyFire(t, dx);
      }
    }
  }

  _enemyFire(e, dxToPlayer) {
    const diff = computeDifficulty(this.wave);
    const dy = this.player.y - e.y;
    const dist = Math.hypot(dxToPlayer, dy) || 1;
    const speed = 260 * diff.bulletSpeedMult;
    this.enemyBullets.push({ x: e.x, y: e.y, vx: (dxToPlayer / dist) * speed, vy: (dy / dist) * speed, ttl: 2.5 });
    this.audio.enemyShoot();
  }

  _updateBullets(dt) {
    for (const b of this.playerBullets) { b.x = wrap(b.x + b.vx * dt, WORLD_W); b.y += b.vy * dt; b.ttl -= dt; }
    for (const b of this.enemyBullets) {
      b.x = wrap(b.x + b.vx * dt, WORLD_W);
      b.y += b.vy * dt;
      b.ttl -= dt;
      if (b.mine) {
        const groundY = this.viewH - GROUND_MARGIN - groundHeightAt(this.elev, b.x);
        if (b.y >= groundY) b.ttl = 0;
      }
    }
    this.playerBullets = this.playerBullets.filter((b) => b.ttl > 0);
    this.enemyBullets = this.enemyBullets.filter((b) => b.ttl > 0);
  }

  _updateHumanoids(dt) {
    for (const h of this.humanoids) {
      if (h.state === 'falling') {
        h.vy = (h.vy || 0) + 500 * dt;
        h.y += h.vy * dt;
        const groundY = this.viewH - GROUND_MARGIN - groundHeightAt(this.elev, h.x) - 8;
        if (h.y >= groundY) { h.y = groundY; h.vy = 0; h.state = 'ground'; }
      }
    }
    this.humanoids = this.humanoids.filter((h) => h.state !== 'lost');
  }

  _loseHumanoid() {
    if (!this.allHumanoidsGone && this.humanoids.filter((h) => h.state !== 'lost').length <= 1) {
      this.allHumanoidsGone = true;
      this.showBanner('HUMANOIDS LOST — MUTANT ONSLAUGHT');
    }
  }

  _updatePowerups(dt) {
    for (const pu of this.powerups) pu.y += pu.vy * dt;
    this.powerups = this.powerups.filter((pu) => pu.y < this.viewH);
  }

  _updateParticles(dt) {
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  _wrappedHit(ax, ay, ar, bx, by, br) {
    const dx = wrapDelta(ax - bx, WORLD_W);
    return circleCollision(0, ay, ar, dx, by, br);
  }

  _handleCollisions() {
    const p = this.player;
    for (const b of this.playerBullets) {
      if (b.hit) continue;
      for (const e of [...this.enemies, ...this.turrets]) {
        if (e.hp <= 0) continue;
        if (this._wrappedHit(b.x, b.y, 3, e.x, e.y, ENEMY_STATS[e.type].radius)) {
          e.hp -= 1; b.hit = true; b.ttl = 0; this.audio.hit();
          break;
        }
      }
    }
    this.turrets = this.turrets.filter((t) => {
      if (t.hp <= 0) { this.score += ENEMY_STATS.turret.score; this.spawnExplosion(t.x, t.y, 18, '#fc5'); this.audio.explosion(1); return false; }
      return true;
    });

    if (!p.hidden && p.invuln <= 0) {
      for (const b of this.enemyBullets) {
        if (this._wrappedHit(b.x, b.y, 3, p.x, p.y, PLAYER_RADIUS)) { b.ttl = 0; this._killPlayer(); break; }
      }
      for (const e of this.enemies) {
        if (this._wrappedHit(e.x, e.y, ENEMY_STATS[e.type].radius, p.x, p.y, PLAYER_RADIUS)) { this._killPlayer(); break; }
      }
    }

    if (!p.hidden) {
      for (const h of this.humanoids) {
        if (h.state === 'falling' && this._wrappedHit(h.x, h.y, 8, p.x, p.y, PLAYER_RADIUS + 6)) {
          h.state = 'ground';
          h.vy = 0;
          this.score += 250;
          this.audio.humanoidCaught();
        }
      }

      this.powerups = this.powerups.filter((pu) => {
        if (this._wrappedHit(pu.x, pu.y, 10, p.x, p.y, PLAYER_RADIUS + 4)) { this._applyPowerup(pu.kind); return false; }
        return true;
      });
    }
  }

  _applyPowerup(kind) {
    this.audio.powerup();
    if (kind === 'rapid') this.player.effects.rapid = 8;
    else if (kind === 'shield') this.player.invuln = Math.max(this.player.invuln, 6);
    else if (kind === 'multishot') this.player.effects.multishot = 10;
    else if (kind === 'bomb') this.bombs = Math.min(MAX_BOMBS, this.bombs + 1);
    else if (kind === 'life') { this.lives++; this.audio.extraLife(); }
    else if (kind === 'score') this.score += 500;
  }

  _updateWaveAndSpawns(dt) {
    this.waveTimer += dt;
    if (this.waveTimer >= WAVE_DURATION) {
      this.waveTimer = 0;
      this.wave++;
      this.score += this.wave * 100;
      this.audio.setIntensity(this.wave);
      this.showBanner(`WAVE ${this.wave}`);
      const alive = this.humanoids.filter((h) => h.state !== 'lost').length;
      if (!this.allHumanoidsGone && alive < MIN_HUMANOIDS_REPLENISH) {
        for (let i = 0; i < 3; i++) {
          const x = wrap(rand(0, WORLD_W), WORLD_W);
          this.humanoids.push({ x, y: this.viewH - GROUND_MARGIN - groundHeightAt(this.elev, x) - 8, state: 'ground' });
        }
      }
    }
    this.bombRegenTimer += dt;
    if (this.bombRegenTimer >= BOMB_REGEN_TIME && this.bombs < MAX_BOMBS) { this.bombs++; this.bombRegenTimer = 0; }

    const diff = computeDifficulty(this.wave);
    this.spawnTimer -= dt * 1000;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = diff.spawnIntervalMs;
      if (this.enemies.length < diff.maxEnemies) this.spawnEnemy();
    }
  }

  // ---------- rendering ----------
  _render() {
    const ctx = this.ctx;
    const w = this.viewW, h = this.viewH;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#050014');
    grad.addColorStop(1, '#160428');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    this._drawStars();

    if (this.state === 'playing' || this.state === 'paused') {
      this._drawTerrain();
      this._drawHumanoids();
      this._drawPowerups();
      this._drawParticles();
      this._drawEnemies();
      this._drawTurrets();
      this._drawBullets();
      this._drawPlayer();
      this._drawHud();
      this._drawMinimap();
      if (this.banner) this._drawBanner();
    }
  }

  _relX(worldX) {
    return this.viewW / 2 + wrapDelta(worldX - this.player.x, WORLD_W);
  }

  _drawStars() {
    const ctx = this.ctx;
    if (!this._starsCache) {
      this._starsCache = Array.from({ length: 140 }, () => ({ x: rand(0, WORLD_W), y: rand(0, this.viewH * 0.6), r: rand(0.5, 1.8) }));
    }
    ctx.fillStyle = '#ffffff';
    const px = this.player ? this.player.x : 0;
    for (const s of this._starsCache) {
      const sx = this.viewW / 2 + wrapDelta(s.x - px, WORLD_W) * 0.4;
      if (sx < -10 || sx > this.viewW + 10) continue;
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(this.time + s.x);
      ctx.beginPath();
      ctx.arc(sx, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawTerrain() {
    if (!this.elev) return;
    const ctx = this.ctx;
    ctx.fillStyle = '#1a2f22';
    ctx.strokeStyle = '#3ee06b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, this.viewH + 10);
    const step = 20;
    for (let sx = -10; sx <= this.viewW + 10; sx += step) {
      const worldX = wrap(this.player.x + (sx - this.viewW / 2), WORLD_W);
      const y = this.viewH - GROUND_MARGIN - groundHeightAt(this.elev, worldX);
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(this.viewW + 10, this.viewH + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  _drawHumanoids() {
    const ctx = this.ctx;
    for (const hu of this.humanoids) {
      const sx = this._relX(hu.x);
      if (sx < -20 || sx > this.viewW + 20) continue;
      ctx.fillStyle = hu.state === 'carried' ? '#ff6b9d' : '#ffe27a';
      ctx.beginPath();
      ctx.arc(sx, hu.y - 6, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(sx - 2, hu.y - 3, 4, 9);
    }
  }

  _shipPath(ctx, sx, y, facing, hue) {
    ctx.save();
    ctx.translate(sx, y);
    ctx.scale(facing, 1);
    ctx.strokeStyle = hue;
    ctx.fillStyle = 'rgba(10,20,30,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(8, -3);
    ctx.lineTo(2, -11);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-14, -3);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-14, 3);
    ctx.lineTo(-6, 6);
    ctx.lineTo(2, 11);
    ctx.lineTo(8, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(180,240,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(6, 0, 3.2, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff8844';
    ctx.beginPath();
    ctx.arc(-10, -2.5, 1.8, 0, Math.PI * 2);
    ctx.arc(-10, 2.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawPlayer() {
    const p = this.player;
    if (p.hidden) return;
    const flashHidden = p.invuln > 0 && Math.floor(this.time * 10) % 2 === 0;
    if (flashHidden) return;
    this._shipPath(this.ctx, this.viewW / 2, p.y, p.facing, p.effects.shield ? '#8ff' : '#4df0ff');
  }

  _drawEnemies() {
    const ctx = this.ctx;
    const colors = { lander: '#ff5d5d', mutant: '#c04dff', bomber: '#ff9d4d', pod: '#6bffb0', swarmer: '#fffb4d' };
    for (const e of this.enemies) {
      const sx = this._relX(e.x);
      if (sx < -30 || sx > this.viewW + 30) continue;
      if (e.type === 'tank') { this._drawTank(e, sx); continue; }
      ctx.save();
      ctx.translate(sx, e.y);
      ctx.scale(e.facing, 1);
      ctx.strokeStyle = colors[e.type] || '#fff';
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      const r = ENEMY_STATS[e.type].radius;
      ctx.beginPath();
      if (e.type === 'swarmer') ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
      else { ctx.moveTo(r, 0); ctx.lineTo(-r * 0.6, -r * 0.8); ctx.lineTo(-r * 0.2, 0); ctx.lineTo(-r * 0.6, r * 0.8); ctx.closePath(); }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawTank(e, sx) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(sx, e.y);
    ctx.scale(e.facing, 1);
    ctx.fillStyle = '#5c6b2e';
    ctx.strokeStyle = '#9cad4e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-14, -6, 24, 10);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, -2);
    ctx.lineTo(20, -2);
    ctx.stroke();
    ctx.restore();
  }

  _drawTurrets() {
    const ctx = this.ctx;
    for (const t of this.turrets) {
      const sx = this._relX(t.x);
      if (sx < -20 || sx > this.viewW + 20) continue;
      const groundY = this.viewH - GROUND_MARGIN - groundHeightAt(this.elev, t.x);
      ctx.fillStyle = '#888';
      ctx.strokeStyle = '#ddd';
      ctx.beginPath();
      ctx.moveTo(sx - 10, groundY);
      ctx.lineTo(sx + 10, groundY);
      ctx.lineTo(sx, groundY - 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  _drawBullets() {
    const ctx = this.ctx;
    for (const b of this.playerBullets) {
      const sx = this._relX(b.x);
      const angle = Math.atan2(b.vy, b.vx);
      const tailX = sx - Math.cos(angle) * BEAM_LENGTH;
      const tailY = b.y - Math.sin(angle) * BEAM_LENGTH;
      ctx.strokeStyle = 'rgba(255, 250, 176, 0.35)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(sx, b.y);
      ctx.stroke();
      ctx.strokeStyle = '#fffab0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(sx, b.y);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff5d5d';
    for (const b of this.enemyBullets) {
      const sx = this._relX(b.x);
      ctx.beginPath();
      ctx.arc(sx, b.y, b.mine ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawPowerups() {
    const ctx = this.ctx;
    const glyphs = { rapid: 'R', shield: 'S', multishot: 'M', bomb: 'B', life: '+', score: '$' };
    for (const pu of this.powerups) {
      const sx = this._relX(pu.x);
      if (sx < -20 || sx > this.viewW + 20) continue;
      ctx.fillStyle = '#222';
      ctx.strokeStyle = '#0ff';
      ctx.beginPath();
      ctx.arc(sx, pu.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0ff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyphs[pu.kind] || '?', sx, pu.y + 1);
    }
  }

  _drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const sx = this._relX(p.x);
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(sx - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  _drawHud() {
    const ctx = this.ctx;
    ctx.fillStyle = '#bff5ff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`SCORE ${this.score}`, 12, this.viewH - 26);
    ctx.fillText(`WAVE ${this.wave}`, 200, this.viewH - 26);
    ctx.fillText(`LIVES ${this.lives}`, 320, this.viewH - 26);
    ctx.fillText(`BOMBS ${this.bombs}`, 460, this.viewH - 26);
  }

  _drawMinimap() {
    const ctx = this.ctx;
    const mapW = this.viewW - 40, mapH = 18, x0 = 20, y0 = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x0, y0, mapW, mapH);
    ctx.strokeStyle = '#3ee06b';
    ctx.strokeRect(x0, y0, mapW, mapH);
    const scale = mapW / WORLD_W;
    for (const hu of this.humanoids) {
      ctx.fillStyle = hu.state === 'carried' ? '#ff6b9d' : '#ffe27a';
      ctx.fillRect(x0 + hu.x * scale, y0 + 6, 2, 6);
    }
    ctx.fillStyle = '#ff5d5d';
    for (const e of this.enemies) ctx.fillRect(x0 + e.x * scale, y0 + 2, 2, 6);
    const viewFrac = (this.viewW / WORLD_W) * mapW;
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(x0 + this.player.x * scale - viewFrac / 2, y0, viewFrac, mapH);
    ctx.fillStyle = '#4df0ff';
    ctx.fillRect(x0 + this.player.x * scale - 1.5, y0, 3, mapH);
  }

  _drawBanner() {
    const ctx = this.ctx;
    ctx.globalAlpha = clamp(this.banner.t / 2.2, 0, 1);
    ctx.fillStyle = '#4df0ff';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.banner.text, this.viewW / 2, this.viewH * 0.3);
    ctx.globalAlpha = 1;
  }
}

window.GuardianGame = { Game };

})();
