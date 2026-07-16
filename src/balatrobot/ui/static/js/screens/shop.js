// Shop screen (game state SHOP): buy cards/vouchers/packs, reroll, next round.

import { areaRow, el, specialCard } from "../components.js";
import { hud, inventoryRows } from "./play.js";

export function render(gs, ctx) {
  const buyable = (paramName) => (card, path, i) => el("div", {},
    specialCard(card, path, { showCost: true }),
    el("button", {
      class: "btn btn-small btn-green",
      onclick: () => ctx.call("buy", { [paramName]: i }),
    }, "Buy"),
  );

  return el("div", { class: "screen-flex" },
    hud(gs),
    el("div", { class: "screen-main" },
      el("div", { class: "panel", style: "text-align:center" },
        el("span", { class: "shop-banner" }, "SHOP"),
      ),
      el("div", { class: "shop-sections" },
        areaRow(gs.shop, "shop", "Cards", buyable("card")),
        el("div", { class: "shop-row" },
          el("div", { style: "flex:1" }, areaRow(gs.vouchers, "vouchers", "Voucher", buyable("voucher"))),
          el("div", { style: "flex:1" }, areaRow(gs.packs, "packs", "Booster Packs", buyable("pack"))),
        ),
        inventoryRows(gs, ctx),
      ),
      el("div", { class: "actions" },
        el("button", {
          class: "btn btn-green",
          "data-path": "round.reroll_cost",
          onclick: () => ctx.call("reroll", {}),
        }, `Reroll $${gs.round?.reroll_cost ?? "?"}`),
        el("button", { class: "btn btn-red", onclick: () => ctx.call("next_round", {}) }, "Next Round"),
      ),
    ),
  );
}
