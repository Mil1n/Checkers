importScripts('checkers.js');

self.onmessage = (event) => {
  const { board, color, depth } = event.data;
  self.postMessage({ moves: bestMoves(board, color, depth) });
};
