import type { Backend } from './backend';
import type { RoomData } from './protocol';

// テストや動作確認用の、メモリ上だけで動く Backend。
export class MemoryBackend implements Backend {
  private data: Record<string, unknown> = {};
  private watchers = new Map<string, Set<(room: RoomData | null) => void>>();
  clock = 1_000_000;

  watchRoom(roomId: string, onChange: (room: RoomData | null) => void): () => void {
    const set = this.watchers.get(roomId) ?? new Set();
    set.add(onChange);
    this.watchers.set(roomId, set);
    onChange(this.room(roomId));
    return () => set.delete(onChange);
  }

  async transact<T>(path: string, update: (current: T | null) => T | undefined): Promise<boolean> {
    const parts = path.split('/');
    const parent = this.walk(parts.slice(0, -1), true)!;
    const leaf = parts[parts.length - 1];
    const current = (parent[leaf] ?? null) as T | null;
    const next = update(current === null ? null : structuredClone(current));
    if (next === undefined) return false;
    parent[leaf] = structuredClone(next);
    if (parts[0] === 'rooms') this.notify(parts[1]);
    return true;
  }

  announcePresence(roomId: string, clientId: string): void {
    void this.transact(`rooms/${roomId}/presence/${clientId}`, () => true);
  }

  disconnect(roomId: string, clientId: string): void {
    const presence = this.walk(['rooms', roomId, 'presence'], false);
    if (presence) delete presence[clientId];
    this.notify(roomId);
  }

  now(): number {
    return this.clock;
  }

  private room(roomId: string): RoomData | null {
    const room = this.walk(['rooms', roomId], false);
    return room ? (structuredClone(room) as RoomData) : null;
  }

  // Firebase と同じく、通知は書き込みの後で順番に届ける。届けるときの最新の値を渡す。
  private notify(roomId: string): void {
    for (const fn of this.watchers.get(roomId) ?? []) queueMicrotask(() => fn(this.room(roomId)));
  }

  private walk(parts: string[], create: boolean): Record<string, any> | null {
    let node: Record<string, any> = this.data;
    for (const part of parts) {
      if (node[part] == null) {
        if (!create) return null;
        node[part] = {};
      }
      node = node[part];
    }
    return node;
  }
}
