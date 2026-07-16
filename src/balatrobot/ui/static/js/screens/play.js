// Gameplay screen (game state SELECTING_HAND): HUD, jokers, consumables,
// hand with click-to-select, and the play/discard/rearrange/sell/use actions.

import { areaRow, el, playingCard, specialCard, statLine } from "../components.js";

// HUD sidebar shared with the shop and pack screens.
export function hud(gs) {
  const blindKey = ["small", "big", "boss"].find((k) => gs.blinds?.[k]?.status === "CURRENT")
    ?? ["small", "big", "boss"].find((k) => gs.blinds?.[k]?.status === "SELECT");
  const blind = blindKey ? gs.blinds[blindKey] : null;
  const blindPath = blindKey ? `blinds.${blindKey}` : "blinds";

  return el("div", { class: "hud" },
    blind
      ? el("div", { class: "blind-chip", "data-path": blindPath },
          el("div", { class: `blind-disc blind-${blind.type === "BOSS" ? "Boss" : blind.type === "BIG" ? "Big" : "Small"}` }),
          el("div", {},
            el("div", { class: "blind-name", "data-path": `${blindPath}.name` }, blind.name),
            el("div", { class: "blind-score", "data-path": `${blindPath}.score` }, `${blind.score}`),
            blind.effect ? el("div", { class: "blind-effect", "data-path": `${blindPath}.effect` }, blind.effect) : null,
          ),
        )
      : null,
    el("div", { class: "panel" },
      statLine("Round score", gs.round?.chips ?? 0, "round.chips", "chips"),
      statLine("Hands", gs.round?.hands_left ?? "-", "round.hands_left", "chips"),
      statLine("Discards", gs.round?.discards_left ?? "-", "round.discards_left", "mult"),
      statLine("Money", `$${gs.money}`, "money", "money"),
      statLine("Ante", gs.ante_num, "ante_num"),
      statLine("Round", gs.round_num, "round_num"),
      statLine("Deck", `${gs.cards?.count ?? 0}`, "cards.count"),
    ),
  );
}

// Jokers and consumables rows with sell/use controls (valid in
// SELECTING_HAND and SHOP).
export function inventoryRows(gs, ctx, { withActions = true } = {}) {
  const jokerCard = (card, path, i) => el("div", {},
    specialCard(card, path),
    withActions
      ? el("button", { class: "btn btn-small btn-orange", onclick: () => ctx.call("sell", { joker: i }) }, "Sell")
      : null,
  );
  const consumableCard = (card, path, i) => el("div", {},
    specialCard(card, path),
    withActions
      ? el("div", {},
          el("button", {
            class: "btn btn-small btn-green",
            title: "Use (targets = selected hand cards)",
            onclick: () => ctx.call("use", { consumable: i, cards: [...ctx.ui.selected].sort((a, b) => a - b) }),
          }, "Use"),
          el("button", { class: "btn btn-small btn-orange", onclick: () => ctx.call("sell", { consumable: i }) }, "Sell"),
        )
      : null,
  );
  return [
    areaRow(gs.jokers, "jokers", "Jokers", jokerCard),
    areaRow(gs.consumables, "consumables", "Consumables", consumableCard),
  ];
}

export function render(gs, ctx) {
  const selected = ctx.ui.selected;

  const handCard = (card, path, i) => playingCard(card, path, {
    selected: selected.has(i),
    onclick: () => {
      selected.has(i) ? selected.delete(i) : selected.size < (gs.hand?.highlighted_limit ?? 5) && selected.add(i);
      ctx.rerender();
    },
  });

  const picks = () => [...selected].sort((a, b) => a - b);

  const sortPermutation = (compare) => {
    const cards = gs.hand?.cards ?? [];
    return cards.map((_, i) => i).sort((a, b) => compare(cards[a], cards[b]));
  };
  const rankOrder = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const byRank = (a, b) => rankOrder.indexOf(b.value?.rank) - rankOrder.indexOf(a.value?.rank);
  const bySuit = (a, b) => (a.value?.suit ?? "").localeCompare(b.value?.suit ?? "") || byRank(a, b);

  return el("div", { class: "screen-flex" },
    hud(gs),
    el("div", { class: "screen-main" },
      inventoryRows(gs, ctx),
      areaRow(gs.hand, "hand", "Hand", handCard),
      el("div", { class: "actions" },
        el("button", {
          class: "btn btn-red", disabled: selected.size === 0 ? "" : undefined,
          onclick: () => ctx.call("play", { cards: picks() }).then(() => selected.clear()),
        }, `Play Hand (${selected.size})`),
        el("button", {
          class: "btn", disabled: selected.size === 0 ? "" : undefined,
          onclick: () => ctx.call("discard", { cards: picks() }).then(() => selected.clear()),
        }, `Discard (${selected.size})`),
        el("button", {
          class: "btn btn-small",
          onclick: () => { selected.clear(); ctx.call("rearrange", { hand: sortPermutation(byRank) }); },
        }, "Sort: Rank"),
        el("button", {
          class: "btn btn-small",
          onclick: () => { selected.clear(); ctx.call("rearrange", { hand: sortPermutation(bySuit) }); },
        }, "Sort: Suit"),
      ),
    ),
  );
}
