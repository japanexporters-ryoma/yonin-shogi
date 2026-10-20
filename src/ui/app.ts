import {
  BOARD_SIZE,
  HAND_KINDS,
  PLAYERS,
  Player,
  applyMove,
  createGame,
  isInCheck,
  legalMoves,
  toBoard,
  type GameState,
  type HandKind,
  type Move,
  type Square,
} from '../engine';
import { HAND_LABELS, PLAYER_NAMES, pieceLabel } from './labels';

type Selection = { type: 'square'; square: Square } | { type: 'hand'; kind: HandKind } | null;

interface UiState {
  game: GameState;
  selection: Selection;
  promotionChoice: { from: Square; to: Square } | null;
  lastMove: { from?: Square; to: Square } | null;
  // 'turn' なら手番の人が常に下に来るように盤を回す（1台を回して遊ぶとき用）。
  view: 'turn' | Player;
}

const same = (a: Square, b: Square) => a.x === b.x && a.y === b.y;

export function mountApp(root: HTMLElement): void {
  const ui: UiState = {
    game: createGame(),
    selection: null,
    promotionChoice: null,
    lastMove: null,
    view: 'turn',
  };

  const viewer = (): Player => (ui.view === 'turn' ? ui.game.turn : ui.view);

  function play(move: Move): void {
    ui.game = applyMove(ui.game, move);
    ui.lastMove =
      move.type === 'move' ? { from: move.from, to: move.to } : move.type === 'drop' ? { to: move.to } : null;
    ui.selection = null;
    ui.promotionChoice = null;
    render();
  }

  function movesFromSelection(): Move[] {
    const sel = ui.selection;
    if (!sel) return [];
    return legalMoves(ui.game).filter((m) =>
      sel.type === 'square'
        ? m.type === 'move' && same(m.from, sel.square)
        : m.type === 'drop' && m.kind === sel.kind,
    );
  }

  function onSquare(square: Square): void {
    if (ui.game.result) return;
    const candidates = movesFromSelection().filter((m) => m.type !== 'pass' && same(m.to, square));
    if (candidates.length === 1) return play(candidates[0]);
    if (candidates.length === 2 && ui.selection?.type === 'square') {
      ui.promotionChoice = { from: ui.selection.square, to: square };
      return render();
    }
    const piece = ui.game.board[square.y][square.x];
    const isOwn = piece && piece.owner === ui.game.turn;
    ui.selection = isOwn && !(ui.selection?.type === 'square' && same(ui.selection.square, square))
      ? { type: 'square', square }
      : null;
    render();
  }

  function onHand(kind: HandKind): void {
    if (ui.game.result) return;
    ui.selection = ui.selection?.type === 'hand' && ui.selection.kind === kind ? null : { type: 'hand', kind };
    render();
  }

  function playerPanel(player: Player): HTMLElement {
    const g = ui.game;
    const panel = el('div', `panel p${player}`);
    if (g.turn === player && !g.result) panel.classList.add('active');
    if (!g.alive[player]) panel.classList.add('out');

    const head = el('div', 'panel-head');
    head.append(el('span', 'dot'), text('span', 'name', PLAYER_NAMES[player]));
    if (!g.alive[player]) head.append(text('span', 'tag', '脱落'));
    else if (isInCheck(g, player)) head.append(text('span', 'tag warn', '王手'));
    if (g.turn === player && !g.result) head.append(text('span', 'tag turn', '手番'));
    panel.append(head);

    const hand = el('div', 'hand');
    for (const kind of HAND_KINDS) {
      const count = g.hands[player][kind];
      if (count === 0) continue;
      const canDrop = g.turn === player && !g.result;
      const btn = el('button', 'hand-piece') as HTMLButtonElement;
      btn.disabled = !canDrop;
      if (ui.selection?.type === 'hand' && ui.selection.kind === kind && canDrop) btn.classList.add('selected');
      btn.append(text('span', 'glyph', HAND_LABELS[kind]));
      if (count > 1) btn.append(text('span', 'count', String(count)));
      btn.addEventListener('click', () => onHand(kind));
      hand.append(btn);
    }
    if (!hand.childElementCount) hand.append(text('span', 'empty', '持ち駒なし'));
    panel.append(hand);
    return panel;
  }

  function boardView(): HTMLElement {
    const g = ui.game;
    const v = viewer();
    const targets = movesFromSelection().flatMap((m) => (m.type === 'pass' ? [] : [m.to]));
    const board = el('div', 'board');
    for (let sy = 0; sy < BOARD_SIZE; sy++) {
      for (let sx = 0; sx < BOARD_SIZE; sx++) {
        const sq = toBoard(v, { x: sx, y: sy });
        const cell = el('button', 'cell') as HTMLButtonElement;
        cell.setAttribute('aria-label', `${sq.x},${sq.y}`);
        const piece = g.board[sq.y][sq.x];
        if (piece) {
          const p = text('span', `piece p${piece.owner}${piece.promoted ? ' promoted' : ''}`, pieceLabel(piece));
          p.style.transform = `rotate(${(((piece.owner - v) % 4) + 4) % 4 * 90}deg)`;
          cell.append(p);
        }
        if (ui.selection?.type === 'square' && same(ui.selection.square, sq)) cell.classList.add('selected');
        if (targets.some((t) => same(t, sq))) cell.classList.add(piece ? 'target capture' : 'target');
        if (ui.lastMove && (same(ui.lastMove.to, sq) || (ui.lastMove.from && same(ui.lastMove.from, sq)))) {
          cell.classList.add('last');
        }
        cell.addEventListener('click', () => onSquare(sq));
        board.append(cell);
      }
    }
    return board;
  }

  function statusLine(): string {
    const g = ui.game;
    if (g.result) return g.result.reason === 'move-limit' ? '手数の上限で終局しました' : '対局終了';
    const name = PLAYER_NAMES[g.turn];
    return isInCheck(g, g.turn) ? `${name}の番です（王手されています）` : `${name}の番です`;
  }

  function overlay(): HTMLElement | null {
    const g = ui.game;
    if (ui.promotionChoice) {
      const { from, to } = ui.promotionChoice;
      const box = el('div', 'overlay');
      const card = el('div', 'card');
      card.append(text('p', '', '成りますか？'));
      const row = el('div', 'row');
      const yes = text('button', 'primary', '成る');
      yes.addEventListener('click', () => play({ type: 'move', from, to, promote: true }));
      const no = text('button', '', '成らない');
      no.addEventListener('click', () => play({ type: 'move', from, to, promote: false }));
      row.append(yes, no);
      card.append(row);
      box.append(card);
      return box;
    }
    if (g.result) {
      const box = el('div', 'overlay');
      const card = el('div', 'card');
      card.append(text('h2', '', '結果'));
      const list = el('ol', 'ranks');
      const ranks = g.result.ranks;
      for (const p of [...PLAYERS].sort((a, b) => ranks[a] - ranks[b])) {
        list.append(text('li', `p${p}`, `${ranks[p]}位　${PLAYER_NAMES[p]}`));
      }
      card.append(list);
      const again = text('button', 'primary', 'もう一度遊ぶ');
      again.addEventListener('click', reset);
      card.append(again);
      box.append(card);
      return box;
    }
    return null;
  }

  function reset(): void {
    ui.game = createGame();
    ui.selection = null;
    ui.promotionChoice = null;
    ui.lastMove = null;
    render();
  }

  function render(): void {
    const v = viewer();
    const others = [1, 2, 3].map((d) => ((v + d) % 4) as Player);

    const header = el('header', '');
    header.append(text('h1', '', '4人将棋'));
    const controls = el('div', 'controls');
    const viewBtn = text(
      'button',
      '',
      ui.view === 'turn' ? '盤の向き：手番の人' : `盤の向き：${PLAYER_NAMES[ui.view]}で固定`,
    );
    viewBtn.addEventListener('click', () => {
      ui.view = ui.view === 'turn' ? ui.game.turn : 'turn';
      render();
    });
    const resetBtn = text('button', '', 'やり直す');
    resetBtn.addEventListener('click', () => {
      if (confirm('最初からやり直しますか？')) reset();
    });
    controls.append(viewBtn, resetBtn);
    header.append(controls);

    const opponents = el('section', 'opponents');
    for (const p of others) opponents.append(playerPanel(p));

    const status = text('p', `status p${ui.game.turn}`, statusLine());

    const main = el('main', '');
    main.append(header, opponents, boardView(), status, playerPanel(v));
    const ov = overlay();
    if (ov) main.append(ov);
    root.replaceChildren(main);
  }

  render();
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function text(tag: string, className: string, content: string): HTMLElement {
  const node = el(tag, className);
  node.textContent = content;
  return node;
}
