import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  runTransaction,
  set,
  type Database,
} from 'firebase/database';
import type { Backend } from './backend';
import type { RoomData } from './protocol';

export class FirebaseBackend implements Backend {
  private db: Database;
  private offset = 0;

  constructor(config: FirebaseOptions) {
    this.db = getDatabase(initializeApp(config));
    // 端末の時計のずれを補正する。
    onValue(ref(this.db, '.info/serverTimeOffset'), (snap) => {
      this.offset = Number(snap.val()) || 0;
    });
  }

  watchRoom(roomId: string, onChange: (room: RoomData | null) => void): () => void {
    return onValue(ref(this.db, `rooms/${roomId}`), (snap) => onChange(snap.val() as RoomData | null));
  }

  async transact<T>(path: string, update: (current: T | null) => T | undefined): Promise<boolean> {
    const result = await runTransaction(ref(this.db, path), (current: T | null) => update(current), {
      applyLocally: false,
    });
    return result.committed;
  }

  announcePresence(roomId: string, clientId: string): void {
    const presenceRef = ref(this.db, `rooms/${roomId}/presence/${clientId}`);
    onValue(ref(this.db, '.info/connected'), (snap) => {
      if (snap.val() !== true) return;
      void onDisconnect(presenceRef)
        .remove()
        .then(() => set(presenceRef, true));
    });
  }

  now(): number {
    return Date.now() + this.offset;
  }
}
