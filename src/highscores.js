// Thin wrapper over localStorage. No backend needed for a local top-10 list.
'use strict';
(function () {

const KEY = 'guardian_highscores_v1';
const MAX_ENTRIES = 10;

function getHighScores() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function addHighScore(name, score, wave) {
  const list = getHighScores();
  list.push({ name: name.slice(0, 12) || 'AAA', score, wave, date: new Date().toISOString() });
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, MAX_ENTRIES);
  localStorage.setItem(KEY, JSON.stringify(top));
  return top;
}

function isHighScore(score) {
  const list = getHighScores();
  return list.length < MAX_ENTRIES || score > list[list.length - 1].score;
}

window.GuardianHighScores = { getHighScores, addHighScore, isHighScore };

})();
