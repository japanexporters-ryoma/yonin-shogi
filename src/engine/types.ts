// 座標は南（画面下）から見た向きで、x は左→右、y は上→下（どちらも 0〜8）。
export const BOARD_SIZE = 9;

// 時計回りの手番順。数値は南の配置を時計回りに何回 90 度回したかを表す。
export enum Player {
  South = 0,
  West = 1,
  North = 2,
  East = 3,
}

export const PLAYERS: readonly Player[] = [Player.South, Player.West, Player.North, Player.East];

export type PieceKind = 'king' | 'rook' | 'gold' | 'silver' | 'pawn';
export type HandKind = Exclude<PieceKind, 'king'>;
export const HAND_KINDS: readonly HandKind[] = ['rook', 'gold', 'silver', 'pawn'];

export interface Piece {
  owner: Player;
  kind: PieceKind;
  promoted: boolean;
}

export interface Square {
  x: number;
  y: number;
}

export type Hand = Record<HandKind, number>;

export type Move =
  | { type: 'move'; from: Square; to: Square; promote: boolean }
  | { type: 'drop'; kind: HandKind; to: Square }
  | { type: 'pass' };

export type EndReason = 'last-standing' | 'move-limit';

export interface GameResult {
  reason: EndReason;
  // ranks[player] = 順位（1〜4）。同順位あり。
  ranks: Record<Player, number>;
}

export interface GameState {
  board: (Piece | null)[][]; // board[y][x]
  hands: Record<Player, Hand>;
  turn: Player;
  alive: Record<Player, boolean>;
  // 脱落した順。同時脱落は同じ配列にまとめる。
  eliminated: Player[][];
  moveCount: number;
  consecutiveTimeouts: Record<Player, number>;
  result: GameResult | null;
}

export interface Rules {
  maxMoves: number;
  timeoutsToEliminate: number;
}

export const DEFAULT_RULES: Rules = {
  maxMoves: 400,
  timeoutsToEliminate: 3,
};
