// Booster pack screen (game state SMODS_BOOSTER_OPENED): pick a card from the
// open pack (optionally targeting hand cards) or skip.

import { areaRow, el, playingCard, specialCard } from "../components.js";
import { hud } from "./play.js";

export function render(gs, ctx) {
  const targets = ctx.ui.selected; // reuse hand selection as consumable targets

  const packCard = (card, path, i) => el("div", {},
    specialCard(card, path, { selected: ctx.ui.packChoice === i }),
    el("button", {
      class: "btn btn-small btn-green",
      onclick: () => {
        const params = { card: i };
        if (targets.size > 0) params.targets = [...targets].sort((a, b) => a - b);
        ctx.call("pack", params).then(() => targets.clear());
      },
    }, "Take"),
  );

  const handCard = (card, path, i) => playingCard(card, path, {
    selected: targets.has(i),
    onclick: () => {
      targets.has(i) ? targets.delete(i) : targets.add(i);
      ctx.rerender();
    },
  });

  return el("div", { class: "screen-flex" },
    hud(gs),
    el("div", { class: "screen-main" },
      el("div", { class: "panel", style: "text-align:center" },
        el("span", { class: "shop-banner" }, "BOOSTER PACK"),
      ),
      areaRow(gs.pack, "pack", "Pick a card", packCard),
      gs.hand
        ? areaRow(gs.hand, "hand", "Hand (select targets for consumables)", handCard)
        : null,
      el("div", { class: "actions" },
        el("button", { class: "btn btn-orange", onclick: () => ctx.call("pack", { skip: true }) }, "Skip Pack"),
      ),
    ),
  );
}
