'use strict';
const assert = require('node:assert/strict');
const E = require('../engine.js');

function fromFen(fen) {
  const parts = fen.split(' ');
  const board = new Array(64).fill(null);
  let i = 0;
  for (const ch of parts[0]) {
    if (ch === '/') continue;
    if (/\d/.test(ch)) { i += Number(ch); continue; }
    const color = ch === ch.toUpperCase() ? 'w' : 'b';
    board[i] = { t: ch.toLowerCase(), c: color, id: `t${i}` };
    i++;
  }
  const cast = parts[2] || '-';
  const epSquare = parts[3] && parts[3] !== '-' ? 'abcdefgh'.indexOf(parts[3][0]) + (8 - Number(parts[3][1])) * 8 : -1;
  return {
    board,
    turn: parts[1] || 'w',
    castling: {
      wK: cast.includes('K'), wQ: cast.includes('Q'),
      bK: cast.includes('k'), bQ: cast.includes('q')
    },
    ep: epSquare,
    half: Number(parts[4] || 0),
    full: Number(parts[5] || 1),
    lastMove: null
  };
}

const PERFT = [
  ['startpos', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['pos3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['pos4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]]
];

let checks = 0;
for (const [name, fen, expected] of PERFT) {
  for (let d = 1; d <= expected.length; d++) {
    const state = fromFen(fen);
    const t0 = Date.now();
    const got = E.perft(state, d);
    assert.equal(got, expected[d - 1], `${name} perft ${d}: expected ${expected[d - 1]}, got ${got}`);
    checks++;
    console.log(`ok  ${name} perft(${d}) = ${got}  (${Date.now() - t0}ms)`);
  }
}

// --- Rules -------------------------------------------------------------

// Castling may not pass through an attacked square.
{
  const s = fromFen('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1');
  const moves = E.legalMoves(s);
  assert.ok(!moves.some(m => m.castle === 'k'), 'kingside castle through f1 attacked by rook');
  assert.ok(moves.some(m => m.castle === 'q'), 'queenside castle should be legal');
  checks++;
}

// En passant that exposes the king is illegal.
{
  const s = fromFen('8/8/8/8/k2pP2R/8/8/4K3 b - e3 0 1');
  const moves = E.legalMoves(s);
  assert.ok(!moves.some(m => m.ep), 'en passant cannot expose own king');
  checks++;
}

// En passant removes the correct pawn.
{
  const s = fromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const m = E.legalMoves(s).find(m => m.ep);
  assert.ok(m, 'ep move exists');
  assert.equal(E.captureSquareOf(s, m), 27, 'captured pawn square is d5');
  E.makeMove(s, m);
  assert.equal(s.board[27], null, 'd5 pawn removed');
  assert.equal(s.board[19].t, 'p', 'white pawn landed on d6');
  checks++;
}

// Promotion generates four choices, makeMove replaces the pawn.
{
  const s = fromFen('8/P7/8/8/8/8/8/k6K w - - 0 1');
  const promos = E.legalMoves(s).filter(m => m.promo);
  assert.deepEqual(promos.map(m => m.promo).sort(), ['b', 'n', 'q', 'r']);
  const q = promos.find(m => m.promo === 'q');
  E.makeMove(s, q);
  assert.equal(s.board[0].t, 'q');
  assert.equal(s.board[8], null);
  checks++;
}

// Checkmate detection (fool's mate).
{
  const s = fromFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  const st = E.getStatus(s);
  assert.equal(st.type, 'checkmate');
  assert.equal(st.winner, 'b');
  checks++;
}

// Stalemate detection.
{
  const s = fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(E.getStatus(s).type, 'stalemate');
  checks++;
}

// Insufficient material.
{
  const s = fromFen('8/8/8/4k3/8/8/8/4K2B w - - 0 1');
  assert.equal(E.getStatus(s).type, 'draw');
  checks++;
}

// SAN: castling, capture, ambiguity and promotion.
{
  let s = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const castle = E.legalMoves(s).find(m => m.castle === 'k');
  assert.equal(E.toSan(s, castle), 'O-O');
  checks++;

  s = fromFen('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  const push = E.legalMoves(s).find(m => m.to === 36);
  assert.equal(E.toSan(s, push), 'e4');
  checks++;

  s = fromFen('k7/8/8/7Q/8/8/8/3QK3 w - - 0 1');
  const q = E.legalMoves(s).find(m => m.from === 59 && m.to === 27);
  assert.equal(E.toSan(s, q), 'Qdd5+', 'queen san disambiguates by file');
  checks++;
}

// Bot returns a legal move and can find mate in one.
{
  const s = fromFen('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1');
  const move = E.findBestMove(s, { depth: 3, timeMs: 1500 });
  assert.ok(E.legalMoves(s).some(m => m.from === move.from && m.to === move.to && m.promo === move.promo));
  const u = E.makeMove(s, move);
  assert.equal(E.getStatus(s).type, 'checkmate', 'bot should play Re8#');
  E.unmakeMove(s, u);
  checks++;
}

// Search never mutates the position.
{
  const s = E.initialState();
  const fenBefore = s.board.map(p => p ? p.c + p.t : '-').join('');
  E.findBestMove(s, { depth: 3, timeMs: 900 });
  assert.equal(s.board.map(p => p ? p.c + p.t : '-').join(''), fenBefore);
  assert.equal(s.turn, 'w');
  checks++;
}

console.log(`\nAll ${checks} assertions passed.`);
