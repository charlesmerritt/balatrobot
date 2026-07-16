// Game over / win screen (game state GAME_OVER).

import { el, statLine } from "../components.js";

export function render(gs, ctx) {
  const won = gs.won === true;
  return el("div", { class: "menu-screen" },
    el("div", { class: "menu-title" },
      el("span", { class: won ? "t2" : "t1", "data-path": "won" }, won ? "YOU WIN!" : "GAME OVER"),
    ),
    el("div", { class: "panel", style: "min-width:280px" },
      statLine("Ante reached", gs.ante_num, "ante_num"),
      statLine("Round", gs.round_num, "round_num"),
      statLine("Money", `$${gs.money}`, "money", "money"),
    ),
    el("div", { class: "actions" },
      el("button", { class: "btn btn-red", onclick: () => ctx.call("menu", {}) }, "Main Menu"),
    ),
  );
}
