// Pure, dependency-free helpers shared by the renderer game engine and the test suite.
'use strict';
(function () {
  function wrap(value, max) {
    return ((value % max) + max) % max;
  }

  // Shortest signed delta from a to b on a ring of circumference `max`.
  function wrapDelta(delta, max) {
    let d = wrap(delta, max);
    if (d > max / 2) d -= max;
    return d;
  }

  function circleCollision(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const r = ar + br;
    return dx * dx + dy * dy <= r * r;
  }

  // Escalating, uncapped difficulty curve: the game is designed to eventually
  // become unsurvivable rather than plateau.
  function computeDifficulty(wave) {
    return {
      speedMult: 1 + wave * 0.06,
      bulletSpeedMult: 1 + wave * 0.05,
      maxEnemies: 6 + wave * 2,
      spawnIntervalMs: Math.max(120, 1400 / (1 + wave * 0.15)),
    };
  }

  const api = { wrap, wrapDelta, circleCollision, computeDifficulty };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.GuardianLogic = api;
})();
