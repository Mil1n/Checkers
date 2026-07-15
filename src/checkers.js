const SIZE = 8;
const WHITE = 'w';
const BLACK = 'b';
const DRAW = 'draw';
const DIRECTIONS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const MEN_DIRECTIONS = {
  [WHITE]: [[-1, 1], [-1, -1]],
  [BLACK]: [[1, 1], [1, -1]],
};

function createEmptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function initialBoard() {
  const board = createEmptyBoard();
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (isPlayable(row, col)) board[row][col] = { color: BLACK, king: false };
    }
  }
  for (let row = 5; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (isPlayable(row, col)) board[row][col] = { color: WHITE, king: false };
    }
  }
  return board;
}

function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

function isPlayable(row, col) {
  return (row + col) % 2 === 1;
}

function inside(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function opponent(color) {
  return color === WHITE ? BLACK : WHITE;
}

function isEnemy(piece, target) {
  return Boolean(piece && target && piece.color !== target.color);
}

function squareName(row, col) {
  return `${String.fromCharCode(97 + col)}${8 - row}`;
}

function parseSquare(square) {
  const col = square.toLowerCase().charCodeAt(0) - 97;
  const row = 8 - Number(square[1]);
  return inside(row, col) ? [row, col] : null;
}

function simpleMoves(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];

  const moves = [];
  const directions = piece.king ? DIRECTIONS : MEN_DIRECTIONS[piece.color];
  for (const [rowStep, colStep] of directions) {
    let nextRow = row + rowStep;
    let nextCol = col + colStep;
    while (inside(nextRow, nextCol) && !board[nextRow][nextCol]) {
      moves.push({ from: [row, col], to: [nextRow, nextCol], captures: [] });
      if (!piece.king) break;
      nextRow += rowStep;
      nextCol += colStep;
    }
  }
  return moves;
}

function capturesFrom(board, row, col, path = [], captured = new Set(), origin = [row, col]) {
  const piece = board[row][col];
  if (!piece) return [];

  const moves = [];
  for (const [rowStep, colStep] of DIRECTIONS) {
    let victimRow = row + rowStep;
    let victimCol = col + colStep;

    while (piece.king && inside(victimRow, victimCol) && !board[victimRow][victimCol]) {
      victimRow += rowStep;
      victimCol += colStep;
    }

    const victimKey = `${victimRow},${victimCol}`;
    if (!inside(victimRow, victimCol) || !isEnemy(piece, board[victimRow][victimCol]) || captured.has(victimKey)) {
      continue;
    }

    let landingRow = victimRow + rowStep;
    let landingCol = victimCol + colStep;
    while (inside(landingRow, landingCol) && !board[landingRow][landingCol]) {
      const nextBoard = cloneBoard(board);
      nextBoard[row][col] = null;
      nextBoard[victimRow][victimCol] = null;
      nextBoard[landingRow][landingCol] = { ...piece };

      const nextPath = [...path, [victimRow, victimCol]];
      const nextCaptured = new Set([...captured, victimKey]);
      const continuations = capturesFrom(nextBoard, landingRow, landingCol, nextPath, nextCaptured, origin);
      if (continuations.length) {
        moves.push(...continuations);
      } else {
        moves.push({ from: origin, to: [landingRow, landingCol], captures: nextPath });
      }

      if (!piece.king) break;
      landingRow += rowStep;
      landingCol += colStep;
    }
  }
  return moves;
}

function legalMoves(board, color) {
  const captures = [];
  const quietMoves = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row][col]?.color !== color) continue;
      captures.push(...capturesFrom(board, row, col));
      quietMoves.push(...simpleMoves(board, row, col));
    }
  }

  if (!captures.length) return quietMoves;
  const maxCaptures = Math.max(...captures.map((move) => move.captures.length));
  return captures.filter((move) => move.captures.length === maxCaptures);
}

function applyMove(board, move) {
  const nextBoard = cloneBoard(board);
  const piece = nextBoard[move.from[0]][move.from[1]];
  nextBoard[move.from[0]][move.from[1]] = null;
  for (const [row, col] of move.captures) nextBoard[row][col] = null;
  if ((piece.color === WHITE && move.to[0] === 0) || (piece.color === BLACK && move.to[0] === 7)) {
    piece.king = true;
  }
  nextBoard[move.to[0]][move.to[1]] = piece;
  return nextBoard;
}

function evaluate(board, color) {
  let score = 0;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const piece = board[row][col];
      if (!piece) continue;
      const advance = piece.color === WHITE ? 7 - row : row;
      const center = col > 1 && col < 6 && row > 1 && row < 6 ? 0.12 : 0;
      const value = (piece.king ? 5 : 1) + advance * 0.08 + center;
      score += piece.color === color ? value : -value;
    }
  }
  return Number(score.toFixed(2));
}

function bestMoves(board, color, depth = 4) {
  function search(position, side, currentDepth, alpha = -Infinity, beta = Infinity) {
    const moves = legalMoves(position, side);
    if (!currentDepth || !moves.length) return evaluate(position, color);

    if (side === color) {
      let value = -Infinity;
      for (const move of moves) {
        value = Math.max(value, search(applyMove(position, move), opponent(side), currentDepth - 1, alpha, beta));
        alpha = Math.max(alpha, value);
        if (beta <= alpha) break;
      }
      return value;
    }

    let value = Infinity;
    for (const move of moves) {
      value = Math.min(value, search(applyMove(position, move), opponent(side), currentDepth - 1, alpha, beta));
      beta = Math.min(beta, value);
      if (beta <= alpha) break;
    }
    return value;
  }

  return legalMoves(board, color)
    .map((move) => ({ ...move, score: search(applyMove(board, move), opponent(color), depth - 1) }))
    .sort((left, right) => right.score - left.score || right.captures.length - left.captures.length)
    .slice(0, 3);
}

function notation(move) {
  return `${squareName(...move.from)}${move.captures.length ? 'x' : '-'}${squareName(...move.to)}`;
}

function moveToPdn(move, index, color) {
  const prefix = color === WHITE ? `${index}. ` : '';
  return `${prefix}${notation(move)}`;
}

function boardToFen(board, turn = WHITE) {
  const parts = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const piece = board[row][col];
      if (!piece) continue;
      parts.push(`${piece.color}${piece.king ? 'K' : 'M'}${squareName(row, col)}`);
    }
  }
  return `${turn}:${parts.join(',')}`;
}

function fenToBoard(fen) {
  const [turn = WHITE, pieces = ''] = fen.split(':');
  const board = createEmptyBoard();
  for (const token of pieces.split(',').filter(Boolean)) {
    const color = token[0];
    const king = token[1] === 'K';
    const square = parseSquare(token.slice(2));
    if (square) board[square[0]][square[1]] = { color, king };
  }
  return { board, turn: turn === BLACK ? BLACK : WHITE };
}

function classifyPlayer(history) {
  if (!history.length) return 'Новичок-исследователь';
  const captures = history.filter((entry) => entry.move.captures.length).length;
  const captureRate = captures / history.length;
  if (captureRate > 0.45) return 'Тактик: часто ищет форсированные размены и удары';
  if (history.length > 24) return 'Эндшпилист: уверенно доводит длинные партии';
  return 'Позиционщик: предпочитает темп, центр и безопасное развитие';
}

function dangerReport(board, color, candidateMove) {
  const afterMove = applyMove(board, candidateMove);
  const replies = bestMoves(afterMove, opponent(color), 3);
  const tacticalReply = replies.find((reply) => reply.captures.length > 0 || reply.score > 1.4);
  if (!tacticalReply) return null;
  return `Внимание: после ${notation(candidateMove)} соперник может ответить ${notation(tacticalReply)} с оценкой ${tacticalReply.score}.`;
}

function trainingPosition() {
  const board = createEmptyBoard();
  board[5][0] = { color: WHITE, king: false };
  board[5][2] = { color: WHITE, king: false };
  board[4][3] = { color: BLACK, king: false };
  board[2][5] = { color: BLACK, king: false };
  board[1][6] = { color: BLACK, king: true };
  return { board, turn: WHITE, goal: 'Спасти позицию: найди ход, который не отдаёт немедленную дамку и создаёт встречные угрозы.' };
}

if (typeof module !== 'undefined') {
  module.exports = {
    BLACK,
    DRAW,
    SIZE,
    WHITE,
    applyMove,
    bestMoves,
    boardToFen,
    capturesFrom,
    classifyPlayer,
    cloneBoard,
    createEmptyBoard,
    dangerReport,
    evaluate,
    fenToBoard,
    initialBoard,
    isPlayable,
    legalMoves,
    moveToPdn,
    notation,
    opponent,
    parseSquare,
    squareName,
    trainingPosition,
  };
}
