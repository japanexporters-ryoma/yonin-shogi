import { inBounds, inPromotionZone, isLastRank, rotateVector, toBoard, toLocal } from './geometry';
import {
  BOARD_SIZE,
  DEFAULT_RULES,
  HAND_KINDS,
  PLAYERS,
  Player,
  type GameState,
  type Hand,
  type HandKind,
  type Move,
  type Piece,
  type PieceKind,
  type Rules,
  type Square,
} from './types';

// 南視点の初期配置（ローカル座標）。他のプレイヤーは盤を回して配置する。
const SETUP: { kind: PieceKind; x: number; y: number }[] = [
  { kind: 'silver', x: 2, y: 8 },
  { kind: 'gold', x: 3, y: 8 },
  { kind: 'king', x: 4, y: 8 },
  { kind: 'gold', x: 5, y: 8 },
  { kind: 'silver', x: 6, y: 8 },
  { kind: 'pawn', x: 3, y: 7 },
  { kind: 'rook', x: 4, y: 7 },
  { kind: 'pawn', x: 5, y: 7 },
  { kind: 'pawn', x: 4, y: 6 },
];

const KING_STEPS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];
const GOLD_STEPS: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [0, 1]];
const SILVER_STEPS: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 1], [1, 1]];
const PAWN_STEPS: [number, number][] = [[0, -1]];
const DIAGONAL_STEPS: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const ORTHOGONAL_RAYS: [number, number][] = [[0, -1], [-1, 0], [1, 0], [0, 1]];

// ローカル座標（前 = y マイナス方向）での一歩移動と、飛び駒の方向。
function movement(piece: Piece): { steps: [number, number][]; rays: [number, number][] } {
  switch (piece.kind) {
    case 'king':
      return { steps: KING_STEPS, rays: [] };
    case 'gold':
      return { steps: GOLD_STEPS, rays: [] };
    case 'silver':
      return { steps: piece.promoted ? GOLD_STEPS : SILVER_STEPS, rays: [] };
    case 'pawn':
      return { steps: piece.promoted ? GOLD_STEPS : PAWN_STEPS, rays: [] };
    case 'rook':
      return { steps: piece.promoted ? DIAGONAL_STEPS : [], rays: ORTHOGONAL_RAYS };
  }
}

export function canPromote(kind: PieceKind): boolean {
  return kind === 'rook' || kind === 'silver' || kind === 'pawn';
}

function emptyHand(): Hand {
  return { rook: 0, gold: 0, silver: 0, pawn: 0 };
}

function perPlayer<T>(fn: (p: Player) => T): Record<Player, T> {
  return Object.fromEntries(PLAYERS.map((p) => [p, fn(p)])) as Record<Player, T>;
}

export function createGame(): GameState {
  const board: (Piece | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array<Piece | null>(BOARD_SIZE).fill(null),
  );
  for (const player of PLAYERS) {
    for (const { kind, x, y } of SETUP) {
      const sq = toBoard(player, { x, y });
      board[sq.y][sq.x] = { owner: player, kind, promoted: false };
    }
  }
  return {
    board,
    hands: perPlayer(emptyHand),
    turn: Player.South,
    alive: perPlayer(() => true),
    eliminated: [],
    moveCount: 0,
    consecutiveTimeouts: perPlayer(() => 0),
    lastMove: null,
    result: null,
  };
}

export function pieceAt(state: GameState, { x, y }: Square): Piece | null {
  return state.board[y][x];
}

// その駒が動ける先（味方の駒がいるマスは除く）。成るかどうかは別に判定する。
// includeOwn なら味方の駒がいるマス（その駒を守っているマス）も含める。
function destinations(state: GameState, from: Square, piece: Piece, includeOwn = false): Square[] {
  const result: Square[] = [];
  const { steps, rays } = movement(piece);
  for (const [lx, ly] of steps) {
    const [dx, dy] = rotateVector(piece.owner, lx, ly);
    const to = { x: from.x + dx, y: from.y + dy };
    if (!inBounds(to)) continue;
    const target = pieceAt(state, to);
    if (!target || target.owner !== piece.owner || includeOwn) result.push(to);
  }
  for (const [lx, ly] of rays) {
    const [dx, dy] = rotateVector(piece.owner, lx, ly);
    let to = { x: from.x + dx, y: from.y + dy };
    while (inBounds(to)) {
      const target = pieceAt(state, to);
      if (target) {
        if (target.owner !== piece.owner || includeOwn) result.push(to);
        break;
      }
      result.push(to);
      to = { x: to.x + dx, y: to.y + dy };
    }
  }
  return result;
}

function hasUnpromotedPawnInColumn(state: GameState, player: Player, localX: number): boolean {
  for (let ly = 0; ly < BOARD_SIZE; ly++) {
    const sq = toBoard(player, { x: localX, y: ly });
    const p = pieceAt(state, sq);
    if (p && p.owner === player && p.kind === 'pawn' && !p.promoted) return true;
  }
  return false;
}

export function legalMoves(state: GameState): Move[] {
  if (state.result) return [];
  const player = state.turn;
  const moves: Move[] = [];

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const piece = state.board[y][x];
      if (!piece || piece.owner !== player) continue;
      const from = { x, y };
      for (const to of destinations(state, from, piece)) {
        const promotable =
          !piece.promoted &&
          canPromote(piece.kind) &&
          (inPromotionZone(player, from) || inPromotionZone(player, to));
        const mustPromote = piece.kind === 'pawn' && !piece.promoted && isLastRank(player, to);
        if (!mustPromote) moves.push({ type: 'move', from, to, promote: false });
        if (promotable) moves.push({ type: 'move', from, to, promote: true });
      }
    }
  }

  const hand = state.hands[player];
  for (const kind of HAND_KINDS) {
    if (hand[kind] === 0) continue;
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const to = { x, y };
        if (state.board[y][x]) continue;
        if (kind === 'pawn') {
          if (isLastRank(player, to)) continue;
          if (hasUnpromotedPawnInColumn(state, player, toLocal(player, to).x)) continue;
        }
        moves.push({ type: 'drop', kind, to });
      }
    }
  }

  return moves.length > 0 ? moves : [{ type: 'pass' }];
}

function sameSquare(a: Square, b: Square): boolean {
  return a.x === b.x && a.y === b.y;
}

function sameMove(a: Move, b: Move): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'pass') return true;
  if (a.type === 'drop' && b.type === 'drop') return a.kind === b.kind && sameSquare(a.to, b.to);
  if (a.type === 'move' && b.type === 'move') {
    return sameSquare(a.from, b.from) && sameSquare(a.to, b.to) && a.promote === b.promote;
  }
  return false;
}

export function isLegal(state: GameState, move: Move): boolean {
  return legalMoves(state).some((m) => sameMove(m, move));
}

function cloneState(state: GameState): GameState {
  return {
    board: state.board.map((row) => row.map((p) => (p ? { ...p } : null))),
    hands: perPlayer((p) => ({ ...state.hands[p] })),
    turn: state.turn,
    alive: { ...state.alive },
    eliminated: state.eliminated.map((group) => [...group]),
    moveCount: state.moveCount,
    consecutiveTimeouts: { ...state.consecutiveTimeouts },
    lastMove: state.lastMove,
    result: state.result,
  };
}

// 脱落させる。盤上の駒は取り除き、持ち駒は heir（玉を取った人）に渡す。heir がなければ消える。
function eliminate(state: GameState, players: Player[], heir: Player | null): void {
  for (const loser of players) {
    state.alive[loser] = false;
    state.consecutiveTimeouts[loser] = 0;
    for (const row of state.board) {
      for (let x = 0; x < row.length; x++) {
        if (row[x]?.owner === loser) row[x] = null;
      }
    }
    if (heir !== null) {
      for (const kind of HAND_KINDS) state.hands[heir][kind] += state.hands[loser][kind];
    }
    state.hands[loser] = emptyHand();
  }
  state.eliminated.push(players);
}

function alivePlayers(state: GameState): Player[] {
  return PLAYERS.filter((p) => state.alive[p]);
}

function computeRanks(state: GameState): Record<Player, number> {
  const ranks = perPlayer(() => 1);
  // 生き残りが 1 位。その後は脱落が遅い順。
  let next = alivePlayers(state).length + 1;
  for (let i = state.eliminated.length - 1; i >= 0; i--) {
    const group = state.eliminated[i];
    for (const p of group) ranks[p] = next;
    next += group.length;
  }
  return ranks;
}

function finishTurn(state: GameState, rules: Rules): void {
  state.moveCount += 1;
  const alive = alivePlayers(state);
  if (alive.length <= 1) {
    state.result = { reason: 'last-standing', ranks: computeRanks(state) };
    return;
  }
  if (state.moveCount >= rules.maxMoves) {
    state.result = { reason: 'move-limit', ranks: computeRanks(state) };
    return;
  }
  let next = state.turn;
  do {
    next = ((next + 1) % 4) as Player;
  } while (!state.alive[next]);
  state.turn = next;
}

export function applyMove(state: GameState, move: Move, rules: Rules = DEFAULT_RULES): GameState {
  if (!isLegal(state, move)) throw new Error('illegal move');
  return applyLegalMove(state, move, rules);
}

// legalMoves() が返した手をそのまま適用する（合法かどうかの確認を省く）。CPU の読み用。
export function applyLegalMove(state: GameState, move: Move, rules: Rules = DEFAULT_RULES): GameState {
  const next = cloneState(state);
  const player = next.turn;
  next.consecutiveTimeouts[player] = 0;
  next.lastMove = move;

  if (move.type === 'drop') {
    next.hands[player][move.kind] -= 1;
    next.board[move.to.y][move.to.x] = { owner: player, kind: move.kind, promoted: false };
  } else if (move.type === 'move') {
    const piece = next.board[move.from.y][move.from.x]!;
    const captured = next.board[move.to.y][move.to.x];
    next.board[move.from.y][move.from.x] = null;
    next.board[move.to.y][move.to.x] = { ...piece, promoted: piece.promoted || move.promote };
    if (captured) {
      if (captured.kind === 'king') {
        eliminate(next, [captured.owner], player);
      } else {
        next.hands[player][captured.kind] += 1;
      }
    }
  }

  finishTurn(next, rules);
  return next;
}

// 持ち時間切れ。その番はパスになり、規定回数続くと脱落する。
export function applyTimeout(state: GameState, rules: Rules = DEFAULT_RULES): GameState {
  if (state.result) throw new Error('game is over');
  const next = cloneState(state);
  const player = next.turn;
  next.lastMove = null;
  next.consecutiveTimeouts[player] += 1;
  if (next.consecutiveTimeouts[player] >= rules.timeoutsToEliminate) {
    eliminate(next, [player], null);
  }
  finishTurn(next, rules);
  return next;
}

// 誰かの駒がその玉を取れる位置にあるか（警告表示用）。
export function isInCheck(state: GameState, player: Player): boolean {
  if (!state.alive[player]) return false;
  let king: Square | null = null;
  for (let y = 0; y < BOARD_SIZE && !king; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const p = state.board[y][x];
      if (p && p.owner === player && p.kind === 'king') {
        king = { x, y };
        break;
      }
    }
  }
  if (!king) return false;
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const p = state.board[y][x];
      if (!p || p.owner === player) continue;
      if (destinations(state, { x, y }, p).some((to) => sameSquare(to, king!))) return true;
    }
  }
  return false;
}

// player の駒が利いているマスの数（盤と同じ並び：[y][x]）。味方の駒を守っている利きも数える。
export function attackCounts(state: GameState, player: Player): number[][] {
  const counts = Array.from({ length: BOARD_SIZE }, () => Array<number>(BOARD_SIZE).fill(0));
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const p = state.board[y][x];
      if (!p || p.owner !== player) continue;
      for (const to of destinations(state, { x, y }, p, true)) counts[to.y][to.x] += 1;
    }
  }
  return counts;
}
