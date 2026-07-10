'use strict';
(function () {

const PUNS = [
  "This game has great gravity — it really pulls you in.",
  "I asked the lander for directions. It abducted the question.",
  "Our ship runs on thrust and bad decisions.",
  "The humanoids asked for a rescue plan. We winged it.",
  "Space is big, but our high score list is bigger... eventually.",
  "The Mutants are just landers who skipped therapy.",
  "I've got a bomb joke, but it might not land well.",
  "Swarmers: because one problem is never enough.",
  "The Baiter always takes the bait — it's in the name.",
  "We paused the game. Even heroes need a smoke bomb break.",
  "Defending Earth is easy. Defending your K/D ratio is hard.",
  "The radar shows everything except our strategy.",
  "Hyperspace: because sometimes the best move is a random one.",
  "Our turret has great aim and worse people skills.",
  "The pod didn't split up peacefully.",
  "Every wave gets harder. Every pun gets worse. It's balanced.",
  "The humanoids trust us completely. We are not worthy.",
  "I put the 'guard' in Guardian. The rest was a rounding error.",
  "Score attack? More like score-attacked-by-mutants.",
  "The best defense is a good offense, and also more bullets.",
];

function randomPun() {
  return PUNS[Math.floor(Math.random() * PUNS.length)];
}

window.GuardianPuns = { randomPun };

})();
