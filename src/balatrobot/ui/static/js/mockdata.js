// Static data tables for the mock game engine. Values approximate base
// Balatro; the mock aims for plausible gamestates, not exact game math.

export const DECKS = [
  "RED", "BLUE", "YELLOW", "GREEN", "BLACK", "MAGIC", "NEBULA", "GHOST",
  "ABANDONED", "CHECKERED", "ZODIAC", "PAINTED", "ANAGLYPH", "PLASMA", "ERRATIC",
];

export const STAKES = [
  "WHITE", "RED", "GREEN", "BLACK", "BLUE", "PURPLE", "ORANGE", "GOLD",
];

export const STAKE_COLORS = {
  WHITE: "#e8e8e8", RED: "#fe5f55", GREEN: "#4bc292", BLACK: "#333b3d",
  BLUE: "#0099ff", PURPLE: "#8e5fca", ORANGE: "#f5920e", GOLD: "#eac058",
};

export const SUITS = ["Spades", "Hearts", "Clubs", "Diamonds"];
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const RANK_CHIPS = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
  J: 10, Q: 10, K: 10, A: 11,
};

// order: 1 = rarest/most important, matching the gamestate Hand.order field.
export const HANDS = {
  "Flush Five":      { order: 1,  chips: 160, mult: 16, step_chips: 50, step_mult: 3 },
  "Flush House":     { order: 2,  chips: 140, mult: 14, step_chips: 40, step_mult: 4 },
  "Five of a Kind":  { order: 3,  chips: 120, mult: 12, step_chips: 35, step_mult: 3 },
  "Straight Flush":  { order: 4,  chips: 100, mult: 8,  step_chips: 40, step_mult: 4 },
  "Four of a Kind":  { order: 5,  chips: 60,  mult: 7,  step_chips: 30, step_mult: 3 },
  "Full House":      { order: 6,  chips: 40,  mult: 4,  step_chips: 25, step_mult: 2 },
  "Flush":           { order: 7,  chips: 35,  mult: 4,  step_chips: 15, step_mult: 2 },
  "Straight":        { order: 8,  chips: 30,  mult: 4,  step_chips: 30, step_mult: 3 },
  "Three of a Kind": { order: 9,  chips: 30,  mult: 3,  step_chips: 20, step_mult: 2 },
  "Two Pair":        { order: 10, chips: 20,  mult: 2,  step_chips: 20, step_mult: 1 },
  "Pair":            { order: 11, chips: 10,  mult: 2,  step_chips: 15, step_mult: 1 },
  "High Card":       { order: 12, chips: 5,   mult: 1,  step_chips: 10, step_mult: 1 },
};

export const BLIND_BASE_BY_ANTE = [100, 300, 800, 2000, 5000, 11000, 20000, 35000, 50000];

export const BOSSES = [
  { name: "The Hook", effect: "Discards 2 random cards per hand played" },
  { name: "The Ox", effect: "Playing your most played hand sets money to $0" },
  { name: "The House", effect: "First hand is drawn face down" },
  { name: "The Wall", effect: "Extra large blind" },
  { name: "The Wheel", effect: "1 in 7 cards get drawn face down" },
  { name: "The Arm", effect: "Decrease level of played poker hand" },
  { name: "The Club", effect: "All Club cards are debuffed" },
  { name: "The Psychic", effect: "Must play 5 cards" },
];

export const TAGS = [
  { name: "Uncommon Tag", effect: "Shop has a free Uncommon Joker" },
  { name: "Investment Tag", effect: "Gain $25 after defeating the Boss Blind" },
  { name: "Voucher Tag", effect: "Adds a Voucher to the next shop" },
  { name: "Charm Tag", effect: "Gives a free Mega Arcana Pack" },
  { name: "Meteor Tag", effect: "Gives a free Mega Celestial Pack" },
  { name: "D6 Tag", effect: "Rerolls start at $0 in next shop" },
  { name: "Double Tag", effect: "Gives a copy of the next selected Tag" },
  { name: "Speed Tag", effect: "Gives $5 per skipped Blind this run" },
];

export const JOKERS = [
  { key: "j_joker", label: "Joker", effect: "+4 Mult", cost: 2, mult: 4 },
  { key: "j_greedy_joker", label: "Greedy Joker", effect: "Played cards with Diamond suit give +3 Mult when scored", cost: 5 },
  { key: "j_lusty_joker", label: "Lusty Joker", effect: "Played cards with Heart suit give +3 Mult when scored", cost: 5 },
  { key: "j_wrathful_joker", label: "Wrathful Joker", effect: "Played cards with Spade suit give +3 Mult when scored", cost: 5 },
  { key: "j_jolly", label: "Jolly Joker", effect: "+8 Mult if played hand contains a Pair", cost: 3, mult_if_pair: 8 },
  { key: "j_sly", label: "Sly Joker", effect: "+50 Chips if played hand contains a Pair", cost: 3, chips_if_pair: 50 },
  { key: "j_half", label: "Half Joker", effect: "+20 Mult if played hand contains 3 or fewer cards", cost: 5, mult_if_small: 20 },
  { key: "j_banner", label: "Banner", effect: "+30 Chips for each remaining discard", cost: 5, chips_per_discard: 30 },
  { key: "j_mystic_summit", label: "Mystic Summit", effect: "+15 Mult when 0 discards remaining", cost: 5, mult_if_no_discards: 15 },
  { key: "j_abstract", label: "Abstract Joker", effect: "+3 Mult for each Joker card", cost: 4, mult_per_joker: 3 },
];

export const TAROTS = [
  { key: "c_fool", label: "The Fool", effect: "Creates the last Tarot or Planet card used" },
  { key: "c_magician", label: "The Magician", effect: "Enhances 2 selected cards to Lucky Cards", enhance: "LUCKY", targets: 2 },
  { key: "c_empress", label: "The Empress", effect: "Enhances 2 selected cards to Mult Cards", enhance: "MULT", targets: 2 },
  { key: "c_hierophant", label: "The Hierophant", effect: "Enhances 2 selected cards to Bonus Cards", enhance: "BONUS", targets: 2 },
  { key: "c_hermit", label: "The Hermit", effect: "Doubles money (Max of $20)", money_double_cap: 20 },
  { key: "c_strength", label: "Strength", effect: "Raises rank of up to 2 selected cards by 1", targets: 2 },
  { key: "c_hanged_man", label: "The Hanged Man", effect: "Destroys up to 2 selected cards", destroys: 2 },
  { key: "c_devil", label: "The Devil", effect: "Enhances 1 selected card to a Gold Card", enhance: "GOLD", targets: 1 },
  { key: "c_tower", label: "The Tower", effect: "Enhances 1 selected card to a Stone Card", enhance: "STONE", targets: 1 },
  { key: "c_temperance", label: "Temperance", effect: "Gives total sell value of all Jokers (Max of $50)" },
  { key: "c_judgement", label: "Judgement", effect: "Creates a random Joker card" },
];

export const PLANETS = [
  { key: "c_pluto", label: "Pluto", hand: "High Card" },
  { key: "c_mercury", label: "Mercury", hand: "Pair" },
  { key: "c_uranus", label: "Uranus", hand: "Two Pair" },
  { key: "c_venus", label: "Venus", hand: "Three of a Kind" },
  { key: "c_saturn", label: "Saturn", hand: "Straight" },
  { key: "c_jupiter", label: "Jupiter", hand: "Flush" },
  { key: "c_earth", label: "Earth", hand: "Full House" },
  { key: "c_mars", label: "Mars", hand: "Four of a Kind" },
  { key: "c_neptune", label: "Neptune", hand: "Straight Flush" },
];

export const SPECTRALS = [
  { key: "c_aura", label: "Aura", effect: "Adds Foil, Holographic, or Polychrome to 1 selected card", targets: 1 },
  { key: "c_talisman", label: "Talisman", effect: "Adds a Gold Seal to 1 selected card", targets: 1 },
  { key: "c_immolate", label: "Immolate", effect: "Destroys 5 random cards in hand, gain $20" },
  { key: "c_sigil", label: "Sigil", effect: "Converts all cards in hand to a single random suit" },
];

export const VOUCHERS = [
  { key: "v_overstock_norm", label: "Overstock", effect: "+1 card slot in shop", cost: 10, shop_slots: 1 },
  { key: "v_clearance_sale", label: "Clearance Sale", effect: "All cards and packs in shop are 25% off", cost: 10 },
  { key: "v_grabber", label: "Grabber", effect: "Permanently gain +1 hand per round", cost: 10, hands: 1 },
  { key: "v_wasteful", label: "Wasteful", effect: "Permanently gain +1 discard each round", cost: 10, discards: 1 },
  { key: "v_seed_money", label: "Seed Money", effect: "Raise the cap on interest earned each round to $10", cost: 10, interest_cap: 10 },
  { key: "v_paint_brush", label: "Paint Brush", effect: "+1 hand size", cost: 10, hand_size: 1 },
  { key: "v_blank", label: "Blank", effect: "Does nothing?", cost: 10 },
];

export const BOOSTERS = [
  { key: "p_arcana_normal_1", label: "Arcana Pack", effect: "Choose 1 of up to 3 Tarot cards", cost: 4, contents: "Tarot", show: 3, picks: 1 },
  { key: "p_celestial_normal_1", label: "Celestial Pack", effect: "Choose 1 of up to 3 Planet cards", cost: 4, contents: "Planet", show: 3, picks: 1 },
  { key: "p_standard_normal_1", label: "Standard Pack", effect: "Choose 1 of up to 3 Playing cards", cost: 4, contents: "Default", show: 3, picks: 1 },
  { key: "p_buffoon_normal_1", label: "Buffoon Pack", effect: "Choose 1 of up to 2 Joker cards", cost: 4, contents: "Joker", show: 2, picks: 1 },
  { key: "p_spectral_normal_1", label: "Spectral Pack", effect: "Choose 1 of up to 2 Spectral cards", cost: 4, contents: "Spectral", show: 2, picks: 1 },
];

// Endpoint schemas mirrored from src/lua/endpoints/*.lua, used for mock
// validation, console form generation, and rpc.discover in mock mode.
export const METHOD_SCHEMAS = {
  health: { params: {}, states: null },
  gamestate: { params: {}, states: null },
  menu: { params: {}, states: null },
  start: {
    params: {
      deck: { type: "string", required: true, description: "Deck enum value (e.g., 'RED', 'BLUE')" },
      stake: { type: "string", required: true, description: "Stake enum value (e.g., 'WHITE', 'GOLD')" },
      seed: { type: "string", required: false, description: "Optional seed for the run" },
    },
    states: ["MENU"],
  },
  select: { params: {}, states: ["BLIND_SELECT"] },
  skip: { params: {}, states: ["BLIND_SELECT"] },
  play: {
    params: { cards: { type: "array", items: "integer", required: true, description: "0-based indices of hand cards to play" } },
    states: ["SELECTING_HAND"],
  },
  discard: {
    params: { cards: { type: "array", items: "integer", required: true, description: "0-based indices of hand cards to discard" } },
    states: ["SELECTING_HAND"],
  },
  cash_out: { params: {}, states: ["ROUND_EVAL"] },
  next_round: { params: {}, states: ["SHOP"] },
  reroll: { params: {}, states: ["SHOP"] },
  buy: {
    params: {
      card: { type: "integer", required: false, description: "0-based index of card to buy" },
      voucher: { type: "integer", required: false, description: "0-based index of voucher to buy" },
      pack: { type: "integer", required: false, description: "0-based index of pack to buy" },
    },
    states: ["SHOP"],
  },
  pack: {
    params: {
      card: { type: "integer", required: false, description: "0-based index of card to select from pack" },
      targets: { type: "array", items: "integer", required: false, description: "0-based indices of hand cards to target" },
      skip: { type: "boolean", required: false, description: "Skip pack selection" },
    },
    states: ["SMODS_BOOSTER_OPENED"],
  },
  sell: {
    params: {
      joker: { type: "integer", required: false, description: "0-based index of joker to sell" },
      consumable: { type: "integer", required: false, description: "0-based index of consumable to sell" },
    },
    states: ["SELECTING_HAND", "SHOP"],
  },
  use: {
    params: {
      consumable: { type: "integer", required: true, description: "0-based index of consumable to use" },
      cards: { type: "array", items: "integer", required: false, description: "0-based indices of cards to target" },
    },
    states: ["SELECTING_HAND", "SHOP"],
  },
  rearrange: {
    params: {
      hand: { type: "array", items: "integer", required: false, description: "New order of cards in hand" },
      jokers: { type: "array", items: "integer", required: false, description: "New order of jokers" },
      consumables: { type: "array", items: "integer", required: false, description: "New order of consumables" },
    },
    states: ["SELECTING_HAND", "SHOP", "SMODS_BOOSTER_OPENED"],
  },
  add: {
    params: {
      key: { type: "string", required: true, description: "Card key (j_*, c_*, v_*, or SUIT_RANK like H_A)" },
      seal: { type: "string", required: false, description: "Seal (RED, BLUE, GOLD, PURPLE)" },
      edition: { type: "string", required: false, description: "Edition (HOLO, FOIL, POLYCHROME, NEGATIVE)" },
      enhancement: { type: "string", required: false, description: "Enhancement (BONUS, MULT, WILD, GLASS, STEEL, STONE, GOLD, LUCKY)" },
      eternal: { type: "boolean", required: false, description: "Joker cannot be sold or destroyed" },
      perishable: { type: "integer", required: false, description: "Rounds before joker perishes" },
      rental: { type: "boolean", required: false, description: "Joker costs $1 per round" },
    },
    states: ["SELECTING_HAND", "SHOP", "ROUND_EVAL"],
  },
  set: {
    params: {
      money: { type: "integer", required: false, description: "New money amount" },
      chips: { type: "integer", required: false, description: "New chips amount" },
      ante: { type: "integer", required: false, description: "New ante number" },
      round: { type: "integer", required: false, description: "New round number" },
      hands: { type: "integer", required: false, description: "New number of hands left" },
      discards: { type: "integer", required: false, description: "New number of discards left" },
      shop: { type: "boolean", required: false, description: "Re-stock shop with new items" },
    },
    states: null,
  },
  save: { params: { path: { type: "string", required: true, description: "File path for the save file" } }, states: null },
  load: { params: { path: { type: "string", required: true, description: "File path to the save file" } }, states: null },
  screenshot: { params: { path: { type: "string", required: true, description: "File path for the screenshot" } }, states: null },
};
