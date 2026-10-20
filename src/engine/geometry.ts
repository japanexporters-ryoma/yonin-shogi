import { BOARD_SIZE, Player, type Square } from './types';

const MAX = BOARD_SIZE - 1;

// 時計回りに 90 度回す（盤の中心まわり）。下辺が左辺に移る。
function rotatePointOnce({ x, y }: Square): Square {
  return { x: MAX - y, y: x };
}

function rotateVectorOnce(dx: number, dy: number): [number, number] {
  return [-dy, dx];
}

function times<T>(n: number, value: T, fn: (v: T) => T): T {
  let v = value;
  for (let i = 0; i < ((n % 4) + 4) % 4; i++) v = fn(v);
  return v;
}

// 南視点のローカル座標を盤上の座標に変換する。
export function toBoard(player: Player, local: Square): Square {
  return times(player, local, rotatePointOnce);
}

// 盤上の座標を、そのプレイヤーから見たローカル座標（前が y の小さい方向）に変換する。
export function toLocal(player: Player, square: Square): Square {
  return times(4 - player, square, rotatePointOnce);
}

export function rotateVector(player: Player, dx: number, dy: number): [number, number] {
  return times(player, [dx, dy] as [number, number], ([a, b]) => rotateVectorOnce(a, b));
}

export function inBounds({ x, y }: Square): boolean {
  return x >= 0 && x <= MAX && y >= 0 && y <= MAX;
}

export function inPromotionZone(player: Player, square: Square): boolean {
  return toLocal(player, square).y <= 2;
}

export function isLastRank(player: Player, square: Square): boolean {
  return toLocal(player, square).y === 0;
}
