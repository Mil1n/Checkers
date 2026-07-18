const state = {
  board: initialBoard(),
  turn: WHITE,
  selected: null,
  history: [],
  flipped: false,
  editor: false,
  roomId: null,
};

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const analysisEl = document.getElementById('analysis');
const blunderGuardEl = document.getElementById('blunderGuard');
const playerProfileEl = document.getElementById('playerProfile');
const pdnEl = document.getElementById('pdn');
const featureOutputEl = document.getElementById('featureOutput');
let pendingMove = null;
let worker;

function getWorker() {
  if (!window.Worker) return null;
  worker ??= new Worker('src/engine.worker.js');
  return worker;
}

function render() {
  boardEl.innerHTML = '';
  const rows = [...Array(SIZE).keys()];
  const cols = [...Array(SIZE).keys()];
  if (state.flipped) {
    rows.reverse();
    cols.reverse();
  }

  const legalTargets = state.selected
    ? legalMoves(state.board, state.turn).filter((move) => sameSquare(move.from, state.selected))
    : [];

  for (const row of rows) {
    for (const col of cols) {
      const cell = document.createElement('button');
      cell.className = `cell ${isPlayable(row, col) ? 'dark' : 'light'}`;
      cell.dataset.row = row;
      cell.dataset.col = col;

      const target = legalTargets.find((move) => sameSquare(move.to, [row, col]));
      if (target) cell.classList.add('target');
      if (state.selected && sameSquare(state.selected, [row, col])) cell.classList.add('selected');

      const piece = state.board[row][col];
      if (piece) cell.append(renderPiece(piece));
      cell.addEventListener('click', () => handleCellClick(row, col));
      boardEl.append(cell);
    }
  }

  const moves = legalMoves(state.board, state.turn);
  statusEl.textContent = moves.length
    ? `Ход: ${state.turn === WHITE ? 'белые (вы)' : 'черные (бот)'}. ${state.editor ? 'Режим редактора включён.' : 'Обязательные и максимальные взятия учитываются.'}`
    : `Партия завершена: ${state.turn === WHITE ? 'у белых' : 'у черных'} нет ходов.`;
  playerProfileEl.textContent = classifyPlayer(state.history);
}

function renderPiece(piece) {
  const element = document.createElement('span');
  element.className = `piece ${piece.color === WHITE ? 'white' : 'black'} ${piece.king ? 'king' : ''}`;
  element.textContent = piece.king ? '♛' : '';
  return element;
}

function handleCellClick(row, col) {
  if (state.editor) {
    cycleEditorPiece(row, col);
    return;
  }
  if (state.turn !== WHITE) return;

  const piece = state.board[row][col];
  if (piece?.color === WHITE) {
    state.selected = [row, col];
    updateBlunderGuard();
    render();
    return;
  }

  if (!state.selected) return;
  const move = legalMoves(state.board, WHITE).find((candidate) => sameSquare(candidate.from, state.selected) && sameSquare(candidate.to, [row, col]));
  if (move) {
    const warning = dangerReport(state.board, WHITE, move);
    const confirmsPending = pendingMove && sameSquare(pendingMove.from, move.from) && sameSquare(pendingMove.to, move.to);
    if (warning && !confirmsPending) {
      pendingMove = move;
      blunderGuardEl.textContent = `${warning} Нажмите этот ход ещё раз, чтобы подтвердить.`;
    } else {
      playMove(move, true);
    }
  }
  state.selected = null;
  render();
}

function cycleEditorPiece(row, col) {
  const piece = state.board[row][col];
  if (!piece) state.board[row][col] = { color: WHITE, king: false };
  else if (piece.color === WHITE && !piece.king) state.board[row][col] = { color: WHITE, king: true };
  else if (piece.color === WHITE) state.board[row][col] = { color: BLACK, king: false };
  else if (!piece.king) state.board[row][col] = { color: BLACK, king: true };
  else state.board[row][col] = null;
  pdnEl.value = boardToFen(state.board, state.turn);
  render();
}

function playMove(move, botAfter) {
  pendingMove = null;
  state.history.push({ board: cloneBoard(state.board), turn: state.turn, move, color: state.turn });
  state.board = applyMove(state.board, move);
  state.turn = opponent(state.turn);
  explainMove(move);
  render();
  if (botAfter && state.turn === BLACK) setTimeout(botMove, 220);
}

function botMove() {
  const workerInstance = getWorker();
  if (!workerInstance) {
    const best = bestMoves(state.board, BLACK, 5)[0];
    if (best) playMove(best, false);
    return;
  }
  workerInstance.onmessage = (event) => {
    const [best] = event.data.moves;
    if (best) playMove(best, false);
  };
  workerInstance.postMessage({ board: state.board, color: BLACK, depth: 5 });
}

function explainMove(lastMove) {
  const candidates = bestMoves(state.board, state.turn, 4);
  const evalForWhite = evaluate(state.board, WHITE);
  analysisEl.innerHTML = `
    <p>📍 <b>Оценка позиции:</b> ${formatScore(evalForWhite)} для белых</p>
    <p>🏆 <b>Последний ход:</b> ${notation(lastMove)}</p>
    <p>📖 <b>Почему:</b> ${lastMove.captures.length ? 'ход выигрывает материал и сохраняет инициативу' : 'ход улучшает темп, центр и безопасность фигур'}.</p>
    <p>⚠️ <b>Ответ соперника:</b> ${candidates[0] ? `главная угроза — ${notation(candidates[0])}` : 'легальных ответов нет'}.</p>
    <p>🎯 <b>План:</b> ограничить контригру, провести активную шашку в дамки и упрощать только при выгодной оценке.</p>
    <ol>${candidates.map((move) => `<li>${notation(move)} — ${formatScore(move.score)}</li>`).join('') || '<li>Нет легальных ходов</li>'}</ol>
  `;
  exportPdn();
}

function updateBlunderGuard() {
  if (!state.selected) return;
  const [candidate] = legalMoves(state.board, WHITE).filter((move) => sameSquare(move.from, state.selected));
  blunderGuardEl.textContent = candidate ? dangerReport(state.board, WHITE, candidate) || 'Выбранная шашка не даёт очевидного тактического зевка.' : 'У выбранной шашки нет легальных ходов.';
}

function showHint() {
  const candidates = bestMoves(state.board, state.turn, 5);
  analysisEl.innerHTML = `
    <p>📍 <b>Оценка:</b> ${formatScore(evaluate(state.board, WHITE))} для белых</p>
    <p>🏆 <b>Лучший ход:</b> ${candidates[0] ? notation(candidates[0]) : 'нет ходов'}</p>
    <p>📖 <b>Почему:</b> поиск учитывает материал, дамок, продвижение, центр, максимальное взятие и контрудары.</p>
    <p>♟ <b>Топ-3:</b></p>
    <ol>${candidates.map((move) => `<li>${notation(move)} — ${formatScore(move.score)}</li>`).join('') || '<li>Нет кандидатов</li>'}</ol>
  `;
}

function exportPdn() {
  const moves = state.history.map((entry, index) => moveToPdn(entry.move, Math.floor(index / 2) + 1, entry.color));
  pdnEl.value = `${moves.join(' ')}\n\nFEN ${boardToFen(state.board, state.turn)}`.trim();
}

function importFen() {
  const fenLine = pdnEl.value.split('\n').find((line) => line.trim().startsWith('FEN')) || pdnEl.value;
  const fen = fenLine.replace(/^FEN\s*/i, '').trim();
  const imported = fenToBoard(fen);
  state.board = imported.board;
  state.turn = imported.turn;
  state.selected = null;
  state.history = [];
  analysisEl.textContent = 'Позиция импортирована. Нажмите «Анализ позиции», чтобы получить план.';
  render();
}

function startTraining() {
  const position = trainingPosition();
  state.board = position.board;
  state.turn = position.turn;
  state.selected = null;
  state.history = [];
  analysisEl.textContent = position.goal;
  render();
}


function showCoachReport() {
  const report = coachReport(state.history, state.board, WHITE);
  featureOutputEl.innerHTML = `<b>${report.title}</b><p>${report.summary}</p><p>✨ Ключевой момент: ${report.bestMoment}</p><p>🎯 Совет: ${report.advice}</p>`;
}

function showOpeningBook() {
  featureOutputEl.innerHTML = `<b>📚 Дебютный навигатор</b><p>${openingHint(state.history)}</p>`;
}

function showGeneratedPuzzle() {
  const puzzle = generatePuzzle(state.board, state.turn);
  featureOutputEl.innerHTML = `<b>🧩 Персональная задача</b><p>${puzzle.prompt}</p><p>Ответ тренера: ${puzzle.answer || 'нет'} ${puzzle.score !== undefined ? `(${formatScore(puzzle.score)})` : ''}</p>`;
}

function saveCurrentPosition() {
  const saved = JSON.parse(localStorage.getItem('checkers-lab') || '[]');
  saved.push({ createdAt: new Date().toISOString(), fen: boardToFen(state.board, state.turn) });
  localStorage.setItem('checkers-lab', JSON.stringify(saved.slice(-12)));
  featureOutputEl.innerHTML = `<b>🧪 Лаборатория позиций</b><p>Позиция сохранена. В лаборатории хранится ${Math.min(saved.length, 12)} последних позиций.</p>`;
}

function showReplay() {
  const frames = replayFrames(state.history);
  featureOutputEl.innerHTML = `<b>🎥 Кино партии</b>${frames.length ? `<ol>${frames.map((frame) => `<li>${frame.notation} — ${frame.caption}</li>`).join('')}</ol>` : '<p>Сначала сделайте несколько ходов.</p>'}`;
}

function showSeasonChallenge() {
  const challenges = [
    'Не сделай ни одного зевка 10 ходов подряд.',
    'Найди 3 позиции, где лучший ход — взятие.',
    'Выиграй тренировочную позицию без потери шашки.',
    'Проведи шашку в дамки и сохрани её 5 ходов.',
  ];
  const challenge = challenges[state.history.length % challenges.length];
  featureOutputEl.innerHTML = `<b>🏆 Сезонный челлендж</b><p>${challenge}</p>`;
}

function sameSquare(left, right) {
  return left[0] === right[0] && left[1] === right[1];
}

function formatScore(score) {
  return `${score > 0 ? '+' : ''}${score}`;
}

document.getElementById('hint').addEventListener('click', showHint);
document.getElementById('undo').addEventListener('click', () => {
  const previous = state.history.pop();
  if (!previous) return;
  state.board = previous.board;
  state.turn = previous.turn;
  render();
  exportPdn();
});
document.getElementById('flip').addEventListener('click', () => {
  state.flipped = !state.flipped;
  render();
});
document.getElementById('editor').addEventListener('click', () => {
  state.editor = !state.editor;
  analysisEl.textContent = state.editor ? 'Редактор включён: кликайте по клеткам, чтобы менять фигуры.' : 'Редактор выключен.';
  render();
});
document.getElementById('newBot').addEventListener('click', () => {
  state.board = initialBoard();
  state.turn = WHITE;
  state.history = [];
  state.selected = null;
  analysisEl.textContent = 'Новая партия против бота готова.';
  render();
  exportPdn();
});
document.getElementById('training').addEventListener('click', startTraining);
document.getElementById('copyRoom').addEventListener('click', () => {
  state.roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
  const url = `${location.href.split('#')[0]}#room-${state.roomId}`;
  document.getElementById('room').textContent = `Комната ${state.roomId}: ${url}`;
  navigator.clipboard?.writeText(url);
});
document.getElementById('exportPdn').addEventListener('click', exportPdn);
document.getElementById('importFen').addEventListener('click', importFen);
document.getElementById('photoInput').addEventListener('change', () => {
  analysisEl.textContent = 'Фото принято. Следующий этап — подключить CV-распознавание клеток и проверку неоднозначных фигур.';
});
document.getElementById('coachReport').addEventListener('click', showCoachReport);
document.getElementById('openingBook').addEventListener('click', showOpeningBook);
document.getElementById('makePuzzle').addEventListener('click', showGeneratedPuzzle);
document.getElementById('savePosition').addEventListener('click', saveCurrentPosition);
document.getElementById('replay').addEventListener('click', showReplay);
document.getElementById('season').addEventListener('click', showSeasonChallenge);

render();
exportPdn();
