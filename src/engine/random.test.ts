import { describe, expect, it } from 'vitest';
import { applyMove, createGame, legalMoves } from './index';

// 乱数で最後まで指して、例外が出ずに必ず終局することを確かめる。
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

describe('ランダム対局', () => {
  it('50 局すべてが例外なく終局する', () => {
    for (let game = 0; game < 50; game++) {
      const rand = seeded(game + 1);
      let s = createGame();
      while (!s.result) {
        const moves = legalMoves(s);
        s = applyMove(s, moves[Math.floor(rand() * moves.length)]);
        expect(s.board.flat().filter((p) => p?.kind === 'king').length).toBe(
          Object.values(s.alive).filter(Boolean).length,
        );
      }
      expect(s.moveCount).toBeLessThanOrEqual(400);
    }
  });
});
