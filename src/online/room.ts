import { PLAYERS, type Move, type Player } from '../engine';
import type { Backend } from './backend';
import {
  DEFAULT_META,
  actionKey,
  replay,
  seatKey,
  seatOf,
  seatedPlayers,
  turnDeadline,
  type Action,
  type ReplayResult,
  type RoomData,
  type RoomMeta,
  type Seat,
} from './protocol';

// 時間切れを書き込むまでの猶予。端末間の時計のずれを吸収する。
const TIMEOUT_GRACE_MS = 2000;

const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ROOM_ID_CHARS[b % ROOM_ID_CHARS.length]).join('');
}

export interface RoomView {
  room: RoomData;
  replay: ReplayResult;
  mySeat: Player | null;
  deadline: number | null;
}

export class RoomClient {
  private room: RoomData = {};
  private unwatch: (() => void) | null = null;
  private listeners = new Set<(view: RoomView) => void>();

  constructor(
    private backend: Backend,
    readonly roomId: string,
    private clientId: string,
  ) {}

  static async create(backend: Backend, clientId: string, name: string): Promise<RoomClient> {
    const roomId = newRoomId();
    const meta: RoomMeta = { ...DEFAULT_META, createdAt: backend.now() };
    await backend.transact<RoomMeta>(`rooms/${roomId}/meta`, (cur) => (cur ? undefined : meta));
    const client = new RoomClient(backend, roomId, clientId);
    await client.join(name);
    return client;
  }

  // 部屋に入る。すでに座っていればその席、空いていれば南から順に座る。満席なら観戦（null）。
  async join(name: string): Promise<Player | null> {
    await this.watch();
    if (!this.room.meta) throw new Error('room-not-found');
    this.backend.announcePresence(this.roomId, this.clientId);
    const seat: Seat = { clientId: this.clientId, name };
    const existing = seatOf(this.room, this.clientId);
    const order = existing === null ? PLAYERS : [existing, ...PLAYERS.filter((p) => p !== existing)];
    for (const player of order) {
      const ok = await this.backend.transact<Seat>(`rooms/${this.roomId}/seats/${seatKey(player)}`, (cur) =>
        !cur || cur.clientId === this.clientId ? seat : undefined,
      );
      if (ok) {
        await this.maybeStart();
        return player;
      }
    }
    return null;
  }

  // 部屋の変化を受け取り始める。最初のデータが届いたら resolve する。
  private watch(): Promise<void> {
    if (this.unwatch) return Promise.resolve();
    return new Promise((resolve) => {
      this.unwatch = this.backend.watchRoom(this.roomId, (room) => {
        this.room = room ?? {};
        resolve();
        void this.maybeStart();
        this.emit();
      });
    });
  }

  // 4 人そろったら対局開始の時刻を書く（最初に書いた人の時刻が使われる）。
  private async maybeStart(): Promise<void> {
    if (!this.room.meta || this.room.meta.startedAt) return;
    if (seatedPlayers(this.room).length < 4) return;
    const now = this.backend.now();
    await this.backend.transact<number>(`rooms/${this.roomId}/meta/startedAt`, (cur) => (cur ? undefined : now));
  }

  view(): RoomView {
    const result = replay(this.room);
    return {
      room: this.room,
      replay: result,
      mySeat: seatOf(this.room, this.clientId),
      deadline: turnDeadline(this.room, result),
    };
  }

  subscribe(listener: (view: RoomView) => void): () => void {
    this.listeners.add(listener);
    listener(this.view());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const v = this.view();
    for (const fn of this.listeners) fn(v);
  }

  private append(index: number, action: Action): Promise<boolean> {
    return this.backend.transact<Action>(`rooms/${this.roomId}/actions/${actionKey(index)}`, (cur) =>
      cur ? undefined : action,
    );
  }

  async submit(move: Move): Promise<boolean> {
    const { replay: r, mySeat } = this.view();
    if (!this.room.meta?.startedAt || r.game.result || mySeat === null || r.game.turn !== mySeat) return false;
    return this.append(r.actionCount, { kind: 'move', move, by: mySeat, at: this.backend.now() });
  }

  // 締め切りを過ぎた手番があれば、時間切れを記録する。誰の端末から書いても結果は同じ。
  async checkTimeout(): Promise<boolean> {
    const { replay: r, deadline } = this.view();
    if (deadline === null || this.backend.now() < deadline + TIMEOUT_GRACE_MS) return false;
    return this.append(r.actionCount, { kind: 'timeout', by: r.game.turn, at: this.backend.now() });
  }

  isOnline(player: Player): boolean {
    const seat = this.room.seats?.[seatKey(player)];
    return Boolean(seat && this.room.presence?.[seat.clientId]);
  }

  close(): void {
    this.unwatch?.();
    this.unwatch = null;
    this.listeners.clear();
  }
}
