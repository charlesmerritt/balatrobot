// Mock game engine: implements the BalatroBot JSON-RPC methods against a
// simulated GameState so the visualizer works without a running game.
// State shapes mirror src/lua/utils/types.lua; error semantics mirror
// src/lua/core/dispatcher.lua. Game math is approximate (see docs).

import {
  BLIND_BASE_BY_ANTE, BOOSTERS, BOSSES, DECKS, HANDS, JOKERS, METHOD_SCHEMAS,
  PLANETS, RANK_CHIPS, RANKS, SPECTRALS, STAKES, SUITS, TAGS, TAROTS, VOUCHERS,
} from "./mockdata.js";

const ERROR_CODES = {
  INTERNAL_ERROR: -32000,
  BAD_REQUEST: -32001,
  INVALID_STATE: -32002,
  NOT_ALLOWED: -32003,
};

class RpcError extends Error {
  constructor(name, message) {
    super(message);
    this.rpc = { code: ERROR_CODES[name], message, data: { name } };
  }
}

const err = (name, message) => { throw new RpcError(name, message); };

// Deterministic RNG (mulberry32) so mock runs are reproducible per seed.
function makeRng(seedStr) {
  let h = 1779033703;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 3432918353);
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockGame {
  constructor() {
    this.reset();
    this.saves = new Map();
  }

  reset() {
    this.state = "MENU";
    this.g = null; // run state, null in menu
    this.rng = makeRng("MOCK");
    this._nextId = 1;
    this.lastConsumableUsed = null;
  }

  // ---- public entry point -------------------------------------------------

  call(method, params = {}) {
    const schema = METHOD_SCHEMAS[method];
    if (method === "rpc.discover") return this.discover();
    if (!schema) err("BAD_REQUEST", `Unknown method: ${method}`);
    this.validate(params, schema.params);
    if (schema.states && !schema.states.includes(this.state)) {
      err("INVALID_STATE",
        `Method '${method}' requires state ${schema.states.join(" or ")}, current state is ${this.state}`);
    }
    const handler = this[`ep_${method}`];
    return handler.call(this, params);
  }

  validate(params, schemas) {
    for (const [name, spec] of Object.entries(schemas)) {
      const value = params[name];
      if (value === undefined || value === null) {
        if (spec.required) err("BAD_REQUEST", `Missing required parameter: ${name}`);
        continue;
      }
      const ok = {
        string: () => typeof value === "string",
        integer: () => Number.isInteger(value),
        boolean: () => typeof value === "boolean",
        array: () => Array.isArray(value) && value.every((v) => Number.isInteger(v)),
        table: () => typeof value === "object",
      }[spec.type]();
      if (!ok) err("BAD_REQUEST", `Parameter '${name}' must be of type ${spec.type}`);
    }
    for (const name of Object.keys(params)) {
      if (!(name in schemas)) err("BAD_REQUEST", `Unknown parameter: ${name}`);
    }
  }

  // ---- card factories -----------------------------------------------------

  id() { return this._nextId++; }

  makePlayingCard(suit, rank) {
    return {
      id: this.id(),
      key: `${suit[0]}_${rank}`,
      set: "Default",
      label: `${rank} of ${suit}`,
      value: { suit, rank, effect: `+${RANK_CHIPS[rank]} chips` },
      modifier: {},
      state: {},
      cost: { sell: 1, buy: 1 },
    };
  }

  makeSpecialCard(def, set) {
    const cost = def.cost ?? 3;
    return {
      id: this.id(),
      key: def.key,
      set,
      label: def.label,
      value: { effect: def.effect ?? (def.hand ? `Level up ${def.hand}` : "") },
      modifier: {},
      state: {},
      cost: { sell: Math.max(1, Math.floor(cost / 2)), buy: cost },
    };
  }

  fullDeck() {
    const cards = [];
    for (const suit of SUITS) for (const rank of RANKS) cards.push(this.makePlayingCard(suit, rank));
    return cards;
  }

  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---- run lifecycle ------------------------------------------------------

  ep_health() { return { status: "ok" }; }

  ep_menu() { this.reset(); return this.ep_gamestate(); }

  ep_start({ deck, stake, seed }) {
    if (!DECKS.includes(deck)) err("BAD_REQUEST", `Invalid deck: ${deck}`);
    if (!STAKES.includes(stake)) err("BAD_REQUEST", `Invalid stake: ${stake}`);
    const runSeed = seed ?? Math.random().toString(36).slice(2, 10).toUpperCase();
    this.rng = makeRng(runSeed);
    const hands = {};
    for (const [name, def] of Object.entries(HANDS)) {
      hands[name] = {
        order: def.order, level: 1, chips: def.chips, mult: def.mult,
        played: 0, played_this_round: 0, example: [],
      };
    }
    this.g = {
      deck, stake, seed: runSeed,
      money: 4 + (deck === "YELLOW" ? 10 : 0),
      ante: 1, round: 0,
      handSize: 8 + (deck === "PAINTED" ? 2 : 0),
      handsPerRound: 4 + (deck === "BLUE" ? 1 : 0),
      discardsPerRound: 3 + (deck === "RED" ? 1 : 0),
      interestCap: 5,
      shopSlots: 2,
      hands,
      jokers: [], consumables: [],
      deckCards: this.fullDeck(), handCards: [],
      shopCards: [], shopVouchers: [], shopPacks: [],
      packCards: [], packPicksLeft: 0, packSource: null,
      usedVouchers: {},
      roundState: null,
      blinds: null, blindOnDeck: "small",
      evalReward: 0,
      won: null,
    };
    this.newAnteBlinds();
    this.state = "BLIND_SELECT";
    return this.ep_gamestate();
  }

  newAnteBlinds() {
    const base = BLIND_BASE_BY_ANTE[Math.min(this.g.ante, BLIND_BASE_BY_ANTE.length - 1)]
      * (this.g.stake === "WHITE" ? 1 : 1.5) * (this.g.deck === "PLASMA" ? 2 : 1);
    const boss = BOSSES[(this.g.ante - 1) % BOSSES.length];
    const tag = () => this.pick(TAGS);
    const smallTag = tag(); const bigTag = tag();
    this.g.blinds = {
      small: {
        type: "SMALL", status: "SELECT", name: "Small Blind",
        effect: "", score: Math.floor(base),
        tag_name: smallTag.name, tag_effect: smallTag.effect,
      },
      big: {
        type: "BIG", status: "UPCOMING", name: "Big Blind",
        effect: "", score: Math.floor(base * 1.5),
        tag_name: bigTag.name, tag_effect: bigTag.effect,
      },
      boss: {
        type: "BOSS", status: "UPCOMING", name: boss.name,
        effect: boss.effect, score: Math.floor(base * 2),
      },
    };
    this.g.blindOnDeck = "small";
  }

  currentBlind() { return this.g.blinds[this.g.blindOnDeck]; }

  ep_select() {
    const blind = this.currentBlind();
    blind.status = "CURRENT";
    this.g.round += 1;
    this.g.roundState = {
      hands_left: this.g.handsPerRound, hands_played: 0,
      discards_left: this.g.discardsPerRound, discards_used: 0,
      chips: 0,
    };
    this.g.deckCards = this.shuffle(this.g.deckCards.concat(this.g.handCards));
    this.g.handCards = [];
    this.draw();
    this.state = "SELECTING_HAND";
    return this.ep_gamestate();
  }

  ep_skip() {
    if (this.g.blindOnDeck === "boss") err("NOT_ALLOWED", "Cannot skip the Boss blind");
    this.currentBlind().status = "SKIPPED";
    this.g.blindOnDeck = this.g.blindOnDeck === "small" ? "big" : "boss";
    this.currentBlind().status = "SELECT";
    return this.ep_gamestate();
  }

  draw() {
    while (this.g.handCards.length < this.g.handSize && this.g.deckCards.length > 0) {
      this.g.handCards.push(this.g.deckCards.pop());
    }
  }

  // ---- playing ------------------------------------------------------------

  takeHandCards(indices) {
    const hand = this.g.handCards;
    const unique = new Set(indices);
    if (unique.size !== indices.length) err("BAD_REQUEST", "Duplicate card indices");
    for (const i of indices) {
      if (i < 0 || i >= hand.length) err("BAD_REQUEST", `Card index out of range: ${i}`);
    }
    const taken = indices.map((i) => hand[i]);
    this.g.handCards = hand.filter((_, i) => !unique.has(i));
    return taken;
  }

  ep_play({ cards }) {
    if (cards.length < 1 || cards.length > 5) err("NOT_ALLOWED", "Must play 1 to 5 cards");
    const blind = this.currentBlind();
    if (blind.name === "The Psychic" && cards.length !== 5) {
      err("NOT_ALLOWED", "The Psychic: must play 5 cards");
    }
    const played = this.takeHandCards(cards);
    const handName = evaluatePokerHand(played);
    const handInfo = this.g.hands[handName];
    handInfo.played += 1;
    handInfo.played_this_round += 1;
    handInfo.example = played.map((c) => [c.key, true]);

    let chips = handInfo.chips + played.reduce((sum, c) => sum + RANK_CHIPS[c.value.rank], 0);
    let mult = handInfo.mult;
    for (const joker of this.g.jokers) {
      const def = JOKERS.find((j) => j.key === joker.key) ?? {};
      const hasPair = ["Pair", "Two Pair", "Three of a Kind", "Full House", "Four of a Kind", "Five of a Kind", "Flush House", "Flush Five"].includes(handName);
      if (def.mult) mult += def.mult;
      if (def.mult_if_pair && hasPair) mult += def.mult_if_pair;
      if (def.chips_if_pair && hasPair) chips += def.chips_if_pair;
      if (def.mult_if_small && cards.length <= 3) mult += def.mult_if_small;
      if (def.chips_per_discard) chips += def.chips_per_discard * this.g.roundState.discards_left;
      if (def.mult_if_no_discards && this.g.roundState.discards_left === 0) mult += def.mult_if_no_discards;
      if (def.mult_per_joker) mult += def.mult_per_joker * this.g.jokers.length;
    }
    const score = chips * mult;

    const round = this.g.roundState;
    round.chips += score;
    round.hands_played += 1;
    round.hands_left -= 1;

    if (round.chips >= blind.score) {
      blind.status = "DEFEATED";
      const rewards = { small: 3, big: 4, boss: 5 };
      const interest = Math.min(Math.floor(this.g.money / 5), this.g.interestCap);
      this.g.evalReward = rewards[this.g.blindOnDeck] + round.hands_left + interest;
      if (this.g.blindOnDeck === "boss" && this.g.ante >= 8) this.g.won = true;
      this.state = "ROUND_EVAL";
    } else if (round.hands_left === 0) {
      this.g.won = false;
      this.state = "GAME_OVER";
    } else {
      this.draw();
    }
    return this.ep_gamestate();
  }

  ep_discard({ cards }) {
    if (cards.length < 1 || cards.length > 5) err("NOT_ALLOWED", "Must discard 1 to 5 cards");
    const round = this.g.roundState;
    if (round.discards_left <= 0) err("NOT_ALLOWED", "No discards remaining");
    this.takeHandCards(cards);
    round.discards_left -= 1;
    round.discards_used += 1;
    this.draw();
    return this.ep_gamestate();
  }

  ep_cash_out() {
    this.g.money += this.g.evalReward;
    this.g.evalReward = 0;
    if (this.g.won) { this.state = "GAME_OVER"; return this.ep_gamestate(); }
    this.restockShop();
    this.state = "SHOP";
    return this.ep_gamestate();
  }

  // ---- shop ---------------------------------------------------------------

  restockShop() {
    const pool = () => {
      const roll = this.rng();
      if (roll < 0.6) return this.makeSpecialCard(this.pick(JOKERS), "Joker");
      if (roll < 0.8) return this.makeSpecialCard(this.pick(TAROTS), "Tarot");
      return this.makeSpecialCard(this.pick(PLANETS), "Planet");
    };
    this.g.shopCards = Array.from({ length: this.g.shopSlots }, pool);
    this.g.shopVouchers = [this.makeSpecialCard(this.pick(VOUCHERS), "Voucher")];
    const packs = this.shuffle([...BOOSTERS]).slice(0, 2);
    this.g.shopPacks = packs.map((p) => this.makeSpecialCard(p, "Booster"));
    this.g.rerollCost = 5;
  }

  spend(amount) {
    if (this.g.money < amount) err("NOT_ALLOWED", `Not enough money (need $${amount}, have $${this.g.money})`);
    this.g.money -= amount;
  }

  ep_reroll() {
    this.spend(this.g.rerollCost);
    const cost = this.g.rerollCost + 1;
    this.restockShop();
    this.g.rerollCost = cost;
    return this.ep_gamestate();
  }

  ep_buy({ card, voucher, pack }) {
    const given = [card, voucher, pack].filter((v) => v !== undefined);
    if (given.length !== 1) err("BAD_REQUEST", "Provide exactly one of: card, voucher, pack");
    if (card !== undefined) {
      const item = this.g.shopCards[card] ?? err("BAD_REQUEST", `No shop card at index ${card}`);
      this.spend(item.cost.buy);
      this.acquire(item);
      this.g.shopCards.splice(card, 1);
    } else if (voucher !== undefined) {
      const item = this.g.shopVouchers[voucher] ?? err("BAD_REQUEST", `No voucher at index ${voucher}`);
      this.spend(item.cost.buy);
      this.applyVoucher(item.key);
      this.g.usedVouchers[item.label] = item.value.effect;
      this.g.shopVouchers.splice(voucher, 1);
    } else {
      const item = this.g.shopPacks[pack] ?? err("BAD_REQUEST", `No pack at index ${pack}`);
      this.spend(item.cost.buy);
      this.openPack(item);
      this.g.shopPacks.splice(pack, 1);
    }
    return this.ep_gamestate();
  }

  acquire(item) {
    if (item.set === "Joker") {
      if (this.g.jokers.length >= 5) err("NOT_ALLOWED", "No joker slots available");
      this.g.jokers.push(item);
    } else {
      if (this.g.consumables.length >= 2) err("NOT_ALLOWED", "No consumable slots available");
      this.g.consumables.push(item);
    }
  }

  applyVoucher(key) {
    const def = VOUCHERS.find((v) => v.key === key) ?? {};
    if (def.shop_slots) this.g.shopSlots += def.shop_slots;
    if (def.hands) this.g.handsPerRound += def.hands;
    if (def.discards) this.g.discardsPerRound += def.discards;
    if (def.interest_cap) this.g.interestCap = def.interest_cap;
    if (def.hand_size) this.g.handSize += def.hand_size;
  }

  openPack(item) {
    const def = BOOSTERS.find((b) => b.key === item.key);
    const source = {
      Tarot: () => this.makeSpecialCard(this.pick(TAROTS), "Tarot"),
      Planet: () => this.makeSpecialCard(this.pick(PLANETS), "Planet"),
      Spectral: () => this.makeSpecialCard(this.pick(SPECTRALS), "Spectral"),
      Joker: () => this.makeSpecialCard(this.pick(JOKERS), "Joker"),
      Default: () => this.makePlayingCard(this.pick(SUITS), this.pick(RANKS)),
    }[def.contents];
    this.g.packCards = Array.from({ length: def.show }, source);
    this.g.packPicksLeft = def.picks;
    this.state = "SMODS_BOOSTER_OPENED";
  }

  ep_pack({ card, targets, skip }) {
    if (skip) {
      this.g.packCards = [];
      this.g.packPicksLeft = 0;
      this.state = "SHOP";
      return this.ep_gamestate();
    }
    if (card === undefined) err("BAD_REQUEST", "Provide 'card' index or 'skip'");
    const picked = this.g.packCards[card] ?? err("BAD_REQUEST", `No pack card at index ${card}`);
    if (picked.set === "Tarot" || picked.set === "Planet" || picked.set === "Spectral") {
      // Consumables picked from a pack apply immediately (targets select the
      // hand cards they act on), matching game behavior.
      this.applyConsumable(picked, targets ?? []);
    } else if (picked.set === "Joker") {
      this.acquire(picked);
    } else {
      this.g.deckCards.push(picked);
    }
    this.g.packCards.splice(card, 1);
    this.g.packPicksLeft -= 1;
    if (this.g.packPicksLeft <= 0) {
      this.g.packCards = [];
      this.state = "SHOP";
    }
    return this.ep_gamestate();
  }

  ep_next_round() {
    if (this.g.blinds.boss.status === "DEFEATED") {
      this.g.ante += 1;
      this.newAnteBlinds();
    } else {
      const order = ["small", "big", "boss"];
      this.g.blindOnDeck = order.find(
        (k) => !["DEFEATED", "SKIPPED"].includes(this.g.blinds[k].status),
      );
      this.currentBlind().status = "SELECT";
    }
    this.state = "BLIND_SELECT";
    return this.ep_gamestate();
  }

  // ---- inventory ----------------------------------------------------------

  ep_sell({ joker, consumable }) {
    const given = [joker, consumable].filter((v) => v !== undefined);
    if (given.length !== 1) err("BAD_REQUEST", "Provide exactly one of: joker, consumable");
    const [area, index] = joker !== undefined ? [this.g.jokers, joker] : [this.g.consumables, consumable];
    const item = area[index] ?? err("BAD_REQUEST", `No card at index ${index}`);
    if (item.modifier.eternal) err("NOT_ALLOWED", "Eternal cards cannot be sold");
    this.g.money += item.cost.sell;
    area.splice(index, 1);
    return this.ep_gamestate();
  }

  ep_use({ consumable, cards }) {
    const item = this.g.consumables[consumable] ?? err("BAD_REQUEST", `No consumable at index ${consumable}`);
    this.applyConsumable(item, cards ?? []);
    this.g.consumables.splice(consumable, 1);
    this.lastConsumableUsed = item.key;
    return this.ep_gamestate();
  }

  applyConsumable(item, targetIndices) {
    const targets = targetIndices.map((i) =>
      this.g.handCards[i] ?? err("BAD_REQUEST", `No hand card at index ${i}`));
    const planet = PLANETS.find((p) => p.key === item.key);
    if (planet) {
      const hand = this.g.hands[planet.hand];
      const def = HANDS[planet.hand];
      hand.level += 1;
      hand.chips += def.step_chips;
      hand.mult += def.step_mult;
      return;
    }
    const def = TAROTS.find((t) => t.key === item.key) ?? SPECTRALS.find((s) => s.key === item.key) ?? {};
    if (def.targets && targets.length === 0) {
      err("NOT_ALLOWED", `${item.label} requires up to ${def.targets} target cards`);
    }
    if (def.targets && targets.length > def.targets) {
      err("NOT_ALLOWED", `${item.label} targets at most ${def.targets} cards`);
    }
    if (def.enhance) for (const c of targets) { c.modifier.enhancement = def.enhance; c.set = "Enhanced"; }
    if (def.destroys) this.g.handCards = this.g.handCards.filter((c) => !targets.includes(c));
    if (def.money_double_cap) this.g.money += Math.min(this.g.money, def.money_double_cap);
    if (item.key === "c_temperance") {
      this.g.money += Math.min(50, this.g.jokers.reduce((s, j) => s + j.cost.sell, 0));
    }
    if (item.key === "c_judgement" && this.g.jokers.length < 5) {
      this.g.jokers.push(this.makeSpecialCard(this.pick(JOKERS), "Joker"));
    }
    if (item.key === "c_strength") {
      for (const c of targets) {
        const next = RANKS[(RANKS.indexOf(c.value.rank) + 1) % RANKS.length];
        c.value.rank = next;
        c.label = `${next} of ${c.value.suit}`;
        c.key = `${c.value.suit[0]}_${next}`;
      }
    }
    if (item.key === "c_immolate") {
      this.shuffle(this.g.handCards);
      this.g.handCards = this.g.handCards.slice(Math.min(5, this.g.handCards.length));
      this.g.money += 20;
    }
    if (item.key === "c_talisman") for (const c of targets) c.modifier.seal = "GOLD";
    if (item.key === "c_aura") for (const c of targets) c.modifier.edition = this.pick(["FOIL", "HOLO", "POLYCHROME"]);
    if (item.key === "c_sigil") {
      const suit = this.pick(SUITS);
      for (const c of this.g.handCards) {
        c.value.suit = suit;
        c.label = `${c.value.rank} of ${suit}`;
        c.key = `${suit[0]}_${c.value.rank}`;
      }
    }
    if (item.key === "c_fool" && this.lastConsumableUsed && this.g.consumables.length < 2) {
      const last = [...TAROTS, ...PLANETS.map((p) => ({ ...p, cost: 3 }))].find((t) => t.key === this.lastConsumableUsed);
      if (last) this.g.consumables.push(this.makeSpecialCard(last, PLANETS.some((p) => p.key === last.key) ? "Planet" : "Tarot"));
    }
  }

  ep_rearrange({ hand, jokers, consumables }) {
    const apply = (area, order, label) => {
      if (!order) return area;
      const sorted = [...order].sort((a, b) => a - b);
      const valid = order.length === area.length && sorted.every((v, i) => v === i);
      if (!valid) err("BAD_REQUEST", `'${label}' must be a permutation of 0..${area.length - 1}`);
      return order.map((i) => area[i]);
    };
    if (!this.g) err("INVALID_STATE", "No run in progress");
    this.g.handCards = apply(this.g.handCards, hand, "hand");
    this.g.jokers = apply(this.g.jokers, jokers, "jokers");
    this.g.consumables = apply(this.g.consumables, consumables, "consumables");
    return this.ep_gamestate();
  }

  ep_add({ key, seal, edition, enhancement, eternal, perishable, rental }) {
    if (!this.g) err("INVALID_STATE", "No run in progress");
    const playingCard = key.match(/^([SHCD])_(2|3|4|5|6|7|8|9|10|J|Q|K|A)$/);
    if (playingCard) {
      const suit = SUITS.find((s) => s[0] === playingCard[1]);
      const card = this.makePlayingCard(suit, playingCard[2]);
      if (seal) card.modifier.seal = seal;
      if (edition) card.modifier.edition = edition;
      if (enhancement) { card.modifier.enhancement = enhancement; card.set = "Enhanced"; }
      this.state === "SELECTING_HAND" ? this.g.handCards.push(card) : this.g.deckCards.push(card);
    } else if (key.startsWith("j_")) {
      const def = JOKERS.find((j) => j.key === key) ?? err("BAD_REQUEST", `Unknown joker key: ${key}`);
      const card = this.makeSpecialCard(def, "Joker");
      if (edition) card.modifier.edition = edition;
      if (eternal) card.modifier.eternal = true;
      if (perishable) card.modifier.perishable = perishable;
      if (rental) card.modifier.rental = true;
      this.acquire(card);
    } else if (key.startsWith("c_")) {
      const pools = [[TAROTS, "Tarot"], [PLANETS, "Planet"], [SPECTRALS, "Spectral"]];
      for (const [pool, set] of pools) {
        const def = pool.find((c) => c.key === key);
        if (def) { this.acquire(this.makeSpecialCard(def, set)); return this.ep_gamestate(); }
      }
      err("BAD_REQUEST", `Unknown consumable key: ${key}`);
    } else if (key.startsWith("v_")) {
      const def = VOUCHERS.find((v) => v.key === key) ?? err("BAD_REQUEST", `Unknown voucher key: ${key}`);
      this.applyVoucher(key);
      this.g.usedVouchers[def.label] = def.effect;
    } else {
      err("BAD_REQUEST", `Unknown card key: ${key}`);
    }
    return this.ep_gamestate();
  }

  ep_set({ money, chips, ante, round, hands, discards, shop }) {
    if (!this.g) err("INVALID_STATE", "No run in progress");
    if (money !== undefined) this.g.money = money;
    if (ante !== undefined) { this.g.ante = ante; }
    if (round !== undefined) this.g.round = round;
    if (chips !== undefined && this.g.roundState) this.g.roundState.chips = chips;
    if (hands !== undefined && this.g.roundState) this.g.roundState.hands_left = hands;
    if (discards !== undefined && this.g.roundState) this.g.roundState.discards_left = discards;
    if (shop) this.restockShop();
    return this.ep_gamestate();
  }

  // ---- persistence & misc -------------------------------------------------

  ep_save({ path }) {
    this.saves.set(path, structuredClone({ state: this.state, g: this.g, nextId: this._nextId }));
    return { success: true, path };
  }

  ep_load({ path }) {
    const snapshot = this.saves.get(path) ?? err("BAD_REQUEST", `No save file at path: ${path}`);
    const restored = structuredClone(snapshot);
    this.state = restored.state;
    this.g = restored.g;
    this._nextId = restored.nextId;
    return { success: true, path };
  }

  ep_screenshot({ path }) {
    return { success: true, path };
  }

  // ---- gamestate assembly ---------------------------------------------------

  area(cards, limit, extra = {}) {
    return { count: cards.length, limit, cards: structuredClone(cards), ...extra };
  }

  ep_gamestate() {
    if (!this.g) {
      return { state: this.state, round_num: 0, ante_num: 0, money: 0 };
    }
    const g = this.g;
    const gs = {
      state: this.state,
      deck: g.deck, stake: g.stake, seed: g.seed,
      round_num: g.round, ante_num: g.ante, money: g.money,
      hands: structuredClone(g.hands),
      blinds: structuredClone(g.blinds),
      jokers: this.area(g.jokers, 5),
      consumables: this.area(g.consumables, 2),
      cards: this.area(g.deckCards, 52),
      used_vouchers: { ...g.usedVouchers },
    };
    if (g.roundState) {
      gs.round = { ...g.roundState };
      if (this.state === "SHOP") gs.round.reroll_cost = g.rerollCost;
    }
    if (this.state === "SELECTING_HAND" || this.state === "ROUND_EVAL" || this.state === "SMODS_BOOSTER_OPENED") {
      gs.hand = this.area(g.handCards, g.handSize, { highlighted_limit: 5 });
    }
    if (this.state === "SHOP" || this.state === "SMODS_BOOSTER_OPENED") {
      gs.shop = this.area(g.shopCards, g.shopSlots);
      gs.vouchers = this.area(g.shopVouchers, 1);
      gs.packs = this.area(g.shopPacks, 2);
    }
    if (this.state === "SMODS_BOOSTER_OPENED") {
      gs.pack = this.area(g.packCards, g.packCards.length);
    }
    if (g.won !== null) gs.won = g.won;
    return gs;
  }

  discover() {
    const methods = Object.entries(METHOD_SCHEMAS).map(([name, schema]) => ({
      name,
      params: Object.entries(schema.params).map(([pname, spec]) => ({
        name: pname,
        required: spec.required ?? false,
        description: spec.description ?? "",
        schema: { type: spec.type },
      })),
      "x-requires-state": schema.states,
    }));
    return { openrpc: "1.2.6", info: { title: "BalatroBot mock", version: "mock" }, methods };
  }
}

// ---- poker hand evaluation (module-level, pure) ----------------------------

export function evaluatePokerHand(cards) {
  const rankCounts = {};
  const suitCounts = {};
  for (const c of cards) {
    rankCounts[c.value.rank] = (rankCounts[c.value.rank] ?? 0) + 1;
    suitCounts[c.value.suit] = (suitCounts[c.value.suit] ?? 0) + 1;
  }
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const isFlush = cards.length === 5 && Object.keys(suitCounts).length === 1;
  const isStraight = (() => {
    if (cards.length !== 5 || counts[0] !== 1) return false;
    const order = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    const idx = cards.map((c) => order.indexOf(c.value.rank)).sort((a, b) => a - b);
    const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    const aceLow = JSON.stringify(idx) === JSON.stringify([0, 1, 2, 3, 12]);
    return consecutive || aceLow;
  })();

  if (counts[0] === 5) return isFlush ? "Flush Five" : "Five of a Kind";
  if (isFlush && counts[0] === 3 && counts[1] === 2) return "Flush House";
  if (isFlush && isStraight) return "Straight Flush";
  if (counts[0] === 4) return "Four of a Kind";
  if (counts[0] === 3 && counts[1] === 2) return "Full House";
  if (isFlush) return "Flush";
  if (isStraight) return "Straight";
  if (counts[0] === 3) return "Three of a Kind";
  if (counts[0] === 2 && counts[1] === 2) return "Two Pair";
  if (counts[0] === 2) return "Pair";
  return "High Card";
}
