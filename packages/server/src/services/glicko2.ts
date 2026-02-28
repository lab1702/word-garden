// Glicko-2 implementation based on Mark Glickman's paper
// http://www.glicko.net/glicko/glicko2.pdf

const TAU = 0.5; // system constant constraining volatility change
const EPSILON = 0.000001;
const SCALE = 173.7178; // conversion factor between Glicko-1 and Glicko-2 scales

interface GlickoPlayer {
  rating: number;
  deviation: number;
  volatility: number;
}

interface RatingResult {
  player1: GlickoPlayer;
  player2: GlickoPlayer;
}

function toGlicko2Scale(rating: number, deviation: number): { mu: number; phi: number } {
  return {
    mu: (rating - 1500) / SCALE,
    phi: deviation / SCALE,
  };
}

function fromGlicko2Scale(mu: number, phi: number): { rating: number; deviation: number } {
  return {
    rating: mu * SCALE + 1500,
    deviation: phi * SCALE,
  };
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
}

function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

function computeNewVolatility(sigma: number, phi: number, v: number, delta: number): number {
  const a = Math.log(sigma * sigma);
  const phiSq = phi * phi;
  const deltaSq = delta * delta;

  function f(x: number): number {
    const ex = Math.exp(x);
    const d = phiSq + v + ex;
    return (ex * (deltaSq - phiSq - v - ex)) / (2 * d * d) - (x - a) / (TAU * TAU);
  }

  let A = a;
  let B: number;
  if (deltaSq > phiSq + v) {
    B = Math.log(deltaSq - phiSq - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0 && k < 100) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);

  for (let iter = 0; iter < 100 && Math.abs(B - A) > EPSILON; iter++) {
    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  return Math.exp(B / 2);
}

function updatePlayer(
  player: { mu: number; phi: number; sigma: number },
  opponent: { mu: number; phi: number },
  score: number,
): { mu: number; phi: number; sigma: number } {
  const gPhiJ = g(opponent.phi);
  const eVal = E(player.mu, opponent.mu, opponent.phi);

  const v = 1 / (gPhiJ * gPhiJ * eVal * (1 - eVal));
  const delta = v * gPhiJ * (score - eVal);

  const newSigma = computeNewVolatility(player.sigma, player.phi, v, delta);

  const phiStar = Math.sqrt(player.phi * player.phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = player.mu + newPhi * newPhi * gPhiJ * (score - eVal);

  return { mu: newMu, phi: newPhi, sigma: newSigma };
}

/**
 * Calculate new ratings after a game.
 * @param player1 - Player 1's current rating
 * @param player2 - Player 2's current rating
 * @param outcome - 1 = player1 wins, 0 = draw, -1 = player2 wins
 */
export function calculateNewRatings(
  player1: GlickoPlayer,
  player2: GlickoPlayer,
  outcome: 1 | 0 | -1,
): RatingResult {
  const p1 = { ...toGlicko2Scale(player1.rating, player1.deviation), sigma: player1.volatility };
  const p2 = { ...toGlicko2Scale(player2.rating, player2.deviation), sigma: player2.volatility };

  const s1 = outcome === 1 ? 1 : outcome === 0 ? 0.5 : 0;
  const s2 = 1 - s1;

  const newP1 = updatePlayer(p1, p2, s1);
  const newP2 = updatePlayer(p2, p1, s2);

  const r1 = fromGlicko2Scale(newP1.mu, newP1.phi);
  const r2 = fromGlicko2Scale(newP2.mu, newP2.phi);

  return {
    player1: { rating: r1.rating, deviation: r1.deviation, volatility: newP1.sigma },
    player2: { rating: r2.rating, deviation: r2.deviation, volatility: newP2.sigma },
  };
}
