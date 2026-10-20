import {
  PLAYERS,
  Player,
  applyMove,
  applyTimeout,
  createGame,
  isLegal,
  type GameState,
  type Move,
  type Rules,
} from '../engine';

// Realtime Database に保存する部屋のデータ。
// 盤面そのものは保存せず、手の記録（actions）を全員が同じ順に再生して盤面を作る。
export interface RoomMeta {
  createdAt: number;
  startedAt: number | null;
  maxMoves: number;
  turnSeconds: number;
  timeoutsToEliminate: number;
}

export interface Seat {
  clientId: string;
  name: string;
}

export type Action =
  | { kind: 'move'; move: Move; by: Player; at: number }
  | { kind: 'timeout'; by: Player; at: number };

export interface RoomData {
  meta?: RoomMeta;
  seats?: Partial<Record<SeatKey, Seat>>;
  actions?: Record<string, Action>;
  presence?: Record<string, boolean>;
}

export type SeatKey = 's0' | 's1' | 's2' | 's3';
export const seatKey = (p: Player): SeatKey => `s${p}` as SeatKey;

// 数値だけのキーは配列に変換されてしまうため、文字を付けてゼロ埋めする。
export const actionKey = (index: number): string => `a${String(index).padStart(6, '0')}`;

export const DEFAULT_META: Omit<RoomMeta, 'createdAt'> = {
  startedAt: null,
  maxMoves: 400,
  turnSeconds: 60,
  timeoutsToEliminate: 3,
};

export function rulesOf(meta: RoomMeta): Rules {
  return { maxMoves: meta.maxMoves, timeoutsToEliminate: meta.timeoutsToEliminate };
}

export interface ReplayResult {
  game: GameState;
  actionCount: number;
  lastActionAt: number | null;
}

// 手の記録を先頭から再生する。手番でない人の手や不正な手は無視する。
export function replay(room: RoomData): ReplayResult {
  const rules = room.meta ? rulesOf(room.meta) : undefined;
  let game = createGame();
  let lastActionAt: number | null = null;
  const keys = Object.keys(room.actions ?? {}).sort();
  for (const key of keys) {
    const action = room.actions![key];
    if (game.result || action.by !== game.turn) continue;
    if (action.kind === 'move') {
      const move = normalizeMove(action.move);
      if (!isLegal(game, move)) continue;
      game = applyMove(game, move, rules);
    } else {
      game = applyTimeout(game, rules);
    }
    lastActionAt = action.at;
  }
  return { game, actionCount: keys.length, lastActionAt };
}

// Firebase は false や空の値を省くことがあるので、読み込んだ手の形をそろえる。
function normalizeMove(move: Move): Move {
  if (move.type === 'move') return { ...move, promote: Boolean(move.promote) };
  return move;
}

export function seatedPlayers(room: RoomData): Player[] {
  return PLAYERS.filter((p) => room.seats?.[seatKey(p)]);
}

export function seatOf(room: RoomData, clientId: string): Player | null {
  return PLAYERS.find((p) => room.seats?.[seatKey(p)]?.clientId === clientId) ?? null;
}

// 今の手番の締め切り時刻。対局前や終局後は null。
export function turnDeadline(room: RoomData, result: ReplayResult): number | null {
  const meta = room.meta;
  if (!meta?.startedAt || result.game.result) return null;
  return (result.lastActionAt ?? meta.startedAt) + meta.turnSeconds * 1000;
}
