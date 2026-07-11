const CARD_SHEET_LAYOUT = {
  cols: 12,
  rows: 10,
  cardWidth: 184,
  cardHeight: 238,
  gap: 1,
};

const CARD_BACK_SRC = 'img/bg_back.png';

const CARD_SET_GRADIENTS = {
  ff8: { player: ['#e7e7e7', '#0f39bd'], ai: ['#ebebeb', '#c7344b'] }, // default
  ff6: { player: ['#6363bd', '#000052'], ai: ['#bc6463', '#520100'] },
  ff7: { player: ['#c0c0c0', '#007da9'], ai: ['#c3c3c3', '#a52b71'] },
  cc: { player: ['#43b8db', '#0a3f69'], ai: ['#fd754d', '#8b3236'] },
  sh: { player: ['#2e6389', '#000000'], ai: ['#882c2c', '#000000'] },
  ps1: { player: ['#d2d2d2', '#326db3'], ai: ['#d2d2d2', '#de0029'] },
};

const ELEMENT_SHEET_SRC = 'img/elems.png';
const ELEMENTS = ['Fire', 'Water', 'Lightning', 'Earth', 'Ice', 'Wind', 'Poison', 'Holy'];
const ELEMENT_TILE_WIDTH = 25;
const ELEMENT_TILE_HEIGHT = 30;
let ELEMENT_ICON_SRC = {};

async function loadElementIcons() {
  const sheet = await loadImage(ELEMENT_SHEET_SRC);
  const icons = {};
  ELEMENTS.forEach((name, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = ELEMENT_TILE_WIDTH;
    canvas.height = ELEMENT_TILE_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sheet, i * ELEMENT_TILE_WIDTH, 0, ELEMENT_TILE_WIDTH, ELEMENT_TILE_HEIGHT, 0, 0, ELEMENT_TILE_WIDTH, ELEMENT_TILE_HEIGHT);
    icons[name] = canvas.toDataURL();
  });
  ELEMENT_ICON_SRC = icons;
  return icons;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

async function loadCardSheet(src, layout = CARD_SHEET_LAYOUT) {
  const { cols, rows, cardWidth, cardHeight, gap } = layout;
  const sheet = await loadImage(src);
  const cards = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const canvas = document.createElement('canvas');
      canvas.width = cardWidth;
      canvas.height = cardHeight;
      const ctx = canvas.getContext('2d');
      const sx = col * (cardWidth + gap);
      const sy = row * (cardHeight + gap);
      ctx.drawImage(sheet, sx, sy, cardWidth, cardHeight, 0, 0, cardWidth, cardHeight);
      cards.push({ index: row * cols + col, canvas });
    }
  }

  return cards;
}

async function loadCardStats(src) {
  const res = await fetch(src);
  const text = await res.text();
  const [, ...rows] = text.trim().split(/\r?\n/);
  return rows.filter((line) => line.trim() !== '').map((line) => {
    const [rank, name, top, right, bottom, left, element] = line.split(',');
    return {
      rank: Number(rank),
      name,
      top: Number(top),
      right: Number(right),
      bottom: Number(bottom),
      left: Number(left),
      element: element && element.trim() ? element.trim() : null,
    };
  });
}

async function loadCards(sheets) {
  const cards = [];
  for (const { sheetSrc, statsSrc, set } of sheets) {
    const [sheetCards, stats] = await Promise.all([
      loadCardSheet(sheetSrc),
      loadCardStats(statsSrc),
    ]);
    stats.forEach((stat, i) => {
      cards.push({ ...stat, set, index: cards.length, canvas: sheetCards[i].canvas });
    });
  }
  return cards;
}

function formatCardValue(value) {
  return value === 10 ? 'A' : String(value);
}

function computeRankTotalRanges(cards) {
  const ranges = new Map();
  for (const card of cards) {
    const total = card.top + card.right + card.bottom + card.left;
    let range = ranges.get(card.rank);
    if (!range) {
      range = { min: Infinity, max: -Infinity };
      ranges.set(card.rank, range);
    }
    if (total < range.min) range.min = total;
    if (total > range.max) range.max = total;
  }
  return ranges;
}

// The highest single side value seen on any real card of each level -- e.g. in the original game
// no level 1 card has a 9 on any side, even though its stat totals alone wouldn't rule that out.
function computeRankMaxValue(cards) {
  const maxByRank = new Map();
  for (const card of cards) {
    const cardMax = Math.max(card.top, card.right, card.bottom, card.left);
    if (cardMax > (maxByRank.get(card.rank) ?? 0)) maxByRank.set(card.rank, cardMax);
  }
  return maxByRank;
}

// Builds 4 side values summing to a random total within [minSum, maxSum], with no single side
// exceeding maxValue -- used to give an RNG-relabeled card stats that actually belong to its new
// level, instead of just keeping its original (now mismatched) values.
function randomCardStatsForRange(minSum, maxSum, maxValue = 10) {
  const cap = Math.max(1, Math.min(10, maxValue));
  const lo = Math.max(4, Math.min(cap * 4, minSum));
  const hi = Math.max(lo, Math.min(cap * 4, maxSum));
  const total = lo + Math.floor(Math.random() * (hi - lo + 1));

  const slots = [0, 1, 2, 3];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  const values = [0, 0, 0, 0];
  const maxExtra = cap - 1;
  let remaining = total - 4; // each side starts at a base of 1; distribute the rest (0..cap-1 extra each)
  slots.forEach((slot, idx) => {
    const slotsLeft = slots.length - idx - 1;
    const maxHere = Math.min(maxExtra, remaining);
    const minHere = Math.max(0, remaining - maxExtra * slotsLeft);
    const extra = minHere + Math.floor(Math.random() * (maxHere - minHere + 1));
    values[slot] = extra + 1;
    remaining -= extra;
  });
  return values;
}

let nextClonedCardIndex = 1000000;

function cloneCardInstance(card) {
  const canvas = document.createElement('canvas');
  canvas.width = card.canvas.width;
  canvas.height = card.canvas.height;
  canvas.getContext('2d').drawImage(card.canvas, 0, 0);
  return { ...card, canvas, index: nextClonedCardIndex++ };
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Mirrors the original game: levels 1-7 can be dealt more than once per game, but the rare
// levels 8-10 (A) are unique -- each such card can be dealt to only one hand slot, period.
const UNIQUE_CARD_RANK_MIN = 8;

function dealHandsRandomMix(cards, handSize, { mirror = false } = {}) {
  const byRank = new Map();
  for (const card of cards) {
    if (!byRank.has(card.rank)) byRank.set(card.rank, []);
    byRank.get(card.rank).push(card);
  }
  for (const pool of byRank.values()) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }

  const ranks = [...byRank.keys()];
  const playerHand = [];
  const aiHand = [];
  for (let i = 0; i < handSize; i++) {
    const available = ranks.filter((rank) => {
      const unique = rank >= UNIQUE_CARD_RANK_MIN;
      // A unique rank needs 2 cards left (one per side) to stay eligible, unless mirror is copying
      // a single card to both sides -- and a non-unique rank always has replacement, so 1 is enough.
      const minPoolSize = unique && !mirror ? 2 : 1;
      return byRank.get(rank).length >= minPoolSize;
    });
    // Ran out of eligible cards for the requested hand size (e.g. a deck with too few unique
    // level 8-10 cards) -- deal what we can rather than reading off the end of `available`.
    if (!available.length) break;
    const rank = available[Math.floor(Math.random() * available.length)];
    const pool = byRank.get(rank);
    const unique = rank >= UNIQUE_CARD_RANK_MIN;

    if (mirror) {
      // Both sides get a clone, even for the "first" one -- for non-unique ranks `base` stays in
      // the pool and could be drawn again later, and a shared (uncloned) canvas can only sit in
      // one hand slot at a time.
      const base = unique ? pool.pop() : randomItem(pool);
      playerHand.push(cloneCardInstance(base));
      aiHand.push(cloneCardInstance(base));
    } else if (unique) {
      playerHand.push(pool.pop());
      aiHand.push(pool.pop());
    } else {
      playerHand.push(cloneCardInstance(randomItem(pool)));
      aiHand.push(cloneCardInstance(randomItem(pool)));
    }
  }
  return { playerHand, aiHand };
}

function buildCardFace(card, owner, { locked = false, memory = false, memoryHidden = false, elemental = false, elementBonus = null, themed = false, nameLabel = false } = {}) {
  const face = document.createElement('div');
  face.className = `card-face-content owner-${owner}${locked ? ' locked' : ''}`;

  const gradient = document.createElement('div');
  gradient.className = 'card-gradient';
  const setGradient = themed && CARD_SET_GRADIENTS[card.set];
  if (setGradient) {
    const [from, to] = setGradient[owner];
    gradient.style.background = `linear-gradient(135deg, ${from}, ${to})`;
  }
  face.appendChild(gradient);
  face.appendChild(card.canvas);

  if (locked) {
    const flash = document.createElement('div');
    flash.className = 'overkill-flash';
    face.appendChild(flash);
  }

  const valueClass = memory ? ' memory-fade' : memoryHidden ? ' memory-hidden' : '';
  for (const pos of ['top', 'right', 'bottom', 'left']) {
    const span = document.createElement('span');
    span.className = `card-value card-value-${pos}${valueClass}`;
    span.textContent = formatCardValue(card[pos]);
    face.appendChild(span);
  }

  if (elemental && card.element && ELEMENT_ICON_SRC[card.element]) {
    const icon = document.createElement('img');
    icon.className = 'card-element';
    icon.src = ELEMENT_ICON_SRC[card.element];
    icon.alt = card.element;
    face.appendChild(icon);
  }

  if (elementBonus) {
    const badge = document.createElement('div');
    badge.className = `card-element-bonus ${elementBonus > 0 ? 'bonus-plus' : 'bonus-minus'}`;
    badge.textContent = elementBonus > 0 ? '+1' : '-1';
    face.appendChild(badge);
  }

  if (nameLabel) {
    const label = document.createElement('div');
    label.className = 'card-name-label';
    label.textContent = card.name;
    face.appendChild(label);
  }

  return face;
}

function cardBackFace() {
  const face = document.createElement('div');
  face.className = 'card-face-content card-back';
  const img = document.createElement('img');
  img.src = CARD_BACK_SRC;
  img.alt = '';
  face.appendChild(img);
  return face;
}

function renderCard(card, owner, { hidden = false, locked = false, memory = false, memoryHidden = false, transform = '', elemental = false, elementBonus = null, themed = false, nameLabel = false } = {}) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.index = card.index;
  if (transform) el.style.transform = transform;
  if (hidden) {
    el.appendChild(cardBackFace());
  } else {
    el.title = card.name;
    el.dataset.name = card.name;
    el.appendChild(buildCardFace(card, owner, { locked, memory, memoryHidden, elemental, elementBonus, themed, nameLabel }));
  }
  return el;
}
