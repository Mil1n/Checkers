const assert = require('assert');
const {
  BLACK,
  WHITE,
  applyMove,
  bestMoves,
  boardToFen,
  createEmptyBoard,
  dangerReport,
  fenToBoard,
  initialBoard,
  legalMoves,
  notation,
  trainingPosition,
} = require('../src/checkers');

const board = initialBoard();
assert.strictEqual(board.flat().filter(Boolean).length, 24, 'initial position has 24 pieces');
assert(legalMoves(board, WHITE).length > 0, 'white has legal moves');

const quietMove = legalMoves(board, WHITE)[0];
const afterQuietMove = applyMove(board, quietMove);
assert.strictEqual(afterQuietMove.flat().filter(Boolean).length, 24, 'quiet move keeps material');
assert(bestMoves(afterQuietMove, BLACK, 2).length > 0, 'bot finds candidate moves');
assert(/^[a-h][1-8][-x][a-h][1-8]$/.test(notation(quietMove)), 'notation is readable');

const captureBoard = createEmptyBoard();
captureBoard[5][0] = { color: WHITE, king: false };
captureBoard[4][1] = { color: BLACK, king: false };
assert.strictEqual(legalMoves(captureBoard, WHITE)[0].captures.length, 1, 'captures are mandatory');

const maxCaptureBoard = createEmptyBoard();
maxCaptureBoard[5][0] = { color: WHITE, king: false };
maxCaptureBoard[4][1] = { color: BLACK, king: false };
maxCaptureBoard[2][3] = { color: BLACK, king: false };
maxCaptureBoard[4][5] = { color: WHITE, king: false };
maxCaptureBoard[3][6] = { color: BLACK, king: false };
assert(legalMoves(maxCaptureBoard, WHITE).every((move) => move.captures.length === 2), 'maximum capture is enforced');

const fen = boardToFen(board, WHITE);
const imported = fenToBoard(fen);
assert.strictEqual(imported.turn, WHITE, 'FEN keeps side to move');
assert.strictEqual(imported.board.flat().filter(Boolean).length, 24, 'FEN restores material');

const training = trainingPosition();
assert.strictEqual(training.turn, WHITE, 'training position starts with white');
assert(dangerReport(board, WHITE, quietMove) === null || typeof dangerReport(board, WHITE, quietMove) === 'string', 'danger report is nullable text');

console.log('checkers engine tests passed');
