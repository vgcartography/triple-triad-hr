// Add a suffix here to pull in another card set: it must have a matching
// img/cardcanvas_<suffix>.png sheet and js/cardlist_<suffix>.csv stats file.
const CARD_SET_LABELS = {
    ff6: 'FFVI',
    ff7: 'FFVII',
    ff8: 'FFVIII',
    cc: 'CHRONO',
    sh: 'SH',
    ps1: 'PSX'
};
const CARD_SET_SUFFIXES = Object.keys(CARD_SET_LABELS);
const CARD_SHEETS = CARD_SET_SUFFIXES.map((suffix) => ({
  sheetSrc: `img/cardcanvas_${suffix}.png`,
  statsSrc: `js/lists/${suffix}.csv`,
  set: suffix,
}));

// board.png = 1256x1011
const BOARD_NATIVE_WIDTH = 1256;
const BOARD_NATIVE_HEIGHT = 1011;
const CELL_ORIGIN_X = 334;
const CELL_ORIGIN_Y = 136;
const CELL_WIDTH = 184;
const CELL_HEIGHT = 238;
const CELL_GAP_X = 20;
const CELL_GAP_Y = 18;

const BOARD_SIZE_MIN = 3;
const BOARD_SIZE_MAX = 5;
const BOARD_SIZE_DEFAULT = 3;
const PLAY_AREA_WIDTH = BOARD_SIZE_DEFAULT * CELL_WIDTH + (BOARD_SIZE_DEFAULT - 1) * CELL_GAP_X;
const PLAY_AREA_HEIGHT = BOARD_SIZE_DEFAULT * CELL_HEIGHT + (BOARD_SIZE_DEFAULT - 1) * CELL_GAP_Y;
const CELL_GAP_RATIO_X = CELL_GAP_X / CELL_WIDTH;
const CELL_GAP_RATIO_Y = CELL_GAP_Y / CELL_HEIGHT;

const FLIP_STAGE_MS = 300;
const ARC_DURATION_MS = 400;
const ARC_HEIGHT_PERCENT = 8;
const ARC_STEPS = 20;

const LOOSE_TOSS_DURATION_MS = 800;
const LOOSE_TOSS_MIN_TURNS = 0;
const LOOSE_TOSS_MAX_TURNS = 1;

const DEAL_IN_DURATION_MS = 260;
const DEAL_IN_STAGGER_MS = 45;

const HAND_ORIGIN = {
  player: { x: 106, y: 132 },
  ai: { x: 980, y: 138 },
};
const HAND_SPACING_Y_MAX = 130;
const HAND_INWARD_OFFSET = 20;
const HAND_INWARD_DIR = { player: 1, ai: -1 };
const HAND_SCORE_GAP = 20;
const HAND_SCORE_HEIGHT = 60;

const DECK_SIZE_MIN = 5;
const DECK_SIZE_MAX = 13;
const HAND_COLUMN_SPAN_CAP = (DECK_SIZE_MIN - 1) * HAND_SPACING_Y_MAX + CELL_HEIGHT;

function handSpacingY(handSize) {
  if (handSize <= 1) return 0;
  return Math.min(HAND_SPACING_Y_MAX, (HAND_COLUMN_SPAN_CAP - CELL_HEIGHT) / (handSize - 1));
}

const TURN_INDICATOR_GAP = 24;
const TURN_INDICATOR_SPIN_MS = 1500;
const TURN_INDICATOR_SPIN_TURNS = 4;
const TURN_INDICATOR_MOVE_MS = 600;
const SWAP_OK_LABEL_GAP = 40;

function rectPercent(x, y, width = CELL_WIDTH, height = CELL_HEIGHT) {
  return {
    left: (x / BOARD_NATIVE_WIDTH) * 100,
    top: (y / BOARD_NATIVE_HEIGHT) * 100,
    width: (width / BOARD_NATIVE_WIDTH) * 100,
    height: (height / BOARD_NATIVE_HEIGHT) * 100,
  };
}

function applyRect(el, rect) {
  el.style.left = `${rect.left}%`;
  el.style.top = `${rect.top}%`;
  el.style.width = `${rect.width}%`;
  el.style.height = `${rect.height}%`;
}

function boardCellGeometry(boardSize) {
  const width = PLAY_AREA_WIDTH / (boardSize + CELL_GAP_RATIO_X * (boardSize - 1));
  const height = PLAY_AREA_HEIGHT / (boardSize + CELL_GAP_RATIO_Y * (boardSize - 1));
  return { width, height, gapX: width * CELL_GAP_RATIO_X, gapY: height * CELL_GAP_RATIO_Y };
}

function cellRectPercent(cellIndex, boardSize) {
  const { width, height, gapX, gapY } = boardCellGeometry(boardSize);
  const row = Math.floor(cellIndex / boardSize);
  const col = cellIndex % boardSize;
  const x = CELL_ORIGIN_X + col * (width + gapX);
  const y = CELL_ORIGIN_Y + row * (height + gapY);
  return rectPercent(x, y, width, height);
}

function handSlotRect(side, handIndex, { selected = false } = {}) {
  const origin = HAND_ORIGIN[side];
  const x = origin.x + (selected ? HAND_INWARD_OFFSET * HAND_INWARD_DIR[side] : 0);
  const y = origin.y + handIndex * handSpacingY(selectedDeckSize);
  return rectPercent(x, y);
}

let allCards = [];
let game = null;
let selectedHandIndex = null;
let selectedSlideIndex = null;
let thinking = false;
let animating = false;
let coinFlipping = false;
let hoveredCardName = null;
let cellEls = [];
let handSlotEls = { player: [], ai: [] };
let displayedBoard = [];

const boardWrapEl = document.querySelector('.board-wrap');
const boardAreaBackingEl = document.getElementById('board-area-backing');
const gridEl = document.getElementById('grid');
const handPlayerEl = document.getElementById('hand-player');
const handAiEl = document.getElementById('hand-ai');
const statusEl = document.getElementById('status');
const scoreEls = {
  player: document.getElementById('score-player'),
  ai: document.getElementById('score-ai'),
};
const rankFacetEl = document.getElementById('rank-facet');
const dealOptionsFacetEl = document.getElementById('deal-options-facet');
const ranksInfoBtnEl = document.getElementById('ranks-info-btn');
const ranksInfoPopoverEl = document.getElementById('ranks-info-popover');
const ranksInfoListEl = document.getElementById('ranks-info-list');
const rulesFacetEl = document.getElementById('rules-facet');
const rulesInfoBtnEl = document.getElementById('rules-info-btn');
const rulesInfoPopoverEl = document.getElementById('rules-info-popover');
const houseRulesFacetEl = document.getElementById('house-rules-facet');
const houseRulesInfoBtnEl = document.getElementById('house-rules-info-btn');
const houseRulesInfoPopoverEl = document.getElementById('house-rules-info-popover');
const deckSizeMinusEl = document.getElementById('deck-size-minus');
const deckSizePlusEl = document.getElementById('deck-size-plus');
const deckSizeValueEl = document.getElementById('deck-size-value');
const boardSizeFacetEl = document.getElementById('board-size-facet');
const decksFacetToggleEl = document.getElementById('decks-facet-toggle');
const decksFacetPanelEl = document.getElementById('decks-facet-panel');
const decksFacetChipsEl = document.getElementById('decks-facet-chips');
const aiDifficultyFacetEl = document.getElementById('ai-difficulty-facet');
const topButtonsEl = document.getElementById('top-buttons');
const newGameBtnEl = document.getElementById('new-game-btn');
const restartGameBtnEl = document.getElementById('restart-game-btn');
const dealAgainBtnEl = document.getElementById('deal-again-btn');
const cardCatalogBtnEl = document.getElementById('card-catalog-btn');
const cardCatalogOverlayEl = document.getElementById('card-catalog-overlay');
const cardCatalogSetFacetEl = document.getElementById('card-catalog-set-facet');
const cardCatalogGridEl = document.getElementById('card-catalog-grid');
const cardCatalogCloseBtnEl = document.getElementById('card-catalog-close-btn');
const catalogRankFacetEl = document.getElementById('catalog-rank-facet');
const catalogRankPrevEl = document.getElementById('catalog-rank-prev');
const catalogRankNextEl = document.getElementById('catalog-rank-next');
const turnIndicatorEl = document.getElementById('turn-indicator');
const swapOkLabelEl = document.getElementById('swap-ok-label');
const setupModalOverlayEl = document.getElementById('setup-modal-overlay');
const startGameBtnEl = document.getElementById('start-game-btn');
const eventBannerEl = document.getElementById('event-banner');
const eventBannerLetterEl = document.getElementById('event-banner-letter');
const eventBannerRestEl = document.getElementById('event-banner-rest');
const endgameBannerLayerEl = document.getElementById('endgame-banner-layer');
const endgameBannerYouEl = document.getElementById('endgame-banner-you');
const endgameBannerLetterEl = document.getElementById('endgame-banner-letter');
const endgameBannerRestEl = document.getElementById('endgame-banner-rest');

const EVENT_BANNER_INFO = {
  same: { word: 'SAME!', badgeColor: '#1dba24' },
  plus: { word: 'PLUS!', badgeColor: '#203dff' },
  combo: { word: 'COMBO!', badgeColor: '#ff1800' },
  advance: { word: 'ADVANCE!', badgeColor: '#de00ff' },
};

const ENDGAME_BANNER_INFO = {
  win: { letter: 'W', rest: 'in!', letterColor: '#fe47ad' },
  lose: { letter: 'L', rest: 'ose...', letterColor: '#3a32ea' },
  draw: { letter: 'D', rest: 'raw', letterColor: '#19fc17' },
};

const RULE_OPTIONS = [
  { key: 'plus', label: 'Plus' },
  { key: 'combo', label: 'Combo' },
  { key: 'open', label: 'Open' },
  { key: 'elemental', label: 'Elemental' },
];

const HOUSE_RULE_OPTIONS = [
  { key: 'advance', label: 'Advance' },
  { key: 'memory', label: 'Memory' },
  { key: 'swap', label: 'Swap' },
  { key: 'slide', label: 'Slide' },
  { key: 'overkill', label: 'Overkill' },
];

const STYLE_OPTIONS = [
  { key: 'loose', label: 'Loose' },
];

const DEAL_OPTIONS = [
  { key: 'mirror', label: 'Mirror' },
  { key: 'rng', label: 'RNG' },
];

const ALL_RANKS_SET = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

const LOOSE_MAX_ROTATE_DEG = 8;
const LOOSE_MAX_OFFSET_PX = 6;

let selectedRanks = new Set([3, 4, 5]);
let selectedRules = new Set(['open' , 'themed']);
let selectedStyle = new Set();
let selectedDealOptions = new Set();
let selectedDeckSize = DECK_SIZE_MIN;
let selectedBoardSize = BOARD_SIZE_DEFAULT;
let selectedDecks = new Set(CARD_SET_SUFFIXES);
const AI_DIFFICULTY_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'expert', label: 'Expert' },
];
let selectedAiDifficulty = 'standard';
let looseTransforms = new Map();

function getLooseJitter(card, context) {
  const key = `${context}-${card.index}`;
  if (!looseTransforms.has(key)) {
    looseTransforms.set(key, {
      rotate: (Math.random() * 2 - 1) * LOOSE_MAX_ROTATE_DEG,
      dx: (Math.random() * 2 - 1) * LOOSE_MAX_OFFSET_PX,
      dy: (Math.random() * 2 - 1) * LOOSE_MAX_OFFSET_PX,
    });
  }
  return looseTransforms.get(key);
}

function looseCardTransform(card, context) {
  if (!selectedStyle.has('loose')) return '';
  const { rotate, dx, dy } = getLooseJitter(card, context);
  return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rotate.toFixed(1)}deg)`;
}

function setupInfoPopover(btnEl, popoverEl) {
  btnEl.addEventListener('click', (e) => {
    e.stopPropagation();
    popoverEl.hidden = !popoverEl.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!popoverEl.hidden && !popoverEl.contains(e.target) && e.target !== btnEl) {
      popoverEl.hidden = true;
    }
  });
}

setupInfoPopover(ranksInfoBtnEl, ranksInfoPopoverEl);
setupInfoPopover(rulesInfoBtnEl, rulesInfoPopoverEl);
setupInfoPopover(houseRulesInfoBtnEl, houseRulesInfoPopoverEl);

boardWrapEl.addEventListener('mouseover', (e) => {
  const cardEl = e.target.closest('.card');
  if (!cardEl || !cardEl.dataset.name) return;
  hoveredCardName = cardEl.dataset.name;
  renderStatus();
});

boardWrapEl.addEventListener('mouseout', (e) => {
  const cardEl = e.target.closest('.card');
  if (!cardEl) return;
  if (e.relatedTarget && cardEl.contains(e.relatedTarget)) return;
  hoveredCardName = null;
  renderStatus();
});

function setupBoardAreaBacking() {
  applyRect(boardAreaBackingEl, rectPercent(CELL_ORIGIN_X, CELL_ORIGIN_Y, PLAY_AREA_WIDTH, PLAY_AREA_HEIGHT));
}

function setupGrid() {
  gridEl.innerHTML = '';
  cellEls = [];
  const cellCount = game.boardSize * game.boardSize;
  displayedBoard = Array(cellCount).fill(null);
  // board.png's ornate grid art is baked in at 3x3; any other size masks it and draws its own
  // cell borders instead of relying on the (mismatched) image.
  const generic = game.boardSize !== BOARD_SIZE_DEFAULT;
  boardAreaBackingEl.classList.toggle('visible', generic);
  for (let i = 0; i < cellCount; i++) {
    const cellEl = document.createElement('div');
    cellEl.className = generic ? 'cell framed' : 'cell';
    applyRect(cellEl, cellRectPercent(i, game.boardSize));
    cellEl.addEventListener('click', () => handleCellClick(i));
    gridEl.appendChild(cellEl);
    cellEls.push(cellEl);
  }
  for (let i = 0; i < cellCount; i++) renderCellElementIcon(i);
}

function boardElementBonus(cellIndex, card) {
  if (!game.rules.elemental || !game.boardElements) return null;
  const tileElement = game.boardElements[cellIndex];
  if (!tileElement) return null;
  return card.element === tileElement ? 1 : -1;
}

function renderCellElementIcon(cellIndex) {
  const cellEl = cellEls[cellIndex];
  cellEl.innerHTML = '';
  if (!game.rules.elemental || !game.boardElements) return;
  const element = game.boardElements[cellIndex];
  if (!element || !ELEMENT_ICON_SRC[element]) return;
  const icon = document.createElement('img');
  icon.className = 'cell-element';
  icon.src = ELEMENT_ICON_SRC[element];
  icon.alt = element;
  cellEl.appendChild(icon);
}

function setupHandSlots() {
  for (const side of ['player', 'ai']) {
    const container = side === 'player' ? handPlayerEl : handAiEl;
    container.innerHTML = '';
    handSlotEls[side] = [];
    for (let i = 0; i < selectedDeckSize; i++) {
      const slotEl = document.createElement('div');
      slotEl.className = 'hand-slot';
      container.appendChild(slotEl);
      handSlotEls[side].push(slotEl);
    }
  }
}

function setupHandScores() {
  for (const side of ['player', 'ai']) {
    const origin = HAND_ORIGIN[side];
    const y = origin.y + (selectedDeckSize - 1) * handSpacingY(selectedDeckSize) + CELL_HEIGHT + HAND_SCORE_GAP;
    applyRect(scoreEls[side], rectPercent(origin.x, y, CELL_WIDTH, HAND_SCORE_HEIGHT));
  }
}

function setupStatusPosition() {
  const y = HAND_ORIGIN.player.y + (selectedDeckSize - 1) * handSpacingY(selectedDeckSize) + CELL_HEIGHT + HAND_SCORE_GAP;
  const x = HAND_ORIGIN.player.x + CELL_WIDTH;
  const width = HAND_ORIGIN.ai.x - x;
  applyRect(statusEl, rectPercent(x, y, width, HAND_SCORE_HEIGHT));
}

function turnIndicatorHandPos(side) {
  const origin = HAND_ORIGIN[side];
  const rect = rectPercent(origin.x, origin.y, CELL_WIDTH, CELL_HEIGHT);
  return {
    left: rect.left + rect.width / 2,
    top: rect.top - (TURN_INDICATOR_GAP / BOARD_NATIVE_HEIGHT) * 100,
  };
}

function turnIndicatorCenterPos() {
  return {
    left: ((CELL_ORIGIN_X + PLAY_AREA_WIDTH / 2) / BOARD_NATIVE_WIDTH) * 100,
    top: ((CELL_ORIGIN_Y + PLAY_AREA_HEIGHT / 2) / BOARD_NATIVE_HEIGHT) * 100,
  };
}

function setTurnIndicatorTransform(rotateDeg, { animate = true } = {}) {
  if (!animate) turnIndicatorEl.style.transition = 'none';
  turnIndicatorEl.style.transform = `translate(-50%, -50%) rotate(${rotateDeg}deg)`;
  if (!animate) {
    void turnIndicatorEl.offsetWidth;
    turnIndicatorEl.style.transition = '';
  }
}

function setTurnIndicatorPos(pos, { animate = true } = {}) {
  if (!animate) turnIndicatorEl.style.transition = 'none';
  turnIndicatorEl.style.left = `${pos.left}%`;
  turnIndicatorEl.style.top = `${pos.top}%`;
  if (!animate) {
    void turnIndicatorEl.offsetWidth;
    turnIndicatorEl.style.transition = '';
  }
}

function sideRotationDeg(side) {
  return side === 'player' ? 90 : -90;
}

async function runCoinFlip(winner) {
  turnIndicatorEl.classList.remove('spinning');
  turnIndicatorEl.style.opacity = '1';
  setTurnIndicatorPos(turnIndicatorCenterPos(), { animate: false });
  setTurnIndicatorTransform(90, { animate: false });

  const totalTurns = winner == 'player' ? TURN_INDICATOR_SPIN_TURNS : TURN_INDICATOR_SPIN_TURNS + 0.5;
  turnIndicatorEl.style.setProperty('--spin-end-deg', `${totalTurns * 360}deg`);
  turnIndicatorEl.classList.add('spinning');

  await new Promise((resolve) => {
    turnIndicatorEl.addEventListener('animationend', function onEnd() {
      turnIndicatorEl.removeEventListener('animationend', onEnd);
      resolve();
    }, { once: true });
  });

  turnIndicatorEl.classList.remove('spinning');
  setTurnIndicatorTransform(sideRotationDeg(winner), { animate: false });

  setTurnIndicatorPos(turnIndicatorHandPos(winner));
  setTurnIndicatorTransform(0);

  await new Promise((resolve) => setTimeout(resolve, TURN_INDICATOR_MOVE_MS));
}

function renderTurnIndicator() {
  if (coinFlipping) return;
  if (isGameOver(game)) {
    turnIndicatorEl.style.opacity = '0';
    return;
  }
  turnIndicatorEl.style.opacity = '1';
  setTurnIndicatorPos(turnIndicatorHandPos(game.turn));
  setTurnIndicatorTransform(0);
}

function renderSwapOkLabel() {
  const show = game.rules.swap && !game.swapUsed.player && game.turn === 'player' && !isGameOver(game) && !coinFlipping;
  swapOkLabelEl.style.opacity = show ? '1' : '0';
  if (!show) return;
  const arrowPos = turnIndicatorHandPos('player');
  swapOkLabelEl.style.left = `${arrowPos.left}%`;
  swapOkLabelEl.style.top = `${arrowPos.top - (SWAP_OK_LABEL_GAP / BOARD_NATIVE_HEIGHT) * 100}%`;
}

function render() {
  renderHand('player');
  renderHand('ai');
  renderGrid();
  renderScores();
  renderStatus();
  renderEndgameBanner();
  renderTurnIndicator();
  renderSwapOkLabel();
  renderNewGameButton();
}

function renderNewGameButton() {
  const disabled = coinFlipping || thinking || animating;
  newGameBtnEl.disabled = disabled;
  restartGameBtnEl.disabled = disabled || !lastDeal;
  dealAgainBtnEl.disabled = disabled;
}

function renderScores() {
  const score = computeScore(game);
  scoreEls.player.textContent = score.player;
  scoreEls.ai.textContent = score.ai;
}

function renderHand(side) {
  const hand = game.hands[side];

  handSlotEls[side].forEach((slotEl, handIndex) => {
    const card = hand[handIndex];
    slotEl.innerHTML = '';
    if (!card) return;

    const selected = side === 'player' && handIndex === selectedHandIndex;
    applyRect(slotEl, handSlotRect(side, handIndex, { selected }));

    const hidden = side === 'ai' && !game.rules.open;
    const el = renderCard(card, side, { hidden, transform: looseCardTransform(card, 'hand'), elemental: game.rules.elemental, themed: game.rules.themed });
    if (side === 'player') {
      if (selected) el.classList.add('selected');
      if (game.turn === 'player' && !isGameOver(game) && !thinking && !animating && !coinFlipping) {
        el.addEventListener('click', () => handleHandCardClick(handIndex));
      } else {
        el.classList.add('disabled');
      }
    } else {
      el.classList.add('disabled');
    }
    slotEl.appendChild(el);
  });
}

function isSwapTarget(cell, side) {
  return !!cell && game.rules.swap && cell.owner === side && !cell.locked && !game.swapUsed[side];
}

function isSlideOrigin(cell, side) {
  return !!cell && game.rules.slide && cell.owner === side && !cell.locked;
}

function isAdjacentCell(fromIndex, toIndex) {
  return DIRECTIONS.some((direction) => neighborIndex(fromIndex, direction, game.boardSize) === toIndex);
}

function updateSwapTargetOverlays(canSelectCell) {
  game.board.forEach((cell, cellIndex) => {
    const cellEl = cellEls[cellIndex];
    const wantsOverlay = canSelectCell && isSwapTarget(cell, 'player');
    const existingOverlay = cellEl.querySelector(':scope > .swap-target');
    if (wantsOverlay && !existingOverlay) {
      const overlay = document.createElement('div');
      overlay.className = 'swap-target';
      cellEl.appendChild(overlay);
    } else if (!wantsOverlay && existingOverlay) {
      existingOverlay.remove();
    }
  });
}

function updateSlideOriginOverlay() {
  game.board.forEach((cell, cellIndex) => {
    const cellEl = cellEls[cellIndex];
    const wantsOverlay = cellIndex === selectedSlideIndex;
    const existingOverlay = cellEl.querySelector(':scope > .slide-origin');
    if (wantsOverlay && !existingOverlay) {
      const overlay = document.createElement('div');
      overlay.className = 'slide-origin';
      cellEl.appendChild(overlay);
    } else if (!wantsOverlay && existingOverlay) {
      existingOverlay.remove();
    }
  });
}

function renderGrid() {
  const activePlayerTurn = game.turn === 'player' && !isGameOver(game) && !thinking && !animating && !coinFlipping;
  const canSelectCell = activePlayerTurn && selectedHandIndex !== null;
  // Slide rule: while a board card is picked up to slide, its adjacent empty cells become valid
  // (and selectable-outlined) destinations; while nothing's selected yet, any of the player's own
  // unlocked board cards is a valid one to pick up, hinted via .slide-eligible instead.
  const canSelectSlideDestination = activePlayerTurn && selectedSlideIndex !== null;
  const canPickSlideOrigin = activePlayerTurn && game.rules.slide && selectedHandIndex === null && selectedSlideIndex === null;

  game.board.forEach((cell, cellIndex) => {
    const cellEl = cellEls[cellIndex];
    const cellIsSwapTarget = isSwapTarget(cell, 'player');
    const cellIsSlideDestination = canSelectSlideDestination && !cell && isAdjacentCell(selectedSlideIndex, cellIndex);
    cellEl.classList.toggle('empty', !cell);
    cellEl.classList.toggle('selectable', ((!cell || cellIsSwapTarget) && canSelectCell) || cellIsSlideDestination);
    cellEl.classList.toggle('slide-eligible', canPickSlideOrigin && isSlideOrigin(cell, 'player'));

    const shown = displayedBoard[cellIndex];
    const shownOwner = shown ? shown.owner : null;
    const cellOwner = cell ? cell.owner : null;
    const shownCardIndex = shown ? shown.cardIndex : null;
    const cellCardIndex = cell ? cell.card.index : null;

    if (shownOwner === cellOwner && shownCardIndex === cellCardIndex) {
      return; // already displaying this state; leave any in-flight animation alone
    }

    if (cell && shown && shown.cardIndex === cell.card.index && shown.owner !== cell.owner) {
      flipCell(cellEl, cell.card, shown.owner, cell.owner, undefined, cell.locked, boardElementBonus(cellIndex, cell.card));
    } else if (cell) {
      cellEl.innerHTML = '';
      // A generic re-render, not the deliberate initial-placement path (performMove/
      // performAdvanceMove handle that directly and never reach here) -- so no fresh reveal.
      cellEl.appendChild(renderCard(cell.card, cell.owner, { locked: cell.locked, memoryHidden: game.rules.memory, transform: looseCardTransform(cell.card, 'board'), elemental: game.rules.elemental, elementBonus: boardElementBonus(cellIndex, cell.card), themed: game.rules.themed }));
    } else {
      renderCellElementIcon(cellIndex);
    }

    displayedBoard[cellIndex] = cell ? { owner: cell.owner, cardIndex: cell.card.index } : null;
  });

  updateSwapTargetOverlays(canSelectCell);
  updateSlideOriginOverlay();
}

function flipCell(cellEl, card, oldOwner, newOwner, axis = 'horizontal', locked = false, elementBonus = null) {
  const rotateFn = axis === 'vertical' ? 'rotateX' : 'rotateY';
  cellEl.innerHTML = '';

  const flipCardEl = document.createElement('div');
  flipCardEl.className = 'flip-card';
  // Same Loose jitter the card already has (or will land on) on the board, applied to the whole
  // flip so the rotation/offset carries through the animation instead of resetting then
  // snapping back once the flip lands.
  const jitter = looseCardTransform(card, 'board');
  if (jitter) flipCardEl.style.transform = jitter;
  const inner = document.createElement('div');
  inner.className = 'flip-inner';

  const front = document.createElement('div');
  front.className = 'flip-face flip-face-front';
  // Memory's reveal only ever happens once, at original placement -- a card being flipped here
  // has already had its window (or wasn't the side that just placed it), so keep it hidden
  // rather than showing values again for the flip.
  front.appendChild(buildCardFace(card, oldOwner, { memoryHidden: game.rules.memory, elemental: game.rules.elemental, elementBonus, themed: game.rules.themed }));

  const back = document.createElement('div');
  back.className = 'flip-face flip-face-back';
  back.style.transform = `${rotateFn}(180deg)`;
  back.appendChild(cardBackFace());

  inner.append(front, back);
  flipCardEl.appendChild(inner);
  cellEl.appendChild(flipCardEl);

  return new Promise((resolve) => {
    // Force layout so the initial (unrotated) state is committed before we transition.
    void inner.offsetWidth;
    inner.style.transition = `transform ${FLIP_STAGE_MS}ms linear`;
    inner.style.transform = `${rotateFn}(180deg)`;

    inner.addEventListener('transitionend', function onFirstFlip() {
      inner.removeEventListener('transitionend', onFirstFlip);

      front.innerHTML = '';
      front.appendChild(cardBackFace());
      back.innerHTML = '';
      // Full color while still rotating in; the locked/overkill treatment (and its flash) only
      // applies once the flip fully lands, via the final static swap below. Values stay hidden
      // throughout under Memory, though -- see the comment on the front face above.
      back.appendChild(buildCardFace(card, newOwner, { memoryHidden: game.rules.memory, elemental: game.rules.elemental, elementBonus, themed: game.rules.themed }));

      inner.style.transition = 'none';
      inner.style.transform = `${rotateFn}(0deg)`;
      void inner.offsetWidth;

      inner.style.transition = `transform ${FLIP_STAGE_MS}ms linear`;
      inner.style.transform = `${rotateFn}(180deg)`;

      inner.addEventListener('transitionend', function onSecondFlip() {
        inner.removeEventListener('transitionend', onSecondFlip);
        cellEl.innerHTML = '';
        cellEl.appendChild(renderCard(card, newOwner, { locked, memoryHidden: game.rules.memory, transform: looseCardTransform(card, 'board'), elemental: game.rules.elemental, elementBonus, themed: game.rules.themed }));
        resolve();
      }, { once: true });
    }, { once: true });
  });
}

function renderStatus() {
  if (hoveredCardName) {
    statusEl.textContent = hoveredCardName;
    return;
  }
  // Slide rule: prompt for the destination while a board card is picked up, same as Advance's
  // "Choose where to advance" (see chooseAdvanceDestinationInteractive).
  if (selectedSlideIndex !== null) {
    statusEl.textContent = 'Choose where to slide';
    return;
  }
  // No card hovered and the game's still going: the turn indicator arrow already shows whose
  // turn it is, so leave the status bar blank.
  statusEl.textContent = '';
}

function renderEndgameBanner() {
  const score = isGameOver(game) ? computeScore(game) : null;
  const key = !score ? null : score.player > score.ai ? 'win' : score.ai > score.player ? 'lose' : 'draw';
  endgameBannerLayerEl.hidden = !key;
  if (!key) return;

  const { letter, rest, letterColor } = ENDGAME_BANNER_INFO[key];
  endgameBannerYouEl.textContent = key == 'draw' ? '' : 'You';
  endgameBannerYouEl.dataset.text = key == 'draw' ? '' : 'You';
  endgameBannerLetterEl.textContent = letter;
  endgameBannerLetterEl.dataset.text = letter;
  endgameBannerLetterEl.style.setProperty('--letter-color', letterColor);
  endgameBannerRestEl.textContent = rest;
  endgameBannerRestEl.dataset.text = rest;
}

function handleHandCardClick(handIndex) {
  if (game.turn !== 'player' || isGameOver(game) || thinking || animating || coinFlipping) return;
  // Slide rule: picking a hand card cancels any in-progress slide selection -- the two are
  // mutually exclusive ways to spend the turn.
  selectedSlideIndex = null;
  selectedHandIndex = selectedHandIndex === handIndex ? null : handIndex;
  render();
}

function handleCellClick(cellIndex) {
  if (game.turn !== 'player' || isGameOver(game) || thinking || animating || coinFlipping) return;
  const cell = game.board[cellIndex];

  if (selectedHandIndex !== null) {
    if (cell && !isSwapTarget(cell, 'player')) return;
    performMove('player', selectedHandIndex, cellIndex);
    return;
  }

  if (!game.rules.slide) return;

  if (selectedSlideIndex === null) {
    if (isSlideOrigin(cell, 'player')) {
      selectedSlideIndex = cellIndex;
      render();
    }
    return;
  }

  if (cellIndex === selectedSlideIndex) {
    selectedSlideIndex = null;
    render();
    return;
  }

  if (isSlideOrigin(cell, 'player')) {
    selectedSlideIndex = cellIndex;
    render();
    return;
  }

  if (!cell && isAdjacentCell(selectedSlideIndex, cellIndex)) {
    performSlideMove('player', selectedSlideIndex, cellIndex);
  }
}

function triggerAiTurn() {
  thinking = true;
  render();
  setTimeout(() => {
    const move = game.aiDifficulty === 'standard' ? getStandardMove(game, 'ai') : getBestMove(game, 'ai');
    thinking = false;
    if (move.fromIndex !== undefined) {
      performSlideMove('ai', move.fromIndex, move.toIndex);
    } else {
      performMove('ai', move.handIndex, move.cellIndex);
    }
  }, 500);
}

function createFlyingCard(card, owner, fromRect) {
  const el = document.createElement('div');
  el.className = 'flying-card';
  applyRect(el, fromRect);
  el.appendChild(buildCardFace(card, owner, { elemental: game.rules.elemental, themed: game.rules.themed }));
  boardWrapEl.appendChild(el);
  return el;
}

function createFlyingHandCard(card, owner, fromRect, hidden) {
  const el = document.createElement('div');
  el.className = 'flying-card';
  applyRect(el, fromRect);
  el.appendChild(renderCard(card, owner, { hidden, elemental: game.rules.elemental, themed: game.rules.themed }));
  boardWrapEl.appendChild(el);
  return el;
}

function animateArc(el, fromRect, toRect) {
  const frames = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = i / ARC_STEPS;
    const left = fromRect.left + (toRect.left - fromRect.left) * t;
    const top = fromRect.top + (toRect.top - fromRect.top) * t - Math.sin(Math.PI * t) * ARC_HEIGHT_PERCENT;
    const width = fromRect.width + (toRect.width - fromRect.width) * t;
    const height = fromRect.height + (toRect.height - fromRect.height) * t;
    frames.push({ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` });
  }
  const animation = el.animate(frames, {
    duration: ARC_DURATION_MS,
    easing: 'ease-in-out',
    fill: 'forwards',
  });
  return animation.finished;
}

function animateLooseToss(el, fromRect, toRect, card) {
  const startJitter = selectedStyle.has('loose') ? getLooseJitter(card, 'hand') : { rotate: 0, dx: 0, dy: 0 };
  const endJitter = getLooseJitter(card, 'board');
  const turns = LOOSE_TOSS_MIN_TURNS + Math.random() * (LOOSE_TOSS_MAX_TURNS - LOOSE_TOSS_MIN_TURNS);
  const spinDirection = Math.random() < 0.5 ? 1 : -1;
  // A whole-turn multiple of 360 added on top of the target angle doesn't change where it visually
  // lands, but makes the animation pass through that many extra spins on the way there.
  const rotateTo = endJitter.rotate + spinDirection * Math.round(turns) * 360;

  const frames = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = i / ARC_STEPS;
    const left = fromRect.left + (toRect.left - fromRect.left) * t;
    const top = fromRect.top + (toRect.top - fromRect.top) * t;
    const width = fromRect.width + (toRect.width - fromRect.width) * t;
    const height = fromRect.height + (toRect.height - fromRect.height) * t;
    const rotate = startJitter.rotate + (rotateTo - startJitter.rotate) * t;
    const dx = startJitter.dx + (endJitter.dx - startJitter.dx) * t;
    const dy = startJitter.dy + (endJitter.dy - startJitter.dy) * t;
    frames.push({ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg)` });
  }
  const animation = el.animate(frames, {
    duration: LOOSE_TOSS_DURATION_MS,
    easing: 'ease-in-out',
    fill: 'forwards',
  });
  return animation.finished;
}

function animateDealDrop(el, fromRect, toRect) {
  const frames = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = i / ARC_STEPS;
    const top = fromRect.top + (toRect.top - fromRect.top) * t;
    frames.push({ left: `${toRect.left}%`, top: `${top}%`, width: `${toRect.width}%`, height: `${toRect.height}%` });
  }
  const animation = el.animate(frames, {
    duration: DEAL_IN_DURATION_MS,
    easing: 'ease-in',
    fill: 'forwards',
  });
  return animation.finished;
}

async function animateDealHands() {
  renderHand('player');
  renderHand('ai');

  const drops = [];
  for (const side of ['player', 'ai']) {
    game.hands[side].forEach((card, handIndex) => {
      const slotEl = handSlotEls[side][handIndex];
      const cardEl = slotEl.firstElementChild;
      if (!cardEl) return;

      const toRect = handSlotRect(side, handIndex);
      const fromRect = { ...toRect, top: -toRect.height - 4 };
      const hidden = side === 'ai' && !game.rules.open;
      cardEl.style.visibility = 'hidden';
      // A clone, not the real card -- card.canvas is a single shared DOM node (see
      // cloneCardInstance in cards.js), so rendering the real card's face again here would rip
      // its canvas out of the real hand slot (already built by renderHand above) instead of just
      // duplicating the art, leaving that slot's face blank once revealed.
      const flyingEl = createFlyingHandCard(cloneCardInstance(card), side, fromRect, hidden);

      const drop = new Promise((resolve) => {
        setTimeout(() => {
          animateDealDrop(flyingEl, fromRect, toRect).then(() => {
            flyingEl.remove();
            cardEl.style.visibility = '';
            resolve();
          });
        }, handIndex * DEAL_IN_STAGGER_MS);
      });
      drops.push(drop);
    });
  }
  await Promise.all(drops);
}

function fadeOutCell(cellEl) {
  const content = cellEl.firstElementChild;
  if (!content) return Promise.resolve();
  return content.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: 'ease-in', fill: 'forwards' }).finished;
}

function playEventBanner(key) {
  const { word, badgeColor } = EVENT_BANNER_INFO[key];
  const rest = word.slice(1);
  eventBannerLetterEl.textContent = word[0];
  eventBannerLetterEl.style.setProperty('--badge-color', badgeColor);
  eventBannerRestEl.textContent = rest;
  eventBannerRestEl.dataset.text = rest;

  return new Promise((resolve) => {
    eventBannerEl.classList.remove('playing');
    void eventBannerEl.offsetWidth; // restart the animation from scratch
    eventBannerEl.classList.add('playing');
    eventBannerEl.addEventListener('animationend', function onEnd() {
      eventBannerEl.removeEventListener('animationend', onEnd);
      eventBannerEl.classList.remove('playing');
      resolve();
    }, { once: true });
  });
}

let eventBannerQueue = Promise.resolve();
function triggerEventBanner(key) {
  eventBannerQueue = eventBannerQueue.then(() => playEventBanner(key));
}

function chooseAdvanceDestinationAI(candidates, draft, current, side) {
  const advancingCard = draft.board[current].card;
  let best = candidates[0];
  let bestScore = -1;
  for (const candidate of candidates) {
    const tempBoard = draft.board.slice();
    tempBoard[candidate] = { card: advancingCard, owner: side };
    tempBoard[current] = null;
    const { captured } = computeCaptures({ board: tempBoard, rules: draft.rules }, side, candidate);
    if (captured.size > bestScore) {
      bestScore = captured.size;
      best = candidate;
    }
  }
  return best;
}

function chooseAdvanceDestinationInteractive(candidates) {
  statusEl.textContent = 'Choose where to advance';
  return new Promise((resolve) => {
    const cleanups = candidates.map((ni) => {
      const cellEl = cellEls[ni];
      cellEl.classList.add('selectable');
      const overlay = document.createElement('div');
      overlay.className = 'advance-target';
      cellEl.appendChild(overlay);
      const handler = (e) => {
        e.stopPropagation();
        cleanups.forEach((cleanup) => cleanup());
        resolve(ni);
      };
      cellEl.addEventListener('click', handler);
      return () => {
        cellEl.classList.remove('selectable');
        overlay.remove();
        cellEl.removeEventListener('click', handler);
      };
    });
  });
}

async function runAdvanceChain(draft, side, startIndex) {
  let current = startIndex;
  let firstHop = true;
  for (;;) {
    const beforeStep = draft.board.slice();
    const { captured, comboSeeds, triggeredRules } = computeCaptures(draft, side, current);
    if (captured.size === 0) break;

    applyCaptures(draft, captured, side);

    // Flips a batch of cells (as they looked/were owned before this step), matching the
    // whole-board diff approach the non-Advance path uses.
    const flipStage = (niList) => Promise.all(niList.map((ni) => {
      const before = beforeStep[ni];
      const afterCell = draft.board[ni];
      let axis = 'horizontal';
      for (const direction of DIRECTIONS) {
        if (neighborIndex(current, direction, draft.boardSize) === ni) {
          axis = direction === 'top' || direction === 'bottom' ? 'vertical' : 'horizontal';
          break;
        }
      }
      const promise = flipCell(cellEls[ni], afterCell.card, before.owner, side, axis, afterCell.locked, boardElementBonus(ni, afterCell.card));
      displayedBoard[ni] = { owner: side, cardIndex: afterCell.card.index };
      return promise;
    }));

    // Direct captures (basic/Same/Plus) flip first, firing Same!/Plus! as they begin; any
    // further Combo chain flips a beat later, firing Combo! as that second-order wave begins.
    if (triggeredRules.has('same')) triggerEventBanner('same');
    if (triggeredRules.has('plus')) triggerEventBanner('plus');
    await flipStage([...captured.keys()]);

    if (draft.rules.combo) {
      const comboCaptured = runCombo(draft, comboSeeds, side);
      if (comboCaptured.size) {
        triggerEventBanner('combo');
        await flipStage([...comboCaptured]);
      }
    }

    const candidates = [...captured.keys()];
    const destination = candidates.length === 1
      ? candidates[0]
      : side === 'ai'
        ? chooseAdvanceDestinationAI(candidates, draft, current, side)
        : await chooseAdvanceDestinationInteractive(candidates);

    // Eliminate the chosen destination's card, then hop the advancing card into its place --
    // a banner fires right as that hop begins, i.e. as the card actually starts moving. Only the
    // very first hop is a plain Advance; any later hop only happens because Combo let the chain
    // continue, so it's a Combo! from then on instead.
    await fadeOutCell(cellEls[destination]);

    const advFromRect = cellRectPercent(current, draft.boardSize);
    const advToRect = cellRectPercent(destination, draft.boardSize);
    const advancingCard = draft.board[current].card;
    const hopEl = createFlyingCard(advancingCard, side, advFromRect);
    renderCellElementIcon(current);
    triggerEventBanner(firstHop ? 'advance' : 'combo');
    firstHop = false;
    if (selectedStyle.has('loose')) {
      await animateLooseToss(hopEl, advFromRect, advToRect, advancingCard);
    } else {
      await animateArc(hopEl, advFromRect, advToRect);
    }
    hopEl.remove();

    draft.board[destination] = { card: advancingCard, owner: side };
    draft.board[current] = null;
    displayedBoard[current] = null;
    displayedBoard[destination] = { owner: side, cardIndex: advancingCard.index };
    cellEls[destination].innerHTML = '';
    // Same card continuing its Advance hop, not a fresh placement from hand -- no new reveal.
    cellEls[destination].appendChild(renderCard(advancingCard, side, { memoryHidden: draft.rules.memory, transform: looseCardTransform(advancingCard, 'board'), elemental: draft.rules.elemental, elementBonus: boardElementBonus(destination, advancingCard), themed: draft.rules.themed }));

    current = destination;

    // Without Combo, re-resolving captures from the new position is itself a combo-like chain --
    // so Advance only ever takes one capture-and-hop step unless Combo is also active.
    if (!draft.rules.combo) break;
  }
}

async function performAdvanceMove(side, handIndex, cellIndex) {
  const prevGame = game;
  const card = prevGame.hands[side][handIndex];
  const existing = prevGame.board[cellIndex]; // Swap rule: cellIndex already holds side's own card
  const selected = side === 'player' && handIndex === selectedHandIndex;
  const fromRect = handSlotRect(side, handIndex, { selected });
  const toRect = cellRectPercent(cellIndex, prevGame.boardSize);

  const draft = cloneState(prevGame);
  draft.hands[side].splice(handIndex, 1);
  if (existing) {
    draft.hands[side].push(existing.card);
    draft.swapUsed[side] = true;
  }
  draft.board[cellIndex] = { card, owner: side };

  animating = true;
  renderNewGameButton();
  selectedHandIndex = null;
  game = draft;

  const flyingEl = createFlyingCard(card, side, fromRect);
  // Swap rule: see performMove's identical handling -- defer this side's hand re-render until
  // the displaced card's fade clears the cell, so it doesn't steal that card's canvas mid-fade.
  if (!existing) renderHand(side);
  renderHand(OTHER_SIDE[side]);
  renderScores();
  renderStatus();

  const arrivePromise = selectedStyle.has('loose')
    ? animateLooseToss(flyingEl, fromRect, toRect, card)
    : animateArc(flyingEl, fromRect, toRect);
  const fadeOutPromise = existing ? fadeOutCell(cellEls[cellIndex]) : Promise.resolve();

  await Promise.all([arrivePromise, fadeOutPromise]);
  flyingEl.remove();

  cellEls[cellIndex].innerHTML = '';
  cellEls[cellIndex].appendChild(renderCard(card, side, { memory: draft.rules.memory, transform: looseCardTransform(card, 'board'), elemental: draft.rules.elemental, elementBonus: boardElementBonus(cellIndex, card), themed: draft.rules.themed }));
  displayedBoard[cellIndex] = { owner: side, cardIndex: card.index };

  if (existing) renderHand(side);

  await runAdvanceChain(draft, side, cellIndex);

  draft.turn = OTHER_SIDE[side];

  animating = false;
  render();

  if (side === 'player' && !isGameOver(game)) {
    triggerAiTurn();
  }
}

async function performAdvanceSlideMove(side, fromIndex, toIndex) {
  const prevGame = game;
  const card = prevGame.board[fromIndex].card;
  const fromRect = cellRectPercent(fromIndex, prevGame.boardSize);
  const toRect = cellRectPercent(toIndex, prevGame.boardSize);

  const draft = cloneState(prevGame);
  draft.board[fromIndex] = null;
  draft.board[toIndex] = { card, owner: side };

  animating = true;
  renderNewGameButton();
  selectedSlideIndex = null;
  game = draft;

  renderCellElementIcon(fromIndex);
  displayedBoard[fromIndex] = null;
  const flyingEl = createFlyingCard(card, side, fromRect);
  renderStatus();

  const arrivePromise = selectedStyle.has('loose')
    ? animateLooseToss(flyingEl, fromRect, toRect, card)
    : animateArc(flyingEl, fromRect, toRect);
  await arrivePromise;
  flyingEl.remove();

  cellEls[toIndex].innerHTML = '';
  // Already on the board and already had its own reveal (if any) -- no fresh reveal here.
  cellEls[toIndex].appendChild(renderCard(card, side, { memoryHidden: draft.rules.memory, transform: looseCardTransform(card, 'board'), elemental: draft.rules.elemental, elementBonus: boardElementBonus(toIndex, card), themed: draft.rules.themed }));
  displayedBoard[toIndex] = { owner: side, cardIndex: card.index };

  await runAdvanceChain(draft, side, toIndex);

  draft.turn = OTHER_SIDE[side];

  animating = false;
  render();

  if (side === 'player' && !isGameOver(game)) {
    triggerAiTurn();
  }
}

async function performMove(side, handIndex, cellIndex) {
  if (game.rules.advance) return performAdvanceMove(side, handIndex, cellIndex);

  const prevGame = game;
  const card = prevGame.hands[side][handIndex];
  const isSwap = !!prevGame.board[cellIndex]; // Swap rule: cellIndex already holds side's own card
  const selected = side === 'player' && handIndex === selectedHandIndex;
  const fromRect = handSlotRect(side, handIndex, { selected });
  const toRect = cellRectPercent(cellIndex, prevGame.boardSize);

  const events = { rules: new Set(), comboCells: new Set() };
  const after = applyMove(prevGame, side, handIndex, cellIndex, undefined, events);

  animating = true;
  renderNewGameButton();
  selectedHandIndex = null;
  game = after;

  const flyingEl = createFlyingCard(card, side, fromRect);
  // Swap rule: the displaced card fades in place while the new one arcs in on top of it; its
  // hand re-render is deferred until the fade clears the cell, since renderHand would otherwise
  // steal the same canvas node the fading board card is still using.
  if (!isSwap) renderHand(side);
  renderHand(OTHER_SIDE[side]);
  renderScores();
  renderStatus();

  const arrivePromise = selectedStyle.has('loose')
    ? animateLooseToss(flyingEl, fromRect, toRect, card)
    : animateArc(flyingEl, fromRect, toRect);
  const fadeOutPromise = isSwap ? fadeOutCell(cellEls[cellIndex]) : Promise.resolve();

  await Promise.all([arrivePromise, fadeOutPromise]);
  flyingEl.remove();

  cellEls[cellIndex].innerHTML = '';
  cellEls[cellIndex].appendChild(renderCard(card, side, { memory: game.rules.memory, transform: looseCardTransform(card, 'board'), elemental: game.rules.elemental, elementBonus: boardElementBonus(cellIndex, card), themed: game.rules.themed }));
  displayedBoard[cellIndex] = { owner: side, cardIndex: card.index };

  if (isSwap) renderHand(side);

  await resolveDirectEffects(after, prevGame.board, side, cellIndex, events);

  animating = false;
  render();

  if (side === 'player' && !isGameOver(game)) {
    triggerAiTurn();
  }
}

async function resolveDirectEffects(after, prevBoard, side, cellIndex, events) {
  const changedCells = [];
  for (let ni = 0; ni < after.board.length; ni++) {
    if (ni === cellIndex) continue;
    const prevCell = prevBoard[ni];
    const afterCell = after.board[ni];
    if (!prevCell || !afterCell || prevCell.owner === side || afterCell.owner !== side) continue;
    changedCells.push(ni);
  }

  const flipCells = (niList) => Promise.all(niList.map((ni) => {
    const afterCell = after.board[ni];
    let axis = 'horizontal';
    for (const direction of DIRECTIONS) {
      if (neighborIndex(cellIndex, direction, after.boardSize) === ni) {
        axis = direction === 'top' || direction === 'bottom' ? 'vertical' : 'horizontal';
        break;
      }
    }
    const promise = flipCell(cellEls[ni], afterCell.card, prevBoard[ni].owner, side, axis, afterCell.locked, boardElementBonus(ni, afterCell.card));
    displayedBoard[ni] = { owner: side, cardIndex: afterCell.card.index };
    return promise;
  }));

  const directCells = changedCells.filter((ni) => !events.comboCells.has(ni));
  const comboCellsChanged = changedCells.filter((ni) => events.comboCells.has(ni));

  if (events.rules.has('same')) triggerEventBanner('same');
  if (events.rules.has('plus')) triggerEventBanner('plus');
  await flipCells(directCells);

  if (comboCellsChanged.length) {
    if (events.rules.has('combo')) triggerEventBanner('combo');
    await flipCells(comboCellsChanged);
  }
}

async function performSlideMove(side, fromIndex, toIndex) {
  if (game.rules.advance) return performAdvanceSlideMove(side, fromIndex, toIndex);

  const prevGame = game;
  const card = prevGame.board[fromIndex].card;
  const fromRect = cellRectPercent(fromIndex, prevGame.boardSize);
  const toRect = cellRectPercent(toIndex, prevGame.boardSize);

  const events = { rules: new Set(), comboCells: new Set() };
  const after = applySlideMove(prevGame, side, fromIndex, toIndex, undefined, events);

  animating = true;
  renderNewGameButton();
  selectedSlideIndex = null;
  game = after;

  renderCellElementIcon(fromIndex);
  displayedBoard[fromIndex] = null;
  const flyingEl = createFlyingCard(card, side, fromRect);
  renderStatus();

  const arrivePromise = selectedStyle.has('loose')
    ? animateLooseToss(flyingEl, fromRect, toRect, card)
    : animateArc(flyingEl, fromRect, toRect);
  await arrivePromise;
  flyingEl.remove();

  cellEls[toIndex].innerHTML = '';
  cellEls[toIndex].appendChild(renderCard(card, side, { memoryHidden: after.rules.memory, transform: looseCardTransform(card, 'board'), elemental: after.rules.elemental, elementBonus: boardElementBonus(toIndex, card), themed: after.rules.themed }));
  displayedBoard[toIndex] = { owner: side, cardIndex: card.index };

  await resolveDirectEffects(after, prevGame.board, side, toIndex, events);

  animating = false;
  render();

  if (side === 'player' && !isGameOver(game)) {
    triggerAiTurn();
  }
}

// Same/Plus/Advance/Combo/Elemental chips get a colored enabled fill instead of the generic gold
// every other chip uses -- see the .chip-banner-* rules in style.css. Same's chip is the left
// half of the Same/Wall split chip (createSameWallChip), not built through createChip, so it's
// tagged there directly instead.
const RULE_BANNER_CHIP_CLASS = {
  plus: 'chip-banner-plus',
  combo: 'chip-banner-combo',
  advance: 'chip-banner-advance',
  elemental: 'chip-banner-elemental',
};

function createChip(label, value, selectedSet, onChange) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  if (RULE_BANNER_CHIP_CLASS[value]) chip.classList.add(RULE_BANNER_CHIP_CLASS[value]);
  chip.textContent = label;
  chip.classList.toggle('active', selectedSet.has(value));
  chip.addEventListener('click', () => {
    if (selectedSet.has(value)) selectedSet.delete(value);
    else selectedSet.add(value);
    chip.classList.toggle('active', selectedSet.has(value));
    if (onChange) onChange();
  });
  return chip;
}

function cardPoolForDecks() {
  return allCards.filter((card) => selectedDecks.has(card.set));
}

function availableRanksForDecks() {
  const available = new Set();
  for (const card of cardPoolForDecks()) available.add(card.rank);
  return available;
}

function setupRankFacet() {
  rankFacetEl.innerHTML = '';
  // RNG reassigns every card a level at random, so a level chip's selectability no longer depends
  // on whether the selected decks happen to have a real card at that level -- any card can be
  // relabeled to any level, so all 10 stay pickable.
  const available = selectedDealOptions.has('rng') ? ALL_RANKS_SET : availableRanksForDecks();
  for (let rank = 1; rank <= 10; rank++) {
    const chip = createChip(formatCardValue(rank), rank, selectedRanks, updateDeckSizeUI);
    if (!available.has(rank)) chip.disabled = true;
    rankFacetEl.appendChild(chip);
  }
}

function randomCardRankFromSelection() {
  const options = selectedRanks.size ? [...selectedRanks] : [...ALL_RANKS_SET];
  return options[Math.floor(Math.random() * options.length)];
}

// The stat-total range for each level, e.g. "Level 1 cards total 10-13 across all four sides" --
// computed once from the full card set (not just the currently selected decks) so every level 1-10
// always has a defined range for RNG to draw from, even when a small deck selection has no real
// cards of its own at a given level.
let globalRankTotalRangesCache = null;
function globalRankTotalRanges() {
  if (!globalRankTotalRangesCache) globalRankTotalRangesCache = computeRankTotalRanges(allCards);
  return globalRankTotalRangesCache;
}

// The highest single side value any real card of each level has, e.g. no level 1 card in the
// original game has a 9 on any side even though 9 alone wouldn't blow its stat-total range.
let globalRankMaxValueCache = null;
function globalRankMaxValue() {
  if (!globalRankMaxValueCache) globalRankMaxValueCache = computeRankMaxValue(allCards);
  return globalRankMaxValueCache;
}

// RNG relabels a card to a random (selected) level, and its stats need to actually belong to that
// level rather than keeping whatever the card's real level would have given it.
function rngRankedCard(card) {
  const rank = randomCardRankFromSelection();
  const range = globalRankTotalRanges().get(rank);
  const maxValue = globalRankMaxValue().get(rank);
  const [top, right, bottom, left] = range
    ? randomCardStatsForRange(range.min, range.max, maxValue)
    : [card.top, card.right, card.bottom, card.left];
  return { ...card, rank, top, right, bottom, left };
}

// How many cards per side the current Decks/Card Levels/Mirror/RNG selection can actually supply:
// any selected level 1-7 rank with at least one eligible card can be dealt without limit
// (duplicates are always allowed there), but levels 8-10 are unique, so their capacity is capped
// by how many distinct cards exist -- one hand slot per card in Mirror (copied to both sides), or
// one slot per pair of cards otherwise (one card per side).
function maxDealableHandSize() {
  const mirror = selectedDealOptions.has('mirror');
  if (selectedDealOptions.has('rng')) {
    // Under RNG every card in the selected decks is a candidate for every selected level, so
    // there's no per-level scarcity to compute -- only whether the selection is unique-tier-only.
    const levels = selectedRanks.size ? [...selectedRanks] : [...ALL_RANKS_SET];
    if (levels.some((rank) => rank < UNIQUE_CARD_RANK_MIN)) return DECK_SIZE_MAX;
    const totalCards = cardPoolForDecks().length;
    const capacity = mirror ? totalCards : Math.floor(totalCards / 2);
    return Math.max(1, Math.min(DECK_SIZE_MAX, capacity));
  }
  const pool = cardPoolForDecks().filter((card) => !selectedRanks.size || selectedRanks.has(card.rank));
  const countsByRank = new Map();
  for (const card of pool) countsByRank.set(card.rank, (countsByRank.get(card.rank) || 0) + 1);
  let uniqueCapacity = 0;
  for (const [rank, count] of countsByRank) {
    if (rank < UNIQUE_CARD_RANK_MIN) return DECK_SIZE_MAX;
    uniqueCapacity += mirror ? count : Math.floor(count / 2);
  }
  return Math.max(1, Math.min(DECK_SIZE_MAX, uniqueCapacity));
}

// RNG changes what the rank facet should even show as selectable -- rebuild it alongside the
// usual deck-size recompute whenever RNG is toggled.
function refreshDealConstraints() {
  setupRankFacet();
  updateDeckSizeUI();
}

function createDeckChip(suffix) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.textContent = CARD_SET_LABELS[suffix] || suffix;
  chip.classList.toggle('active', selectedDecks.has(suffix));
  chip.addEventListener('click', () => {
    if (selectedDecks.has(suffix)) {
      if (selectedDecks.size <= 1) return; // at least one deck must stay selected
      selectedDecks.delete(suffix);
    } else {
      selectedDecks.add(suffix);
    }
    chip.classList.toggle('active', selectedDecks.has(suffix));
    onDecksChanged();
  });
  return chip;
}

function updateDecksToggleLabel() {
  if (selectedDecks.size === CARD_SET_SUFFIXES.length) {
    decksFacetToggleEl.textContent = 'All Decks';
  } else if (selectedDecks.size === 1) {
    const [suffix] = selectedDecks;
    decksFacetToggleEl.textContent = CARD_SET_LABELS[suffix] || suffix;
  } else {
    decksFacetToggleEl.textContent = `${selectedDecks.size} Decks`;
  }
}

// Deck selection changes which cards are in the pool, which in turn changes which Card Levels
// have any cards in them at all -- keep the rank facet/info and toggle label in sync. Under RNG
// a level's availability doesn't depend on the decks' real cards (any card can be relabeled to
// any level), so there's nothing to prune there.
function onDecksChanged() {
  if (!selectedDealOptions.has('rng')) {
    const available = availableRanksForDecks();
    for (const rank of [...selectedRanks]) {
      if (!available.has(rank)) selectedRanks.delete(rank);
    }
  }
  setupRankFacet();
  setupRanksInfo(computeRankTotalRanges(cardPoolForDecks()));
  updateDecksToggleLabel();
  updateDeckSizeUI();
}

function setupDecksFacet() {
  decksFacetChipsEl.innerHTML = '';
  for (const suffix of CARD_SET_SUFFIXES) {
    decksFacetChipsEl.appendChild(createDeckChip(suffix));
  }
  updateDecksToggleLabel();
  decksFacetToggleEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = decksFacetPanelEl.hidden;
    decksFacetPanelEl.hidden = !opening;
    decksFacetToggleEl.classList.toggle('active', opening);
    decksFacetToggleEl.setAttribute('aria-expanded', String(opening));
  });
  document.addEventListener('click', (e) => {
    if (!decksFacetPanelEl.hidden && !decksFacetPanelEl.contains(e.target) && e.target !== decksFacetToggleEl) {
      decksFacetPanelEl.hidden = true;
      decksFacetToggleEl.classList.remove('active');
      decksFacetToggleEl.setAttribute('aria-expanded', 'false');
    }
  });
}

// Each DEAL_OPTIONS chip changes the effective card pool in a different way, so each needs its
// own recompute hook rather than one shared callback.
const DEAL_OPTION_ON_CHANGE = {
  mirror: updateDeckSizeUI,
  rng: refreshDealConstraints,
};

function setupDealOptionsFacet() {
  dealOptionsFacetEl.innerHTML = '';
  for (const { key, label } of DEAL_OPTIONS) {
    dealOptionsFacetEl.appendChild(createChip(label, key, selectedDealOptions, DEAL_OPTION_ON_CHANGE[key]));
  }
  // Themed and Loose live here (after Mirror/RNG) rather than in House Rules -- neither affects
  // turn-to-turn play, so they read more like dealing/display options than actual house rules.
  // Still backed by their usual selectedRules/selectedStyle sets, just chipped here.
  dealOptionsFacetEl.appendChild(createChip('Themed', 'themed', selectedRules));
  for (const { key, label } of STYLE_OPTIONS) {
    dealOptionsFacetEl.appendChild(createChip(label, key, selectedStyle));
  }
}

function setupRanksInfo(rankTotalRanges) {
  ranksInfoListEl.innerHTML = '';
  let dt = document.createElement('dt');
  dt.textContent = `Level Ranks`;
  let dd = document.createElement('dd');
  dd.textContent = 'Card level determines the maximum sum of all four ranks.';
  ranksInfoListEl.append(dt, dd);
  dd = document.createElement('dd');
  for (let rank = 1; rank <= 10; rank++) {
    const range = rankTotalRanges.get(rank);
    dd.innerHTML += range ? `Level ${formatCardValue(rank)}...${range.min}–${range.max}\t` : 'No cards loaded';
  }
  ranksInfoListEl.append(dd);
  dt = document.createElement('dt');
  dt.textContent = `Mirror`;
  dd = document.createElement('dd');
  dd.textContent = 'Both players get the same hand.';
  ranksInfoListEl.append(dt, dd);
  dt = document.createElement('dt');
  dt.textContent = `RNG`;
  dd = document.createElement('dd');
  dd.textContent = 'Randomize card scores within the selected level range.';
  ranksInfoListEl.append(dt, dd);
  dt = document.createElement('dt');
  dt.textContent = `Themed`;
  dd = document.createElement('dd');
  dd.textContent = 'Style backgrounds after game origin.';
  ranksInfoListEl.append(dt, dd);
  dt = document.createElement('dt');
  dt.textContent = `Loose`;
  dd = document.createElement('dd');
  dd.textContent = 'Handle cards loosely.';
  ranksInfoListEl.append(dt, dd);
}

function createSameWallChip() {
  const chip = document.createElement('div');
  chip.className = 'chip split-chip';

  const left = document.createElement('button');
  left.type = 'button';
  left.className = 'chip-half chip-half-left chip-banner-same';
  left.textContent = 'Same';

  const right = document.createElement('button');
  right.type = 'button';
  right.className = 'chip-half chip-half-right';
  right.textContent = 'Wall';

  const sync = () => {
    left.classList.toggle('active', selectedRules.has('same'));
    right.classList.toggle('active', selectedRules.has('sameWall'));
  };

  left.addEventListener('click', () => {
    if (selectedRules.has('same')) {
      selectedRules.delete('same');
      selectedRules.delete('sameWall');
    } else {
      selectedRules.add('same');
    }
    sync();
  });

  right.addEventListener('click', () => {
    if (selectedRules.has('sameWall')) {
      selectedRules.delete('sameWall');
    } else {
      selectedRules.add('sameWall');
      selectedRules.add('same');
    }
    sync();
  });

  sync();
  chip.append(left, right);
  return chip;
}

function setupRulesFacet() {
  rulesFacetEl.innerHTML = '';
  rulesFacetEl.appendChild(createSameWallChip());
  for (const { key, label } of RULE_OPTIONS) {
    rulesFacetEl.appendChild(createChip(label, key, selectedRules));
  }
}

function setupHouseRulesFacet() {
  houseRulesFacetEl.innerHTML = '';
  for (const { key, label } of HOUSE_RULE_OPTIONS) {
    houseRulesFacetEl.appendChild(createChip(label, key, selectedRules));
  }
}

// The usual [DECK_SIZE_MIN, DECK_SIZE_MAX] range, narrowed down to whatever the current
// Decks/Card Levels/Match selection can actually supply (see maxDealableHandSize) -- a deck like
// SH with only 1 card at level 8 can't fill a 5-card hand from level 8 alone.
function deckSizeBounds() {
  const max = Math.max(1, Math.min(DECK_SIZE_MAX, maxDealableHandSize()));
  const min = Math.min(DECK_SIZE_MIN, max);
  return { min, max };
}

function updateDeckSizeUI() {
  const { min, max } = deckSizeBounds();
  selectedDeckSize = Math.min(Math.max(selectedDeckSize, min), max);
  deckSizeValueEl.textContent = selectedDeckSize;
  deckSizeMinusEl.disabled = selectedDeckSize <= min;
  deckSizePlusEl.disabled = selectedDeckSize >= max;
}

function setupDeckSizeStepper() {
  updateDeckSizeUI();
  deckSizeMinusEl.addEventListener('click', () => {
    selectedDeckSize = Math.max(deckSizeBounds().min, selectedDeckSize - 1);
    updateDeckSizeUI();
  });
  deckSizePlusEl.addEventListener('click', () => {
    selectedDeckSize = Math.min(deckSizeBounds().max, selectedDeckSize + 1);
    updateDeckSizeUI();
  });
}

function createExclusiveChips(container, options, initialValue, onSelect) {
  container.innerHTML = '';
  const chips = options.map(({ value, label }) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = label;
    chip.classList.toggle('active', value === initialValue);
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      onSelect(value);
    });
    container.appendChild(chip);
    return chip;
  });
}

function setupBoardSizeFacet() {
  const options = [];
  for (let size = BOARD_SIZE_MIN; size <= BOARD_SIZE_MAX; size++) {
    options.push({ value: size, label: `${size}×${size}` });
  }
  createExclusiveChips(boardSizeFacetEl, options, selectedBoardSize, (value) => {
    selectedBoardSize = value;
  });
}

function setupAiDifficultyFacet() {
  createExclusiveChips(aiDifficultyFacetEl, AI_DIFFICULTY_OPTIONS, selectedAiDifficulty, (value) => {
    selectedAiDifficulty = value;
  });
}

// CATALOG

let selectedCatalogSet = CARD_SET_SUFFIXES[0];
let selectedCatalogRank = 1;

function catalogRanksForSet(setSuffix) {
  const ranks = new Set();
  for (const card of allCards) {
    if (card.set === setSuffix) ranks.add(card.rank);
  }
  return [...ranks].sort((a, b) => a - b);
}

const CATALOG_ROW_SIZE = 6;
const CATALOG_ROW_STAGGER_MS = 70;
const CATALOG_SWIPE_OUT_MS = 220;

function renderCardCatalog(setSuffix, rank, { animateIn = false } = {}) {
  const ranks = catalogRanksForSet(setSuffix);
  if (!ranks.includes(rank)) rank = ranks[0];
  selectedCatalogSet = setSuffix;
  selectedCatalogRank = rank;

  const cards = allCards.filter((card) => card.set === setSuffix && card.rank === rank);
  cardCatalogGridEl.innerHTML = '';
  for (let i = 0; i < cards.length; i += CATALOG_ROW_SIZE) {
    const row = document.createElement('div');
    row.className = 'catalog-card-row';
    for (const card of cards.slice(i, i + CATALOG_ROW_SIZE)) {
      const slot = document.createElement('div');
      slot.className = 'catalog-card-slot';
      // Always themed and elemental here, regardless of those rules' settings for actual play --
      // the catalog is a browsing tool, so showing each card's set colors and element is just
      // more useful than hiding them behind house rule toggles that may not be on.
      slot.appendChild(renderCard(cloneCardInstance(card), 'player', { themed: true, elemental: true, nameLabel: true }));
      row.appendChild(slot);
    }
    cardCatalogGridEl.appendChild(row);
  }

  if (animateIn) {
    cardCatalogGridEl.querySelectorAll(':scope > .catalog-card-row').forEach((row, i) => {
      row.style.animationDelay = `${i * CATALOG_ROW_STAGGER_MS}ms`;
      row.classList.add('swiping-in');
    });
  }

  const options = ranks.map((r) => ({ value: r, label: formatCardValue(r) }));
  createExclusiveChips(catalogRankFacetEl, options, rank, (value) => {
    if (value !== selectedCatalogRank) animateCatalogRankChange(setSuffix, value);
  });

  const rankIndex = ranks.indexOf(rank);
  catalogRankPrevEl.disabled = rankIndex <= 0;
  catalogRankNextEl.disabled = rankIndex >= ranks.length - 1;
}

function animateCatalogRankChange(setSuffix, rank) {
  const rows = cardCatalogGridEl.querySelectorAll(':scope > .catalog-card-row');
  if (!rows.length) {
    renderCardCatalog(setSuffix, rank);
    return;
  }
  rows.forEach((row, i) => {
    // Reset the class outright (not classList.add) -- a row still carries 'swiping-in' from its
    // own entrance, and since that class comes later in the stylesheet it would otherwise win the
    // cascade tie over 'swiping-out' and silently no-op this animation.
    row.className = 'catalog-card-row swiping-out';
    row.style.animationDelay = `${i * CATALOG_ROW_STAGGER_MS}ms`;
  });
  const totalOutMs = CATALOG_SWIPE_OUT_MS + (rows.length - 1) * CATALOG_ROW_STAGGER_MS;
  setTimeout(() => renderCardCatalog(setSuffix, rank, { animateIn: true }), totalOutMs);
}

function stepCatalogRank(delta) {
  const ranks = catalogRanksForSet(selectedCatalogSet);
  const nextIndex = ranks.indexOf(selectedCatalogRank) + delta;
  if (nextIndex < 0 || nextIndex >= ranks.length) return;
  animateCatalogRankChange(selectedCatalogSet, ranks[nextIndex]);
}

function setupCardCatalogSetFacet() {
  const options = CARD_SET_SUFFIXES.map((suffix) => ({ value: suffix, label: CARD_SET_LABELS[suffix] || suffix }));
  createExclusiveChips(cardCatalogSetFacetEl, options, selectedCatalogSet, (value) => {
    renderCardCatalog(value, selectedCatalogRank);
  });
}

function openCardCatalog() {
  cardCatalogOverlayEl.hidden = false;
  renderCardCatalog(selectedCatalogSet, selectedCatalogRank);
}

function closeCardCatalog() {
  cardCatalogOverlayEl.hidden = true;
}

// BASE RESETS

function dealHands() {
  const deckPool = cardPoolForDecks();
  // RNG ignores each card's real level as a filter -- every card in every selected deck is a
  // candidate -- but still respects the selected Card Levels as the set of levels it's allowed to
  // relabel a card to, and regenerates its stats to actually fit that level's normal range. The
  // shallow copy keeps this from ever touching the shared allCards objects, so the reassignment
  // really is just for this one deal.
  const pool = selectedDealOptions.has('rng')
    ? deckPool.map(rngRankedCard)
    : selectedRanks.size
      ? deckPool.filter((card) => selectedRanks.has(card.rank))
      : deckPool;
  return dealHandsRandomMix(pool, selectedDeckSize, {
    mirror: selectedDealOptions.has('mirror'),
  });
}

function clearBoardForSetup() {
  gridEl.innerHTML = '';
  cellEls = [];
  displayedBoard = [];
  handPlayerEl.innerHTML = '';
  handAiEl.innerHTML = '';
  handSlotEls = { player: [], ai: [] };
  scoreEls.player.textContent = '';
  scoreEls.ai.textContent = '';
  statusEl.textContent = '';
  hoveredCardName = null;
  selectedHandIndex = null;
  selectedSlideIndex = null;
  turnIndicatorEl.style.opacity = '0';
  swapOkLabelEl.style.opacity = '0';
  game = null;
}

function openSetupModal() {
  setupModalOverlayEl.hidden = false;
  topButtonsEl.hidden = true;
}

function closeSetupModal() {
  setupModalOverlayEl.hidden = true;
  topButtonsEl.hidden = false;
}

let lastDeal = null; // { playerHand, aiHand, firstTurn } from the most recent deal, for Restart Game

async function beginGame(playerHand, aiHand, firstTurn) {
  setupHandSlots();
  setupHandScores();
  setupStatusPosition();
  selectedHandIndex = null;
  selectedSlideIndex = null;
  thinking = false;
  animating = false;
  looseTransforms = new Map();
  const rules = {
    same: selectedRules.has('same'),
    sameWall: selectedRules.has('sameWall'),
    plus: selectedRules.has('plus'),
    combo: selectedRules.has('combo'),
    open: selectedRules.has('open'),
    advance: selectedRules.has('advance'),
    memory: selectedRules.has('memory'),
    swap: selectedRules.has('swap'),
    slide: selectedRules.has('slide'),
    overkill: selectedRules.has('overkill'),
    elemental: selectedRules.has('elemental'),
    themed: selectedRules.has('themed'),
  };
  game = createGame(playerHand, aiHand, firstTurn, rules, selectedBoardSize);

  game.aiDifficulty = selectedAiDifficulty;
  setupGrid();
  coinFlipping = true;
  renderGrid();
  renderScores();
  renderStatus();
  renderEndgameBanner();
  renderNewGameButton();
  await animateDealHands();

  await runCoinFlip(firstTurn);
  coinFlipping = false;
  render();

  if (game.turn === 'ai') {
    triggerAiTurn();
  }
}

async function newGame() {
  const { playerHand, aiHand } = dealHands();
  const firstTurn = Math.random() < 0.5 ? 'player' : 'ai';
  lastDeal = { playerHand, aiHand, firstTurn };
  await beginGame(playerHand, aiHand, firstTurn);
}

async function restartGame() {
  if (!lastDeal) return;
  await beginGame(lastDeal.playerHand, lastDeal.aiHand, lastDeal.firstTurn);
}

async function init() {
  await loadElementIcons();
  allCards = await loadCards(CARD_SHEETS);
  setupDecksFacet();
  setupRankFacet();
  setupDealOptionsFacet();
  setupRanksInfo(computeRankTotalRanges(cardPoolForDecks()));
  setupRulesFacet();
  setupHouseRulesFacet();
  setupDeckSizeStepper();
  setupBoardSizeFacet();
  setupAiDifficultyFacet();
  setupBoardAreaBacking();
  setupCardCatalogSetFacet();
  newGameBtnEl.addEventListener('click', () => {
    clearBoardForSetup();
    openSetupModal();
  });
  restartGameBtnEl.addEventListener('click', () => {
    restartGame();
  });
  dealAgainBtnEl.addEventListener('click', () => {
    newGame();
  });
  startGameBtnEl.addEventListener('click', () => {
    closeSetupModal();
    newGame();
  });
  cardCatalogBtnEl.addEventListener('click', openCardCatalog);
  cardCatalogCloseBtnEl.addEventListener('click', closeCardCatalog);
  cardCatalogOverlayEl.addEventListener('click', (e) => {
    if (e.target === cardCatalogOverlayEl) closeCardCatalog();
  });
  catalogRankPrevEl.addEventListener('click', () => stepCatalogRank(-1));
  catalogRankNextEl.addEventListener('click', () => stepCatalogRank(1));
  openSetupModal();
}

init();
