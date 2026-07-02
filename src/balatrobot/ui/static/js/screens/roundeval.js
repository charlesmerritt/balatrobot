// Round eval / cash out screen (game state ROUND_EVAL).

import { el, statLine } from "../components.js";
import { hud } from "./play.js";

export function render(gs, ctx) {
  const beaten = ["small", "big", "boss"]
    .map((k) => gs.blinds?.[k])
    .find((b) => b?.status === "DEFEATED");

  return el("div", { class: "screen-flex" },
    hud(gs),
    el("div", { class: "screen-main" },
      el("div", { class: "panel", style: "text-align:center" },
        el("h3", {}, "Round complete"),
        beaten
          ? el("div", { class: "shop-banner" }, `${beaten.name} defeated!`)
          : el("div", { class: "shop-banner" }, "Blind defeated!"),
        el("div", { class: "eval-rows" },
          statLine("Round score", gs.round?.chips ?? 0, "round.chips", "chips"),
          statLine("Hands left (bonus $)", gs.round?.hands_left ?? 0, "round.hands_left"),
          statLine("Money", `$${gs.money}`, "money", "money"),
        ),
        el("div", { class: "actions" },
          el("button", { class: "btn btn-orange", onclick: () => ctx.call("cash_out", {}) }, "CASH OUT"),
        ),
      ),
    ),
  );
}
