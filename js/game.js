const DIRECTIONS = ['top', 'right', 'bottom', 'left'];
const OPPOSITE_DIRECTION = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' };
const OTHER_SIDE = { player: 'ai', ai: 'player' };


function neighborIndex(index, direction, gridSize) {
  const row = Math.floor(index / gridSize);
  const col = index % gridSize;
  if (direction === 'top') return row > 0 ? index - gridSize : -1;
  if (direction === 'bottom') return row < gridSize - 1 ? index + gridSize : -1;
  if (direction === 'left') return col > 0 ? index - 1 : -1;
  if (direction === 'right') return col < gridSize - 1 ? index + 1 : -1;
  throw new Error(`Unknown direction: ${direction}`);
}

const ELEMENT_TILE_CHANCE = 0.45;

function generateBoardElements(cellCount, enabled) {
  return Array.from({ length: cellCount }, () => (
    enabled && Math.random() < ELEMENT_TILE_CHANCE ? ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)] : null
  ));
}

function createGame(playerHand, aiHand, firstTurn = 'player', rules = { same: false, sameWall: false, plus: false, combo: false, open: false, advance: false, memory: false, swap: false, slide: false, overkill: false, elemental: false, themed: false }, boardSize = 3) {
  const cellCount = boardSize * boardSize;
  return {
    board: Array(cellCount).fill(null), // each filled slot: { card, owner }
    boardElements: generateBoardElements(cellCount, !!rules.elemental),
    hands: { player: playerHand.slice(), ai: aiHand.slice() },
    turn: firstTurn,
    rules,
    boardSize,
    swapUsed: { player: false, ai: false }, // Swap rule: each side only gets one, for the whole game
  };
}

function cloneState(state) {
  return {
    board: state.board.slice(),
    boardElements: state.boardElements,
    hands: { player: state.hands.player.slice(), ai: state.hands.ai.slice() },
    turn: state.turn,
    rules: state.rules,
    boardSize: state.boardSize,
    swapUsed: { ...state.swapUsed },
    // Not read by any game logic here -- just a UI annotation (see main.js) that needs to survive
    // cloning so it doesn't silently reset to Expert after the game's first move.
    aiDifficulty: state.aiDifficulty,
  };
}

function effectiveCardValue(state, cellIndex, direction) {
  const cell = state.board[cellIndex];
  const rawValue = cell.card[direction];
  if (!state.rules.elemental || !state.boardElements) return rawValue;
  const tileElement = state.boardElements[cellIndex];
  if (!tileElement) return rawValue;
  const bonus = cell.card.element === tileElement ? 1 : -1;
  return Math.max(1, Math.min(10, rawValue + bonus));
}

function touchingNeighbors(state, cellIndex) {
  const result = [];
  for (const direction of DIRECTIONS) {
    const ni = neighborIndex(cellIndex, direction, state.boardSize);
    if (ni === -1) continue;
    const neighbor = state.board[ni];
    if (neighbor) result.push({ direction, ni, neighbor });
  }
  return result;
}

function getValidMoves(state, side) {
  const canSwap = state.rules.swap && !state.swapUsed[side];
  const moves = [];
  state.hands[side].forEach((_, handIndex) => {
    state.board.forEach((cell, cellIndex) => {
      if (!cell || (canSwap && cell.owner === side && !cell.locked)) {
        moves.push({ handIndex, cellIndex });
      }
    });
  });
  return moves;
}

function isOverkill(rules, attackValue, defendValue) {
  return !!rules.overkill && attackValue >= defendValue * 2;
}

function computeCaptures(state, side, cellIndex) {
  const card = state.board[cellIndex].card;
  const other = OTHER_SIDE[side];
  const rules = state.rules || {};
  const neighbors = touchingNeighbors(state, cellIndex);

  const captured = new Map();
  const comboSeeds = new Set();
  const triggeredRules = new Set();
  const markCaptured = (ni, overkill, comboSeed) => {
    captured.set(ni, (captured.get(ni) || false) || overkill);
    if (comboSeed) comboSeeds.add(ni);
  };

  // Basic rule: capture any unlocked opponent neighbor whose facing value the placed card beats.
  // Elemental tiles (if active) adjust both sides' effective values first.
  for (const { direction, ni, neighbor } of neighbors) {
    if (neighbor.owner === other && !neighbor.locked) {
      const attackValue = effectiveCardValue(state, cellIndex, direction);
      const defendValue = effectiveCardValue(state, ni, OPPOSITE_DIRECTION[direction]);
      if (attackValue > defendValue) {
        markCaptured(ni, isOverkill(rules, attackValue, defendValue), false);
      }
    }
  }

  // Same: 2+ sides where the placed card's value equals the neighbor's facing value (own/locked
  // cards can count toward that threshold without being captured). With Same Wall, a board edge
  // also counts as a match when the placed card shows a 10 (A) on that side. Plus: same idea,
  // but for sides whose facing values sum to a matching total.
  if (rules.same) {
    let matchCount = 0;
    const matchedNeighbors = [];
    for (const direction of DIRECTIONS) {
      const ni = neighborIndex(cellIndex, direction, state.boardSize);
      if (ni === -1) {
        if (rules.sameWall && card[direction] === 10) matchCount++;
        continue;
      }
      const neighbor = state.board[ni];
      if (neighbor && card[direction] === neighbor.card[OPPOSITE_DIRECTION[direction]]) {
        matchCount++;
        matchedNeighbors.push({ direction, ni, neighbor });
      }
    }
    if (matchCount >= 2) {
      for (const { direction, ni, neighbor } of matchedNeighbors) {
        if (neighbor.owner === other && !neighbor.locked) {
          markCaptured(ni, isOverkill(rules, card[direction], neighbor.card[OPPOSITE_DIRECTION[direction]]), true);
          triggeredRules.add('same');
        }
      }
    }
  }
  if (rules.plus) {
    const bySum = new Map();
    for (const { direction, ni, neighbor } of neighbors) {
      const sum = card[direction] + neighbor.card[OPPOSITE_DIRECTION[direction]];
      if (!bySum.has(sum)) bySum.set(sum, []);
      bySum.get(sum).push({ direction, ni, neighbor });
    }
    for (const group of bySum.values()) {
      if (group.length >= 2) {
        for (const { direction, ni, neighbor } of group) {
          if (neighbor.owner === other && !neighbor.locked) {
            markCaptured(ni, isOverkill(rules, card[direction], neighbor.card[OPPOSITE_DIRECTION[direction]]), true);
            triggeredRules.add('plus');
          }
        }
      }
    }
  }

  return { captured, comboSeeds, triggeredRules };
}

function applyCaptures(state, captured, side) {
  for (const [ni, overkill] of captured) {
    state.board[ni] = { card: state.board[ni].card, owner: side, locked: overkill };
  }
}

function runCombo(state, comboSeeds, side) {
  const other = OTHER_SIDE[side];
  const rules = state.rules || {};
  const queue = [...comboSeeds];
  const capturedNi = new Set();
  while (queue.length) {
    const comboIndex = queue.shift();
    for (const { direction, ni, neighbor } of touchingNeighbors(state, comboIndex)) {
      if (neighbor.owner === other && !neighbor.locked) {
        const attackValue = effectiveCardValue(state, comboIndex, direction);
        const defendValue = effectiveCardValue(state, ni, OPPOSITE_DIRECTION[direction]);
        if (attackValue > defendValue) {
          const overkill = isOverkill(rules, attackValue, defendValue);
          state.board[ni] = { card: neighbor.card, owner: side, locked: overkill };
          queue.push(ni);
          capturedNi.add(ni);
        }
      }
    }
  }
  return capturedNi;
}

function defaultChooseDestination(candidates) {
  return candidates[0];
}

function advanceCard(state, side, cellIndex, chooseDestination = defaultChooseDestination, events) {
  let current = cellIndex;
  let firstHop = true;
  for (;;) {
    const { captured, comboSeeds, triggeredRules } = computeCaptures(state, side, current);
    if (captured.size === 0) break;
    applyCaptures(state, captured, side);
    if (events) {
      triggeredRules.forEach((rule) => events.rules.add(rule));
      events.rules.add(firstHop ? 'advance' : 'combo');
    }
    if (state.rules.combo) {
      const comboCaptured = runCombo(state, comboSeeds, side);
      if (events && comboCaptured.size) {
        events.rules.add('combo');
        comboCaptured.forEach((ni) => events.comboCells.add(ni));
      }
    }

    const candidates = [...captured.keys()];
    const destination = candidates.length === 1 ? candidates[0] : chooseDestination(candidates, state, current);
    state.board[destination] = { card: state.board[current].card, owner: side };
    state.board[current] = null;
    current = destination;
    firstHop = false;

    if (!state.rules.combo) break;
  }
  return current;
}

function resolveCellEffects(state, side, cellIndex, chooseAdvanceDestination, events) {
  if (state.rules.advance) {
    advanceCard(state, side, cellIndex, chooseAdvanceDestination, events);
  } else {
    const { captured, comboSeeds, triggeredRules } = computeCaptures(state, side, cellIndex);
    applyCaptures(state, captured, side);
    if (events) triggeredRules.forEach((rule) => events.rules.add(rule));
    if (state.rules.combo) {
      const comboCaptured = runCombo(state, comboSeeds, side);
      if (events && comboCaptured.size) {
        events.rules.add('combo');
        comboCaptured.forEach((ni) => events.comboCells.add(ni));
      }
    }
  }
}

function applyMove(state, side, handIndex, cellIndex, chooseAdvanceDestination, events) {
  const next = cloneState(state);
  const card = next.hands[side][handIndex];
  next.hands[side].splice(handIndex, 1);
  // Swap rule: getValidMoves only allows targeting an occupied cell if it's your own unlocked
  // card, so any existing occupant here just goes back to your hand. Each side only gets one.
  const existing = next.board[cellIndex];
  if (existing) {
    next.hands[side].push(existing.card);
    next.swapUsed[side] = true;
  }
  next.board[cellIndex] = { card, owner: side };

  resolveCellEffects(next, side, cellIndex, chooseAdvanceDestination, events);

  next.turn = OTHER_SIDE[side];
  return next;
}

function applySlideMove(state, side, fromIndex, toIndex, chooseAdvanceDestination, events) {
  const next = cloneState(state);
  const card = next.board[fromIndex].card;
  next.board[fromIndex] = null;
  next.board[toIndex] = { card, owner: side };

  resolveCellEffects(next, side, toIndex, chooseAdvanceDestination, events);

  next.turn = OTHER_SIDE[side];
  return next;
}

function getValidSlideMoves(state, side) {
  if (!state.rules.slide) return [];
  const moves = [];
  state.board.forEach((cell, cellIndex) => {
    if (!cell || cell.owner !== side || cell.locked) return;
    for (const direction of DIRECTIONS) {
      const ni = neighborIndex(cellIndex, direction, state.boardSize);
      if (ni !== -1 && !state.board[ni]) moves.push({ fromIndex: cellIndex, toIndex: ni });
    }
  });
  return moves;
}

function getAllMoves(state, side) {
  return [...getValidMoves(state, side), ...getValidSlideMoves(state, side)];
}

function isGameOver(state) {
  // Only the side about to move matters here -- turn always alternates one-for-one after every
  // move (including Slide, which doesn't spend a hand card), so if the other side emptied their
  // hand first, they simply don't get checked again until it's their turn; whoever's up now still
  // gets to play as long as they have cards, even if that leaves the two hand counts uneven.
  return state.board.every((cell) => cell !== null)
    || state.hands[state.turn].length === 0;
}

function computeScore(state) {
  const score = { player: state.hands.player.length, ai: state.hands.ai.length };
  for (const cell of state.board) {
    if (cell) score[cell.owner]++;
  }
  return score;
}

function cardBalance(state, side) {
  const score = computeScore(state);
  return score[side] - score[OTHER_SIDE[side]];
}
