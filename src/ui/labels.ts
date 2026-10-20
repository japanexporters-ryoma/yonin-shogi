import { Player, type HandKind, type Piece } from '../engine';

export const PLAYER_NAMES: Record<Player, string> = {
  [Player.South]: '南',
  [Player.West]: '西',
  [Player.North]: '北',
  [Player.East]: '東',
};

export const HAND_LABELS: Record<HandKind, string> = {
  rook: '飛',
  gold: '金',
  silver: '銀',
  pawn: '歩',
};

export function pieceLabel(piece: Piece): string {
  switch (piece.kind) {
    case 'king':
      return '玉';
    case 'gold':
      return '金';
    case 'rook':
      return piece.promoted ? '龍' : '飛';
    case 'silver':
      return piece.promoted ? '全' : '銀';
    case 'pawn':
      return piece.promoted ? 'と' : '歩';
  }
}
