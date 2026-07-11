// Standard's heuristic is adapted from https://github.com/itdelatrisu/triple-triad-html5
// Expert's minimax is adapted from https://github.com/visadb/ff8_tthelper

// --- Expert difficulty ---------------------------------------------------------------------

const AI_SEARCH_DEPTH = 4;

// Depth 4 suits the default 3x3/5-card game (~45 root moves); alpha-beta cost grows roughly with
// branchingFactor^depth, so a bigger board/deck (a 5x5 with 13-card hands starts at 325) would
// otherwise be billions of nodes and freeze the tab. Scale depth down as branching grows instead.
function searchDepthFor(branchingFactor) {
  if (branchingFactor <= 60) return AI_SEARCH_DEPTH;
  if (branchingFactor <= 150) return 3;
  if (branchingFactor <= 400) return 2;
  return 1;
}

function maxPowersInHand(hand) {
  const max = { top: -1, right: -1, bottom: -1, left: -1 };
  for (const card of hand) {
    for (const direction of DIRECTIONS) {
      if (card[direction] > max[direction]) max[direction] = card[direction];
    }
  }
  return max;
}

function canCardBeCaptured(board, cellIndex, card, opponentMaxPowers, gridSize) {
  return DIRECTIONS.some((direction) => {
    const ni = neighborIndex(cellIndex, direction, gridSize);
    if (ni === -1 || board[ni]) return false;
    return opponentMaxPowers[OPPOSITE_DIRECTION[direction]] > card[direction];
  });
}

function evaluateNode(state, forSide) {
  const otherSide = OTHER_SIDE[forSide];
  const myMaxPowers = maxPowersInHand(state.hands[forSide]);
  const oppMaxPowers = maxPowersInHand(state.hands[otherSide]);

  let gridValue = 0;
  state.board.forEach((cell, cellIndex) => {
    if (!cell) return;
    const threatensFrom = cell.owner === forSide ? oppMaxPowers : myMaxPowers;
    const vulnerable = canCardBeCaptured(state.board, cellIndex, cell.card, threatensFrom, state.boardSize);
    const sign = cell.owner === forSide ? 1 : -1;
    gridValue += sign * (vulnerable ? 5 : 15);
  });

  return gridValue + state.hands[forSide].length * 10 - state.hands[otherSide].length * 10;
}

// A move is either a hand placement ({handIndex, cellIndex}) or a board-to-board slide
// ({fromIndex, toIndex}) -- discriminated by shape. Shared by both AIs so neither has to special-
// case Slide moves itself.
function isSlideMove(move) {
  return move.fromIndex !== undefined;
}

function applyAnyMove(state, side, move) {
  return isSlideMove(move)
    ? applySlideMove(state, side, move.fromIndex, move.toIndex)
    : applyMove(state, side, move.handIndex, move.cellIndex);
}

// Cheap move ordering so alpha-beta prunes more: try moves that capture the most cards first.
// Also used by Standard's heuristic below to score its own candidates.
function countCaptures(state, side, move) {
  const before = computeScore(state)[side];
  const after = applyAnyMove(state, side, move);
  return computeScore(after)[side] - before;
}

function orderedMoves(state, side) {
  const moves = getAllMoves(state, side);
  moves.sort((a, b) => countCaptures(state, side, b) - countCaptures(state, side, a));
  return moves;
}

function alphaBeta(state, depth, alpha, beta, forSide) {
  if (isGameOver(state)) {
    return { move: null, value: cardBalance(state, forSide) * 100 };
  }
  if (depth === 0) {
    return { move: null, value: evaluateNode(state, forSide) };
  }

  const maximizing = state.turn === forSide;
  const moves = orderedMoves(state, state.turn);
  let bestMove = moves[0];
  let bestValue = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const child = applyAnyMove(state, state.turn, move);
    const { value } = alphaBeta(child, depth - 1, alpha, beta, forSide);

    if (maximizing ? value > bestValue : value < bestValue) {
      bestValue = value;
      bestMove = move;
    }

    if (maximizing) alpha = Math.max(alpha, bestValue);
    else beta = Math.min(beta, bestValue);
    if (beta <= alpha) break;
  }

  return { move: bestMove, value: bestValue };
}

function getBestMove(state, side, depth) {
  const searchDepth = depth || searchDepthFor(getAllMoves(state, side).length);
  return alphaBeta(state, searchDepth, -Infinity, Infinity, side).move;
}

// --- Standard difficulty ---------------------------------------------------------------------

// Elemental bonus (+1 matching / -1 mismatched) `card` would get from cellIndex's tile, if it
// were placed there -- mirrors game.js's effectiveCardValue, but for a card not yet on the board.
function standardElementBonus(state, cellIndex, card) {
  if (!state.rules.elemental || !state.boardElements) return 0;
  const tileElement = state.boardElements[cellIndex];
  if (!tileElement) return 0;
  return card.element === tileElement ? 1 : -1;
}

// "Rank difference" exposure of `card` if it were placed at cellIndex: for every side that faces
// an empty neighboring cell (a future opposing card could show up there and attack that side),
// sum (10 - value) on that side. 0 means every exposed side already shows a strong value; higher
// means the card would be left vulnerable.
function standardRankDiff(state, cellIndex, card) {
  let totalValue = 0;
  let sides = 0;
  for (const direction of DIRECTIONS) {
    const ni = neighborIndex(cellIndex, direction, state.boardSize);
    if (ni === -1 || state.board[ni]) continue; // wall, or a neighbor already sits there: not exposed
    totalValue += card[direction];
    sides++;
  }
  if (sides > 0) totalValue += standardElementBonus(state, cellIndex, card) * sides;
  return Math.max(sides * 10 - totalValue, 0);
}

// Sum of standardRankDiff for every one of `side`'s cards currently on the board -- a snapshot of
// how exposed its whole board presence is right now.
function standardBoardRankDiff(state, side) {
  let total = 0;
  state.board.forEach((cell, cellIndex) => {
    if (cell && cell.owner === side) total += standardRankDiff(state, cellIndex, cell.card);
  });
  return total;
}

// How much of standardBoardRankDiff's total is currently propped up by cellIndex being empty --
// the facing values of side's own neighbors that would stop counting as "exposed" once cellIndex
// gets occupied. `boardRankDiff + standardRankDiff(newCard) - this` approximates the board's new
// total exposure after the placement, without recomputing every card's exposure from scratch.
function standardSideRankDiff(state, cellIndex, side) {
  let total = 0;
  for (const direction of DIRECTIONS) {
    const ni = neighborIndex(cellIndex, direction, state.boardSize);
    if (ni === -1) continue;
    const neighbor = state.board[ni];
    if (!neighbor || neighbor.owner !== side) continue;
    const facing = neighbor.card[OPPOSITE_DIRECTION[direction]];
    total += facing + standardElementBonus(state, ni, neighbor.card);
  }
  return total;
}

// Purely defensive fallback for when no move captures anything: whichever card/cell combo leaves
// `side`'s board presence least exposed overall, preferring to spend the lowest-rank card when
// otherwise tied (saving stronger cards for later) -- except on the second-to-last move of a
// 2-card hand, where that's flipped so the last card played is the (usually stronger) one.
function standardMinExposureMove(state, side) {
  const hand = state.hands[side];
  const spaces = [];
  state.board.forEach((cell, cellIndex) => { if (!cell) spaces.push(cellIndex); });
  const boardRankDiff = standardBoardRankDiff(state, side);
  const preferLowRank = spaces.length % 2 !== 0 || hand.length !== 2;

  let best = null;
  let bestTotal = Infinity;
  let bestRank = -1;
  for (const cellIndex of spaces) {
    const sideDiff = standardSideRankDiff(state, cellIndex, side);
    hand.forEach((card, handIndex) => {
      const total = boardRankDiff + standardRankDiff(state, cellIndex, card) - sideDiff;
      const better = total < bestTotal
        || (total === bestTotal && (preferLowRank ? card.rank < bestRank : card.rank > bestRank));
      if (better) {
        bestTotal = total;
        bestRank = card.rank;
        best = { handIndex, cellIndex };
      }
    });
  }
  return best;
}

function getStandardMove(state, side) {
  const hand = state.hands[side];
  const emptyCount = state.board.filter((cell) => !cell).length;
  const preferLowRank = emptyCount % 2 !== 0 || hand.length !== 2;
  const score = computeScore(state);
  const isLosing = score[side] < score[OTHER_SIDE[side]];

  let best = null;
  let maxCapture = -1;
  let bestRankDiff = 41;
  let bestRank = -1;

  for (const move of getAllMoves(state, side)) {
    const card = isSlideMove(move) ? state.board[move.fromIndex].card : hand[move.handIndex];
    const cellIndex = isSlideMove(move) ? move.toIndex : move.cellIndex;
    const captured = countCaptures(state, side, move);
    const rankDiff = standardRankDiff(state, cellIndex, card);

    let isValid = false;
    if (maxCapture === -1) {
      isValid = true;
    } else if (captured > maxCapture) {
      if (captured > 2 || bestRankDiff - rankDiff > -5 || isLosing) isValid = true;
    } else if (captured === maxCapture) {
      if (rankDiff < bestRankDiff
        || (rankDiff === bestRankDiff && (preferLowRank ? card.rank < bestRank : card.rank > bestRank))) {
        isValid = true;
      }
    } else if (captured === maxCapture - 1 && !isLosing) {
      if (bestRankDiff - rankDiff > 5) isValid = true;
    }

    if (isValid) {
      maxCapture = captured;
      bestRankDiff = rankDiff;
      bestRank = card.rank;
      best = move;
    }
  }

  // No capture available anywhere, and it's not the opening move of an empty board: fall back to
  // the purely defensive placement instead of the (arbitrary) first candidate the loop above left.
  if (maxCapture === 0 && emptyCount !== state.boardSize * state.boardSize) {
    const fallback = standardMinExposureMove(state, side);
    if (fallback) return fallback;
  }
  return best;
}
