import { Player, applyMove, chooseCpuMove, createGame, type CpuLevel, type GameState } from '../engine';
import type { Backend } from '../online/backend';
import { firebaseConfig } from '../online/config';
import { MemoryBackend } from '../online/memory';
import { seatKey } from '../online/protocol';
import { RoomClient, type RoomView } from '../online/room';
import { button, el } from './dom';
import { GameScreen } from './game-screen';
import { PLAYER_NAMES } from './labels';

const NAME_KEY = 'yonin-shogi:name';
const CLIENT_KEY = 'yonin-shogi:client';

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できなくても遊べる。
  }
}

function clientId(): string {
  let id = load(CLIENT_KEY);
  if (!id) {
    id = crypto.randomUUID();
    save(CLIENT_KEY, id);
  }
  return id;
}

function roomFromUrl(): string | null {
  return new URLSearchParams(location.search).get('room')?.toUpperCase() ?? null;
}

function setRoomInUrl(roomId: string | null): void {
  const url = new URL(location.href);
  if (roomId) url.searchParams.set('room', roomId);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

function inviteUrl(roomId: string): string {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('room', roomId);
  return url.toString();
}

async function createBackend(): Promise<Backend | null> {
  // 動作確認用：?backend=memory なら、このページの中だけで動く部屋を使う。
  if (new URLSearchParams(location.search).get('backend') === 'memory') {
    const backend = new MemoryBackend();
    backend.clock = Date.now();
    setInterval(() => (backend.clock = Date.now()), 200);
    (window as unknown as { __yonin: unknown }).__yonin = { backend, RoomClient };
    return backend;
  }
  if (!firebaseConfig) return null;
  const { FirebaseBackend } = await import('../online/firebase');
  return new FirebaseBackend(firebaseConfig);
}

export async function mountApp(root: HTMLElement): Promise<void> {
  const backend = await createBackend();
  const me = clientId();
  let screen: GameScreen | null = null;
  let cleanup: (() => void) | null = null;

  function clear(): void {
    screen?.destroy();
    screen = null;
    cleanup?.();
    cleanup = null;
  }

  function showHome(message = ''): void {
    clear();
    const invited = roomFromUrl();
    const nameInput = el('input', 'name-input') as HTMLInputElement;
    nameInput.placeholder = 'あなたの名前';
    nameInput.maxLength = 12;
    nameInput.value = load(NAME_KEY) ?? '';
    const name = () => {
      const value = nameInput.value.trim() || 'ななし';
      save(NAME_KEY, value);
      return value;
    };

    const online = el('section', 'menu-group');
    if (!backend) {
      online.append(el('p', 'note', 'オンライン対戦は準備中です（サーバーの設定待ち）。'));
    } else if (invited) {
      online.append(
        el('p', 'note', `部屋 ${invited} に招待されています。`),
        button('この部屋に参加する', () => void joinRoom(invited, name()), 'primary big'),
        button('招待を無視して新しい部屋を作る', () => void createRoom(name()), 'big'),
      );
    } else {
      online.append(
        button('部屋を作って友達を招待する', () => void createRoom(name()), 'primary big'),
        el('p', 'note', '部屋を作ると招待リンクができます。4人そろうと対局が始まります。'),
      );
    }

    const cpu = el(
      'section',
      'menu-group',
      el('div', 'row2', button('CPUと対戦（よわい）', () => showCpu('easy'), 'big'), button('CPUと対戦（ふつう）', () => showCpu('normal'), 'big')),
      el('p', 'note', 'あなた1人とCPU3人で対戦します。通信なしで遊べます。'),
    );

    const local = el(
      'section',
      'menu-group',
      button('1台で4人で遊ぶ', showLocal, 'big'),
      el('p', 'note', 'スマホ1台を順番に回して遊ぶモードです。'),
    );

    const main = el(
      'main',
      'home',
      el('h1', 'title', '4人将棋'),
      el('p', 'lead', '友達4人で遊べる将棋。玉を取られたら脱落、最後まで残った人の勝ちです。'),
      nameInput,
      online,
      cpu,
      local,
    );
    if (message) main.insertBefore(el('p', 'error', message), nameInput);
    root.replaceChildren(main);
  }

  function showLocal(): void {
    clear();
    let game: GameState = createGame();
    let fixedView: Player | null = null;
    screen = new GameScreen(root, {
      game: () => game,
      viewer: () => fixedView ?? game.turn,
      canPlay: (p) => p === game.turn,
      isMe: () => false,
      submit: (move) => {
        game = applyMove(game, move);
        screen?.refresh();
      },
      name: (p) => PLAYER_NAMES[p],
      isOnline: () => true,
      deadline: () => null,
      now: () => Date.now(),
      headerButtons: () => [
        button(fixedView === null ? '盤：手番の人を下に' : `盤：${PLAYER_NAMES[fixedView]}で固定`, () => {
          fixedView = fixedView === null ? game.turn : null;
          screen?.refresh();
        }),
        button('メニュー', () => {
          if (game.result || confirm('対局をやめてメニューに戻りますか？')) showHome();
        }),
      ],
      onLeave: () => showHome(),
    });
  }

  function showCpu(level: CpuLevel): void {
    clear();
    const human = Player.South;
    const cpuNames: Record<Player, string> = {
      [Player.South]: load(NAME_KEY) || 'あなた',
      [Player.West]: 'CPU 1',
      [Player.North]: 'CPU 2',
      [Player.East]: 'CPU 3',
    };
    let game: GameState = createGame();
    let pending: number | null = null;

    // CPU の番なら少し待ってから指す。あなたが脱落した後は早送りで最後まで進める。
    const scheduleCpu = () => {
      if (pending !== null || game.result || game.turn === human) return;
      const delay = game.alive[human] ? 700 : 120;
      pending = window.setTimeout(() => {
        pending = null;
        game = applyMove(game, chooseCpuMove(game, level));
        screen?.refresh();
        scheduleCpu();
      }, delay);
    };

    screen = new GameScreen(root, {
      game: () => game,
      viewer: () => human,
      canPlay: (p) => p === human,
      isMe: (p) => p === human,
      submit: (move) => {
        game = applyMove(game, move);
        screen?.refresh();
        scheduleCpu();
      },
      name: (p) => cpuNames[p],
      isOnline: () => true,
      deadline: () => null,
      now: () => Date.now(),
      headerButtons: () => [
        button('メニュー', () => {
          if (game.result || confirm('対局をやめてメニューに戻りますか？')) showHome();
        }),
      ],
      onLeave: () => showHome(),
    });
    cleanup = () => {
      if (pending !== null) window.clearTimeout(pending);
    };
    scheduleCpu();
  }

  async function createRoom(name: string): Promise<void> {
    if (!backend) return;
    try {
      const client = await RoomClient.create(backend, me, name);
      setRoomInUrl(client.roomId);
      enterRoom(client);
    } catch (e) {
      console.error(e);
      showHome('部屋を作れませんでした。通信状態を確認して、もう一度お試しください。');
    }
  }

  async function joinRoom(roomId: string, name: string): Promise<void> {
    if (!backend) return;
    const client = new RoomClient(backend, roomId, me);
    try {
      await client.join(name);
      enterRoom(client);
    } catch (e) {
      client.close();
      setRoomInUrl(null);
      const notFound = e instanceof Error && e.message === 'room-not-found';
      showHome(notFound ? `部屋 ${roomId} が見つかりませんでした。` : '部屋に入れませんでした。');
    }
  }

  function enterRoom(client: RoomClient): void {
    clear();
    let latest: RoomView = client.view();
    const leave = () => {
      setRoomInUrl(null);
      showHome();
    };
    const timeoutCheck = window.setInterval(() => void client.checkTimeout(), 1000);
    const unsubscribe = client.subscribe((view) => {
      latest = view;
      if (view.room.meta?.startedAt) {
        if (!screen) screen = new GameScreen(root, onlineSource());
        else screen.refresh();
      } else {
        renderLobby(view);
      }
    });
    cleanup = () => {
      window.clearInterval(timeoutCheck);
      unsubscribe();
      client.close();
    };

    function seatName(p: Player): string {
      return latest.room.seats?.[seatKey(p)]?.name ?? PLAYER_NAMES[p];
    }

    function onlineSource() {
      return {
        game: () => latest.replay.game,
        viewer: () => latest.mySeat ?? Player.South,
        canPlay: (p: Player) => latest.mySeat === p,
        isMe: (p: Player) => latest.mySeat === p,
        submit: (move: Parameters<RoomClient['submit']>[0]) => void client.submit(move),
        name: (p: Player) => `${seatName(p)}${latest.mySeat === p ? '（あなた）' : ''}`,
        isOnline: (p: Player) => client.isOnline(p),
        deadline: () => latest.deadline,
        now: () => backend!.now(),
        headerButtons: () => [
          button('退出', () => {
            if (latest.replay.game.result || confirm('退出しますか？（同じリンクから戻れます）')) leave();
          }),
        ],
        onLeave: leave,
      };
    }

    function renderLobby(view: RoomView): void {
      const link = inviteUrl(client.roomId);
      const seats = el('ol', 'seats');
      for (const p of [Player.South, Player.West, Player.North, Player.East]) {
        const seat = view.room.seats?.[seatKey(p)];
        const label = seat ? `${seat.name}${view.mySeat === p ? '（あなた）' : ''}` : '空席';
        const li = el('li', `seat p${p}${seat ? '' : ' vacant'}`, el('span', 'dot'), el('span', '', label));
        if (seat && !client.isOnline(p)) li.append(el('span', 'tag', '切断中'));
        seats.append(li);
      }
      const share = button('招待リンクを送る', async () => {
        try {
          if (navigator.share) await navigator.share({ title: '4人将棋', text: '4人将棋で遊ぼう！', url: link });
          else {
            await navigator.clipboard.writeText(link);
            share.textContent = 'コピーしました';
          }
        } catch {
          // 共有をキャンセルしたときなど。
        }
      }, 'primary big');
      const linkBox = el('input', 'link-box') as HTMLInputElement;
      linkBox.readOnly = true;
      linkBox.value = link;
      linkBox.addEventListener('focus', () => linkBox.select());

      root.replaceChildren(
        el(
          'main',
          'home',
          el('h1', 'title', `部屋 ${client.roomId}`),
          el('p', 'lead', view.mySeat === null ? '満席のため観戦します。' : '4人そろうと自動で対局が始まります。'),
          seats,
          share,
          linkBox,
          button('退出', leave, 'big'),
        ),
      );
    }
  }

  const invited = roomFromUrl();
  const savedName = load(NAME_KEY);
  // 一度名前を入れたことがあり、招待リンクから来た場合はそのまま入る（再読み込みで戻れるように）。
  if (backend && invited && savedName) await joinRoom(invited, savedName);
  else showHome();
}
