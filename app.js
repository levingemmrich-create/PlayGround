/* ============================================================
   Bloodchess — UI, blood, corpses, bots and pass-and-play
   ============================================================ */
(function () {
  'use strict';

  var E = window.ChessEngine;
  if (!E) return;

  /* ---------------------------------------------------------- */
  /* Constants                                                  */
  /* ---------------------------------------------------------- */
  var GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  var NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  var DIFF = {
    easy: { label: 'Casual', depth: 2, timeMs: 280, noise: 110, blunder: 0.14 },
    medium: { label: 'Ruthless', depth: 3, timeMs: 650, noise: 0, blunder: 0.015 },
    hard: { label: 'Merciless', depth: 5, timeMs: 1400, noise: 0, blunder: 0 }
  };
  var STORAGE_KEY = 'bloodchess.settings.v1';

  /* ---------------------------------------------------------- */
  /* DOM                                                        */
  /* ---------------------------------------------------------- */
  function $(id) { return document.getElementById(id); }

  var boardEl = $('board');
  var boardFrame = $('boardFrame');
  var squaresEl = $('squares');
  var corpsesEl = $('corpses');
  var marksEl = $('marks');
  var piecesEl = $('pieces');
  var fxEl = $('fx');
  var flashEl = $('flash');

  var turnDot = $('turnDot');
  var turnName = $('turnName');
  var turnSub = $('turnSub');
  var checkBadge = $('checkBadge');
  var killsWEl = $('killsW');
  var killsBEl = $('killsB');
  var bodiesEl = $('bodies');
  var modeChip = $('modeChip');
  var statusText = $('statusText');
  var thinkingEl = $('thinking');
  var logEl = $('log');
  var btnUndo = $('btnUndo');
  var btnSound = $('btnSound');

  var menuOverlay = $('menuOverlay');
  var menuModeCards = Array.prototype.slice.call(document.querySelectorAll('.mode-card'));
  var botOptions = $('botOptions');
  var localOptions = $('localOptions');
  var difficultySeg = $('difficultySeg');
  var sideSeg = $('sideSeg');
  var soundToggle = $('soundToggle');
  var autoFlipEl = $('autoFlip');
  var btnStart = $('btnStart');
  var btnResume = $('btnResume');
  var btnMenuClose = $('btnMenuClose');

  var promoOverlay = $('promoOverlay');
  var promoChoices = $('promoChoices');
  var promoCancel = $('promoCancel');

  var endOverlay = $('endOverlay');
  var endTitle = $('endTitle');
  var endSub = $('endSub');
  var endStats = $('endStats');

  /* ---------------------------------------------------------- */
  /* Settings                                                   */
  /* ---------------------------------------------------------- */
  function loadSettings() {
    var s = { sound: true, difficulty: 'medium', side: 'w', autoFlip: false, mode: 'bot' };
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        Object.keys(s).forEach(function (k) {
          if (parsed[k] !== undefined) s[k] = parsed[k];
        });
      }
    } catch (err) { /* private mode */ }
    if (['easy', 'medium', 'hard'].indexOf(s.difficulty) < 0) s.difficulty = 'medium';
    if (['w', 'b', 'random'].indexOf(s.side) < 0) s.side = 'w';
    if (['bot', 'local'].indexOf(s.mode) < 0) s.mode = 'bot';
    s.sound = !!s.sound;
    s.autoFlip = !!s.autoFlip;
    return s;
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (err) { /* ignore */ }
  }

  var settings = loadSettings();
  var menuMode = settings.mode;

  /* ---------------------------------------------------------- */
  /* Game state                                                 */
  /* ---------------------------------------------------------- */
  var state = E.initialState();
  var timeline = [];
  var corpses = [];
  var kills = { w: 0, b: 0 };
  var bloodied = new Set();

  var selected = null;
  var selectedMoves = [];
  var currentStatus = { type: 'playing', check: false };
  var pendingPromo = null;

  var flipped = false;
  var humanColor = settings.side === 'b' ? 'b' : 'w';
  var gameOver = false;
  var hasGame = false;
  var thinking = false;
  var botToken = 0;
  var botTimer = null;
  var endTimer = null;

  var pieceEls = new Map();

  /* ---------------------------------------------------------- */
  /* Geometry helpers                                           */
  /* ---------------------------------------------------------- */
  function displayOf(i) {
    var r = i >> 3, c = i & 7;
    return flipped ? { r: 7 - r, c: 7 - c } : { r: r, c: c };
  }

  function updateCell() {
    var w = boardEl.clientWidth;
    if (w) boardEl.style.setProperty('--cell', (w / 8).toFixed(2) + 'px');
  }

  function buildSquares() {
    squaresEl.innerHTML = '';
    for (var dr = 0; dr < 8; dr++) {
      for (var dc = 0; dc < 8; dc++) {
        var r = flipped ? 7 - dr : dr;
        var c = flipped ? 7 - dc : dc;
        var sq = document.createElement('div');
        sq.className = 'sq ' + ((r + c) % 2 ? 'dark' : 'light');
        sq.dataset.sq = String(r * 8 + c);
        squaresEl.appendChild(sq);
      }
    }
  }

  /* ---------------------------------------------------------- */
  /* Rendering                                                  */
  /* ---------------------------------------------------------- */
  function clearPieces() {
    pieceEls.forEach(function (el) { el.remove(); });
    pieceEls.clear();
  }

  function renderPieces(instant) {
    if (instant) piecesEl.classList.add('instant');
    var seen = new Set();

    for (var i = 0; i < 64; i++) {
      var p = state.board[i];
      if (!p) continue;
      seen.add(p.id);
      var el = pieceEls.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'piece';
        el.dataset.id = p.id;
        piecesEl.appendChild(el);
        pieceEls.set(p.id, el);
      }
      var d = displayOf(i);
      el.style.transform = 'translate(' + (d.c * 100) + '%, ' + (d.r * 100) + '%)';
      el.dataset.type = p.t;
      el.dataset.color = p.c;
      el.textContent = GLYPH[p.t];
      el.classList.toggle('bloodied', bloodied.has(p.id));
    }

    pieceEls.forEach(function (el, id) {
      if (!seen.has(id)) { el.remove(); pieceEls.delete(id); }
    });

    if (instant) {
      requestAnimationFrame(function () { piecesEl.classList.remove('instant'); });
    }
  }

  function addMark(sq, cls) {
    var d = displayOf(sq);
    var el = document.createElement('div');
    el.className = 'mark ' + cls;
    el.style.left = (d.c * 12.5) + '%';
    el.style.top = (d.r * 12.5) + '%';
    marksEl.appendChild(el);
  }

  function renderMarks() {
    marksEl.innerHTML = '';
    var lm = state.lastMove;
    if (lm) {
      addMark(lm.from, 'last');
      addMark(lm.to, 'last');
    }
    if (currentStatus && currentStatus.check && !gameOver) {
      var k = E.findKing(state.board, state.turn);
      if (k >= 0) addMark(k, 'check');
    }
    if (selected !== null) {
      addMark(selected, 'selected');
      var seen = Object.create(null);
      for (var i = 0; i < selectedMoves.length; i++) {
        var m = selectedMoves[i];
        if (seen[m.to]) continue;
        seen[m.to] = 1;
        addMark(m.to, (state.board[m.to] || m.ep) ? 'capture' : 'target');
      }
    }
  }

  function renderAll(instant) {
    renderPieces(!!instant);
    renderMarks();
    updateHud();
  }

  function renderCorpses() {
    corpsesEl.innerHTML = '';
    for (var i = 0; i < corpses.length; i++) {
      var c = corpses[i];
      var d = displayOf(c.sq);
      var el = document.createElement('div');
      el.className = 'corpse ' + (c.color === 'b' ? 'b' : 'w');
      el.style.left = (d.c * 12.5 + c.ox).toFixed(2) + '%';
      el.style.top = (d.r * 12.5 + c.oy).toFixed(2) + '%';
      el.style.setProperty('--rot', c.rot.toFixed(0) + 'deg');
      el.style.setProperty('--scale', c.scale.toFixed(2));

      var pool = document.createElement('div');
      pool.className = 'pool';
      pool.innerHTML = bloodSvg(c.seed);
      el.appendChild(pool);

      var body = document.createElement('div');
      body.className = 'body';
      body.textContent = GLYPH[c.type];
      el.appendChild(body);

      corpsesEl.appendChild(el);
    }
  }

  function renderLog() {
    logEl.innerHTML = '';
    var moves = timeline.slice(1);
    if (!moves.length) {
      var empty = document.createElement('div');
      empty.className = 'log-empty';
      empty.textContent = 'The board is clean. For now.';
      logEl.appendChild(empty);
      return;
    }
    for (var i = 0; i < moves.length; i += 2) {
      var row = document.createElement('div');
      row.className = 'log-row';
      var no = document.createElement('span');
      no.className = 'no';
      no.textContent = (i / 2 + 1) + '.';
      row.appendChild(no);
      for (var j = 0; j < 2; j++) {
        var entry = moves[i + j];
        var cell = document.createElement('span');
        cell.className = 'm';
        if (entry) {
          cell.textContent = entry.san;
          if (entry.san.indexOf('x') >= 0) cell.classList.add('took');
          if (entry.san.indexOf('#') >= 0) cell.classList.add('mate');
        }
        row.appendChild(cell);
      }
      logEl.appendChild(row);
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  function updateHud() {
    var t = state.turn;
    turnDot.className = 'turn-dot' + (t === 'b' ? ' black' : '');
    turnName.textContent = t === 'w' ? 'White' : 'Black';
    turnSub.textContent = gameOver ? 'game over' : (thinking ? 'thinking' : 'to move');
    checkBadge.hidden = !(currentStatus && currentStatus.check && !gameOver);

    killsWEl.textContent = String(kills.w);
    killsBEl.textContent = String(kills.b);
    bodiesEl.title = 'Pieces taken — white ' + kills.w + ', black ' + kills.b;

    modeChip.textContent = settings.mode === 'bot'
      ? 'VS ' + DIFF[settings.difficulty].label.toUpperCase()
      : 'PASS & PLAY';
    thinkingEl.hidden = !thinking;
    btnUndo.disabled = !hasGame || timeline.length <= 1;
  }

  function setStatus(text) {
    statusText.textContent = text;
  }

  /* ---------------------------------------------------------- */
  /* Blood art                                                  */
  /* ---------------------------------------------------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function bloodSvg(seed) {
    var rnd = mulberry32(Math.floor(seed * 0xFFFFFFF) + 17);
    var s = '';
    var cx = 47 + rnd() * 8;
    var cy = 49 + rnd() * 8;

    s += '<ellipse cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" rx="' + (34 + rnd() * 12).toFixed(1) + '" ry="' + (21 + rnd() * 10).toFixed(1) + '" fill="rgba(72,3,8,.6)"/>';
    s += '<ellipse cx="' + (cx - 3).toFixed(1) + '" cy="' + cy.toFixed(1) + '" rx="' + (22 + rnd() * 10).toFixed(1) + '" ry="' + (12 + rnd() * 7).toFixed(1) + '" fill="rgba(126,6,14,.64)"/>';
    s += '<ellipse cx="' + (cx - 5).toFixed(1) + '" cy="' + (cy - 3).toFixed(1) + '" rx="' + (10 + rnd() * 7).toFixed(1) + '" ry="' + (5 + rnd() * 3).toFixed(1) + '" fill="rgba(176,14,24,.55)"/>';

    var i;
    for (i = 0; i < 9; i++) {
      var a0 = rnd() * Math.PI * 2;
      var dist0 = 20 + rnd() * 30;
      var x0 = 50 + Math.cos(a0) * dist0;
      var y0 = 51 + Math.sin(a0) * dist0 * 0.85;
      s += '<ellipse cx="' + x0.toFixed(1) + '" cy="' + y0.toFixed(1) + '" rx="' + (3 + rnd() * 7).toFixed(1) + '" ry="' + (2 + rnd() * 4).toFixed(1) + '" transform="rotate(' + (rnd() * 180).toFixed(0) + ' ' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ')" fill="rgba(' + (90 + Math.floor(rnd() * 55)) + ',' + (4 + Math.floor(rnd() * 8)) + ',' + (8 + Math.floor(rnd() * 8)) + ',' + (0.35 + rnd() * 0.4).toFixed(2) + ')"/>';
    }

    for (i = 0; i < 26; i++) {
      var a = rnd() * Math.PI * 2;
      var dist = 26 + rnd() * 50;
      var x = 50 + Math.cos(a) * dist;
      var y = 51 + Math.sin(a) * dist * 0.9;
      var rad = 0.7 + rnd() * 3.1;
      s += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="' + rad.toFixed(1) + '" ry="' + (rad * (0.55 + rnd() * 0.8)).toFixed(1) + '" transform="rotate(' + (rnd() * 180).toFixed(0) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')" fill="rgba(' + (105 + Math.floor(rnd() * 55)) + ',' + (3 + Math.floor(rnd() * 9)) + ',' + (9 + Math.floor(rnd() * 8)) + ',' + (0.4 + rnd() * 0.45).toFixed(2) + ')"/>';
    }

    for (i = 0; i < 4; i++) {
      var a1 = rnd() * Math.PI * 2;
      var len = 12 + rnd() * 24;
      var wid = 1 + rnd() * 2.4;
      s += '<rect x="' + (cx + Math.cos(a1) * 8).toFixed(1) + '" y="' + (cy + Math.sin(a1) * 8).toFixed(1) + '" width="' + len.toFixed(1) + '" height="' + wid.toFixed(1) + '" rx="' + (wid / 2).toFixed(1) + '" transform="rotate(' + (a1 * 180 / Math.PI).toFixed(0) + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')" fill="rgba(86,3,9,.72)"/>';
    }

    return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + s + '</svg>';
  }

  function addCorpse(sq, piece) {
    var stack = 0;
    for (var i = 0; i < corpses.length; i++) if (corpses[i].sq === sq) stack++;
    var ang = Math.random() * Math.PI * 2;
    var spread = 3.7 + Math.min(stack, 3) * 1.8;
    corpses.push({
      sq: sq,
      type: piece.t,
      color: piece.c,
      seed: Math.random(),
      ox: Math.cos(ang) * spread + (Math.random() - 0.5) * 1.2,
      oy: Math.sin(ang) * spread + (Math.random() - 0.5) * 1.2,
      rot: (Math.random() < 0.5 ? -1 : 1) * (76 + Math.random() * 28),
      scale: 0.9 + Math.random() * 0.12
    });
    renderCorpses();
  }

  function bloodBurst(sq) {
    var d = displayOf(sq);
    var cell = (boardEl.clientWidth || 320) / 8;
    var burst = document.createElement('div');
    burst.className = 'burst';
    burst.style.left = (d.c * 12.5 + 6.25) + '%';
    burst.style.top = (d.r * 12.5 + 6.25) + '%';

    var n = 13 + Math.floor(Math.random() * 7);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var dist = cell * (0.35 + Math.random() * 1.6);
      var dot = document.createElement('i');
      dot.style.setProperty('--dx', (Math.cos(a) * dist).toFixed(1) + 'px');
      dot.style.setProperty('--dy', (Math.sin(a) * dist).toFixed(1) + 'px');
      dot.style.setProperty('--sz', (2 + Math.random() * Math.max(2, cell * 0.13)).toFixed(1) + 'px');
      dot.style.setProperty('--delay', Math.floor(Math.random() * 70) + 'ms');
      burst.appendChild(dot);
    }
    fxEl.appendChild(burst);
    setTimeout(function () { burst.remove(); }, 950);

    boardFrame.classList.remove('hit');
    void boardFrame.offsetWidth;
    boardFrame.classList.add('hit');
    setTimeout(function () { boardFrame.classList.remove('hit'); }, 430);

    flashEl.classList.add('on');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { flashEl.classList.remove('on'); });
    });
  }

  /* ---------------------------------------------------------- */
  /* Sound                                                      */
  /* ---------------------------------------------------------- */
  var audioRef = null;
  var noiseRef = null;

  function getAudio() {
    if (!settings.sound) return null;
    try {
      if (!audioRef) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioRef = new AC();
      }
      if (audioRef.state === 'suspended') audioRef.resume();
      return audioRef;
    } catch (err) { return null; }
  }

  function noiseBuffer(ctx) {
    if (noiseRef && noiseRef.sampleRate === ctx.sampleRate) return noiseRef;
    var len = Math.floor(ctx.sampleRate * 0.5);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noiseRef = buf;
    return buf;
  }

  function playTick() {
    var ctx = getAudio(); if (!ctx) return;
    try {
      var t = ctx.currentTime;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.02, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.06);
    } catch (err) { /* ignore */ }
  }

  function playMove() {
    var ctx = getAudio(); if (!ctx) return;
    try {
      var t = ctx.currentTime;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(125, t + 0.07);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.11);

      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2400;
      var ng = ctx.createGain();
      ng.gain.setValueAtTime(0.028, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(hp).connect(ng).connect(ctx.destination);
      src.start(t); src.stop(t + 0.06);
    } catch (err) { /* ignore */ }
  }

  function playCapture() {
    var ctx = getAudio(); if (!ctx) return;
    try {
      var t = ctx.currentTime;

      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1800, t);
      lp.frequency.exponentialRampToValueAtTime(240, t + 0.3);
      lp.Q.value = 5;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      src.connect(lp).connect(g).connect(ctx.destination);
      src.start(t); src.stop(t + 0.36);

      var o = ctx.createOscillator();
      var og = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(36, t + 0.24);
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(og).connect(ctx.destination);
      o.start(t); o.stop(t + 0.3);
    } catch (err) { /* ignore */ }
  }

  function playCheck() {
    var ctx = getAudio(); if (!ctx) return;
    try {
      var t = ctx.currentTime;
      [740, 988].forEach(function (freq, i) {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = freq;
        var at = t + i * 0.11;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.03, at + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
        o.connect(g).connect(ctx.destination);
        o.start(at); o.stop(at + 0.13);
      });
    } catch (err) { /* ignore */ }
  }

  function playEnd(victorious) {
    var ctx = getAudio(); if (!ctx) return;
    try {
      var t = ctx.currentTime;
      var notes = victorious ? [196, 233.08, 293.66, 392] : [174.61, 146.83, 110];
      notes.forEach(function (freq, i) {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        var at = t + i * 0.13;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.05, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
        o.connect(g).connect(ctx.destination);
        o.start(at); o.stop(at + 0.72);
      });
    } catch (err) { /* ignore */ }
  }

  function vibrate(pattern) {
    if (!settings.sound || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (err) { /* ignore */ }
  }

  /* ---------------------------------------------------------- */
  /* Game flow                                                  */
  /* ---------------------------------------------------------- */
  function snapshot(san, status) {
    return {
      state: E.cloneState(state),
      san: san,
      corpses: corpses.map(function (c) { return Object.assign({}, c); }),
      kills: { w: kills.w, b: kills.b },
      bloodied: new Set(bloodied),
      status: status
    };
  }

  function maybeBot() {
    cancelBot();
    if (!hasGame || gameOver || settings.mode !== 'bot' || state.turn === humanColor) return;
    if (pendingPromo) return;

    var token = ++botToken;
    thinking = true;
    updateHud();
    setStatus(DIFF[settings.difficulty].label + ' is deciding.');

    botTimer = setTimeout(function () {
      botTimer = null;
      if (token !== botToken || gameOver) return;
      var move = E.findBestMove(state, DIFF[settings.difficulty]);
      if (token !== botToken || gameOver) return;
      thinking = false;
      updateHud();
      if (move) applyMove(move);
    }, 340);
  }

  function cancelBot() {
    botToken++;
    if (botTimer) { clearTimeout(botTimer); botTimer = null; }
    thinking = false;
  }

  function positionKey(st) {
    var s = '';
    for (var i = 0; i < 64; i++) {
      var p = st.board[i];
      s += p ? p.c + p.t : '.';
    }
    return s + '|' + st.turn + '|' +
      (st.castling.wK ? 'K' : '') + (st.castling.wQ ? 'Q' : '') +
      (st.castling.bK ? 'k' : '') + (st.castling.bQ ? 'q' : '') + '|' + st.ep;
  }

  function repetitionCount() {
    var key = positionKey(state);
    var count = 1;
    for (var i = 0; i < timeline.length; i++) {
      if (positionKey(timeline[i].state) === key) count++;
    }
    return count;
  }

  function applyMove(move) {
    if (!move || gameOver) return;

    var mover = state.board[move.from];
    var victimSq = E.captureSquareOf(state, move);
    var victim = victimSq >= 0 ? state.board[victimSq] : null;
    var san = E.toSan(state, move);

    if (victim && mover) {
      kills[mover.c]++;
      addCorpse(victimSq, victim);
      bloodied.add(mover.id);
      bloodBurst(victimSq);
      playCapture();
      vibrate(32);
    } else {
      playMove();
    }

    E.makeMove(state, move);
    selected = null;
    selectedMoves = [];

    var status = E.getStatus(state);
    if (status.type === 'playing' && repetitionCount() >= 3) {
      status = { type: 'draw', reason: 'threefold repetition', moves: status.moves, check: status.check };
    }
    currentStatus = status;
    timeline.push(snapshot(san, status));

    if (settings.mode === 'local' && settings.autoFlip) {
      flipped = state.turn === 'b';
      buildSquares();
      renderCorpses();
    }

    renderAll(settings.mode === 'local' && settings.autoFlip);
    renderLog();

    if (status.type !== 'playing') {
      setStatus('');
      endGame(status);
      return;
    }

    if (status.check) playCheck();
    setStatus(moveStory(san, victim, mover, status));

    if (settings.mode === 'bot' && mover && mover.c !== humanColor) {
      thinkFlavor();
    }

    maybeBot();
  }

  function moveStory(san, victim, mover, status) {
    if (settings.mode === 'bot' && mover && mover.c !== humanColor) {
      return 'The machine plays ' + san + '.' + (victim ? ' Another body.' : '');
    }
    if (victim) {
      var line = san + ' — the ' + NAMES[victim.t] + ' stays.';
      if (status.check) line += ' Check.';
      return line;
    }
    if (status.check) return san + ' — check. The king is exposed.';
    if (settings.mode === 'local') return san + '. ' + (state.turn === 'w' ? 'White' : 'Black') + ' to move.';
    return san + '.';
  }

  function thinkFlavor() {
    /* reserved for future taunts */
  }

  function endGame(status) {
    if (gameOver) return;
    gameOver = true;
    cancelBot();
    updateHud();

    var title;
    var sub;
    var winner = status.winner || null;

    if (status.type === 'checkmate') {
      title = 'CHECKMATE';
      var wn = winner === 'w' ? 'White' : 'Black';
      if (settings.mode === 'bot') {
        sub = winner === humanColor
          ? 'You win. The machine has nothing left to say.'
          : wn + ' wins. The machine leaves you on the board.';
      } else {
        sub = wn + ' wins. ' + (winner === 'w' ? 'Black' : 'White') + "'s king is finished.";
      }
    } else if (status.type === 'stalemate') {
      title = 'STALEMATE';
      sub = 'No legal moves. No winner. Just bodies.';
    } else {
      title = 'DRAW';
      sub = (status.reason ? status.reason.charAt(0).toUpperCase() + status.reason.slice(1) : 'Nobody wins') + '. The board keeps them all.';
    }

    var total = kills.w + kills.b;
    if (status.type === 'checkmate' && total > 0) {
      sub += ' ' + total + ' ' + (total === 1 ? 'body stays' : 'bodies stay') + ' on the board.';
    }

    endTitle.textContent = title;
    endSub.textContent = sub;
    endStats.innerHTML =
      '<div class="end-stat"><span class="k">White took</span><span class="v">' + kills.w + ' <small>' + (kills.w === 1 ? 'body' : 'bodies') + '</small></span></div>' +
      '<div class="end-stat"><span class="k">Black took</span><span class="v">' + kills.b + ' <small>' + (kills.b === 1 ? 'body' : 'bodies') + '</small></span></div>' +
      '<div class="end-stat wide"><span class="k">Bodies on the board</span><span class="v">' + total + ' <small>' + (total === 1 ? 'body' : 'bodies') + '</small></span></div>';

    setStatus(sub);
    playEnd(status.type === 'checkmate' && winner === humanColor);
    vibrate(status.type === 'checkmate' ? [40, 60, 40, 60, 110] : 40);

    if (endTimer) clearTimeout(endTimer);
    endTimer = setTimeout(function () {
      if (gameOver && hasGame) endOverlay.classList.add('show');
    }, 560);
  }

  function newGame() {
    cancelBot();
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }

    state = E.initialState();
    timeline = [];
    corpses = [];
    kills = { w: 0, b: 0 };
    bloodied = new Set();
    selected = null;
    selectedMoves = [];
    pendingPromo = null;
    currentStatus = { type: 'playing', check: false };
    gameOver = false;
    hasGame = true;
    thinking = false;

    if (settings.mode === 'bot') {
      humanColor = settings.side === 'random'
        ? (Math.random() < 0.5 ? 'w' : 'b')
        : settings.side;
      flipped = humanColor === 'b';
    } else {
      humanColor = 'w';
      flipped = false;
    }

    buildSquares();
    clearPieces();
    renderCorpses();
    timeline.push(snapshot(null, currentStatus));
    renderAll(true);
    renderLog();
    updateHud();
    hideOverlays();

    if (settings.mode === 'bot') {
      setStatus(humanColor === 'w'
        ? 'You are White. The machine is Black.'
        : 'You are Black. The machine opens.');
    } else {
      setStatus('White opens. Pass the phone when you are done.');
    }

    maybeBot();
  }

  function restoreEntry(entry) {
    cancelBot();
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }

    state = E.cloneState(entry.state);
    corpses = entry.corpses.map(function (c) { return Object.assign({}, c); });
    kills = { w: entry.kills.w, b: entry.kills.b };
    bloodied = new Set(entry.bloodied);
    currentStatus = entry.status;
    selected = null;
    selectedMoves = [];
    pendingPromo = null;
    gameOver = false;
    thinking = false;

    if (settings.mode === 'bot') flipped = humanColor === 'b';
    else if (settings.autoFlip) flipped = state.turn === 'b';

    buildSquares();
    clearPieces();
    renderCorpses();
    renderAll(true);
    renderLog();
    updateHud();
    promoOverlay.classList.remove('show');
    endOverlay.classList.remove('show');
    setStatus('Move taken back. The bodies are back too.');
  }

  function undoMove() {
    if (!hasGame || timeline.length <= 1) return;
    cancelBot();
    timeline.pop();
    var entry = timeline[timeline.length - 1];

    if (settings.mode === 'bot' && timeline.length > 1 && entry.state.turn !== humanColor) {
      timeline.pop();
      entry = timeline[timeline.length - 1];
    }

    restoreEntry(entry);
    if (settings.mode === 'bot' && state.turn !== humanColor) maybeBot();
  }

  /* ---------------------------------------------------------- */
  /* Input                                                      */
  /* ---------------------------------------------------------- */
  function selectSquare(sq) {
    selected = sq;
    selectedMoves = E.legalMoves(state).filter(function (m) { return m.from === sq; });
    renderMarks();
    var p = state.board[sq];
    if (p) setStatus(cap(NAMES[p.t]) + ' selected. Tap a glowing square.');
    playTick();
  }

  function clearSelection() {
    selected = null;
    selectedMoves = [];
    renderMarks();
  }

  function onSquare(sq) {
    if (!hasGame || gameOver || thinking || pendingPromo) return;
    if (settings.mode === 'bot' && state.turn !== humanColor) return;

    var piece = state.board[sq];

    if (selected !== null) {
      var candidates = selectedMoves.filter(function (m) { return m.to === sq; });
      if (candidates.length) {
        if (candidates.length > 1 && candidates[0].promo) {
          openPromotion(candidates);
          return;
        }
        applyMove(candidates[0]);
        return;
      }
      if (piece && piece.c === state.turn) {
        if (sq === selected) { clearSelection(); setStatus('Selection cleared.'); return; }
        selectSquare(sq);
        return;
      }
      clearSelection();
      setStatus('That piece cannot go there.');
      playTick();
      return;
    }

    if (piece && piece.c === state.turn) {
      selectSquare(sq);
    }
  }

  function openPromotion(candidates) {
    pendingPromo = candidates;
    var color = state.turn;
    promoChoices.innerHTML = '';
    ['q', 'r', 'b', 'n'].forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'promo-btn';
      b.dataset.promo = t;
      var g = document.createElement('span');
      g.className = 'glyph ' + (color === 'b' ? 'b' : 'w');
      g.textContent = GLYPH[t];
      var n = document.createElement('span');
      n.className = 'name';
      n.textContent = NAMES[t];
      b.appendChild(g);
      b.appendChild(n);
      promoChoices.appendChild(b);
    });
    promoOverlay.classList.add('show');
    playTick();
  }

  promoChoices.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-promo]');
    if (!btn || !pendingPromo) return;
    var chosen = pendingPromo.filter(function (m) { return m.promo === btn.dataset.promo; })[0];
    pendingPromo = null;
    promoOverlay.classList.remove('show');
    if (chosen) applyMove(chosen);
  });

  promoCancel.addEventListener('click', function () {
    pendingPromo = null;
    promoOverlay.classList.remove('show');
  });

  promoOverlay.addEventListener('click', function (ev) {
    if (ev.target === promoOverlay) {
      pendingPromo = null;
      promoOverlay.classList.remove('show');
    }
  });

  squaresEl.addEventListener('click', function (ev) {
    var sq = ev.target.closest('.sq');
    if (!sq) return;
    onSquare(Number(sq.dataset.sq));
  });

  /* ---------------------------------------------------------- */
  /* Menu / settings UI                                         */
  /* ---------------------------------------------------------- */
  function syncSoundIcon() {
    btnSound.textContent = settings.sound ? '🔊' : '🔇';
    btnSound.classList.toggle('muted', !settings.sound);
    soundToggle.checked = settings.sound;
  }

  function syncSettingsUI() {
    menuModeCards.forEach(function (card) {
      var active = card.dataset.mode === menuMode;
      card.classList.toggle('selected', active);
      card.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    botOptions.hidden = menuMode !== 'bot';
    localOptions.hidden = menuMode !== 'local';

    Array.prototype.forEach.call(difficultySeg.children, function (b) {
      b.classList.toggle('active', b.dataset.diff === settings.difficulty);
    });
    Array.prototype.forEach.call(sideSeg.children, function (b) {
      b.classList.toggle('active', b.dataset.side === settings.side);
    });
    autoFlipEl.checked = settings.autoFlip;
    syncSoundIcon();
  }

  function openMenu() {
    menuMode = settings.mode;
    syncSettingsUI();
    btnResume.hidden = !hasGame;
    btnResume.textContent = gameOver ? 'Back to the final board' : 'Resume game';
    btnMenuClose.hidden = !hasGame;
    btnStart.textContent = hasGame ? 'Start a new game' : 'Begin the bloodshed';
    menuOverlay.classList.add('show');
  }

  function closeMenu() {
    menuOverlay.classList.remove('show');
    if (gameOver && hasGame) {
      /* leave the player on the final board */
    }
  }

  function hideOverlays() {
    menuOverlay.classList.remove('show');
    endOverlay.classList.remove('show');
    promoOverlay.classList.remove('show');
  }

  function startGame() {
    settings.mode = menuMode;
    settings.sound = soundToggle.checked;
    settings.autoFlip = autoFlipEl.checked;
    saveSettings();
    syncSettingsUI();
    newGame();
  }

  menuModeCards.forEach(function (card) {
    card.addEventListener('click', function () {
      menuMode = card.dataset.mode;
      syncSettingsUI();
      playTick();
    });
  });

  difficultySeg.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-diff]');
    if (!b) return;
    settings.difficulty = b.dataset.diff;
    saveSettings();
    syncSettingsUI();
    playTick();
  });

  sideSeg.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-side]');
    if (!b) return;
    settings.side = b.dataset.side;
    saveSettings();
    syncSettingsUI();
    playTick();
  });

  soundToggle.addEventListener('change', function () {
    settings.sound = soundToggle.checked;
    saveSettings();
    syncSoundIcon();
    if (settings.sound) playTick();
  });

  autoFlipEl.addEventListener('change', function () {
    settings.autoFlip = autoFlipEl.checked;
    saveSettings();
    playTick();
  });

  btnStart.addEventListener('click', startGame);
  btnResume.addEventListener('click', closeMenu);
  btnMenuClose.addEventListener('click', closeMenu);

  $('btnMenu').addEventListener('click', openMenu);
  $('btnMenu2').addEventListener('click', openMenu);
  $('btnFlip').addEventListener('click', function () {
    flipped = !flipped;
    buildSquares();
    renderCorpses();
    renderAll(true);
    playTick();
  });
  btnSound.addEventListener('click', function () {
    settings.sound = !settings.sound;
    saveSettings();
    syncSoundIcon();
    if (settings.sound) playTick();
  });

  btnUndo.addEventListener('click', function () {
    if (btnUndo.disabled) return;
    undoMove();
    playTick();
  });

  $('btnRematch').addEventListener('click', function () {
    if (!hasGame) { openMenu(); return; }
    newGame();
  });

  $('btnRematchEnd').addEventListener('click', function () {
    newGame();
  });

  $('btnMenuEnd').addEventListener('click', function () {
    endOverlay.classList.remove('show');
    openMenu();
  });

  $('btnUndoEnd').addEventListener('click', function () {
    endOverlay.classList.remove('show');
    undoMove();
  });

  /* ---------------------------------------------------------- */
  /* Boot                                                       */
  /* ---------------------------------------------------------- */
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  buildSquares();
  updateCell();
  renderCorpses();
  renderAll(true);
  updateHud();
  syncSettingsUI();
  renderLog();
  setStatus('Tap a piece, then a square.');

  if (window.ResizeObserver) {
    new ResizeObserver(function () { updateCell(); }).observe(boardEl);
  } else {
    window.addEventListener('resize', updateCell);
  }

  document.addEventListener('pointerdown', function () { getAudio(); }, { once: true });

  /* expose a tiny debug handle for screenshots / testing */
  window.__bloodchess = {
    getState: function () { return state; },
    getTimeline: function () { return timeline; },
    getCorpses: function () { return corpses; },
    getKills: function () { return kills; },
    newGame: newGame,
    undo: undoMove,
    applyMove: applyMove,
    setStatus: setStatus
  };
})();
