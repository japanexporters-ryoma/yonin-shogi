import { describe, expect, it } from 'vitest';
import { Player, toBoard, type Move } from '../engine';
import { MemoryBackend } from './memory';
import { actionKey } from './protocol';
import { RoomClient } from './room';

const pawnPush: Record<Player, Move> = {
  [Player.South]: { type: 'move', from: { x: 4, y: 6 }, to: { x: 4, y: 5 }, promote: false },
  [Player.West]: { type: 'move', from: { x: 2, y: 4 }, to: { x: 3, y: 4 }, promote: false },
  [Player.North]: { type: 'move', from: { x: 4, y: 2 }, to: { x: 4, y: 3 }, promote: false },
  [Player.East]: { type: 'move', from: { x: 6, y: 4 }, to: { x: 5, y: 4 }, promote: false },
};

async function fullRoom() {
  const backend = new MemoryBackend();
  const host = await RoomClient.create(backend, 'c0', 'りょうま');
  const clients = [host];
  for (const id of ['c1', 'c2', 'c3']) {
    const c = new RoomClient(backend, host.roomId, id);
    await c.join(id);
    clients.push(c);
  }
  return { backend, clients };
}

describe('オンライン対戦の部屋', () => {
  it('入った順に南・西・北・東の席に座り、4人そろうと始まる', async () => {
    const backend = new MemoryBackend();
    const host = await RoomClient.create(backend, 'c0', 'A');
    expect(host.view().mySeat).toBe(Player.South);
    expect(host.view().room.meta?.startedAt).toBeNull();
    const seats: (Player | null)[] = [];
    for (const id of ['c1', 'c2', 'c3', 'c4']) {
      seats.push(await new RoomClient(backend, host.roomId, id).join(id));
    }
    expect(seats).toEqual([Player.West, Player.North, Player.East, null]);
    expect(host.view().room.meta?.startedAt).toBe(backend.clock);
  });

  it('入り直すと同じ席に戻る', async () => {
    const { backend, clients } = await fullRoom();
    const again = new RoomClient(backend, clients[0].roomId, 'c2');
    expect(await again.join('c2')).toBe(Player.North);
  });

  it('存在しない部屋には入れない', async () => {
    const c = new RoomClient(new MemoryBackend(), 'NOROOM', 'c0');
    await expect(c.join('x')).rejects.toThrow('room-not-found');
  });

  it('自分の番にだけ指せて、全員の盤面が同じになる', async () => {
    const { clients } = await fullRoom();
    expect(await clients[1].submit(pawnPush[Player.West])).toBe(false);
    expect(await clients[0].submit(pawnPush[Player.South])).toBe(true);
    expect(await clients[1].submit(pawnPush[Player.West])).toBe(true);
    for (const c of clients) {
      expect(c.view().replay.game.turn).toBe(Player.North);
      expect(c.view().replay.game.board[4][3]?.owner).toBe(Player.West);
    }
  });

  it('同じ番号に2つ書こうとしても、先に書いた方だけが残る', async () => {
    const { backend, clients } = await fullRoom();
    backend.clock += 70_000;
    const [a, b] = await Promise.all([clients[0].submit(pawnPush[Player.South]), clients[2].checkTimeout()]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(Object.keys(clients[0].view().room.actions ?? {})).toEqual([actionKey(0)]);
  });

  it('持ち時間を過ぎると、ほかの人の端末が時間切れを記録する', async () => {
    const { backend, clients } = await fullRoom();
    expect(await clients[1].checkTimeout()).toBe(false);
    backend.clock += 60_000 + 2_000;
    expect(await clients[1].checkTimeout()).toBe(true);
    expect(clients[3].view().replay.game.turn).toBe(Player.West);
    expect(clients[3].view().deadline).toBe(backend.clock + 60_000);
  });

  it('いなくなった人は時間切れ3回で脱落し、対局は続く', async () => {
    const { backend, clients } = await fullRoom();
    // 西・北・東は、歩を突いたあと飛車を前後に動かして時間を進める。
    const rookAt = (p: Player, localY: number) => toBoard(p, { x: 4, y: localY });
    const moves = (p: Player): Move[] => [
      pawnPush[p],
      { type: 'move', from: rookAt(p, 7), to: rookAt(p, 6), promote: false },
      { type: 'move', from: rookAt(p, 6), to: rookAt(p, 7), promote: false },
    ];
    for (let round = 0; round < 3; round++) {
      backend.clock += 62_000;
      expect(await clients[1].checkTimeout()).toBe(true); // 南の時間切れ
      for (const p of [Player.West, Player.North, Player.East]) {
        expect(await clients[p].submit(moves(p)[round])).toBe(true);
      }
    }
    const game = clients[1].view().replay.game;
    expect(game.alive[Player.South]).toBe(false);
    expect(game.board[8][4]).toBeNull();
    expect(game.turn).toBe(Player.West);
  });

  it('接続状態が分かる', async () => {
    const { backend, clients } = await fullRoom();
    expect(clients[0].isOnline(Player.North)).toBe(true);
    backend.disconnect(clients[0].roomId, 'c2');
    await Promise.resolve();
    expect(clients[0].isOnline(Player.North)).toBe(false);
  });
});

