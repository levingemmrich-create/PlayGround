/*
 * Bloodchess engine — complete chess rules, evaluation and a small alpha-beta bot.
 * No DOM dependencies: usable from the browser and from Node tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChessEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WHITE = 'w';
  var BLACK = 'b';
  var MATE = 100000;

  var DIRS = {
    rook: [[-1, 0], [1, 0], [0, -1], [0, 1]],
    bishop: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    knight: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
    king: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
  };

  var VALUES = { p: 100, n: 320, b: 335, r: 500, q: 950, k: 0 };

  // Piece-square tables, indexed from a8 (0) to h1 (63) — white's point of view.
  var PST = {
    p: [
      0, 0, 0, 0, 0, 0, 0, 0,
      60, 60, 60, 60, 60, 60, 60, 60,
      12, 16, 24, 34, 34, 24, 16, 12,
      4, 6, 12, 24, 24, 10, 6, 4,
      0, 0, 4, 18, 18, 4, 0, 0,
      4, -6, -10, 0, 0, -10, -6, 4,
      4, 10, 10, -18, -18, 10, 10, 4,
      0, 0, 0, 0, 0, 0, 0, 0
    ],
    n: [
      -60, -40, -30, -30, -30, -30, -40, -60,
      -40, -20, 0, 0, 0, 0, -20, -40,
      -30, 0, 12, 16, 16, 12, 0, -30,
      -30, 6, 16, 20, 20, 16, 6, -30,
      -30, 0, 16, 20, 20, 16, 0, -30,
      -30, 4, 12, 16, 16, 12, 4, -30,
      -40, -20, 0, 4, 4, 0, -20, -40,
      -60, -40, -30, -30, -30, -30, -40, -60
    ],
    b: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 6, 12, 12, 6, 0, -10,
      -10, 6, 6, 12, 12, 6, 6, -10,
      -10, 0, 12, 12, 12, 12, 0, -10,
      -10, 12, 12, 12, 12, 12, 12, -10,
      -10, 6, 0, 0, 0, 0, 6, -10,
      -20, -10, -14, -10, -10, -14, -10, -20
    ],
    r: [
      0, 0, 0, 4, 4, 0, 0, 0,
      8, 12, 12, 12, 12, 12, 12, 8,
      -4, 0, 0, 0, 0, 0, 0, -4,
      -4, 0, 0, 0, 0, 0, 0, -4,
      -4, 0, 0, 0, 0, 0, 0, -4,
      -4, 0, 0, 0, 0, 0, 0, -4,
      -4, 0, 0, 0, 0, 0, 0, -4,
      0, 0, 0, 6, 6, 0, 0, 0
    ],
    q: [
      -20, -10, -10, -4, -4, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 4, 4, 4, 4, 0, -10,
      -4, 0, 4, 4, 4, 4, 0, -4,
      0, 0, 4, 4, 4, 4, 0, -4,
      -10, 4, 4, 4, 4, 4, 0, -10,
      -10, 0, 4, 0, 0, 0, 0, -10,
      -20, -10, -10, -4, -4, -10, -10, -20
    ],
    k: [
      -40, -50, -50, -60, -60, -50, -50, -40,
      -40, -50, -50, -60, -60, -50, -50, -40,
      -40, -50, -50, -60, -60, -50, -50, -40,
      -40, -50, -50, -60, -60, -50, -50, -40,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      10, 10, -10, -20, -20, -10, 10, 10,
      20, 40, 10, -10, -10, 10, 40, 20
    ],
    kEnd: [
      -50, -40, -30, -20, -20, -30, -40, -50,
      -30, -20, -10, 0, 0, -10, -20, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -30, 0, 0, 0, 0, -30, -30,
      -50, -30, -30, -30, -30, -30, -30, -50
    ]
  };

  var idSeq = 1;
  function nextId() { return 'p' + (idSeq++); }

  function idx(r, c) { return r * 8 + c; }
  function rowOf(i) { return i >> 3; }
  function colOf(i) { return i & 7; }
  function inBoard(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function other(color) { return color === WHITE ? BLACK : WHITE; }
  function fileChar(c) { return 'abcdefgh'[c]; }
  function squareName(i) { return fileChar(colOf(i)) + (8 - rowOf(i)); }

  var BACK_RANK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

  function initialState() {
    var board = new Array(64).fill(null);
    for (var c = 0; c < 8; c++) {
      board[idx(0, c)] = { t: BACK_RANK[c], c: BLACK, id: nextId() };
      board[idx(1, c)] = { t: 'p', c: BLACK, id: nextId() };
      board[idx(6, c)] = { t: 'p', c: WHITE, id: nextId() };
      board[idx(7, c)] = { t: BACK_RANK[c], c: WHITE, id: nextId() };
    }
    return {
      board: board,
      turn: WHITE,
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      ep: -1,
      half: 0,
      full: 1,
      lastMove: null
    };
  }

  function cloneState(s) {
    return {
      board: s.board.slice(),
      turn: s.turn,
      castling: { wK: s.castling.wK, wQ: s.castling.wQ, bK: s.castling.bK, bQ: s.castling.bQ },
      ep: s.ep,
      half: s.half,
      full: s.full,
      lastMove: s.lastMove
    };
  }

  function findKing(board, color) {
    for (var i = 0; i < 64; i++) {
      var p = board[i];
      if (p && p.t === 'k' && p.c === color) return i;
    }
    return -1;
  }

  function isAttacked(board, sq, by) {
    var r = rowOf(sq), c = colOf(sq);
    var i, rr, cc, p, d;

    // Pawns: a white pawn attacks upward, so it must sit one rank below the target.
    var pr = r + (by === WHITE ? 1 : -1);
    for (d = -1; d <= 1; d += 2) {
      cc = c + d;
      if (inBoard(pr, cc)) {
        p = board[idx(pr, cc)];
        if (p && p.c === by && p.t === 'p') return true;
      }
    }

    var kn = DIRS.knight;
    for (i = 0; i < kn.length; i++) {
      rr = r + kn[i][0]; cc = c + kn[i][1];
      if (inBoard(rr, cc)) {
        p = board[idx(rr, cc)];
        if (p && p.c === by && p.t === 'n') return true;
      }
    }

    var kg = DIRS.king;
    for (i = 0; i < kg.length; i++) {
      rr = r + kg[i][0]; cc = c + kg[i][1];
      if (inBoard(rr, cc)) {
        p = board[idx(rr, cc)];
        if (p && p.c === by && p.t === 'k') return true;
      }
    }

    var rd = DIRS.rook;
    for (i = 0; i < rd.length; i++) {
      rr = r + rd[i][0]; cc = c + rd[i][1];
      while (inBoard(rr, cc)) {
        p = board[idx(rr, cc)];
        if (p) {
          if (p.c === by && (p.t === 'r' || p.t === 'q')) return true;
          break;
        }
        rr += rd[i][0]; cc += rd[i][1];
      }
    }

    var bd = DIRS.bishop;
    for (i = 0; i < bd.length; i++) {
      rr = r + bd[i][0]; cc = c + bd[i][1];
      while (inBoard(rr, cc)) {
        p = board[idx(rr, cc)];
        if (p) {
          if (p.c === by && (p.t === 'b' || p.t === 'q')) return true;
          break;
        }
        rr += bd[i][0]; cc += bd[i][1];
      }
    }

    return false;
  }

  function inCheck(state, color) {
    color = color || state.turn;
    var k = findKing(state.board, color);
    if (k < 0) return false;
    return isAttacked(state.board, k, other(color));
  }

  function pushPawnMove(moves, from, to, promoRank, rowTo) {
    if (rowTo === promoRank) {
      moves.push({ from: from, to: to, promo: 'q' });
      moves.push({ from: from, to: to, promo: 'r' });
      moves.push({ from: from, to: to, promo: 'b' });
      moves.push({ from: from, to: to, promo: 'n' });
    } else {
      moves.push({ from: from, to: to });
    }
  }

  function pseudoMoves(state) {
    var board = state.board;
    var color = state.turn;
    var moves = [];

    for (var from = 0; from < 64; from++) {
      var p = board[from];
      if (!p || p.c !== color) continue;
      var r = rowOf(from), c = colOf(from);

      if (p.t === 'p') {
        var dir = color === WHITE ? -1 : 1;
        var startRank = color === WHITE ? 6 : 1;
        var promoRank = color === WHITE ? 0 : 7;
        var r1 = r + dir;

        if (inBoard(r1, c) && !board[idx(r1, c)]) {
          pushPawnMove(moves, from, idx(r1, c), promoRank, r1);
          if (r === startRank && !board[idx(r + 2 * dir, c)]) {
            moves.push({ from: from, to: idx(r + 2 * dir, c), double: true });
          }
        }

        for (var dc = -1; dc <= 1; dc += 2) {
          var cc = c + dc;
          if (!inBoard(r1, cc)) continue;
          var to = idx(r1, cc);
          var tp = board[to];
          if (tp && tp.c !== color) {
            pushPawnMove(moves, from, to, promoRank, r1);
          } else if (!tp && state.ep === to) {
            moves.push({ from: from, to: to, ep: true });
          }
        }
        continue;
      }

      if (p.t === 'n' || p.t === 'k') {
        var deltas = p.t === 'n' ? DIRS.knight : DIRS.king;
        for (var i = 0; i < deltas.length; i++) {
          var rr = r + deltas[i][0], c2 = c + deltas[i][1];
          if (!inBoard(rr, c2)) continue;
          var t2 = board[idx(rr, c2)];
          if (!t2 || t2.c !== color) moves.push({ from: from, to: idx(rr, c2) });
        }
        if (p.t === 'k') addCastles(state, moves, from, color);
        continue;
      }

      var dirs = p.t === 'r' ? DIRS.rook : p.t === 'b' ? DIRS.bishop : DIRS.rook.concat(DIRS.bishop);
      for (var j = 0; j < dirs.length; j++) {
        var dr2 = dirs[j][0], dc2 = dirs[j][1];
        var rr2 = r + dr2, cc2 = c + dc2;
        while (inBoard(rr2, cc2)) {
          var toIdx = idx(rr2, cc2);
          var tp2 = board[toIdx];
          if (!tp2) {
            moves.push({ from: from, to: toIdx });
          } else {
            if (tp2.c !== color) moves.push({ from: from, to: toIdx });
            break;
          }
          rr2 += dr2; cc2 += dc2;
        }
      }
    }
    return moves;
  }

  function addCastles(state, moves, from, color) {
    var board = state.board;
    var rights = state.castling;
    var home = color === WHITE ? 60 : 4;
    if (from !== home) return;
    var kingRight = color === WHITE ? rights.wK : rights.bK;
    var queenRight = color === WHITE ? rights.wQ : rights.bQ;
    var enemy = other(color);

    if (kingRight) {
      if (!board[from + 1] && !board[from + 2] && board[from + 3] && board[from + 3].t === 'r' && board[from + 3].c === color) {
        if (!isAttacked(board, from, enemy) && !isAttacked(board, from + 1, enemy) && !isAttacked(board, from + 2, enemy)) {
          moves.push({ from: from, to: from + 2, castle: 'k' });
        }
      }
    }
    if (queenRight) {
      if (!board[from - 1] && !board[from - 2] && !board[from - 3] && board[from - 4] && board[from - 4].t === 'r' && board[from - 4].c === color) {
        if (!isAttacked(board, from, enemy) && !isAttacked(board, from - 1, enemy) && !isAttacked(board, from - 2, enemy)) {
          moves.push({ from: from, to: from - 2, castle: 'q' });
        }
      }
    }
  }

  function makeMove(state, move) {
    var board = state.board;
    var p = board[move.from];
    var undo = {
      move: move,
      moved: p,
      captured: null,
      capturedSq: -1,
      rookFrom: -1,
      rookTo: -1,
      castling: { wK: state.castling.wK, wQ: state.castling.wQ, bK: state.castling.bK, bQ: state.castling.bQ },
      ep: state.ep,
      half: state.half,
      full: state.full,
      turn: state.turn,
      lastMove: state.lastMove
    };

    if (move.ep) {
      var capSq = idx(rowOf(move.from), colOf(move.to));
      undo.captured = board[capSq];
      undo.capturedSq = capSq;
      board[capSq] = null;
    } else if (board[move.to]) {
      undo.captured = board[move.to];
      undo.capturedSq = move.to;
    }

    board[move.to] = p;
    board[move.from] = null;

    if (move.castle) {
      var r = rowOf(move.from);
      var rookFrom = idx(r, move.castle === 'k' ? 7 : 0);
      var rookTo = idx(r, move.castle === 'k' ? 5 : 3);
      undo.rookFrom = rookFrom;
      undo.rookTo = rookTo;
      board[rookTo] = board[rookFrom];
      board[rookFrom] = null;
    }

    if (move.promo) {
      board[move.to] = { t: move.promo, c: p.c, id: p.id };
    }

    // Castling rights
    if (p.t === 'k') {
      if (p.c === WHITE) { state.castling.wK = false; state.castling.wQ = false; }
      else { state.castling.bK = false; state.castling.bQ = false; }
    }
    if (p.t === 'r') {
      if (move.from === 63) state.castling.wK = false;
      if (move.from === 56) state.castling.wQ = false;
      if (move.from === 7) state.castling.bK = false;
      if (move.from === 0) state.castling.bQ = false;
    }
    if (undo.captured && undo.captured.t === 'r') {
      if (undo.capturedSq === 63) state.castling.wK = false;
      if (undo.capturedSq === 56) state.castling.wQ = false;
      if (undo.capturedSq === 7) state.castling.bK = false;
      if (undo.capturedSq === 0) state.castling.bQ = false;
    }

    state.ep = move.double ? idx(rowOf(move.from) + (p.c === WHITE ? -1 : 1), colOf(move.from)) : -1;
    state.half = (p.t === 'p' || undo.captured) ? 0 : state.half + 1;
    if (state.turn === BLACK) state.full++;
    state.turn = other(state.turn);
    state.lastMove = { from: move.from, to: move.to, promo: move.promo || null };
    return undo;
  }

  function unmakeMove(state, undo) {
    var board = state.board;
    var move = undo.move;

    board[move.to] = null;
    board[move.from] = undo.moved;
    if (undo.captured) board[undo.capturedSq] = undo.captured;
    if (undo.rookFrom >= 0) {
      board[undo.rookFrom] = board[undo.rookTo];
      board[undo.rookTo] = null;
    }

    state.castling = undo.castling;
    state.ep = undo.ep;
    state.half = undo.half;
    state.full = undo.full;
    state.turn = undo.turn;
    state.lastMove = undo.lastMove;
  }

  function legalMoves(state) {
    var pseudo = pseudoMoves(state);
    var out = [];
    var color = state.turn;
    for (var i = 0; i < pseudo.length; i++) {
      var m = pseudo[i];
      var undo = makeMove(state, m);
      if (!inCheck(state, color)) out.push(m);
      unmakeMove(state, undo);
    }
    return out;
  }

  function hasLegalMoves(state) {
    var pseudo = pseudoMoves(state);
    var color = state.turn;
    for (var i = 0; i < pseudo.length; i++) {
      var undo = makeMove(state, pseudo[i]);
      var ok = !inCheck(state, color);
      unmakeMove(state, undo);
      if (ok) return true;
    }
    return false;
  }

  function captureSquareOf(state, move) {
    if (move.ep) return idx(rowOf(move.from), colOf(move.to));
    return state.board[move.to] ? move.to : -1;
  }

  function insufficientMaterial(board) {
    var minor = 0;
    var bishopColors = [];
    for (var i = 0; i < 64; i++) {
      var p = board[i];
      if (!p || p.t === 'k') continue;
      if (p.t === 'n') { minor++; continue; }
      if (p.t === 'b') { minor++; bishopColors.push((rowOf(i) + colOf(i)) & 1); continue; }
      return false;
    }
    if (minor === 0) return true;
    if (minor === 1) return true;
    if (bishopColors.length === minor) {
      // Bishops all on the same colour complex can never force mate.
      var first = bishopColors[0];
      for (var j = 1; j < bishopColors.length; j++) if (bishopColors[j] !== first) return false;
      return true;
    }
    return false;
  }

  function getStatus(state, moves) {
    var list = moves || legalMoves(state);
    if (!list.length) {
      if (inCheck(state, state.turn)) return { type: 'checkmate', winner: other(state.turn), moves: list };
      return { type: 'stalemate', moves: list };
    }
    if (state.half >= 100) return { type: 'draw', reason: 'fifty-move rule', moves: list };
    if (insufficientMaterial(state.board)) return { type: 'draw', reason: 'insufficient material', moves: list };
    return { type: 'playing', check: inCheck(state, state.turn), moves: list };
  }

  function evaluate(state) {
    var board = state.board;
    var score = 0;
    var whiteMaterial = 0, blackMaterial = 0;
    var whiteBishops = 0, blackBishops = 0;
    var nonPawn = 0;

    for (var i = 0; i < 64; i++) {
      var p = board[i];
      if (!p) continue;
      var val = VALUES[p.t];
      if (p.t !== 'p' && p.t !== 'k') nonPawn += val;
      if (p.c === WHITE) {
        whiteMaterial += val;
        if (p.t === 'b') whiteBishops++;
      } else {
        blackMaterial += val;
        if (p.t === 'b') blackBishops++;
      }
    }

    var endgame = nonPawn < 1500;

    for (i = 0; i < 64; i++) {
      p = board[i];
      if (!p) continue;
      var table = p.t === 'k' ? (endgame ? PST.kEnd : PST.k) : PST[p.t];
      var v = VALUES[p.t] + table[p.c === WHITE ? i : (i ^ 56)];
      score += p.c === WHITE ? v : -v;
    }

    if (whiteBishops >= 2) score += 30;
    if (blackBishops >= 2) score -= 30;

    return score;
  }

  function evalForTurn(state) {
    var e = evaluate(state);
    var tempo = 8;
    return state.turn === WHITE ? e + tempo : -e + tempo;
  }

  function now() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }

  function moveScore(state, m) {
    var score = 0;
    var victim = m.ep ? state.board[idx(rowOf(m.from), colOf(m.to))] : state.board[m.to];
    if (victim) score += 1000 + VALUES[victim.t] * 10 - VALUES[state.board[m.from].t];
    if (m.promo) score += 800 + VALUES[m.promo];
    if (m.castle) score += 60;
    return score;
  }

  function orderMoves(state, moves) {
    for (var i = 0; i < moves.length; i++) moves[i]._s = moveScore(state, moves[i]);
    moves.sort(function (a, b) { return b._s - a._s; });
    return moves;
  }

  function findBestMove(state, opts) {
    opts = opts || {};
    var maxDepth = opts.depth || 3;
    var timeMs = opts.timeMs || 800;
    var noise = opts.noise || 0;
    var blunder = opts.blunder || 0;

    var rootMoves = legalMoves(state);
    if (!rootMoves.length) return null;
    if (blunder > 0 && Math.random() < blunder) {
      return rootMoves[Math.floor(Math.random() * rootMoves.length)];
    }

    var ctx = { nodes: 0, deadline: now() + timeMs, aborted: false };
    if (opts.shuffle !== false) {
      for (var s = rootMoves.length - 1; s > 0; s--) {
        var j = Math.floor(Math.random() * (s + 1));
        var tmp = rootMoves[s];
        rootMoves[s] = rootMoves[j];
        rootMoves[j] = tmp;
      }
    }
    orderMoves(state, rootMoves);

    var best = rootMoves[0];

    for (var depth = 1; depth <= maxDepth; depth++) {
      var alpha = -Infinity;
      var localBest = null;
      var localScore = -Infinity;
      var scored = [];

      for (var i = 0; i < rootMoves.length; i++) {
        var m = rootMoves[i];
        var u = makeMove(state, m);
        var sc;
        if (noise > 0) {
          sc = -negamax(state, depth - 1, -Infinity, Infinity, 1, ctx);
        } else {
          sc = -negamax(state, depth - 1, -Infinity, -alpha, 1, ctx);
        }
        unmakeMove(state, u);
        if (ctx.aborted) break;
        if (noise > 0) sc += Math.random() * noise * 2 - noise;
        scored.push({ move: m, score: sc });
        if (sc > localScore) { localScore = sc; localBest = m; }
        if (sc > alpha) alpha = sc;
      }

      if (ctx.aborted) break;
      if (localBest) { best = localBest; }
      // Feed the depth's ordering into the next iteration.
      if (noise === 0) {
        scored.sort(function (a, b) { return b.score - a.score; });
        rootMoves = scored.map(function (x) { return x.move; });
      }
    }
    return best;
  }

  function negamax(state, depth, alpha, beta, ply, ctx) {
    ctx.nodes++;
    if ((ctx.nodes & 511) === 0 && now() > ctx.deadline) { ctx.aborted = true; return 0; }

    if (depth <= 0) return quiesce(state, alpha, beta, ply, ctx);

    var moves = legalMoves(state);
    if (!moves.length) return inCheck(state, state.turn) ? -MATE + ply : 0;
    orderMoves(state, moves);

    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var u = makeMove(state, moves[i]);
      var sc = -negamax(state, depth - 1, -beta, -alpha, ply + 1, ctx);
      unmakeMove(state, u);
      if (ctx.aborted) return 0;
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function quiesce(state, alpha, beta, ply, ctx) {
    ctx.nodes++;
    if ((ctx.nodes & 511) === 0 && now() > ctx.deadline) { ctx.aborted = true; return 0; }

    var stand = evalForTurn(state);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;

    var all = legalMoves(state);
    var tactical = [];
    for (var i = 0; i < all.length; i++) {
      var m = all[i];
      if (m.promo || m.ep || state.board[m.to]) tactical.push(m);
    }
    if (!tactical.length) return alpha;
    orderMoves(state, tactical);

    for (i = 0; i < tactical.length; i++) {
      var u = makeMove(state, tactical[i]);
      var sc = -quiesce(state, -beta, -alpha, ply + 1, ctx);
      unmakeMove(state, u);
      if (ctx.aborted) return 0;
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  function toSan(state, move) {
    var p = state.board[move.from];
    if (!p) return '';
    var san;
    if (move.castle) {
      san = move.castle === 'k' ? 'O-O' : 'O-O-O';
    } else if (p.t === 'p') {
      san = move.ep || state.board[move.to] ? fileChar(colOf(move.from)) + 'x' : '';
      san += squareName(move.to);
      if (move.promo) san += '=' + move.promo.toUpperCase();
    } else {
      san = p.t.toUpperCase();
      var all = legalMoves(state);
      var sameFile = false, sameRank = false, ambiguous = false;
      for (var i = 0; i < all.length; i++) {
        var m = all[i];
        if (m.from === move.from || m.to !== move.to) continue;
        var op = state.board[m.from];
        if (!op || op.c !== p.c || op.t !== p.t) continue;
        ambiguous = true;
        if (colOf(m.from) === colOf(move.from)) sameFile = true;
        if (rowOf(m.from) === rowOf(move.from)) sameRank = true;
      }
      if (ambiguous) {
        if (!sameFile) san += fileChar(colOf(move.from));
        else if (!sameRank) san += String(8 - rowOf(move.from));
        else san += squareName(move.from);
      }
      if (move.ep || state.board[move.to]) san += 'x';
      san += squareName(move.to);
    }

    var u = makeMove(state, move);
    var check = inCheck(state, state.turn);
    var hasMoves = hasLegalMoves(state);
    unmakeMove(state, u);
    if (check) san += hasMoves ? '+' : '#';
    return san;
  }

  function perft(state, depth) {
    if (depth === 0) return 1;
    var moves = legalMoves(state);
    if (depth === 1) return moves.length;
    var total = 0;
    for (var i = 0; i < moves.length; i++) {
      var u = makeMove(state, moves[i]);
      total += perft(state, depth - 1);
      unmakeMove(state, u);
    }
    return total;
  }

  return {
    WHITE: WHITE,
    BLACK: BLACK,
    MATE: MATE,
    initialState: initialState,
    cloneState: cloneState,
    legalMoves: legalMoves,
    hasLegalMoves: hasLegalMoves,
    makeMove: makeMove,
    unmakeMove: unmakeMove,
    inCheck: inCheck,
    isAttacked: isAttacked,
    getStatus: getStatus,
    evaluate: evaluate,
    findBestMove: findBestMove,
    toSan: toSan,
    captureSquareOf: captureSquareOf,
    perft: perft,
    squareName: squareName,
    findKing: findKing,
    VALUES: VALUES
  };
});
