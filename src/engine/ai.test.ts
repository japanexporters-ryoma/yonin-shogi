import { describe, expect, it } from 'vitest';
import { applyMove, chooseCpuMove, createGame, Player, type GameState, type Piece } from './index';

function kingsOnly(): GameState {
  const state = createGame();
  state.board = state.board.map((row) => row.map(() => null));
  const put = (x: number, y: number, owner: Player, kind: Piece['kind']) => {
    state.board[y][x] = { owner, kind, promoted: false };
  };
  put(4, 8, Player.South, 'king');
  put(0, 4, Player.West, 'king');
  put(4, 0, Player.North, 'king');
  put(8, 4, Player.East, 'king');
  return state;
}

const noRandom = () => 0;

describe('CPU', () => {
  it('取れる玉があれば取る', () => {
    const s = kingsOnly();
    s.board[4][1] = { owner: Player.South, kind: 'rook', promoted: false };
    s.board[3][6] = { owner: Player.North, kind: 'gold', promoted: false };
    const move = chooseCpuMove(s, 'normal', noRandom);
    expect(move).toMatchObject({ type: 'move', from: { x: 1, y: 4 }, to: { x: 0, y: 4 } });
  });

  it('タダで取れる駒は取る', () => {
    const s = kingsOnly();
    s.board[5][4] = { owner: Player.South, kind: 'rook', promoted: false };
    s.board[2][4] = { owner: Player.North, kind: 'gold', promoted: false };
    const move = chooseCpuMove(s, 'normal', noRandom);
    expect(move).toMatchObject({ type: 'move', to: { x: 4, y: 2 } });
  });

  it('王手されたら玉を逃がす', () => {
    const s = kingsOnly();
    s.board[8][0] = { owner: Player.West, kind: 'rook', promoted: false };
    s.board[2][2] = { owner: Player.South, kind: 'gold', promoted: false };
    const next = applyMove(s, chooseCpuMove(s, 'normal', noRandom));
    expect(next.board[8][4]?.kind).not.toBe('king');
  });

  it('CPU 4人で最後まで対局でき、1手あたりの計算は速い', () => {
    let s = createGame();
    let maxMs = 0;
    while (!s.result) {
      const t = performance.now();
      const move = chooseCpuMove(s, 'normal');
      maxMs = Math.max(maxMs, performance.now() - t);
      s = applyMove(s, move);
    }
    expect(s.result).not.toBeNull();
    console.log(`moves=${s.moveCount} reason=${s.result.reason} slowest=${maxMs.toFixed(1)}ms`);
    expect(maxMs).toBeLessThan(500);
  });
});
