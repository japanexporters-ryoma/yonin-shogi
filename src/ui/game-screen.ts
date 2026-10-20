import {
  BOARD_SIZE,
  HAND_KINDS,
  PLAYERS,
  Player,
  isInCheck,
  legalMoves,
  toBoard,
  type GameState,
  type HandKind,
  type Move,
  type Square,
} from '../engine';
import { button, el } from './dom';
import { HAND_LABELS, pieceLabel } from './labels';

// 対局画面が必要とする情報。1台モードとオンラインモードで中身が変わる。
export interface GameSource {
  game(): GameState;
  // 盤の下側に来る人。
  viewer(): Player;
  // この端末から指せる人（1台モードなら手番の人、オンラインなら自分の席）。
  canPlay(player: Player): boolean;
  // オンラインで自分の席かどうか（表示用）。
  isMe(player: Player): boolean;
  submit(move: Move): void;
  name(player: Player): string;
  // 接続していない人には印を付ける。1台モードでは常に true。
  isOnline(player: Player): boolean;
  // 今の手番の締め切り（ミリ秒）。持ち時間なしなら null。
  deadline(): number | null;
  now(): number;
  headerButtons(): HTMLElement[];
  onLeave(): void;
}

type Selection = { type: 'square'; square: Square } | { type: 'hand'; kind: HandKind } | null;

const same = (a: Square, b: Square) => a.x === b.x && a.y === b.y;

export class GameScreen {
  private selection: Selection = null;
  private promotionChoice: { from: Square; to: Square } | null = null;
  private timer: number;
  private clockNode: HTMLElement | null = null;

  constructor(
    private root: HTMLElement,
    private source: GameSource,
  ) {
    this.timer = window.setInterval(() => this.updateClock(), 250);
    this.render();
  }

  destroy(): void {
    window.clearInterval(this.timer);
  }

  // 相手の手などで盤面が変わったときに呼ぶ。
  refresh(): void {
    const game = this.source.game();
    if (!this.source.canPlay(game.turn) || game.result) {
      this.selection = null;
      this.promotionChoice = null;
    }
    this.render();
  }

  private get game(): GameState {
    return this.source.game();
  }

  private myTurn(): boolean {
    return !this.game.result && this.source.canPlay(this.game.turn);
  }

  private play(move: Move): void {
    this.selection = null;
    this.promotionChoice = null;
    this.source.submit(move);
    this.render();
  }

  private movesFromSelection(): Move[] {
    const sel = this.selection;
    if (!sel || !this.myTurn()) return [];
    return legalMoves(this.game).filter((m) =>
      sel.type === 'square'
        ? m.type === 'move' && same(m.from, sel.square)
        : m.type === 'drop' && m.kind === sel.kind,
    );
  }

  private onSquare(square: Square): void {
    if (!this.myTurn()) return;
    const candidates = this.movesFromSelection().filter((m) => m.type !== 'pass' && same(m.to, square));
    if (candidates.length === 1) return this.play(candidates[0]);
    if (candidates.length === 2 && this.selection?.type === 'square') {
      this.promotionChoice = { from: this.selection.square, to: square };
      return this.render();
    }
    const piece = this.game.board[square.y][square.x];
    const isOwn = piece && piece.owner === this.game.turn;
    const reselect = this.selection?.type === 'square' && same(this.selection.square, square);
    this.selection = isOwn && !reselect ? { type: 'square', square } : null;
    this.render();
  }

  private onHand(kind: HandKind): void {
    if (!this.myTurn()) return;
    const reselect = this.selection?.type === 'hand' && this.selection.kind === kind;
    this.selection = reselect ? null : { type: 'hand', kind };
    this.render();
  }

  private playerPanel(player: Player): HTMLElement {
    const g = this.game;
    const panel = el('div', `panel p${player}`);
    if (g.turn === player && !g.result) panel.classList.add('active');
    if (!g.alive[player]) panel.classList.add('out');

    const head = el('div', 'panel-head', el('span', 'dot'), el('span', 'name', this.source.name(player)));
    if (!g.alive[player]) head.append(el('span', 'tag', '脱落'));
    else if (isInCheck(g, player)) head.append(el('span', 'tag warn', '王手'));
    if (g.alive[player] && !this.source.isOnline(player)) head.append(el('span', 'tag', '切断中'));
    if (g.turn === player && !g.result) head.append(el('span', 'tag turn', '手番'));
    panel.append(head);

    const hand = el('div', 'hand');
    const canDrop = g.turn === player && this.myTurn();
    for (const kind of HAND_KINDS) {
      const count = g.hands[player][kind];
      if (count === 0) continue;
      const btn = button('', () => this.onHand(kind), 'hand-piece');
      btn.disabled = !canDrop;
      if (canDrop && this.selection?.type === 'hand' && this.selection.kind === kind) btn.classList.add('selected');
      btn.append(el('span', 'glyph', HAND_LABELS[kind]));
      if (count > 1) btn.append(el('span', 'count', String(count)));
      hand.append(btn);
    }
    if (!hand.childElementCount) hand.append(el('span', 'empty', '持ち駒なし'));
    panel.append(hand);
    return panel;
  }

  private boardView(): HTMLElement {
    const g = this.game;
    const v = this.source.viewer();
    const targets = this.movesFromSelection().flatMap((m) => (m.type === 'pass' ? [] : [m.to]));
    const last = g.lastMove && g.lastMove.type !== 'pass' ? g.lastMove : null;
    const board = el('div', 'board');
    for (let sy = 0; sy < BOARD_SIZE; sy++) {
      for (let sx = 0; sx < BOARD_SIZE; sx++) {
        const sq = toBoard(v, { x: sx, y: sy });
        const cell = button('', () => this.onSquare(sq), 'cell');
        cell.setAttribute('aria-label', `${sq.x},${sq.y}`);
        const piece = g.board[sq.y][sq.x];
        if (piece) {
          const p = el('span', `piece p${piece.owner}${piece.promoted ? ' promoted' : ''}`, pieceLabel(piece));
          p.style.transform = `rotate(${((((piece.owner - v) % 4) + 4) % 4) * 90}deg)`;
          cell.append(p);
        }
        if (this.selection?.type === 'square' && same(this.selection.square, sq)) cell.classList.add('selected');
        if (targets.some((t) => same(t, sq))) cell.classList.add(piece ? 'target capture' : 'target');
        if (last && (same(last.to, sq) || (last.type === 'move' && same(last.from, sq)))) cell.classList.add('last');
        board.append(cell);
      }
    }
    return board;
  }

  private statusLine(): string {
    const g = this.game;
    if (g.result) return g.result.reason === 'move-limit' ? '手数の上限で終局しました' : '対局終了';
    const name = this.source.name(g.turn);
    const who = this.source.isMe(g.turn) ? 'あなたの番です' : `${name}の番です`;
    return isInCheck(g, g.turn) ? `${who}（王手されています）` : who;
  }

  private updateClock(): void {
    if (!this.clockNode) return;
    const deadline = this.source.deadline();
    if (deadline === null) {
      this.clockNode.textContent = '';
      return;
    }
    const left = Math.max(0, Math.ceil((deadline - this.source.now()) / 1000));
    this.clockNode.textContent = `残り ${left} 秒`;
    this.clockNode.classList.toggle('hurry', left <= 10);
  }

  private overlay(): HTMLElement | null {
    const g = this.game;
    if (this.promotionChoice) {
      const { from, to } = this.promotionChoice;
      return el(
        'div',
        'overlay',
        el(
          'div',
          'card',
          el('p', '', '成りますか？'),
          el(
            'div',
            'row',
            button('成る', () => this.play({ type: 'move', from, to, promote: true }), 'primary'),
            button('成らない', () => this.play({ type: 'move', from, to, promote: false })),
          ),
        ),
      );
    }
    if (g.result) {
      const ranks = g.result.ranks;
      const list = el('ol', 'ranks');
      for (const p of [...PLAYERS].sort((a, b) => ranks[a] - ranks[b])) {
        list.append(el('li', `p${p}`, `${ranks[p]}位　${this.source.name(p)}`));
      }
      return el(
        'div',
        'overlay',
        el('div', 'card', el('h2', '', '結果'), list, button('メニューに戻る', () => this.source.onLeave(), 'primary')),
      );
    }
    return null;
  }

  private render(): void {
    // 動かせる手がまったくないときは自動でパスする。
    if (this.myTurn()) {
      const moves = legalMoves(this.game);
      if (moves.length === 1 && moves[0].type === 'pass') {
        const pass = moves[0];
        queueMicrotask(() => this.play(pass));
      }
    }
    const v = this.source.viewer();
    const others = [1, 2, 3].map((d) => ((v + d) % 4) as Player);

    const header = el(
      'header',
      '',
      el('h1', '', '4人将棋'),
      el('div', 'controls', ...this.source.headerButtons()),
    );
    const opponents = el('section', 'opponents', ...others.map((p) => this.playerPanel(p)));
    this.clockNode = el('span', 'clock');
    const status = el('p', `status p${this.game.turn}`, this.statusLine(), ' ', this.clockNode);

    const main = el('main', '', header, opponents, this.boardView(), status, this.playerPanel(v));
    const ov = this.overlay();
    if (ov) main.append(ov);
    this.root.replaceChildren(main);
    this.updateClock();
  }
}
