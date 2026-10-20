import { applyLegalMove, attackCounts, legalMoves } from './game';
import { toLocal } from './geometry';
import { BOARD_SIZE, HAND_KINDS, PLAYERS, type GameState, type HandKind, type Move, type Piece, type Player } from './types';

export type CpuLevel = 'easy' | 'normal';

const BASE_VALUE: Record<HandKind, number> = { pawn: 1, silver: 5, gold: 6, rook: 10 };

function pieceValue(p: Piece): number {
  if (p.kind === 'king') return 0;
  if (!p.promoted) return BASE_VALUE[p.kind];
  return p.kind === 'rook' ? 13 : 6;
}

const LEVELS: Record<CpuLevel, { noise: number; caution: number }> = {
  // よわい：危険をあまり気にせず、手の選び方もばらつく。
  easy: { noise: 4, caution: 0.3 },
  normal: { noise: 0.4, caution: 1 },
};

// 指した後の局面を、me から見て点数にする。1手先だけを見る簡単な評価。
function evaluate(state: GameState, me: Player, caution: number): number {
  if (!state.alive[me]) return -100_000;
  const opponents = PLAYERS.filter((p) => p !== me && state.alive[p]);
  let score = (3 - opponents.length) * 1000;
  if (state.result && state.result.ranks[me] === 1) score += 10_000;

  const mine = attackCounts(state, me);
  const enemy = Array.from({ length: BOARD_SIZE }, () => Array<number>(BOARD_SIZE).fill(0));
  for (const p of opponents) {
    const counts = attackCounts(state, p);
    for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) enemy[y][x] += counts[y][x];
  }

  for (const kind of HAND_KINDS) score += state.hands[me][kind] * BASE_VALUE[kind];

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const piece = state.board[y][x];
      if (!piece) continue;
      if (piece.owner === me) {
        const value = pieceValue(piece);
        score += value;
        if (enemy[y][x] > 0) {
          if (piece.kind === 'king') score -= 500 * caution;
          else score -= value * (mine[y][x] > 0 ? 0.3 : 0.9) * caution;
        }
        if (piece.kind !== 'king') score += (BOARD_SIZE - 1 - toLocal(me, { x, y }).y) * 0.03;
      } else if (mine[y][x] > 0) {
        // 相手の駒を狙っている。王手は特に高く評価する。
        score += piece.kind === 'king' ? 1.5 : pieceValue(piece) * 0.15;
      }
    }
  }
  return score;
}

export function chooseCpuMove(state: GameState, level: CpuLevel = 'normal', random: () => number = Math.random): Move {
  const moves = legalMoves(state);
  const me = state.turn;
  const { noise, caution } = LEVELS[level];
  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const score = evaluate(applyLegalMove(state, move), me, caution) + random() * noise;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}
