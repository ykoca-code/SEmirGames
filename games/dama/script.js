/* ==========================================================================
   Türk Daması (Turkish Draughts) — 2-player on one device
   - 8×8, 16 pieces each
   - Movement: ONE square forward (or sideways for non-king)
   - Capture: jump straight over enemy onto empty square
   - Mandatory capture; chained captures must continue
   - Promotion: reach the far row → "Dame" (queen), moves any distance
     in any orthogonal direction; captures by jumping in a straight line
     with one empty square afterwards.
   ========================================================================== */
(function () {
  "use strict";

  const SIZE = 8;
  // White starts at the BOTTOM, moves UP (dr = -1).
  // Black starts at the TOP, moves DOWN (dr = +1).
  const WHITE = "w";
  const BLACK = "b";

  const state = {
    board: [],       // [r][c] = { color, king } | null
    turn: WHITE,
    selected: null,  // {r, c}
    moves: [],       // valid moves for selected piece, each { r, c, captures: [{r,c}] }
    mustCapture: false, // true if any piece of current player has a capture
    finished: false,
  };

  const els = {
    board: document.getElementById("board"),
    turnIndicator: document.getElementById("turnIndicator"),
    whiteCount: document.getElementById("whiteCount"),
    blackCount: document.getElementById("blackCount"),
    p1Box: document.getElementById("p1Box"),
    p2Box: document.getElementById("p2Box"),
    newGameBtn: document.getElementById("newGameBtn"),
    rulesBtn: document.getElementById("rulesBtn"),
    closeRulesBtn: document.getElementById("closeRulesBtn"),
    rulesModal: document.getElementById("rulesModal"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayBtn: document.getElementById("overlayBtn"),
  };

  // ==========================================================================
  // Setup
  // ==========================================================================
  function newGame() {
    state.board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    // Black on rows 1-2 (top), White on rows 5-6 (bottom)
    for (let c = 0; c < SIZE; c++) {
      state.board[1][c] = { color: BLACK, king: false };
      state.board[2][c] = { color: BLACK, king: false };
      state.board[5][c] = { color: WHITE, king: false };
      state.board[6][c] = { color: WHITE, king: false };
    }
    state.turn = WHITE;
    state.selected = null;
    state.moves = [];
    state.finished = false;
    updateMandatoryCapture();
    render();
    hideOverlay();
  }

  function buildGrid() {
    els.board.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const sq = document.createElement("div");
        sq.className = "sq " + ((r + c) % 2 === 0 ? "light" : "dark");
        sq.dataset.r = String(r);
        sq.dataset.c = String(c);
        els.board.appendChild(sq);
      }
    }
  }

  // ==========================================================================
  // Moves
  // ==========================================================================
  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  // For non-king: forward (color-dependent) + sideways (not backward)
  function nonKingDirs(color) {
    const forward = color === WHITE ? -1 : 1;
    return [
      [forward, 0], // forward
      [0, -1],      // left
      [0, 1],       // right
    ];
  }

  function allDirs() {
    return [[-1, 0], [1, 0], [0, -1], [0, 1]];
  }

  // Returns array of moves from (r,c). Each move: { r, c, captures: [{r,c}] }
  function getMovesFrom(r, c) {
    const piece = state.board[r][c];
    if (!piece) return [];
    const captures = getCapturesFrom(r, c, piece);
    if (captures.length) return captures;
    // Plain moves
    const plain = [];
    if (piece.king) {
      for (const [dr, dc] of allDirs()) {
        for (let i = 1; i < SIZE; i++) {
          const nr = r + dr * i;
          const nc = c + dc * i;
          if (!inBounds(nr, nc)) break;
          if (state.board[nr][nc]) break;
          plain.push({ r: nr, c: nc, captures: [] });
        }
      }
    } else {
      for (const [dr, dc] of nonKingDirs(piece.color)) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc) && !state.board[nr][nc]) {
          plain.push({ r: nr, c: nc, captures: [] });
        }
      }
    }
    return plain;
  }

  // Find capture sequences (DFS to chain captures).
  // Returns flat list of { r, c, captures: [...] }; we keep the longest chain
  // start nodes for the UI (Turkish rules require maximizing captures, but a
  // friendly relaxation: any capture is allowed, mandatory if available).
  function getCapturesFrom(r, c, piece) {
    const out = [];
    function rec(cr, cc, kinged, capturedSoFar, board) {
      // Search captures from (cr,cc)
      const dirs = (piece.king || kinged) ? allDirs() : nonKingDirs(piece.color);
      let anyCapture = false;
      for (const [dr, dc] of dirs) {
        if (piece.king || kinged) {
          // Look for first piece along the line
          let i = 1;
          while (inBounds(cr + dr * i, cc + dc * i) && !board[cr + dr * i][cc + dc * i]) i++;
          if (!inBounds(cr + dr * i, cc + dc * i)) continue;
          const mid = board[cr + dr * i][cc + dc * i];
          if (mid.color === piece.color) continue;
          if (capturedSoFar.find((p) => p.r === cr + dr * i && p.c === cc + dc * i)) continue;
          // Now land on next empty squares in same direction
          let j = i + 1;
          while (inBounds(cr + dr * j, cc + dc * j) && !board[cr + dr * j][cc + dc * j]) {
            anyCapture = true;
            const nr = cr + dr * j;
            const nc = cc + dc * j;
            const newCaps = capturedSoFar.concat([{ r: cr + dr * i, c: cc + dc * i }]);
            // Simulate continued from (nr,nc) for chains
            const savedTarget = board[cr + dr * i][cc + dc * i];
            board[cr + dr * i][cc + dc * i] = null;
            const childCaptures = simulateChain(nr, nc, piece, newCaps, board);
            board[cr + dr * i][cc + dc * i] = savedTarget;
            if (childCaptures.length === 0) {
              out.push({ r: nr, c: nc, captures: newCaps });
            } else {
              for (const child of childCaptures) out.push(child);
            }
            j++;
          }
        } else {
          // Non-king: single step, capture next-adjacent if enemy and one beyond empty
          const mr = cr + dr, mc = cc + dc;
          const lr = cr + dr * 2, lc = cc + dc * 2;
          if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;
          if (!board[mr][mc] || board[mr][mc].color === piece.color) continue;
          if (capturedSoFar.find((p) => p.r === mr && p.c === mc)) continue;
          if (board[lr][lc]) continue;
          anyCapture = true;
          const newCaps = capturedSoFar.concat([{ r: mr, c: mc }]);
          // Promotion check during chain: in Turkish rules, if you reach the
          // back row during a capture, you become Dame mid-jump.
          const promoted = !piece.king && willPromote(piece, lr);
          const savedMid = board[mr][mc];
          board[mr][mc] = null;
          const childCaptures = simulateChain(lr, lc, piece, newCaps, board, promoted);
          board[mr][mc] = savedMid;
          if (childCaptures.length === 0) {
            out.push({ r: lr, c: lc, captures: newCaps });
          } else {
            for (const child of childCaptures) out.push(child);
          }
        }
      }
    }
    rec(r, c, piece.king, [], cloneBoard(state.board));
    return out;
  }

  function simulateChain(r, c, piece, capturedSoFar, board, promoted) {
    // Recursively find further captures from (r,c).
    const out = [];
    const isKingNow = piece.king || promoted;
    const dirs = isKingNow ? allDirs() : nonKingDirs(piece.color);
    for (const [dr, dc] of dirs) {
      if (isKingNow) {
        let i = 1;
        while (inBounds(r + dr * i, c + dc * i) && !board[r + dr * i][c + dc * i]) i++;
        if (!inBounds(r + dr * i, c + dc * i)) continue;
        const mid = board[r + dr * i][c + dc * i];
        if (mid.color === piece.color) continue;
        if (capturedSoFar.find((p) => p.r === r + dr * i && p.c === c + dc * i)) continue;
        let j = i + 1;
        while (inBounds(r + dr * j, c + dc * j) && !board[r + dr * j][c + dc * j]) {
          const nr = r + dr * j;
          const nc = c + dc * j;
          const newCaps = capturedSoFar.concat([{ r: r + dr * i, c: c + dc * i }]);
          const savedT = board[r + dr * i][c + dc * i];
          board[r + dr * i][c + dc * i] = null;
          const child = simulateChain(nr, nc, piece, newCaps, board, true);
          board[r + dr * i][c + dc * i] = savedT;
          if (child.length === 0) out.push({ r: nr, c: nc, captures: newCaps });
          else for (const ch of child) out.push(ch);
          j++;
        }
      } else {
        const mr = r + dr, mc = c + dc;
        const lr = r + dr * 2, lc = c + dc * 2;
        if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;
        if (!board[mr][mc] || board[mr][mc].color === piece.color) continue;
        if (capturedSoFar.find((p) => p.r === mr && p.c === mc)) continue;
        if (board[lr][lc]) continue;
        const newCaps = capturedSoFar.concat([{ r: mr, c: mc }]);
        const newlyPromoted = willPromote(piece, lr);
        const savedM = board[mr][mc];
        board[mr][mc] = null;
        const child = simulateChain(lr, lc, piece, newCaps, board, promoted || newlyPromoted);
        board[mr][mc] = savedM;
        if (child.length === 0) out.push({ r: lr, c: lc, captures: newCaps });
        else for (const ch of child) out.push(ch);
      }
    }
    return out;
  }

  function willPromote(piece, landingRow) {
    if (piece.king) return false;
    return (piece.color === WHITE && landingRow === 0) ||
           (piece.color === BLACK && landingRow === SIZE - 1);
  }

  function cloneBoard(b) {
    return b.map((row) => row.map((cell) => (cell ? { color: cell.color, king: cell.king } : null)));
  }

  function updateMandatoryCapture() {
    state.mustCapture = false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = state.board[r][c];
        if (p && p.color === state.turn && getCapturesFrom(r, c, p).length) {
          state.mustCapture = true;
          return;
        }
      }
    }
  }

  // ==========================================================================
  // Interaction
  // ==========================================================================
  function onSquareTap(r, c) {
    if (state.finished) return;
    // If selected, try to move to (r,c)
    if (state.selected) {
      const m = state.moves.find((mv) => mv.r === r && mv.c === c);
      if (m) {
        executeMove(state.selected, m);
        return;
      }
      // Allow re-selecting another piece of the same color
      const cell = state.board[r][c];
      if (cell && cell.color === state.turn) {
        selectPiece(r, c);
        return;
      }
      // Otherwise clear selection
      state.selected = null;
      state.moves = [];
      render();
      return;
    }
    const cell = state.board[r][c];
    if (cell && cell.color === state.turn) selectPiece(r, c);
  }

  function selectPiece(r, c) {
    const piece = state.board[r][c];
    let moves = getMovesFrom(r, c);
    // If mandatory capture is active globally, only allow capture moves
    if (state.mustCapture) moves = moves.filter((m) => m.captures.length > 0);
    if (moves.length === 0) {
      state.selected = null;
      state.moves = [];
      render();
      return;
    }
    state.selected = { r, c };
    state.moves = moves;
    render();
  }

  function executeMove(from, move) {
    const piece = state.board[from.r][from.c];
    // Remove from origin
    state.board[from.r][from.c] = null;
    // Remove captured
    for (const cap of move.captures) state.board[cap.r][cap.c] = null;
    // Place at destination, possibly promoting
    const promote = willPromote(piece, move.r);
    state.board[move.r][move.c] = { color: piece.color, king: piece.king || promote };
    state.selected = null;
    state.moves = [];
    // Switch turn and update mandatory capture
    state.turn = state.turn === WHITE ? BLACK : WHITE;
    updateMandatoryCapture();
    render();
    checkEndState();
  }

  function checkEndState() {
    // Count pieces
    let wCount = 0, bCount = 0;
    let canMove = false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = state.board[r][c];
        if (!p) continue;
        if (p.color === WHITE) wCount++; else bCount++;
        if (p.color === state.turn && getMovesFrom(r, c).length) canMove = true;
      }
    }
    els.whiteCount.textContent = wCount;
    els.blackCount.textContent = bCount;

    if (wCount === 0) return endGame("Siyah Kazandı!");
    if (bCount === 0) return endGame("Beyaz Kazandı!");
    if (!canMove) {
      const winner = state.turn === WHITE ? "Siyah" : "Beyaz";
      return endGame(winner + " Kazandı! (Rakip hamlesiz kaldı)");
    }
  }

  function endGame(title) {
    state.finished = true;
    els.overlayTitle.textContent = "🏆 " + title;
    els.overlayText.textContent =
      "Beyaz: " + els.whiteCount.textContent + " taş · Siyah: " + els.blackCount.textContent + " taş";
    els.overlayBtn.textContent = "Yeni Oyun";
    els.overlay.classList.remove("hidden");
  }

  function hideOverlay() { els.overlay.classList.add("hidden"); }

  // ==========================================================================
  // Render
  // ==========================================================================
  function render() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const sq = els.board.children[r * SIZE + c];
        sq.className = "sq " + ((r + c) % 2 === 0 ? "light" : "dark");
        sq.innerHTML = "";
        const p = state.board[r][c];
        if (p) {
          const piece = document.createElement("div");
          piece.className = "piece " + p.color + (p.king ? " king" : "");
          sq.appendChild(piece);
        }
        if (state.selected && state.selected.r === r && state.selected.c === c) {
          sq.classList.add("selected");
        }
        const m = state.moves.find((mv) => mv.r === r && mv.c === c);
        if (m) {
          sq.classList.add(m.captures.length > 0 ? "capture" : "target");
        }
      }
    }

    // Turn indicator
    if (state.finished) {
      els.turnIndicator.textContent = "Oyun bitti";
    } else if (state.turn === WHITE) {
      els.turnIndicator.textContent = "Beyaz oynar";
    } else {
      els.turnIndicator.textContent = "Siyah oynar";
    }
    els.p1Box.classList.toggle("active", state.turn === WHITE && !state.finished);
    els.p2Box.classList.toggle("active", state.turn === BLACK && !state.finished);
  }

  // ==========================================================================
  // Bind & boot
  // ==========================================================================
  function bindEvents() {
    els.board.addEventListener("click", (e) => {
      const sq = e.target.closest(".sq");
      if (!sq) return;
      const r = +sq.dataset.r;
      const c = +sq.dataset.c;
      onSquareTap(r, c);
    });
    els.newGameBtn.addEventListener("click", newGame);
    els.overlayBtn.addEventListener("click", newGame);
    els.rulesBtn.addEventListener("click", () => els.rulesModal.classList.remove("hidden"));
    els.closeRulesBtn.addEventListener("click", () => els.rulesModal.classList.add("hidden"));
  }

  function boot() {
    buildGrid();
    bindEvents();
    newGame();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
