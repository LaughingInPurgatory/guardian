'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { wrap, wrapDelta, circleCollision, computeDifficulty } = require('../src/logic.js');

test('wrap keeps values in [0, max)', () => {
  assert.equal(wrap(-10, 100), 90);
  assert.equal(wrap(110, 100), 10);
  assert.equal(wrap(50, 100), 50);
});

test('wrapDelta picks the short way around the ring', () => {
  assert.equal(wrapDelta(90, 100), -10);
  assert.equal(wrapDelta(-90, 100), 10);
  assert.equal(wrapDelta(5, 100), 5);
});

test('circleCollision detects overlap and misses', () => {
  assert.equal(circleCollision(0, 0, 5, 8, 0, 5), true);
  assert.equal(circleCollision(0, 0, 5, 11, 0, 5), false);
});

test('computeDifficulty escalates without ever capping', () => {
  const early = computeDifficulty(1);
  const later = computeDifficulty(50);
  assert.ok(later.speedMult > early.speedMult);
  assert.ok(later.maxEnemies > early.maxEnemies);
  assert.ok(later.spawnIntervalMs < early.spawnIntervalMs);
  assert.ok(later.spawnIntervalMs > 0);
});
