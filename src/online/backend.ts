import type { RoomData } from './protocol';

// 部屋データの保存先。本番は Firebase、テストはメモリ上の実装を使う。
export interface Backend {
  watchRoom(roomId: string, onChange: (room: RoomData | null) => void): () => void;
  // path の値が update の戻り値で置き換わる。undefined を返すと何もしない。書き込めたら true。
  transact<T>(path: string, update: (current: T | null) => T | undefined): Promise<boolean>;
  // 接続中であることを知らせる。切断されると自動で消える。
  announcePresence(roomId: string, clientId: string): void;
  // サーバー基準の現在時刻（ミリ秒）。
  now(): number;
}
