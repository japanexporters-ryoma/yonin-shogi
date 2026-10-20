import { describe, expect, it } from 'vitest';
import {
  applyMove,
  applyTimeout,
  createGame,
  isInCheck,
  isLegal,
  legalMoves,
  pieceAt,
  Player,
  type GameState,
  type Move,
  type Piece,
} from './index';

function emptyBoard(): GameState {
  const state = createGame();
  state.board = state.board.map((row) => row.map(() => null));
  return state;
}

function put(state: GameState, x: number, y: number, owner: Player, kind: Piece['kind'], promoted = false) {
  state.board[y][x] = { owner, kind, promoted };
}

function move(fx: number, fy: number, tx: number, ty: number, promote = false): Move {
  return { type: 'move', from: { x: fx, y: fy }, to: { x: tx, y: ty }, promote };
}

// 4 人とも玉だけ置いた盤。テストで使う駒を追加して使う。
function kingsOnly(): GameState {
  const state = emptyBoard();
  put(state, 4, 8, Player.South, 'king');
  put(state, 0, 4, Player.West, 'king');
  put(state, 4, 0, Player.North, 'king');
  put(state, 8, 4, Player.East, 'king');
  return state;
}

describe('初期配置', () => {
  it('参考画像と同じ位置に 4 人の駒が並ぶ', () => {
    const s = createGame();
    expect(pieceAt(s, { x: 4, y: 8 })).toEqual({ owner: Player.South, kind: 'king', promoted: false });
    expect(pieceAt(s, { x: 4, y: 7 })?.kind).toBe('rook');
    expect(pieceAt(s, { x: 4, y: 6 })?.kind).toBe('pawn');
    // 西（画面左）：9五に玉、8五に飛、8四・8六・7五に歩
    expect(pieceAt(s, { x: 0, y: 4 })).toEqual({ owner: Player.West, kind: 'king', promoted: false });
    expect(pieceAt(s, { x: 1, y: 4 })?.kind).toBe('rook');
    expect(pieceAt(s, { x: 1, y: 3 })?.kind).toBe('pawn');
    expect(pieceAt(s, { x: 2, y: 4 })?.kind).toBe('pawn');
    expect(pieceAt(s, { x: 0, y: 2 })?.kind).toBe('silver');
    expect(pieceAt(s, { x: 4, y: 0 })).toEqual({ owner: Player.North, kind: 'king', promoted: false });
    expect(pieceAt(s, { x: 8, y: 4 })).toEqual({ owner: Player.East, kind: 'king', promoted: false });
    const count = s.board.flat().filter(Boolean).length;
    expect(count).toBe(36);
  });

  it('時計回り（南→西→北→東）で手番が回る', () => {
    let s = createGame();
    s = applyMove(s, move(4, 6, 4, 5));
    expect(s.turn).toBe(Player.West);
    s = applyMove(s, move(2, 4, 3, 4)); // 西の歩は右へ進む
    expect(s.turn).toBe(Player.North);
    s = applyMove(s, move(4, 2, 4, 3)); // 北の歩は下へ進む
    expect(s.turn).toBe(Player.East);
    s = applyMove(s, move(6, 4, 5, 4)); // 東の歩は左へ進む
    expect(s.turn).toBe(Player.South);
  });

  it('後ろには進めない', () => {
    const s = createGame();
    expect(isLegal(s, move(4, 6, 4, 7))).toBe(false);
  });
});

describe('取る・成る', () => {
  it('取った駒は成っていない状態で持ち駒になる', () => {
    const s = kingsOnly();
    put(s, 4, 5, Player.South, 'rook');
    put(s, 4, 3, Player.North, 'silver', true);
    const next = applyMove(s, move(4, 5, 4, 3));
    expect(next.hands[Player.South].silver).toBe(1);
  });

  it('南は上 3 段、東は左 3 列で成れる', () => {
    const s = kingsOnly();
    put(s, 4, 4, Player.South, 'silver');
    expect(isLegal(s, move(4, 4, 4, 3, true))).toBe(false);
    put(s, 2, 3, Player.South, 'silver');
    expect(isLegal(s, move(2, 3, 2, 2, true))).toBe(true);

    s.turn = Player.East;
    put(s, 3, 6, Player.East, 'silver');
    expect(isLegal(s, move(3, 6, 2, 6, true))).toBe(true);
    expect(isLegal(s, move(3, 6, 2, 5, true))).toBe(true);
  });

  it('いちばん奥に着いた歩は必ず成る', () => {
    const s = kingsOnly();
    put(s, 2, 1, Player.South, 'pawn');
    expect(isLegal(s, move(2, 1, 2, 0, false))).toBe(false);
    expect(isLegal(s, move(2, 1, 2, 0, true))).toBe(true);
  });

  it('龍は斜めに 1 マス動ける', () => {
    const s = kingsOnly();
    put(s, 2, 5, Player.South, 'rook', true);
    expect(isLegal(s, move(2, 5, 3, 6))).toBe(true);
    expect(isLegal(s, move(2, 5, 4, 7))).toBe(false);
  });
});

describe('持ち駒', () => {
  it('二歩は自分が進む向きの列で判定する（西なら横の行）', () => {
    const s = kingsOnly();
    s.turn = Player.West;
    s.hands[Player.West].pawn = 1;
    put(s, 3, 6, Player.West, 'pawn');
    const drops = legalMoves(s).filter((m) => m.type === 'drop');
    expect(drops.some((m) => m.type === 'drop' && m.to.y === 6)).toBe(false);
    expect(drops.some((m) => m.type === 'drop' && m.to.y === 5 && m.to.x === 3)).toBe(true);
  });

  it('他の人の歩は二歩にならない', () => {
    const s = kingsOnly();
    s.hands[Player.South].pawn = 1;
    put(s, 3, 3, Player.North, 'pawn');
    expect(isLegal(s, { type: 'drop', kind: 'pawn', to: { x: 3, y: 5 } })).toBe(true);
  });

  it('いちばん奥の列には歩を打てない', () => {
    const s = kingsOnly();
    s.hands[Player.South].pawn = 1;
    expect(isLegal(s, { type: 'drop', kind: 'pawn', to: { x: 2, y: 0 } })).toBe(false);
    expect(isLegal(s, { type: 'drop', kind: 'pawn', to: { x: 2, y: 1 } })).toBe(true);
  });

  it('打った駒は打った人の向きで動く', () => {
    let s = kingsOnly();
    s.turn = Player.East;
    s.hands[Player.East].pawn = 1;
    s = applyMove(s, { type: 'drop', kind: 'pawn', to: { x: 5, y: 2 } });
    s.turn = Player.East;
    expect(isLegal(s, move(5, 2, 4, 2))).toBe(true);
  });
});

describe('脱落と勝ち負け', () => {
  it('玉を取られたら脱落し、駒は盤から消え、持ち駒は取った人に移る', () => {
    const s = kingsOnly();
    put(s, 4, 1, Player.South, 'rook');
    put(s, 6, 2, Player.North, 'gold');
    s.hands[Player.North].silver = 2;
    const next = applyMove(s, move(4, 1, 4, 0));
    expect(next.alive[Player.North]).toBe(false);
    expect(pieceAt(next, { x: 6, y: 2 })).toBeNull();
    expect(next.hands[Player.South].silver).toBe(2);
    expect(next.hands[Player.North].silver).toBe(0);
  });

  it('脱落した人の番は飛ばす', () => {
    let s = kingsOnly();
    put(s, 1, 4, Player.South, 'rook');
    s = applyMove(s, move(1, 4, 0, 4));
    expect(s.alive[Player.West]).toBe(false);
    expect(s.turn).toBe(Player.North);
  });

  it('最後の 1 人が 1 位で、脱落が遅い順に順位が付く', () => {
    let s = kingsOnly();
    put(s, 1, 4, Player.South, 'rook');
    put(s, 4, 1, Player.South, 'rook');
    put(s, 7, 4, Player.South, 'rook');
    s = applyMove(s, move(1, 4, 0, 4)); // 西が 4 位
    s.turn = Player.South;
    s = applyMove(s, move(4, 1, 4, 0)); // 北が 3 位
    s.turn = Player.South;
    s = applyMove(s, move(7, 4, 8, 4)); // 東が 2 位
    expect(s.result?.reason).toBe('last-standing');
    expect(s.result?.ranks).toEqual({
      [Player.South]: 1,
      [Player.East]: 2,
      [Player.North]: 3,
      [Player.West]: 4,
    });
    expect(legalMoves(s)).toEqual([]);
  });

  it('3 回続けて時間切れになると脱落し、持ち駒は消える', () => {
    let s = kingsOnly();
    s.hands[Player.South].gold = 1;
    for (let round = 0; round < 3; round++) {
      s = applyTimeout(s);
      expect(s.turn).toBe(Player.West);
      if (round < 2) s.turn = Player.South;
    }
    expect(s.alive[Player.South]).toBe(false);
    expect(pieceAt(s, { x: 4, y: 8 })).toBeNull();
    const totalGold = Object.values(s.hands).reduce((n, h) => n + h.gold, 0);
    expect(totalGold).toBe(0);
  });

  it('指せば時間切れの回数はリセットされる', () => {
    let s = kingsOnly();
    s = applyTimeout(s);
    s.turn = Player.South;
    s = applyMove(s, move(4, 8, 4, 7));
    expect(s.consecutiveTimeouts[Player.South]).toBe(0);
  });

  it('手数の上限で終わると、残っている人は同順位', () => {
    let s = kingsOnly();
    s = applyMove(s, move(4, 8, 4, 7), { maxMoves: 1, timeoutsToEliminate: 3 });
    expect(s.result).toEqual({
      reason: 'move-limit',
      ranks: { [Player.South]: 1, [Player.West]: 1, [Player.North]: 1, [Player.East]: 1 },
    });
  });
});

describe('王手の判定と警告', () => {
  it('どの相手からの王手も検出する', () => {
    const s = kingsOnly();
    expect(isInCheck(s, Player.South)).toBe(false);
    put(s, 0, 8, Player.West, 'rook');
    expect(isInCheck(s, Player.South)).toBe(true);
  });

  it('王手を放っておく手も指せる', () => {
    const s = kingsOnly();
    put(s, 0, 8, Player.West, 'rook');
    put(s, 2, 2, Player.South, 'gold');
    expect(isLegal(s, move(2, 2, 2, 1))).toBe(true);
  });

  it('動かせる手がなければパスだけになる', () => {
    const s = emptyBoard();
    put(s, 0, 4, Player.West, 'king');
    put(s, 4, 0, Player.North, 'king');
    s.alive[Player.South] = true;
    // 南の駒が 1 枚もない（実際には起こらないが、念のため）
    expect(legalMoves(s)).toEqual([{ type: 'pass' }]);
  });
});
